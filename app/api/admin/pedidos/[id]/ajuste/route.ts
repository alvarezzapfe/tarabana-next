import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { canManageAsAdmin, isVendedor } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { puedeEditarPartidas, sobrepagoDeTotal } from '../../../../../../src/lib/editar-partidas'
import { TOLERANCIA_AJUSTE, excedeTolerancia, motivoRechazo } from '../../../../../../src/lib/ajuste'

/**
 * Cambia el ajuste de un pedido: lo que se suma o resta al final para cuadrar
 * contra la orden de compra del cliente.
 *
 * ── De donde sale el total ────────────────────────────────
 *
 * `totalAntes` se obtiene de `pedidos_saldo` como `total_con_envio - ajuste`,
 * no recalculando el descuento, el prorrateo del IVA y el redondeo. La vista
 * es la autoridad: reconstruir aqui su aritmetica para llegar al mismo numero
 * seria una segunda implementacion, y el dia que difieran por un centavo el
 * aviso del 5% y el del sobrepago hablarian de un pedido que no existe.
 *
 * ── Quien puede ──────────────────────────────────────────
 *
 * Solo `canManageAsAdmin`. El ajuste mueve lo que el cliente paga sin tocar
 * ningun precio ni dejar rastro en la lista de precios, asi que sigue el
 * criterio del descuento y no el del IVA (donde oficina puede quedarse en el
 * default del cliente). El vendedor recibe un mensaje y no un 403 pelado.
 *
 * ── Las tres cosas que puede rechazar ────────────────────
 *
 *   1. Motivo vacio, o un ajuste que deja el pedido en negativo
 *      (`motivoRechazo`). Son 400: no hay nada que confirmar.
 *   2. Ajuste de mas del 5% del total. 409 con `requiereConfirmacion`: puede
 *      ser legitimo, pero no se guarda sin que alguien lo vea.
 *   3. Sobrepago: si el ajuste baja el total por debajo de lo ya pagado.
 *      Mismo 409 y misma forma que `/partidas` y `/iva`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (isVendedor(profile?.role)) {
    return NextResponse.json(
      { error: 'Un vendedor no puede ajustar el total de un pedido. Pídelo a alguien de oficina.' },
      { status: 403 }
    )
  }
  if (!canManageAsAdmin(profile?.role)) {
    return NextResponse.json(
      { error: 'Solo admin y super admin pueden ajustar el total de un pedido.' },
      { status: 403 }
    )
  }

  let body: { ajuste?: unknown; ajuste_motivo?: unknown; confirmarAjuste?: unknown; confirmarSobrepago?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
  }

  const ajuste = Number(body.ajuste)
  if (!Number.isFinite(ajuste)) {
    return NextResponse.json({ error: 'Falta el ajuste, o no es un número.' }, { status: 400 })
  }
  // numeric(12,2): mas de dos decimales los redondearia la base de datos y el
  // total dejaria de ser el que se confirmo en pantalla.
  if (Math.abs(ajuste * 100 - Math.round(ajuste * 100)) > 1e-6) {
    return NextResponse.json({ error: 'El ajuste no puede tener fracciones de centavo.' }, { status: 400 })
  }
  const motivo = typeof body.ajuste_motivo === 'string' ? body.ajuste_motivo.trim() : ''

  const [{ data: pedido }, { data: saldo }] = await Promise.all([
    supabase.from('pedidos').select('id, status, ajuste, ajuste_motivo, total').eq('id', id).maybeSingle(),
    supabase.from('pedidos_saldo').select('total_con_envio, ajuste, pagado').eq('id', id).maybeSingle(),
  ])

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Mismo criterio que las partidas y el IVA: un entregado ya se facturo y un
  // cancelado no va a salir. Cambiarles el total reescribe un documento que ya
  // existe afuera.
  if (!puedeEditarPartidas(pedido.status)) {
    return NextResponse.json(
      {
        error: `Este pedido está ${pedido.status} y su total ya no se ajusta.`,
        detalle: pedido.status === 'entregado'
          ? 'Un pedido entregado ya se facturó.'
          : 'Un pedido cancelado no va a salir.',
      },
      { status: 409 }
    )
  }
  if (!saldo) {
    return NextResponse.json({ error: 'El pedido no tiene saldo que ajustar.' }, { status: 409 })
  }

  const ajusteActual = Number(saldo.ajuste) || 0
  const pagado = Number(saldo.pagado) || 0
  // La vista manda: lo que se cobraria sin ajuste.
  const totalAntes = Number(saldo.total_con_envio) - ajusteActual

  if (ajuste === ajusteActual && motivo === (pedido.ajuste_motivo || '').trim()) {
    return NextResponse.json({ ok: true, sinCambio: true, ajuste: ajusteActual })
  }

  const rechazo = motivoRechazo({ ajuste, motivo, totalAntes })
  if (rechazo) return NextResponse.json({ error: rechazo }, { status: 400 })

  if (excedeTolerancia(ajuste, totalAntes) && body.confirmarAjuste !== true) {
    const pct = Math.abs(ajuste) / totalAntes * 100
    return NextResponse.json(
      {
        error: `El ajuste es ${pct.toFixed(1)}% del total y pasa del ${TOLERANCIA_AJUSTE * 100}%.`,
        tolerancia: { ajuste, totalAntes, pct: Number(pct.toFixed(2)) },
        requiereConfirmacion: true,
      },
      { status: 409 }
    )
  }

  const sobra = sobrepagoDeTotal(totalAntes + ajuste, pagado)
  if (sobra && body.confirmarSobrepago !== true) {
    return NextResponse.json(
      {
        error: 'Con ese ajuste el pedido queda sobrepagado.',
        sobrepago: sobra,
        requiereConfirmacion: true,
      },
      { status: 409 }
    )
  }

  // ── Escritura ─────────────────────────────────────────────
  //
  // Pasa por RLS a proposito (el cliente de sesion, no el service) y se cuenta
  // la fila devuelta: con RLS, un UPDATE sin policy afecta CERO filas en
  // silencio, y sin este check la pantalla diria "guardado" sin haber guardado.
  const { data: tocado, error } = await supabase
    .from('pedidos')
    .update({ ajuste, ajuste_motivo: ajuste === 0 ? null : motivo })
    .eq('id', id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: `No se pudo guardar el ajuste: ${error.message}` }, { status: 400 })
  }
  if (!tocado || tocado.length === 0) {
    return NextResponse.json({ error: 'No tienes permiso para modificar este pedido.' }, { status: 403 })
  }

  const { data: despues } = await supabase
    .from('pedidos_saldo')
    .select('ajuste, total_con_envio, saldo, estado_cobro')
    .eq('id', id)
    .maybeSingle()

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.ajuste', entidad: 'pedidos', entidadId: id,
    detalle: {
      antes: { ajuste: ajusteActual, motivo: pedido.ajuste_motivo ?? null },
      despues: { ajuste, motivo: ajuste === 0 ? null : motivo },
      total_antes_de_ajuste: totalAntes,
      total_resultante: despues?.total_con_envio ?? null,
      pagado,
      ...(excedeTolerancia(ajuste, totalAntes) ? { tolerancia_confirmada: true } : {}),
      ...(sobra ? { sobrepago_confirmado: sobra } : {}),
    },
    request,
  })

  return NextResponse.json({
    ok: true,
    ajuste,
    total_con_envio: despues?.total_con_envio ?? null,
    saldo: despues?.saldo ?? null,
    estado_cobro: despues?.estado_cobro ?? null,
  })
}

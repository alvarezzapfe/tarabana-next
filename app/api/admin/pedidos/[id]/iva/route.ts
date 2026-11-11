import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { canManageAsAdmin, canWrite, isVendedor } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { puedeEditarPartidas, sobrepagoDe } from '../../../../../../src/lib/editar-partidas'
import { cargarTasaIva } from '../../../../../../src/lib/iva'

/**
 * Prende o apaga el IVA de un pedido que ya existe.
 *
 * Es una ruta aparte de `/partidas` porque son dos operaciones distintas:
 * editar partidas cambia la MERCANCIA y pasa por `set_pedido_items`; esto
 * cambia un atributo del pedido y es un UPDATE de dos columnas. Juntarlas
 * obligaria a mandar el carrito completo para mover un switch.
 *
 * ── Quien puede ───────────────────────────────────────────
 *
 * La misma regla que al crear (ver `crearPedido`): quedarse en el default del
 * cliente —su `requiere_factura`— es de oficina; SALIRSE de ese default es de
 * admin. Asi la pregunta no es "quien puede tocar el IVA" sino "quien puede
 * facturar distinto a como el cliente pidio", que es la decision que de
 * verdad cuesta dinero.
 *
 * El vendedor no entra, igual que en `/partidas`: no tiene policy de UPDATE
 * sobre `pedidos` (20261103100000), asi que sin este guard recibiria un
 * update que afecta cero filas sin error. Ver la verificacion del final.
 *
 * ── Sobrepago ─────────────────────────────────────────────
 *
 * Apagar el IVA de un pedido ya cobrado baja el total un 16% y deja al
 * cliente con mas pagado de lo que debe. No se bloquea —puede haber una
 * devolucion de por medio— pero no se guarda sin que alguien lo confirme,
 * con el mismo 409 y la misma forma de respuesta que `/partidas`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (isVendedor(profile?.role)) {
    return NextResponse.json(
      { error: 'Un vendedor no puede cambiar el IVA de un pedido. Pídelo a alguien de oficina.' },
      { status: 403 }
    )
  }
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let body: { incluye_iva?: unknown; confirmarSobrepago?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
  }
  if (typeof body.incluye_iva !== 'boolean') {
    return NextResponse.json({ error: 'Falta incluye_iva (true o false).' }, { status: 400 })
  }
  const quiereIva = body.incluye_iva

  const service = createServiceClient()

  const [{ data: pedido }, { data: saldo }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, status, cliente_id, total, descuento_tipo, descuento_valor, costo_envio, incluye_iva, iva_tasa')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('pedidos_saldo').select('pagado').eq('id', id).maybeSingle(),
  ])

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Mismo criterio que las partidas: un entregado ya desconto inventario y se
  // facturo, un cancelado no va a salir. Cambiarles el IVA reescribe un
  // documento que ya existe afuera.
  if (!puedeEditarPartidas(pedido.status)) {
    return NextResponse.json(
      {
        error: `Este pedido está ${pedido.status} y su IVA ya no se cambia.`,
        detalle: pedido.status === 'entregado'
          ? 'Un pedido entregado ya se facturó.'
          : 'Un pedido cancelado no va a salir.',
      },
      { status: 409 }
    )
  }

  if (!!pedido.incluye_iva === quiereIva) {
    return NextResponse.json({ ok: true, sinCambio: true, incluye_iva: quiereIva })
  }

  // ── Salirse del default del cliente pide admin ────────────
  const { data: cliente } = await service
    .from('profiles').select('requiere_factura').eq('id', pedido.cliente_id).maybeSingle()
  const ivaPorCliente = !!cliente?.requiere_factura

  if (quiereIva !== ivaPorCliente && !canManageAsAdmin(profile!.role)) {
    return NextResponse.json(
      {
        error: ivaPorCliente
          ? 'Este cliente factura con IVA; solo admin puede quitárselo a un pedido.'
          : 'Este cliente no factura con IVA; solo admin puede agregárselo a un pedido.',
      },
      { status: 403 }
    )
  }

  // ── La tasa ───────────────────────────────────────────────
  //
  // Al PRENDER se copia la vigente, porque es la que aplica a la factura que
  // se va a emitir ahora. Al apagar no se toca: la columna guarda la ultima
  // tasa usada y el check de la migracion solo la exige cuando incluye_iva es
  // true. `app_config` pide is_staff(), de ahi el service client.
  const tasa = quiereIva ? await cargarTasaIva(service) : Number(pedido.iva_tasa) || 0
  if (quiereIva && tasa <= 0) {
    return NextResponse.json(
      { error: 'La tasa de IVA configurada es 0: revisa app_config.impuestos antes de facturar con IVA.' },
      { status: 400 }
    )
  }

  // ── Sobrepago con el estado NUEVO ─────────────────────────
  const sobra = sobrepagoDe({
    total: Number(pedido.total) || 0,
    descuento_tipo: pedido.descuento_tipo,
    descuento_valor: pedido.descuento_valor,
    costo_envio: pedido.costo_envio,
    incluye_iva: quiereIva,
    iva_tasa: tasa,
    pagado: Number(saldo?.pagado) || 0,
  })
  if (sobra && body.confirmarSobrepago !== true) {
    return NextResponse.json(
      {
        error: quiereIva
          ? 'Con IVA el pedido queda sobrepagado.'
          : 'Sin IVA el pedido queda sobrepagado.',
        sobrepago: sobra,
        requiereConfirmacion: true,
      },
      { status: 409 }
    )
  }

  // ── Escritura ─────────────────────────────────────────────
  //
  // Pasa por RLS a proposito (el cliente de sesion, no el service): quien
  // puede escribir pedidos lo decide la policy. Y por eso se cuenta la fila
  // devuelta: con RLS, un UPDATE sin policy afecta CERO filas en silencio, y
  // sin este check la pantalla diria "guardado" sin haber guardado nada.
  const { data: actualizados, error } = await supabase
    .from('pedidos')
    .update({ incluye_iva: quiereIva, iva_tasa: tasa })
    .eq('id', id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: `No se pudo cambiar el IVA: ${error.message}` }, { status: 400 })
  }
  if (!actualizados || actualizados.length === 0) {
    return NextResponse.json({ error: 'No tienes permiso para modificar este pedido.' }, { status: 403 })
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.iva', entidad: 'pedidos', entidadId: id,
    detalle: {
      antes: { incluye_iva: !!pedido.incluye_iva, iva_tasa: Number(pedido.iva_tasa) || 0 },
      despues: { incluye_iva: quiereIva, iva_tasa: tasa },
      total: Number(pedido.total) || 0,
      requiere_factura_cliente: ivaPorCliente,
      ...(sobra ? { sobrepago_confirmado: sobra } : {}),
    },
    request,
  })

  return NextResponse.json({ ok: true, incluye_iva: quiereIva, iva_tasa: tasa })
}

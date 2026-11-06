import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { hoyMx } from '../../../../../../src/lib/fechas'
import { logAction } from '../../../../../../src/lib/audit'

/**
 * Una fecha del body a timestamptz, al MEDIODIA UTC.
 *
 * A medianoche UTC, cualquier formateo en una zona al oeste retrocede un
 * dia y la entrega aparece el dia anterior; al mediodia no hay zona que
 * cruce la frontera del dia (ver src/lib/fechas.ts, que hace lo mismo).
 *
 * Devuelve `undefined` si el campo no venia — eso significa "no lo toques",
 * distinto de `null`, que es "borralo".
 */
function fechaDelBody(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const texto = String(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined
  return `${texto}T12:00:00.000Z`
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const { costo_envio, paqueteria, guia_envio } = body

  // `costo_envio` es OPCIONAL: solo admin y super admin lo pueden tocar, asi
  // que el panel no lo manda cuando quien guarda es ventas o produccion. Lo
  // exigia, y por eso ventas no podia guardar paqueteria ni guia: se comia un
  // 400 en cada intento. Si no viene, se queda el que ya tenia.
  if (costo_envio !== undefined && (typeof costo_envio !== 'number' || costo_envio < 0)) {
    return NextResponse.json({ error: 'costo_envio debe ser un numero >= 0' }, { status: 400 })
  }

  for (const campo of ['fecha_entrega', 'fecha_entrega_real'] as const) {
    const crudo = body[campo]
    if (crudo !== undefined && crudo !== null && crudo !== '' && fechaDelBody(crudo) === undefined) {
      return NextResponse.json({ error: `${campo} debe venir como YYYY-MM-DD` }, { status: 400 })
    }
  }

  const entregaReal = fechaDelBody(body.fecha_entrega_real)
  // La entrega PROGRAMADA puede ser futura; la REAL no: es algo que ya paso.
  if (entregaReal && entregaReal.slice(0, 10) > hoyMx()) {
    return NextResponse.json({ error: 'La fecha de entrega real no puede ser futura' }, { status: 400 })
  }

  const { data: prev } = await supabase
    .from('pedidos')
    .select('costo_envio, total, paqueteria, guia_envio, fecha_entrega, fecha_entrega_real')
    .eq('id', id)
    .single()
  if (!prev) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const entregaProgramada = fechaDelBody(body.fecha_entrega)

  const update: Record<string, unknown> = {
    paqueteria: paqueteria || null,
    guia_envio: guia_envio || null,
    envio_cotizado_at: new Date().toISOString(),
  }
  if (costo_envio !== undefined) update.costo_envio = costo_envio
  if (entregaProgramada !== undefined) update.fecha_entrega = entregaProgramada
  if (entregaReal !== undefined) update.fecha_entrega_real = entregaReal

  const { error: errorUpdate } = await supabase.from('pedidos').update(update).eq('id', id)
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 400 })

  // Fetch updated saldo
  const { data: saldo } = await supabase.from('pedidos_saldo').select('saldo').eq('id', id).single()

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.envio', entidad: 'pedidos', entidadId: id,
    detalle: {
      costo_envio_anterior: prev.costo_envio,
      costo_envio_nuevo: costo_envio !== undefined ? costo_envio : prev.costo_envio,
      paqueteria, guia_envio,
      ...(entregaProgramada !== undefined
        ? { fecha_entrega_anterior: prev.fecha_entrega, fecha_entrega_nueva: entregaProgramada }
        : {}),
      ...(entregaReal !== undefined
        ? { fecha_entrega_real_anterior: prev.fecha_entrega_real, fecha_entrega_real_nueva: entregaReal }
        : {}),
    },
    request,
  })

  return NextResponse.json({ ok: true, saldo: saldo?.saldo ?? null })
}

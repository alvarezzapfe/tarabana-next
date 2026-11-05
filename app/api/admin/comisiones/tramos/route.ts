import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { validarTramos, type Tramo } from '../../../../../src/lib/comisiones'

/**
 * Reemplaza la escalera de comision completa de un vendedor, o la global.
 *
 * La escalera se manda entera y no renglon por renglon: con la contiguidad
 * obligatoria, mover un limite exige tocar dos tramos a la vez y cualquier
 * estado intermedio es invalido. `set_comision_tramos` hace el borra-e-inserta
 * en una transaccion.
 *
 * Se usa el cliente del usuario y no el service client a proposito: asi el
 * permiso real lo da la policy `comision_tramos_super_write` y no este
 * handler. El check de rol de abajo es para devolver un 403 legible.
 *
 * Body: { vendedor_id: string | null, tramos: [{ desde, hasta, porcentaje }] }
 * `vendedor_id: null` es el esquema global. `tramos: []` lo deja sin esquema.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const body = await request.json()
  const vendedorId: string | null = body?.vendedor_id ?? null

  if (!Array.isArray(body?.tramos)) {
    return NextResponse.json({ error: 'tramos debe ser un arreglo' }, { status: 400 })
  }

  // Normalizacion antes de validar: el formulario manda strings y '' para un
  // tramo abierto. Un `hasta` vacio es null, no 0.
  const tramos: Tramo[] = body.tramos.map((t: Record<string, unknown>) => ({
    desde: Number(t.desde),
    hasta: t.hasta === null || t.hasta === undefined || t.hasta === '' ? null : Number(t.hasta),
    porcentaje: Number(t.porcentaje),
  }))

  // La DB vuelve a validar esto en el constraint trigger; aqui es para dar un
  // mensaje accionable en vez de un error de Postgres.
  const errores = validarTramos(tramos)
  if (errores.length) return NextResponse.json({ error: errores.join(' ') }, { status: 400 })

  const { data, error } = await supabase.rpc('set_comision_tramos', {
    p_vendedor_id: vendedorId,
    p_tramos: tramos,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'comision.tramos.set', entidad: 'comision_tramos', entidadId: vendedorId || 'global',
    detalle: { vendedor_id: vendedorId, tramos },
    request,
  })

  return NextResponse.json({ ok: true, tramos: data })
}

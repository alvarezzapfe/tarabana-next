import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin, isVendedor } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'

/**
 * Liga (o desliga) el login de un vendedor con su ficha de `vendedores`.
 *
 * Es el paso que activa el rol: `mi_vendedor_id()` resuelve por
 * vendedores.profile_id, asi que sin ficha ligada el vendedor entra al panel
 * pero no puede crear nada ni ve filas. Las fichas se dan de alta en
 * Comercial -> Vendedores; aqui solo se conectan.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role))
    return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { profile_id, vendedor_id } = await request.json()
  if (!profile_id) return NextResponse.json({ error: 'profile_id requerido' }, { status: 400 })

  const service = createServiceClient()

  const { data: destino } = await service
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', profile_id)
    .maybeSingle()
  if (!destino) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  if (!isVendedor(destino.role))
    return NextResponse.json({ error: 'Ese usuario no tiene el rol vendedor' }, { status: 400 })

  // El indice unico de profile_id no permite dos fichas para el mismo login,
  // asi que primero se suelta la que tuviera.
  const { data: previa } = await service
    .from('vendedores')
    .select('id, nombre')
    .eq('profile_id', profile_id)
    .maybeSingle()
  if (previa) {
    await service.from('vendedores').update({ profile_id: null }).eq('id', previa.id)
  }

  let ficha: { id: string; nombre: string } | null = null
  if (vendedor_id) {
    const { data: f } = await service
      .from('vendedores')
      .select('id, nombre, profile_id')
      .eq('id', vendedor_id)
      .maybeSingle()
    if (!f) return NextResponse.json({ error: 'Ficha de vendedor no encontrada' }, { status: 404 })
    if (f.profile_id && f.profile_id !== profile_id)
      return NextResponse.json({ error: 'Esa ficha ya esta ligada a otro usuario' }, { status: 409 })

    const { error } = await service.from('vendedores').update({ profile_id }).eq('id', vendedor_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    ficha = { id: f.id, nombre: f.nombre }
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: ficha ? 'vendedor.ligar' : 'vendedor.desligar',
    entidad: 'vendedores', entidadId: ficha?.id || previa?.id || profile_id,
    detalle: { profile_id, email: destino.email, de: previa?.nombre || null, a: ficha?.nombre || null },
    request,
  })

  return NextResponse.json({ ok: true, vendedor: ficha })
}

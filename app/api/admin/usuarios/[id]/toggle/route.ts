import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { data: target } = await supabase.from('profiles').select('active, role').eq('id', id).single()
  if (!target || isSuperAdmin(target.role)) return NextResponse.json({ error: 'No permitido' }, { status: 403 })

  const serviceClient = createServiceClient()
  await serviceClient.from('profiles').update({ active: !target.active }).eq('id', id)

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'usuario.toggle', entidad: 'profiles', entidadId: id, detalle: { active: !target.active, target_role: target.role }, request: _req })

  return NextResponse.redirect(new URL('/admin/usuarios', _req.url))
}

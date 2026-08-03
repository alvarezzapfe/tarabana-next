import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const service = createServiceClient()

  // Get the invitation
  const { data: inv } = await service.from('invitaciones').select('*').eq('id', id).single()
  if (!inv) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })

  // Check if already activated — if a profile with that email exists, don't delete
  if (inv.used) {
    return NextResponse.json({ error: 'Esta invitación ya fue activada. No se puede eliminar.' }, { status: 409 })
  }

  const { data: existingProfile } = await service.from('profiles').select('id').eq('email', inv.email).single()
  if (existingProfile) {
    return NextResponse.json({ error: 'Ya existe un usuario con este email. La invitación no se puede eliminar.' }, { status: 409 })
  }

  const { error } = await service.from('invitaciones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'invitacion.eliminar', entidad: 'invitaciones', entidadId: id,
    detalle: { email: inv.email, role: inv.role },
    request,
  })

  return NextResponse.json({ ok: true })
}

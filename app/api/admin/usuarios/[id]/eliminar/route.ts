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

  if (id === user.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta.' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: target } = await service.from('profiles').select('id, full_name, email, role').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  if (isSuperAdmin(target.role)) {
    return NextResponse.json({ error: 'No se puede eliminar a un super admin.' }, { status: 403 })
  }

  // Check dependencies: pedidos as cliente
  const { count: pedidosCount } = await service
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', id)

  if (pedidosCount && pedidosCount > 0) {
    return NextResponse.json({
      error: `Este usuario tiene ${pedidosCount} pedido${pedidosCount > 1 ? 's' : ''} asociado${pedidosCount > 1 ? 's' : ''}. Desactívalo en vez de borrarlo para conservar el historial.`,
      suggest_deactivate: true,
    }, { status: 409 })
  }

  // Check audit_log entries (informational, doesn't block)
  const { count: auditCount } = await service
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', id)

  // Log BEFORE deleting so we capture the details
  await logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'usuario.eliminar', entidad: 'profiles', entidadId: id,
    detalle: {
      target_email: target.email,
      target_name: target.full_name,
      target_role: target.role,
      audit_entries: auditCount || 0,
    },
    request,
  })

  // Delete profile (cascade or manual cleanup)
  await service.from('profiles').delete().eq('id', id)

  // Delete auth user
  await service.auth.admin.deleteUser(id)

  // Clean up pending invitations for this email
  if (target.email) {
    await service.from('invitaciones').delete().eq('email', target.email).eq('used', false)
  }

  return NextResponse.json({ ok: true })
}

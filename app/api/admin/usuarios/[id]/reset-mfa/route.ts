import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const service = createServiceClient()

  // Get target user info for audit
  const { data: target } = await service.from('profiles').select('full_name, email, role').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // List and delete all MFA factors for the target user
  const { data: factors, error: listError } = await service.auth.admin.mfa.listFactors({ userId: id })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  for (const factor of factors?.factors || []) {
    await service.auth.admin.mfa.deleteFactor({ userId: id, factorId: factor.id })
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'usuario.reset_mfa', entidad: 'profiles', entidadId: id,
    detalle: { target_email: target.email, target_role: target.role, factors_removed: factors?.factors?.length || 0 },
    request,
  })

  return NextResponse.json({ ok: true, factors_removed: factors?.factors?.length || 0 })
}

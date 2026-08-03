import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../src/lib/roles'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const service = createServiceClient()

  // Get all internal users
  const { data: usuarios } = await service.from('profiles').select('id').not('role', 'eq', 'comprador')
  if (!usuarios) return NextResponse.json({})

  const mfaStatus: Record<string, boolean> = {}
  for (const u of usuarios) {
    const { data: factors } = await service.auth.admin.mfa.listFactors({ userId: u.id })
    const verified = factors?.factors?.some((f: any) => f.status === 'verified') || false
    mfaStatus[u.id] = verified
  }

  return NextResponse.json(mfaStatus)
}

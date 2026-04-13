import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { data: target } = await supabase.from('profiles').select('active, role').eq('id', id).single()
  if (!target || target.role === 'super_admin') return NextResponse.json({ error: 'No permitido' }, { status: 403 })

  const serviceClient = createServiceClient()
  await serviceClient.from('profiles').update({ active: !target.active }).eq('id', id)

  return NextResponse.redirect(new URL('/admin/usuarios', _req.url))
}

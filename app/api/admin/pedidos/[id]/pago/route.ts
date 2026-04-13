import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin', 'ventas'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { pagado } = await request.json()
  await supabase.from('pedidos').update({ pagado }).eq('id', id)
  return NextResponse.json({ ok: true })
}

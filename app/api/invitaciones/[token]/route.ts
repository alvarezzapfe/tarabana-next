import { createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('invitaciones')
    .select('email, full_name, role, expires_at, used')
    .eq('token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (data.used) return NextResponse.json({ error: 'Ya usada' }, { status: 410 })
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: 'Expirada' }, { status: 410 })

  return NextResponse.json(data)
}

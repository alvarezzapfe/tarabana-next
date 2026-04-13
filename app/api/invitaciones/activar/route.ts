import { createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, password } = await request.json()
  const supabase = createServiceClient()

  const { data: inv, error } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'Invitación inválida' }, { status: 400 })
  if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: 'Invitación expirada' }, { status: 410 })

  // Crear usuario en auth
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: inv.email, password,
    email_confirm: true,
    user_metadata: { full_name: inv.full_name, role: inv.role }
  })

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

  // Actualizar profile con rol correcto
  await supabase.from('profiles').update({ full_name: inv.full_name, role: inv.role }).eq('id', newUser.user.id)

  // Marcar invitación como usada
  await supabase.from('invitaciones').update({ used: true }).eq('token', token)

  return NextResponse.json({ ok: true })
}

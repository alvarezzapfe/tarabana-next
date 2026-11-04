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

  // Ligar la ficha de vendedor, si la invitacion traia una. Es el unico
  // momento en que se puede: vendedores.profile_id necesita un profiles.id y
  // el perfil acaba de existir.
  //
  // Si la ficha se borro entre la invitacion y la activacion, el on delete
  // set null ya dejo vendedor_id en null y esto no corre: la persona entra
  // sin ficha y el panel se lo avisa.
  if (inv.vendedor_id) {
    const { error: eLiga } = await supabase
      .from('vendedores')
      .update({ profile_id: newUser.user.id })
      .eq('id', inv.vendedor_id)
      .is('profile_id', null)
    if (eLiga) {
      // No se aborta: la cuenta ya existe y es mejor que entre sin ficha que
      // dejarla a medias. Un super admin la liga desde Equipo.
      console.error('[activar] no se pudo ligar la ficha de vendedor', eLiga.message)
    }
  }

  // Marcar invitación como usada
  await supabase.from('invitaciones').update({ used: true }).eq('token', token)

  return NextResponse.json({ ok: true })
}

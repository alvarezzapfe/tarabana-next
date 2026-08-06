import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'No hay sesión de recuperación activa. Solicita un nuevo link.' },
      { status: 401 }
    )
  }

  const { password } = await request.json()
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'La contraseña debe tener al menos 8 caracteres.' },
      { status: 400 }
    )
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    )
  }

  // Mark account as activated (for client portal onboarding tracking)
  const service = createServiceClient()
  await service.from('profiles')
    .update({ cuenta_activada_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('cuenta_activada_at', null)

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}

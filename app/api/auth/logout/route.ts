import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

const INTERNAL_ROLES = ['super_admin', 'admin', 'ventas', 'produccion', 'contabilidad']

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()

  // Determine destination BEFORE signing out (signOut clears the session)
  let destination = '/portal'
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile && INTERNAL_ROLES.includes(profile.role)) {
        destination = '/tierra-mojada'
      }
    }
  } catch {
    // If anything fails, default to portal (safe — never exposes admin URL)
  }

  await supabase.auth.signOut()
  return NextResponse.redirect(new URL(destination, request.url))
}

import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isStaff } from '../../../../src/lib/roles'

const ADMIN_LOGIN = '/tierra-mojada'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()

  // Read role BEFORE signOut (session still alive) using service_role
  // to bypass RLS — anon key + profiles_self_read can fail on JWT refresh races.
  // Fail closed: default to /portal, never to admin URL.
  let destination = '/portal'
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const service = createServiceClient()
      const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
      if (profile && isStaff(profile.role)) {
        destination = ADMIN_LOGIN
      }
    }
  } catch {
    // Default to /portal — never expose admin URL on error
  }

  await supabase.auth.signOut()
  return NextResponse.redirect(new URL(destination, request.url))
}

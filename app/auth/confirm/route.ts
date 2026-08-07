import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  if (!tokenHash || !type) {
    url.pathname = '/portal'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as any,
  })

  const isNuevo = url.searchParams.get('nuevo') === '1'
  url.search = ''

  if (error) {
    url.pathname = '/portal/reset-password'
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  // Session is now in the cookie — redirect to the password form
  url.pathname = '/portal/reset-password'
  if (isNuevo) url.searchParams.set('nuevo', '1')
  return NextResponse.redirect(url)
}

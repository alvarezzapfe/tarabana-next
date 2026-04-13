import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  const origin = new URL(request.url).origin
  return NextResponse.redirect(`${origin}/login`)
}

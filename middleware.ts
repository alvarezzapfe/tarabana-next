import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Rutas admin protegidas
  const adminPaths = ['/admin', '/produccion', '/ventas', '/mi-cuenta']
  if (adminPaths.some(p => path.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rutas portal protegidas (NO incluir /portal exacto ni /portal/onboarding)
  const portalProtegido = ['/portal/catalogo', '/portal/pedidos', '/portal/puntos', '/portal/cuenta']
  if (portalProtegido.some(p => path.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/portal', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

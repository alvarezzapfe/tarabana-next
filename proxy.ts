import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { conReturnTo } from './src/lib/return-to'

export async function proxy(request: NextRequest) {
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

  // Rutas admin protegidas — redirect a /portal, nunca exponer la URL de login admin
  const adminPaths = ['/admin', '/produccion', '/ventas', '/mi-cuenta']
  if (adminPaths.some(p => path.startsWith(p)) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/portal'
    url.search = ''
    // Se guarda a donde iba. Hace falta por el QR de los tanques: sin esto,
    // escanear el de FV3 sin sesion dejaba al cervecero en el portal de
    // clientes y el destino se perdia.
    //
    // Sigue yendo a /portal y NO a /tierra-mojada: el comentario original de
    // esta rama es que la URL del login admin no se expone, y eso no cambia.
    // El portal reenvia a `returnTo` despues del login si el perfil puede
    // entrar al panel.
    //
    // `conReturnTo` valida contra una lista blanca: sin eso, este parametro
    // seria un redirector abierto.
    const destino = conReturnTo('/portal', path + (request.nextUrl.search || ''))
    const [, query] = destino.split('?')
    if (query) url.search = `?${query}`
    return NextResponse.redirect(url)
  }

  // Rutas portal protegidas (NO incluir /portal exacto ni /portal/onboarding)
  const portalProtegido = ['/portal/catalogo', '/portal/pedidos', '/portal/puntos', '/portal/cuenta']
  if (portalProtegido.some(p => path.startsWith(p)) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/portal'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

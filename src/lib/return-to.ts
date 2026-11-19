/**
 * Destino al que volver despues de autenticarse.
 *
 * Existe por el QR de los tanques: escanear el de FV3 sin sesion mandaba a
 * `/portal` y el destino se perdia, asi que el cervecero acababa en el portal
 * de clientes en vez de en la captura del tanque.
 *
 * ── Por que una lista blanca y no "cualquier ruta" ──
 *
 * Un parametro de redireccion que acepte lo que sea es un redirector abierto:
 * un link a `tarabana.mx/portal?returnTo=https://sitio-falso/login` se ve
 * legitimo —el dominio es el nuestro— y termina en una pagina de captura de
 * credenciales. Por eso solo se acepta una ruta RELATIVA que empiece con
 * `/admin/`, que es el unico destino que este flujo necesita.
 *
 * Los casos que se rechazan, y por que cada uno:
 *
 *   https://otro.com/x   absoluta: destino fuera del sitio
 *   //otro.com/x         "protocol-relative": el navegador la resuelve como
 *                        absoluta, y es el bypass clasico de un filtro que
 *                        solo revisa que empiece con "/"
 *   /portal              dentro del sitio pero fuera del flujo
 *   backslashes          algunos navegadores los normalizan a "/"
 *   control chars        podrian partir un header de respuesta
 */

const PREFIJOS = ['/admin/'] as const

const CONTROL = /[\u0000-\u001f\u007f]/

export function returnToValido(valor: string | null | undefined): string | null {
  if (!valor) return null
  if (valor.length > 512) return null

  // Los backslashes se normalizan a "/" en varios navegadores, asi que una
  // ruta con ellos no se puede juzgar por su texto.
  if (valor.includes('\\')) return null

  // Tiene que empezar con una sola "/": "//host" es protocol-relative y el
  // navegador la trata como absoluta.
  if (!valor.startsWith('/') || valor.startsWith('//')) return null

  if (CONTROL.test(valor)) return null

  if (!PREFIJOS.some(p => valor.startsWith(p))) return null

  return valor
}

/** Lo agrega a una URL de destino solo si es valido. */
export function conReturnTo(base: string, returnTo: string | null | undefined): string {
  const limpio = returnToValido(returnTo)
  if (!limpio) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}returnTo=${encodeURIComponent(limpio)}`
}

/**
 * Lee `returnTo` de la URL del navegador, ya validado.
 *
 * Y no con `useSearchParams()`, a proposito: ese hook obliga a la pagina a
 * salirse del prerender estatico —o a envolverse en un Suspense— y tanto
 * /portal como /tierra-mojada/verificar son estaticas hoy. El valor solo se
 * necesita DENTRO del handler del submit, que corre en el navegador, asi que
 * leerlo de `window.location` no cuesta nada y deja las dos paginas como
 * estaban.
 *
 * Devuelve null en el servidor.
 */
export function returnToDeURL(): string | null {
  if (typeof window === 'undefined') return null
  return returnToValido(new URLSearchParams(window.location.search).get('returnTo'))
}

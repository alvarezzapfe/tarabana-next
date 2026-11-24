/**
 * Prueba de NEGACION sobre public.recetas: que el rol `anon` no vea nada.
 *
 *   node scripts/negacion-recetas.mjs
 *
 * SOLO LECTURA. Hace dos peticiones GET y nada mas; no escribe en produccion
 * ni crea usuarios. Sale con codigo != 0 si la prueba falla o si queda
 * inconclusa, asi que sirve en CI y no solo a ojo.
 *
 * ── Por que son DOS lecturas ──
 *
 * El lado de negacion es el que importa para seguridad: que un rol sin
 * permiso reciba 401/403 o 0 filas. Pero "0 filas" solo significa algo si la
 * tabla TIENE filas — con `recetas` vacia, 0 salia igual si la policy
 * funcionaba que si no, y por eso esta prueba estuvo meses sin poderse hacer
 * (ver docs/HANDOFF.md).
 *
 *   1. CONTROL DE DATOS, con la service role key: cuantas filas hay de
 *      verdad. SALTA RLS por diseño y NO prueba ninguna policy. Sirve
 *      unicamente para descartar que el 0 de abajo sea falta de datos.
 *   2. NEGACION, con la anon key y sin sesion: tiene que ver 0 de esas filas.
 *   3. CONTROL POSITIVO, con la MISMA anon key, contra `productos`, que si
 *      tiene policy para anon (`productos_read_anon`, por el sitio publico).
 *      Tiene que ver filas. Sin esto, un 0 en el paso 2 podria ser plomeria
 *      —URL mal, llave ignorada, red caida— y se leeria como seguridad.
 *      Con esto, la misma llave en la misma corrida ve 0 en una tabla y N en
 *      la otra: lo unico que cambia entre las dos es la policy.
 *
 * ── Que se espera ──
 *
 * Las tres policies de la tabla son `to authenticated`:
 *
 *   recetas_select  for select to authenticated using (is_staff_sin_ventas())
 *   recetas_insert  for insert to authenticated with check (can_manage_inventory())
 *   recetas_update  for update to authenticated ...
 *
 * O sea que el rol `anon` no tiene NINGUNA, y con RLS encendido la lectura
 * da 200 con lista vacia. El 200 —y no 401— es parte del resultado: confirma
 * que la anon key se acepto, asi que lo que detiene la lectura es la policy y
 * no una credencial invalida.
 *
 * ── Lo que esta prueba NO cubre ──
 *
 * El lado de un usuario AUTENTICADO pero sin permiso (un `vendedor`, contra
 * `is_staff_sin_ventas()`). Eso pide una sesion de prueba y sigue pendiente.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const TABLA = 'recetas'
/**
 * Tabla legible por `anon` A PROPOSITO, para el control positivo.
 *
 * `productos_read_anon` existe desde 20260729000000_enable_rls.sql porque el
 * sitio publico lista las cervezas. Si algun dia deja de ser publica, este
 * control hay que moverlo a otra tabla con policy para anon, no borrarlo.
 */
const TABLA_CONTROL = 'productos'

/**
 * Las variables, de .env.local o del ambiente.
 *
 * El fallback a process.env no es adorno: en CI no hay .env.local, y una
 * prueba de seguridad que solo corre en la laptop de alguien no es una
 * prueba.
 */
function variables() {
  const env = { ...process.env }
  const archivo = join(RAIZ, '.env.local')
  if (existsSync(archivo)) {
    for (const l of readFileSync(archivo, 'utf8').split('\n')) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      // El ambiente gana sobre el archivo, que es lo que espera CI.
      if (m && !process.env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = variables()
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

const faltan = [
  !URL_BASE && 'NEXT_PUBLIC_SUPABASE_URL',
  !ANON && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  !SERVICE && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean)

if (faltan.length) {
  console.error(`\n  Faltan variables (.env.local o ambiente): ${faltan.join(', ')}\n`)
  process.exit(1)
}

/**
 * Un GET a PostgREST pidiendo la cuenta exacta.
 *
 * `Range: 0-0` trae a lo mucho una fila: la cuenta viaja en el header
 * `content-range`, asi que no hace falta descargar la tabla para contarla.
 * Nunca se imprime la llave.
 */
async function leer(tabla, key, etiqueta) {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=id`, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const rango = res.headers.get('content-range') || ''
  const bruto = rango.includes('/') ? rango.split('/')[1] : '*'
  const cuerpo = await res.text()
  return {
    etiqueta,
    status: res.status,
    // '*' es la respuesta de PostgREST cuando no pudo contar.
    cuenta: bruto === '*' ? null : Number(bruto),
    cuerpo: cuerpo.slice(0, 160),
  }
}

console.log('')
console.log(`  Prueba de negacion sobre public.${TABLA}   (solo GET, cero escrituras)`)
console.log('  ' + '-'.repeat(68))

const control = await leer(TABLA, SERVICE, `service role / ${TABLA} (SALTA RLS)`)
const anon = await leer(TABLA, ANON, `anon / ${TABLA}`)
const positivo = await leer(TABLA_CONTROL, ANON, `anon / ${TABLA_CONTROL} (control+)`)

for (const r of [control, anon, positivo]) {
  console.log(`  ${r.etiqueta.padEnd(34)} HTTP ${r.status}   filas visibles: ${r.cuenta ?? '?'}`)
}
console.log('')
console.log(`  respuesta de anon: ${anon.cuerpo || '(vacia)'}`)
console.log('')

// ── Veredicto ──
//
// Negado es 401/403 (ni siquiera entra) o 200 con 0 filas (entra y no ve
// nada). Los dos son resultados buenos; el que importa es que no vea filas.
const hayFilas = typeof control.cuenta === 'number' && control.cuenta > 0
const anonNoVe =
  anon.status === 401 || anon.status === 403 ||
  (anon.status === 200 && anon.cuenta === 0)
// La anon key SI esta leyendo: ve filas donde hay policy para ella.
const llaveVive = typeof positivo.cuenta === 'number' && positivo.cuenta > 0

if (!hayFilas) {
  console.log(`  INCONCLUSA: ${TABLA} esta vacia (o no se pudo contar), y 0 filas`)
  console.log('  no prueba nada contra una tabla vacia. Captura datos y repite.')
  process.exitCode = 1
} else if (!llaveVive) {
  console.log(`  INCONCLUSA: la anon key tampoco ve nada en ${TABLA_CONTROL}, donde SI`)
  console.log(`  tiene policy (HTTP ${positivo.status}). El 0 de ${TABLA} puede ser plomeria`)
  console.log('  —URL, llave o red— y no la policy. Revisa eso antes de creerle al 0.')
  process.exitCode = 1
} else if (!anonNoVe) {
  console.log(`  FALLA: anon ve ${anon.cuenta ?? '?'} de ${control.cuenta} filas (HTTP ${anon.status}).`)
  console.log('  La policy no esta deteniendo nada.')
  process.exitCode = 1
} else {
  console.log(`  PASA: anon ve 0 de ${control.cuenta} filas de ${TABLA} (HTTP ${anon.status}).`)
  console.log(`  La tabla NO esta vacia, y la misma llave ve ${positivo.cuenta} filas de`)
  console.log(`  ${TABLA_CONTROL} en esta misma corrida. Lo unico que cambia entre las dos`)
  console.log('  es la policy: el 0 no es falta de datos ni plomeria.')
}

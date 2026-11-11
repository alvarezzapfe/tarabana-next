/**
 * Lista maestra de precios de NOVIEMBRE 2026. Ya aplicada a produccion.
 *
 *   node scripts/precios-nov-2026.mjs           # diff, sin escribir
 *   node scripts/precios-nov-2026.mjs --aplicar # escribe lo que falte
 *
 * Esta aqui como REGISTRO de que se aplico y con que valores. Es idempotente:
 * solo escribe las celdas que difieren, asi que volver a correrlo sobre la
 * base ya actualizada no hace nada y no genera entradas de audit_log.
 *
 * Por que un script y no la pantalla: la lista llego como tabla para nueve
 * productos y 54 celdas, y capturarla a mano en la Lista de precios es donde se
 * cuelan los dedazos. La validacion es la MISMA que la de la ruta
 * `/api/admin/inventario/precios` —columna de la lista blanca, entero > 0,
 * dentro del tope— y el renglon de auditoria tiene la misma for
 * (`producto.precios` con el antes/despues por columna), mas un `origen` que
 * dice que entro por script y no desde la pantalla: el rastro tiene que decir
 * la verdad de como entro el dato.
 *
 * Reglas de la lista, verificadas antes de escribir:
 *   - "publico" -> columnas *_publico; "distribuidor" -> columnas *_taproom,
 *     que es el nivel mayorista (ver `precioSufijo`).
 *   - Barril acero 20 L = barril PET 20 L - 300, en los dos niveles.
 *   - Las cajas NO se escriben: `precioUnitario` las deriva del precio por
 *     lata (x12 y x24). Mover la lata mueve la caja, y eso se reporta.
 *   - No se tocan los barriles de 10 L, ni Zap Helles, ni Solarsteinn.
 *
 * Aplicado el 2026-11-10: 38 de las 54 celdas cambiaron, en 9 productos, con 9
 * entradas de audit_log. Las otras 16 ya coincidian.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { PRECIO_MAX, esColumnaPrecio } from '../src/lib/precios.ts'

/** Un renglon por producto, en pesos enteros. */
const LISTA = [
  { nombre: 'Brasa',       petPub: 2400, petMay: 1900, aceroPub: 2100, aceroMay: 1600, lataPub: 35, lataMay: 26 },
  { nombre: 'Oleaje',      petPub: 2400, petMay: 1900, aceroPub: 2100, aceroMay: 1600, lataPub: 35, lataMay: 26 },
  { nombre: 'Carboncillo', petPub: 2700, petMay: 2100, aceroPub: 2400, aceroMay: 1800, lataPub: 40, lataMay: 32 },
  { nombre: 'Sílice',      petPub: 2700, petMay: 2100, aceroPub: 2400, aceroMay: 1800, lataPub: 40, lataMay: 32 },
  { nombre: 'Brisa',       petPub: 2800, petMay: 2200, aceroPub: 2500, aceroMay: 1900, lataPub: 45, lataMay: 36 },
  { nombre: 'Chula Vista', petPub: 2900, petMay: 2250, aceroPub: 2600, aceroMay: 1950, lataPub: 50, lataMay: 40 },
  { nombre: 'Caliza',      petPub: 2900, petMay: 2250, aceroPub: 2600, aceroMay: 1950, lataPub: 50, lataMay: 40 },
  { nombre: 'Terragrana',  petPub: 2900, petMay: 2250, aceroPub: 2600, aceroMay: 1950, lataPub: 50, lataMay: 40 },
  { nombre: 'Magma',       petPub: 3200, petMay: 2500, aceroPub: 2900, aceroMay: 2200, lataPub: 60, lataMay: 45 },
]

const COLUMNAS = [
  ['precio_barril_pet_publico',   'petPub'],
  ['precio_barril_pet_taproom',   'petMay'],
  ['precio_barril_acero_publico', 'aceroPub'],
  ['precio_barril_acero_taproom', 'aceroMay'],
  ['precio_lata_publico',         'lataPub'],
  ['precio_lata_taproom',         'lataMay'],
]

/** Quien autorizo el cambio. Va en el audit_log como actor. */
const ACTOR = { id: '7242348c-5f3e-46f9-b2ee-4ccb2e890530', email: 'luis@tarabana.mx', role: 'super_admin' }
const ORIGEN = 'lista maestra noviembre 2026, aplicada por script (chore/precios-nov-2026)'

const aplicar = process.argv.includes('--aplicar')

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── La lista contra su propia regla, antes de mirar la base ──
for (const f of LISTA) {
  for (const [nivel, pet, acero] of [['público', f.petPub, f.aceroPub], ['mayorista', f.petMay, f.aceroMay]]) {
    if (pet - acero !== 300) {
      console.error(`ABORTA: ${f.nombre} ${nivel}: PET ${pet} − acero ${acero} = ${pet - acero}, no 300`)
      process.exit(1)
    }
  }
}

const { data: productos } = await sb.from('productos').select('*')
const porNombre = new Map(productos.map(p => [p.nombre, p]))

// ── Validacion completa antes de escribir nada ──
for (const f of LISTA) {
  if (!porNombre.has(f.nombre)) { console.error(`ABORTA: "${f.nombre}" no esta en el catalogo`); process.exit(1) }
  for (const [columna, clave] of COLUMNAS) {
    const v = f[clave]
    if (!esColumnaPrecio(columna)) { console.error(`ABORTA: "${columna}" no es columna de precio`); process.exit(1) }
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || !Number.isInteger(v) || v > PRECIO_MAX) {
      console.error(`ABORTA: ${f.nombre}.${columna} = ${v} no es un entero > 0 dentro del tope`)
      process.exit(1)
    }
  }
}

let celdas = 0
for (const f of LISTA) {
  const previo = porNombre.get(f.nombre)
  const diff = {}, update = {}
  for (const [columna, clave] of COLUMNAS) {
    const antes = previo[columna] === null || previo[columna] === undefined ? null : Number(previo[columna])
    if (antes === f[clave]) continue
    diff[columna] = { from: antes, to: f[clave] }
    update[columna] = f[clave]
  }

  const n = Object.keys(update).length
  if (n === 0) { console.log(`  ${f.nombre.padEnd(13)} sin cambios`); continue }
  console.log(`  ${f.nombre.padEnd(13)} ${n} celdas: ${Object.entries(diff).map(([k, d]) => `${k.replace('precio_', '')} ${d.from ?? '∅'}→${d.to}`).join(', ')}`)
  celdas += n

  if (!aplicar) continue

  const { error } = await sb.from('productos').update(update).eq('id', previo.id)
  if (error) { console.error(`ABORTA en ${f.nombre}: ${error.message}`); process.exit(1) }

  const { error: eAudit } = await sb.from('audit_log').insert({
    actor_id: ACTOR.id, actor_email: ACTOR.email, actor_role: ACTOR.role,
    accion: 'producto.precios', entidad: 'productos', entidad_id: previo.id,
    detalle: { nombre: f.nombre, changes: diff, origen: ORIGEN },
    ip: null,
  })
  if (eAudit) { console.error(`ABORTA: no se pudo auditar ${f.nombre}: ${eAudit.message}`); process.exit(1) }
}

console.log(aplicar ? `\nescritas ${celdas} celdas` : `\n${celdas} celdas por escribir. Corre con --aplicar para hacerlo.`)

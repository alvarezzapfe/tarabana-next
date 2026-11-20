/**
 * Screenshots del modulo de Produccion, pestaña por pestaña.
 *
 *   node scripts/shots-produccion.mjs
 *
 * Requiere .playwright-session.json (scripts/shots-login.mjs) y `next dev`.
 * Deja los PNG en shots/produccion/.
 *
 * Ademas del PNG mide el desborde horizontal de cada vista, que es la
 * invariante que el arreglo de ancho tenia que dejar en pie: un PNG no
 * distingue un desborde de 200 px de uno de 10.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE || 'http://localhost:3000'
const SESION = '.playwright-session.json'
const SALIDA = 'shots/produccion'
const LOTE = process.env.SHOTS_LOTE || 'a941240b-5b42-4ee7-a647-49ed1207627e' // CAR-26-001

if (!existsSync(SESION)) {
  console.error(`\n  Falta ${SESION}. Corre primero:  node scripts/shots-login.mjs\n`)
  process.exit(1)
}
mkdirSync(SALIDA, { recursive: true })

/** [archivo, url, ancho, espera opcional] */
const VISTAS = [
  ['1-tablero',    '/admin/produccion?tab=tablero',    1440],
  ['2-tanques',    '/admin/produccion?tab=tanques',    1440],
  ['3-calendario', '/admin/produccion?tab=calendario', 1440],
  ['4-recetas',    '/admin/produccion?tab=recetas',    1440],
  ['5-historico',  '/admin/produccion?tab=historico',  1440],
  // La ficha pide su detalle al montarse, asi que necesita un respiro extra.
  ['6-ficha-CAR-26-001', `/admin/produccion?lote=${LOTE}`, 1440, 1800],
  ['7-nuevo-lote', '/admin/produccion?tab=tablero&nuevo=1', 1440, 900],
  ['8-tablero-movil', '/admin/produccion?tab=tablero', 390],
]

const navegador = await chromium.launch()
const medidas = []

for (const [nombre, ruta, ancho, extra = 0] of VISTAS) {
  const contexto = await navegador.newContext({
    storageState: SESION,
    viewport: { width: ancho, height: 1000 },
    deviceScaleFactor: 1,
  })
  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('console', m => { if (m.type() === 'error') errores.push(m.text().slice(0, 150)) })
  pagina.on('pageerror', e => errores.push(String(e).slice(0, 150)))

  await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
  await pagina.waitForTimeout(700 + extra)

  const m = await pagina.evaluate(() => {
    const main = document.querySelector('main')
    const r = main?.getBoundingClientRect()
    return {
      url: location.pathname + location.search,
      // Si cayo al portal, la sesion no sirvio y el PNG no vale nada.
      enPortal: location.pathname.startsWith('/portal'),
      mainW: r ? Math.round(r.width) : null,
      desborda: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      titulo: document.querySelector('h1')?.textContent?.trim() ?? null,
      // Señales de que la vista de verdad cargo y no es un esqueleto vacio
      filas: document.querySelectorAll('tbody tr').length,
      dialogo: !!document.querySelector('[role="dialog"]'),
    }
  })

  const archivo = `${SALIDA}/${nombre}-${ancho}.png`
  await pagina.screenshot({ path: archivo, fullPage: true })
  medidas.push({ nombre, ancho, archivo, errores: errores.slice(0, 2), ...m })
  console.log(`  ${archivo}${m.enPortal ? '   <-- SIN SESION (cayo al portal)' : ''}`)
  await pagina.close()
  await contexto.close()
}

await navegador.close()

console.log('')
console.log(`${'vista'.padEnd(22)} ${'px'.padEnd(6)} ${'main W'.padEnd(8)} ${'desborda'.padEnd(10)} ${'filas'.padEnd(6)} ${'dialogo'.padEnd(8)} errs`)
console.log('-'.repeat(78))
for (const d of medidas) {
  const des = d.desborda > 0 ? `SI +${d.desborda}` : 'no'
  console.log(`${d.nombre.padEnd(22)} ${String(d.ancho).padEnd(6)} ${String(d.mainW).padEnd(8)} ${des.padEnd(10)} ${String(d.filas).padEnd(6)} ${String(d.dialogo).padEnd(8)} ${d.errores.length}`)
}
for (const d of medidas) {
  for (const e of d.errores) console.log(`\n  error en ${d.nombre}: ${e}`)
}
writeFileSync(`${SALIDA}/medidas.json`, JSON.stringify(medidas, null, 2))

const sinSesion = medidas.filter(d => d.enPortal)
const desbordan = medidas.filter(d => d.desborda > 0 && d.ancho >= 1200)
console.log('')
if (sinSesion.length) {
  console.log(`  ${sinSesion.length} vistas cayeron al portal: la sesion no sirvio.`)
  process.exitCode = 1
} else if (desbordan.length) {
  console.log('  DESBORDAN en escritorio:')
  for (const d of desbordan) console.log(`    ${d.nombre} @ ${d.ancho}px  +${d.desborda}px`)
  process.exitCode = 1
} else {
  console.log('  Sin desborde horizontal en escritorio, y todas con sesion.')
}

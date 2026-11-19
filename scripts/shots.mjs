/**
 * Screenshots del panel a 1440 y 390, con sesion.
 *
 *   node scripts/shots.mjs <etiqueta>
 *
 * Requiere .playwright-session.json (ver scripts/shots-login.mjs) y un
 * `next dev` corriendo. La etiqueta va en el nombre del archivo, para poder
 * comparar dos versiones del codigo:
 *
 *   git checkout 34f7bbb -- app/admin && node scripts/shots.mjs antes
 *   git checkout HEAD -- app/admin     && node scripts/shots.mjs despues
 *
 * Mide tambien la geometria de <main> y si el documento desborda a lo ancho,
 * que es mas preciso que mirar un PNG: un desborde de 240 px se ve igual que
 * uno de 10 si no se mide.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const ETIQUETA = process.argv[2] || 'actual'
const BASE = process.env.SHOTS_BASE || 'http://localhost:3000'
const SESION = '.playwright-session.json'
const SALIDA = process.env.SHOTS_DIR || 'shots'

if (!existsSync(SESION)) {
  console.error(`\n  Falta ${SESION}. Corre primero:  node scripts/shots-login.mjs\n`)
  process.exit(1)
}
mkdirSync(SALIDA, { recursive: true })

const RUTAS = [
  ['pedidos', '/admin/pedidos'],
  ['inventario', '/admin/inventario'],
  ['clientes', '/admin/clientes'],
  ['produccion', '/admin/produccion'],
]
const ANCHOS = [1440, 1200, 390]

const navegador = await chromium.launch()
const medidas = []

for (const ancho of ANCHOS) {
  const contexto = await navegador.newContext({
    storageState: SESION,
    viewport: { width: ancho, height: 900 },
    deviceScaleFactor: 1,
  })
  for (const [nombre, ruta] of RUTAS) {
    const pagina = await contexto.newPage()
    const errores = []
    pagina.on('console', m => { if (m.type() === 'error') errores.push(m.text().slice(0, 120)) })
    pagina.on('pageerror', e => errores.push(String(e).slice(0, 120)))

    await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
    // Un respiro para que terminen las animaciones de ancho del sidebar.
    await pagina.waitForTimeout(700)

    const m = await pagina.evaluate(() => {
      const main = document.querySelector('main')
      const r = main?.getBoundingClientRect()
      const cs = main ? getComputedStyle(main) : null
      return {
        url: location.pathname + location.search,
        mainLeft: r ? Math.round(r.left) : null,
        mainW: r ? Math.round(r.width) : null,
        padTop: cs?.paddingTop ?? null,
        padLeft: cs?.paddingLeft ?? null,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        desborda: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })

    const archivo = `${SALIDA}/${ETIQUETA}-${nombre}-${ancho}.png`
    await pagina.screenshot({ path: archivo, fullPage: false })
    medidas.push({ ancho, ruta: nombre, archivo, ...m, errores: errores.length })
    const aviso = m.url.includes('/portal') ? '  <-- SIN SESION (cayo al portal)' : ''
    console.log(`  ${archivo}${aviso}`)
    await pagina.close()
  }
  await contexto.close()
}

await navegador.close()

console.log('')
console.log(`${'ruta'.padEnd(13)} ${'px'.padEnd(6)} ${'main L'.padEnd(8)} ${'main W'.padEnd(8)} ${'pad'.padEnd(14)} ${'desborda'.padEnd(10)} errs`)
console.log('-'.repeat(72))
for (const d of medidas) {
  const pad = `${d.padTop}/${d.padLeft}`
  const des = d.desborda > 0 ? `SI +${d.desborda}` : 'no'
  console.log(`${d.ruta.padEnd(13)} ${String(d.ancho).padEnd(6)} ${String(d.mainLeft).padEnd(8)} ${String(d.mainW).padEnd(8)} ${pad.padEnd(14)} ${des.padEnd(10)} ${d.errores}`)
}
writeFileSync(`${SALIDA}/${ETIQUETA}-medidas.json`, JSON.stringify(medidas, null, 2))
console.log(`\n  medidas en ${SALIDA}/${ETIQUETA}-medidas.json`)

// La invariante que se pidio: ningun ancho de la pagina excede al viewport.
const malas = medidas.filter(d => d.desborda > 0)
if (malas.length === 0) {
  console.log('\n  scrollWidth === clientWidth en TODAS las rutas y anchos.')
} else {
  console.log('\n  DESBORDAN:')
  for (const d of malas) console.log(`    ${d.ruta} @ ${d.ancho}px  +${d.desborda}px`)
  process.exitCode = 1
}

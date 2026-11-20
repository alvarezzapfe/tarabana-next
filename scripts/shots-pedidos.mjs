/**
 * Mide y fotografia la tabla de Pedidos a 1100, 1200 y 1440.
 *
 *   node scripts/shots-pedidos.mjs
 *
 * Requiere .playwright-session.json (scripts/shots-login.mjs) y `next dev`.
 *
 * La invariante que se persigue: el CONTENEDOR de la tabla no debe tener
 * scroll horizontal desde 1100 px de ventana en adelante. Se mide sobre el
 * contenedor y no sobre el documento porque son cosas distintas: la pagina
 * puede estar perfecta mientras la tabla scrollea dentro de su tarjeta, que
 * es justo el sintoma que hay que matar.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE || 'http://localhost:3000'
const SESION = '.playwright-session.json'
const SALIDA = 'shots/pedidos'
const ANCHOS = [1100, 1200, 1440]

if (!existsSync(SESION)) {
  console.error(`\n  Falta ${SESION}. Corre primero:  node scripts/shots-login.mjs\n`)
  process.exit(1)
}
mkdirSync(SALIDA, { recursive: true })

const navegador = await chromium.launch()
const medidas = []

for (const ancho of ANCHOS) {
  const contexto = await navegador.newContext({
    storageState: SESION,
    viewport: { width: ancho, height: 950 },
    deviceScaleFactor: 1,
  })
  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('console', m => { if (m.type() === 'error') errores.push(m.text().slice(0, 140)) })
  pagina.on('pageerror', e => errores.push(String(e).slice(0, 140)))

  await pagina.goto(`${BASE}/admin/pedidos`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
  // El ResizeObserver mide despues del primer paint y puede esconder
  // columnas en el segundo; sin esta espera se fotografia el estado previo.
  await pagina.waitForTimeout(1200)

  const m = await pagina.evaluate(() => {
    const tabla = document.querySelector('table')
    const cont = tabla?.parentElement ?? null
    const doc = document.documentElement
    const main = document.querySelector('main')
    const encabezados = tabla
      ? [...tabla.querySelectorAll('thead th')].map(t => t.textContent.replace(/[▲▼]/g, '').trim()).filter(Boolean)
      : []
    return {
      enPortal: location.pathname.startsWith('/portal'),
      // La invariante pedida
      contScroll: cont?.scrollWidth ?? null,
      contClient: cont?.clientWidth ?? null,
      contDesborda: cont ? cont.scrollWidth - cont.clientWidth : null,
      tablaW: tabla ? Math.round(tabla.getBoundingClientRect().width) : null,
      // La pagina tampoco debe desbordar
      docDesborda: doc.scrollWidth - doc.clientWidth,
      mainW: main ? Math.round(main.getBoundingClientRect().width) : null,
      encabezados,
      filas: document.querySelectorAll('tbody tr').length,
    }
  })

  const archivo = `${SALIDA}/pedidos-${ancho}.png`
  await pagina.screenshot({ path: archivo, fullPage: false })
  medidas.push({ ancho, archivo, errores: errores.slice(0, 2), ...m })
  console.log(`  ${archivo}${m.enPortal ? '   <-- SIN SESION' : ''}`)
  await pagina.close()
  await contexto.close()
}

await navegador.close()

console.log('')
console.log(`${'ventana'.padEnd(9)} ${'main'.padEnd(7)} ${'contenedor'.padEnd(12)} ${'tabla'.padEnd(7)} ${'scroll tabla'.padEnd(14)} ${'doc'.padEnd(8)} filas`)
console.log('-'.repeat(76))
for (const d of medidas) {
  const cont = `${d.contClient} / ${d.contScroll}`
  const st = d.contDesborda > 0 ? `SI +${d.contDesborda}` : 'no'
  const dd = d.docDesborda > 0 ? `SI +${d.docDesborda}` : 'no'
  console.log(`${String(d.ancho).padEnd(9)} ${String(d.mainW).padEnd(7)} ${cont.padEnd(12)} ${String(d.tablaW).padEnd(7)} ${st.padEnd(14)} ${dd.padEnd(8)} ${d.filas}`)
}
console.log('')
for (const d of medidas) console.log(`  ${d.ancho}px -> ${d.encabezados.join(' | ')}`)
for (const d of medidas) for (const e of d.errores) console.log(`\n  error @${d.ancho}: ${e}`)

writeFileSync(`${SALIDA}/medidas.json`, JSON.stringify(medidas, null, 2))

const sinSesion = medidas.filter(d => d.enPortal)
const malas = medidas.filter(d => d.contDesborda > 0 || d.docDesborda > 0)
console.log('')
if (sinSesion.length) {
  console.log('  Cayo al portal: la sesion no sirvio. Los PNG no valen.')
  process.exitCode = 1
} else if (malas.length) {
  console.log('  TODAVIA DESBORDA:')
  for (const d of malas) console.log(`    ${d.ancho}px  tabla +${d.contDesborda}  documento +${d.docDesborda}`)
  process.exitCode = 1
} else {
  console.log('  scrollWidth === clientWidth en el contenedor de la tabla, en los tres anchos.')
  console.log('  Y el documento tampoco desborda.')
}

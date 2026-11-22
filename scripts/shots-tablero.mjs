/**
 * Mide y fotografia el kanban del Tablero de Produccion a 1100, 1200 y 1440.
 *
 *   node scripts/shots-tablero.mjs
 *
 * Requiere .playwright-session.json (scripts/shots-login.mjs) y `next dev`.
 *
 * La invariante que se persigue: el kanban NO hace scroll horizontal en
 * ninguna ventana de escritorio. Se mide en los dos lados, porque son fallas
 * distintas y cada una se ve sola:
 *
 *   - el CONTENEDOR del kanban (.tb-cols): si scrollWidth > clientWidth, las
 *     cinco columnas no caben y la ultima sale cortada — el sintoma original.
 *   - el DOCUMENTO: si desborda, el kanban se paso de <main> y se llevo la
 *     pagina entera, que es el bug de ancho de Pedidos otra vez.
 *
 * Tambien se imprime el ancho de cada pista del grid. Es lo que prueba que
 * las columnas vacias se colapsaron: cinco pistas iguales significan que
 * `plantilla` no hizo su trabajo.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE || 'http://localhost:3000'
const SESION = '.playwright-session.json'
const SALIDA = 'shots/produccion'
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
    viewport: { width: ancho, height: 1000 },
    deviceScaleFactor: 1,
  })
  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('console', m => { if (m.type() === 'error') errores.push(m.text().slice(0, 140)) })
  pagina.on('pageerror', e => errores.push(String(e).slice(0, 140)))

  await pagina.goto(`${BASE}/admin/produccion?tab=tablero`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
  await pagina.waitForTimeout(900)

  const m = await pagina.evaluate(() => {
    const cols = document.querySelector('.tb-cols')
    const doc = document.documentElement
    const main = document.querySelector('main')

    // Una pista por columna, en el orden del tablero, con su etiqueta. La
    // etiqueta de una columna vacia esta girada, pero el textContent es el
    // mismo.
    const pistas = cols
      ? [...cols.children].map(c => ({
          etapa: c.querySelector('.tb-tit')?.textContent?.trim() ?? '?',
          px: Math.round(c.getBoundingClientRect().width),
          lotes: c.querySelectorAll('.tb-card').length,
          riel: !!c.querySelector('.tb-riel'),
        }))
      : []

    return {
      enPortal: location.pathname.startsWith('/portal'),
      // La invariante pedida
      colsScroll: cols?.scrollWidth ?? null,
      colsClient: cols?.clientWidth ?? null,
      colsDesborda: cols ? cols.scrollWidth - cols.clientWidth : null,
      // El documento tampoco debe desbordar
      docDesborda: doc.scrollWidth - doc.clientWidth,
      mainW: main ? Math.round(main.getBoundingClientRect().width) : null,
      pistas,
      // Señales de que la vista cargo de verdad
      tarjetas: document.querySelectorAll('.tb-card').length,
      barras: document.querySelectorAll('[role="progressbar"]').length,
      // Ni una tarjeta debe desbordar su propia columna: ahi es donde se
      // asoma un texto sin elipsis.
      tarjetasDesbordadas: [...document.querySelectorAll('.tb-card')]
        .filter(c => c.scrollWidth > c.clientWidth).length,
      // El renglon que se quito
      enProceso: /lotes? en proceso/.test(document.body.innerText),
      vacio: /Vacío/.test(document.body.innerText),
    }
  })

  const archivo = `${SALIDA}/tablero-${ancho}.png`
  await pagina.screenshot({ path: archivo, fullPage: false })
  medidas.push({ ancho, archivo, errores: errores.slice(0, 2), ...m })
  console.log(`  ${archivo}${m.enPortal ? '   <-- SIN SESION' : ''}`)
  await pagina.close()
  await contexto.close()
}

await navegador.close()

console.log('')
console.log(`${'ventana'.padEnd(9)} ${'main'.padEnd(7)} ${'kanban'.padEnd(13)} ${'scroll kanban'.padEnd(15)} ${'doc'.padEnd(8)} ${'tarjetas'.padEnd(9)} barras`)
console.log('-'.repeat(82))
for (const d of medidas) {
  const k = `${d.colsClient} / ${d.colsScroll}`
  const sk = d.colsDesborda > 0 ? `SI +${d.colsDesborda}` : 'no'
  const dd = d.docDesborda > 0 ? `SI +${d.docDesborda}` : 'no'
  console.log(`${String(d.ancho).padEnd(9)} ${String(d.mainW).padEnd(7)} ${k.padEnd(13)} ${sk.padEnd(15)} ${dd.padEnd(8)} ${String(d.tarjetas).padEnd(9)} ${d.barras}`)
}

console.log('')
for (const d of medidas) {
  const p = d.pistas.map(x => `${x.etapa} ${x.px}px${x.riel ? ' (riel)' : ` [${x.lotes}]`}`).join('  ·  ')
  console.log(`  ${d.ancho}px -> ${p}`)
}
for (const d of medidas) for (const e of d.errores) console.log(`\n  error @${d.ancho}: ${e}`)

writeFileSync(`${SALIDA}/medidas-tablero.json`, JSON.stringify(medidas, null, 2))

const sinSesion = medidas.filter(d => d.enPortal)
const malas = medidas.filter(d => d.colsDesborda > 0 || d.docDesborda > 0)
const tarjetasMal = medidas.filter(d => d.tarjetasDesbordadas > 0)
console.log('')
if (sinSesion.length) {
  console.log('  Cayo al portal: la sesion no sirvio. Los PNG no valen.')
  process.exitCode = 1
} else if (malas.length) {
  console.log('  TODAVIA DESBORDA:')
  for (const d of malas) console.log(`    ${d.ancho}px  kanban +${d.colsDesborda}  documento +${d.docDesborda}`)
  process.exitCode = 1
} else {
  console.log('  scrollWidth === clientWidth en el contenedor del kanban, en los tres anchos.')
  console.log('  Y el documento tampoco desborda.')
  if (tarjetasMal.length) {
    console.log('')
    console.log('  Pero hay tarjetas que desbordan su columna (falta una elipsis):')
    for (const d of tarjetasMal) console.log(`    ${d.ancho}px -> ${d.tarjetasDesbordadas} tarjeta(s)`)
    process.exitCode = 1
  }
}

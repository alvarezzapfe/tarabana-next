/**
 * Abre un Chromium VISIBLE para que inicies sesion a mano UNA vez, y guarda
 * la sesion en un archivo para que el script de screenshots pueda entrar.
 *
 *   node scripts/shots-login.mjs
 *
 * Existe porque el panel exige MFA (app/admin/layout.tsx revisa AAL2), asi
 * que no hay forma de autenticarse desde un script sin tu segundo factor. Tu
 * entras, el navegador se queda con las cookies, y aqui se vuelcan a disco.
 *
 * El archivo que produce (.playwright-session.json) trae tus cookies de
 * sesion: esta en .gitignore y conviene borrarlo cuando acabes.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const DESTINO = '.playwright-session.json'
const BASE = process.env.SHOTS_BASE || 'http://localhost:3000'

const navegador = await chromium.launch({ headless: false })
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
const pagina = await contexto.newPage()

await pagina.goto(`${BASE}/tierra-mojada`)

console.log('')
console.log('  Se abrio un Chromium. Inicia sesion ahi, con tu MFA, hasta')
console.log(`  que veas el panel en ${BASE}/admin`)
console.log('')
console.log('  No hay que apretar nada: en cuanto detecte que estas dentro,')
console.log('  guarda la sesion y cierra el navegador solo.')
console.log('')

/*
 * Se detecta por la URL y no con un Enter en la terminal.
 *
 * La version anterior pedia Enter, y eso la volvia inservible en cuanto el
 * proceso pasaba a segundo plano: ahi ya no hay teclado conectado, el script
 * se quedaba esperando para siempre y la sesion nunca se guardaba.
 */
const LIMITE_MS = 10 * 60 * 1000
const inicio = Date.now()
let dentro = false

while (Date.now() - inicio < LIMITE_MS) {
  const url = pagina.url()
  // /admin, pero no el portal ni el verificador de MFA: esos son escalas.
  if (/\/admin(\/|$|\?)/.test(url) && !url.includes('/verificar')) {
    // Un respiro para que terminen de asentarse las cookies de la sesion.
    await pagina.waitForTimeout(1500)
    dentro = true
    break
  }
  await pagina.waitForTimeout(1000)
}

if (!dentro) {
  console.log('  Se acabo el tiempo sin detectar /admin. No se guardo nada.')
  await navegador.close()
  process.exit(1)
}

const estado = await contexto.storageState()
writeFileSync(DESTINO, JSON.stringify(estado, null, 2))

console.log('')
console.log(`  Sesion guardada en ${DESTINO}  (detectado en ${pagina.url()})`)
console.log(`  ${estado.cookies.length} cookies`)

await navegador.close()

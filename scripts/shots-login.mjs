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
import { createInterface } from 'node:readline'

const DESTINO = '.playwright-session.json'
const BASE = process.env.SHOTS_BASE || 'http://localhost:3000'

const navegador = await chromium.launch({ headless: false })
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
const pagina = await contexto.newPage()

await pagina.goto(`${BASE}/tierra-mojada`)

console.log('')
console.log('  Se abrio un Chromium. Inicia sesion ahi (incluido el codigo MFA)')
console.log(`  hasta que veas el panel en ${BASE}/admin`)
console.log('')
console.log('  Cuando ya estes dentro, vuelve aqui y aprieta Enter.')
console.log('')

await new Promise(resolve => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.question('  Enter cuando estes dentro del panel: ', () => { rl.close(); resolve() })
})

const estado = await contexto.storageState()
writeFileSync(DESTINO, JSON.stringify(estado, null, 2))

const url = pagina.url()
console.log('')
console.log(`  Sesion guardada en ${DESTINO}`)
console.log(`  Ultima URL del navegador: ${url}`)
if (!url.includes('/admin')) {
  console.log('')
  console.log('  OJO: la URL no es de /admin, asi que puede que la sesion no haya')
  console.log('  quedado completa. Si los screenshots salen del portal, vuelve a correr esto.')
}

await navegador.close()

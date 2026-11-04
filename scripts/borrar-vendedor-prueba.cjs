/**
 * Borra TODO lo que la prueba del rol vendedor (Fase 2) creo en produccion.
 *
 *   node scripts/borrar-vendedor-prueba.cjs          # muestra que borraria
 *   node scripts/borrar-vendedor-prueba.cjs --si     # lo borra
 *
 * Busca por correo y por nombre de ficha, no por ids hardcodeados, asi que es
 * idempotente: si ya se borro, no hace nada. Solo toca filas de prueba.
 */
const fs = require('fs')
const path = require('path')

const RAIZ = path.resolve(__dirname, '..')
const env = {}
for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { createClient } = require(path.join(RAIZ, 'node_modules/@supabase/supabase-js'))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const CORREOS = [
  'luis+vendedor@tarabana.mx',
  'luis+clientevendedor@tarabana.mx',
  'luis+cli2vendedor@tarabana.mx',
]
const FICHA = 'PRUEBA - no usar'
const EJECUTAR = process.argv.includes('--si')

;(async () => {
  const { data: perfiles } = await db
    .from('profiles').select('id, email, role').in('email', CORREOS)
  const ids = (perfiles || []).map(p => p.id)
  const { data: fichas } = await db
    .from('vendedores').select('id, nombre').eq('nombre', FICHA)
  const fichaIds = (fichas || []).map(f => f.id)

  // Pedidos de la ficha de prueba o de los clientes de prueba.
  let pedidoIds = []
  if (fichaIds.length) {
    const { data } = await db.from('pedidos').select('id').in('vendedor_id', fichaIds)
    pedidoIds.push(...(data || []).map(p => p.id))
  }
  if (ids.length) {
    const { data } = await db.from('pedidos').select('id').in('cliente_id', ids)
    pedidoIds.push(...(data || []).map(p => p.id))
  }
  pedidoIds = [...new Set(pedidoIds)]

  console.log('perfiles  :', perfiles?.length || 0, (perfiles || []).map(p => p.email + ' (' + p.role + ')').join(', '))
  console.log('fichas    :', fichaIds.length, (fichas || []).map(f => f.nombre).join(', '))
  console.log('pedidos   :', pedidoIds.length, pedidoIds.map(i => i.slice(-6)).join(', '))

  if (!EJECUTAR) {
    console.log('\nSimulacion. Para borrar de verdad:')
    console.log('  node scripts/borrar-vendedor-prueba.cjs --si')
    return
  }

  // Orden por las FKs: hijos antes que padres.
  if (pedidoIds.length) {
    for (const [tabla, col] of [['comisiones', 'pedido_id'], ['pagos', 'pedido_id'], ['pedido_items', 'pedido_id']]) {
      const { error } = await db.from(tabla).delete().in(col, pedidoIds)
      console.log('borrado ' + tabla.padEnd(13), error ? 'ERROR ' + error.message : 'ok')
    }
    const { error } = await db.from('pedidos').delete().in('id', pedidoIds)
    console.log('borrado pedidos      ', error ? 'ERROR ' + error.message : 'ok')
  }

  // Suelta la ficha antes de borrar el perfil (profile_id es on delete set
  // null, pero se hace explicito) y luego la ficha.
  if (fichaIds.length) {
    await db.from('vendedores').update({ profile_id: null }).in('id', fichaIds)
    await db.from('profiles').update({ vendedor_id: null }).in('vendedor_id', fichaIds)
    const { error } = await db.from('vendedores').delete().in('id', fichaIds)
    console.log('borrada ficha        ', error ? 'ERROR ' + error.message : 'ok')
  }

  // auth.admin.deleteUser se lleva la fila de profiles y el factor TOTP.
  for (const p of perfiles || []) {
    const { error } = await db.auth.admin.deleteUser(p.id)
    console.log('borrado usuario', p.email.padEnd(34), error ? 'ERROR ' + error.message : 'ok')
  }

  console.log('\nListo. Verificacion:')
  const { data: quedan } = await db.from('profiles').select('email').in('email', CORREOS)
  const { data: fq } = await db.from('vendedores').select('nombre').eq('nombre', FICHA)
  console.log('  perfiles restantes:', quedan?.length || 0)
  console.log('  fichas restantes  :', fq?.length || 0)
})()

/**
 * Borra TODO lo que la prueba de comisiones (Fase 3) creo en produccion.
 *
 *   node scripts/borrar-comisiones-prueba.cjs          # muestra que borraria
 *   node scripts/borrar-comisiones-prueba.cjs --si     # lo borra
 *
 * Busca por correo, por nombre de ficha y por marca en las notas, no por ids
 * hardcodeados, asi que es idempotente: si ya se borro, no hace nada.
 *
 * Los cortes de la prueba se reconocen por la marca en `notas`. Los TRAMOS no
 * tienen donde llevar marca, asi que solo se borran los de las fichas de
 * prueba; la escalera global y la de las fichas reales se quedan salvo que
 * pases --escaleras, porque no hay forma de distinguir la que dejo la prueba
 * de la que capturaste tu a mano.
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
  'luis+pruebacomsuper@tarabana.mx',
  'luis+pruebacomvend@tarabana.mx',
  'luis+pruebacomcli@tarabana.mx',
]
const FICHA = 'PRUEBA COMISIONES - borrar'
/** Marca que la prueba deja en pedidos.notas_internas y comision_cortes.notas. */
const MARCA = 'PRUEBA-COMISIONES'
const EJECUTAR = process.argv.includes('--si')
/** Tirar tambien la escalera global y la de las fichas reales (no llevan marca). */
const BORRAR_ESCALERAS = process.argv.includes('--escaleras')

;(async () => {
  const { data: perfiles } = await db
    .from('profiles').select('id, email, role').in('email', CORREOS)
  const ids = (perfiles || []).map(p => p.id)

  const { data: fichas } = await db
    .from('vendedores').select('id, nombre').eq('nombre', FICHA)
  const fichaIds = (fichas || []).map(f => f.id)

  // Pedidos de la prueba: los marcados, mas los de la ficha y los clientes
  // de prueba por si algo quedo sin marca.
  let pedidoIds = []
  const { data: marcados } = await db
    .from('pedidos').select('id').ilike('notas_internas', `%${MARCA}%`)
  pedidoIds.push(...(marcados || []).map(p => p.id))
  if (fichaIds.length) {
    const { data } = await db.from('pedidos').select('id').in('vendedor_id', fichaIds)
    pedidoIds.push(...(data || []).map(p => p.id))
  }
  if (ids.length) {
    const { data } = await db.from('pedidos').select('id').in('cliente_id', ids)
    pedidoIds.push(...(data || []).map(p => p.id))
  }
  pedidoIds = [...new Set(pedidoIds)]

  // Cortes y tramos de la prueba.
  const { data: cortesMarcados } = await db
    .from('comision_cortes').select('id, vendedor_id, periodo, comision, notas')
    .ilike('notas', `%${MARCA}%`)
  const corteIds = (cortesMarcados || []).map(c => c.id)

  const { data: tramos } = await db.from('comision_tramos').select('id, vendedor_id')

  console.log('perfiles  :', perfiles?.length || 0, (perfiles || []).map(p => p.email + ' (' + p.role + ')').join(', '))
  console.log('fichas    :', fichaIds.length, (fichas || []).map(f => f.nombre).join(', '))
  console.log('pedidos   :', pedidoIds.length, pedidoIds.map(i => i.slice(-6)).join(', '))
  console.log('cortes    :', corteIds.length, 'marcados como prueba')
  console.log('tramos    :', (tramos || []).length, 'en total (se borran los de la prueba)')

  if (!EJECUTAR) {
    console.log('\nSimulacion. Para borrar de verdad:')
    console.log('  node scripts/borrar-comisiones-prueba.cjs --si')
    return
  }

  // ── Cortes y tramos ───────────────────────────────────────
  if (corteIds.length) {
    const { error } = await db.from('comision_cortes').delete().in('id', corteIds)
    console.log('borrados cortes      ', error ? 'ERROR ' + error.message : 'ok')
  }
  // Los cortes de las fichas de prueba, marcados o no.
  if (fichaIds.length) {
    await db.from('comision_cortes').delete().in('vendedor_id', fichaIds)
  }
  // Tramos de las fichas de prueba: esos si son inequivocamente de la prueba.
  if (fichaIds.length) {
    const { error } = await db.from('comision_tramos').delete().in('vendedor_id', fichaIds)
    console.log('borrados tramos de la ficha de prueba', error ? 'ERROR ' + error.message : 'ok')
  }

  // La escalera GLOBAL y la de las fichas reales no llevan marca: no hay forma
  // de distinguir la que dejo la prueba de la que capturaste tu. Por eso solo
  // se borran si lo pides explicito.
  if (BORRAR_ESCALERAS) {
    const { error } = await db.from('comision_tramos').delete().not('id', 'is', null)
    console.log('borradas TODAS las escaleras', error ? 'ERROR ' + error.message : 'ok (lo pediste con --escaleras)')
  } else {
    const { count } = await db.from('comision_tramos').select('*', { count: 'exact', head: true })
    if (count) {
      console.log(`quedan ${count} tramos (global y/o de fichas reales).`)
      console.log('  Si son de la prueba y quieres tirarlos: --si --escaleras')
    }
  }

  // ── Pedidos y sus hijos ───────────────────────────────────
  if (pedidoIds.length) {
    for (const [tabla, col] of [['pagos', 'pedido_id'], ['pedido_items', 'pedido_id']]) {
      const { error } = await db.from(tabla).delete().in(col, pedidoIds)
      console.log('borrado ' + tabla.padEnd(13), error ? 'ERROR ' + error.message : 'ok')
    }
    const { error } = await db.from('pedidos').delete().in('id', pedidoIds)
    console.log('borrado pedidos      ', error ? 'ERROR ' + error.message : 'ok')
  }

  // ── Ficha y usuarios ──────────────────────────────────────
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

  // audit_log guarda el correo como texto, asi que las entradas sobreviven al
  // borrado del usuario. Se van por correo, no por accion: asi no se toca
  // ninguna entrada de comisiones que hayas generado tu.
  const { error: eAudit, count: nAudit } = await db
    .from('audit_log').delete({ count: 'exact' }).in('actor_email', CORREOS)
  console.log('borrado audit_log    ', eAudit ? 'ERROR ' + eAudit.message : `ok (${nAudit} entradas de los usuarios de prueba)`)

  // ── Verificacion ──────────────────────────────────────────
  console.log('\nListo. Verificacion:')
  const { data: quedan } = await db.from('profiles').select('email').in('email', CORREOS)
  const { data: fq } = await db.from('vendedores').select('nombre').eq('nombre', FICHA)
  const { count: nTramos } = await db.from('comision_tramos').select('*', { count: 'exact', head: true })
  const { count: nCortes } = await db.from('comision_cortes').select('*', { count: 'exact', head: true })
  const { count: nPedidos } = await db.from('pedidos').select('*', { count: 'exact', head: true })
  const { count: nPagos } = await db.from('pagos').select('*', { count: 'exact', head: true })
  console.log('  perfiles restantes:', quedan?.length || 0)
  console.log('  fichas restantes  :', fq?.length || 0)
  console.log('  comision_tramos   :', nTramos)
  console.log('  comision_cortes   :', nCortes)
  console.log('  pedidos (total)   :', nPedidos, '— eran 13 antes de la prueba')
  console.log('  pagos (total)     :', nPagos, '— eran 4 antes de la prueba')
})()

/**
 * Flujo completo del IVA contra produccion.
 *
 *   node --import ./scripts/resolver-ts.mjs scripts/verificar-iva.mjs
 *
 * Crea cuatro pedidos de prueba, los ejercita y los BORRA al final, luego
 * comprueba que pedidos, pedido_items, pagos y el stock quedaron con el mismo
 * conteo de antes. No toca audit_log.
 *
 * Usa las funciones REALES de la app —crearPedido, ivaDe, sobrepagoDe,
 * calcularComision— y no reimplementaciones: una copia del calculo aqui
 * probaria la copia, no lo que corre.
 *
 * Lo que NO prueba, y hay que decirlo: la capa HTTP y RLS. El service client
 * se salta las policies, asi que esto verifica el MODELO de datos y la
 * aritmetica, no quien tiene permiso de que. Los pagos replican la logica de
 * /api/admin/pagos (leer saldo de la vista, rechazar si lo excede, insertar)
 * en vez de llamar la ruta, porque no hay sesion.
 *
 * El loader de ./resolver-ts.mjs existe porque src/lib escribe sus imports
 * sin extension: Next los resuelve, node no.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const R = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
for (const l of readFileSync(`${R}/.env.local`,'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const { crearPedido } = await import(`${R}/src/lib/crear-pedido.ts`)
const { ivaDe } = await import(`${R}/src/lib/iva.ts`)
const { sobrepagoDe } = await import(`${R}/src/lib/editar-partidas.ts`)
const { calcularComision } = await import(`${R}/src/lib/comisiones.ts`)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let fallas = 0
const ok = (c, m) => { if (!c) fallas++; console.log(`${c ? '  OK  ' : ' FALLA'} ${m}`) }
const eq = (a, b, m) => ok(Number(a) === Number(b), `${m} — ${a}${Number(a) === Number(b) ? '' : ` (esperado ${b})`}`)

const SIN_FACTURA = '5cc4ff44-42c5-4be1-be6a-bde2f0a084d7'   // Alejandro Butron, publico
const CON_FACTURA = '1db000ac-56bc-485d-97b8-1dfd5c3deba9'   // Luis Armando, publico, requiere_factura
const CHULA = '75d2e8e3-f7a8-4521-904e-b5e1e78fdbd3'          // lata publico $50
const ACTOR = { userId: '7242348c-5f3e-46f9-b2ee-4ccb2e890530', userEmail: 'luis@tarabana.mx', role: 'super_admin' }
const NOTA = 'PRUEBA IVA automatizada — borrar'

// ── Foto del antes ──────────────────────────────────────────
const snap = async () => {
  const [{ data: prod }, { count: nPed }, { count: nItems }, { count: nPagos }, { count: nAudit }] = await Promise.all([
    db.from('productos').select('id, stock_latas, stock_caja24').order('id'),
    db.from('pedidos').select('id', { count: 'exact', head: true }),
    db.from('pedido_items').select('id', { count: 'exact', head: true }),
    db.from('pagos').select('id', { count: 'exact', head: true }),
    db.from('audit_log').select('id', { count: 'exact', head: true }),
  ])
  return { stock: JSON.stringify(prod), nPed, nItems, nPagos, nAudit }
}
const antes = await snap()
console.log(`antes: ${antes.nPed} pedidos, ${antes.nItems} partidas, ${antes.nPagos} pagos, ${antes.nAudit} audit_log\n`)

const creados = []
const crear = async (datos) => {
  const r = await crearPedido(
    { items: [{ producto_id: `${CHULA}-lata`, cantidad: datos.latas }], notas: NOTA, ...datos },
    { ...ACTOR, db, service: db, sinInvitacion: true }
  )
  if (!r.ok) { fallas++; console.log(' FALLA  crearPedido:', r.error); return null }
  creados.push(r.pedido_id)
  return r
}
const vista = async id => (await db.from('pedidos_saldo').select('*').eq('id', id).maybeSingle()).data

// ── A. Sin IVA ──────────────────────────────────────────────
console.log('A. Sin IVA — 10 latas a $50')
const a = await crear({ cliente_id: SIN_FACTURA, latas: 10 })
const va = await vista(a.pedido_id)
eq(va.total, 500, 'total bruto')
eq(va.iva_monto, 0, 'iva_monto')
eq(va.total_con_envio, 500, 'total_con_envio')
eq(va.saldo, 500, 'saldo')
ok(va.incluye_iva === false, 'incluye_iva = false (default del cliente)')

// ── B. Con IVA, misma mercancia ─────────────────────────────
console.log('\nB. Con IVA — la misma mercancia')
const b = await crear({ cliente_id: SIN_FACTURA, latas: 10, incluye_iva: true })
const vb = await vista(b.pedido_id)
eq(vb.total, 500, 'total bruto SIN IVA (las partidas no cambian)')
eq(vb.iva_tasa, 0.16, 'iva_tasa copiada de app_config')
eq(vb.iva_monto, ivaDe(500, 0.16), 'iva_monto = ivaDe(500, 0.16)')
eq(vb.total_con_envio, 580, 'total_con_envio')
eq(vb.saldo, 580, 'saldo con IVA')

// ── C. Default del cliente que factura ──────────────────────
console.log('\nC. Cliente con requiere_factura, sin mandar incluye_iva')
const c0 = await crear({ cliente_id: CON_FACTURA, latas: 2 })
const vc0 = await vista(c0.pedido_id)
ok(vc0.incluye_iva === true, 'incluye_iva = true por el default del cliente')
eq(vc0.iva_monto, 16, 'iva_monto de 100')

// ── D. Descuento porcentual + envio + IVA ───────────────────
console.log('\nD. 13 latas, descuento 7%, envio 123.45, con IVA')
const d = await crear({
  cliente_id: CON_FACTURA, latas: 13,
  descuento_tipo: 'porcentaje', descuento_valor: 7, descuento_motivo: 'Prueba IVA',
  costo_envio: 123.45,
})
const vd = await vista(d.pedido_id)
const baseD = 650 - 45.5 + 123.45
eq(vd.descuento_monto, 45.5, 'descuento 7% de 650')
eq(Math.round((vd.total_con_envio - vd.iva_monto) * 100) / 100, baseD, 'base = total - descuento + envio')
eq(vd.iva_monto, ivaDe(baseD, 0.16), `iva_monto = ivaDe(${baseD}, 0.16) — el redondeo de la vista`)
eq(vd.total_con_envio, 844.42, 'total con IVA')
ok(Number(vd.iva_monto) === 116.47, `redondeo: 727.95 x 0.16 = 116.472 -> ${vd.iva_monto}`)

// ── E. Pago parcial, por el RPC real ────────────────────────
console.log('\nE. Pagos parciales sobre D (misma logica que /api/admin/pagos)')
// Se replica lo que hace la ruta del panel: leer el saldo de la VISTA,
// rechazar si el monto lo excede, e insertar. Es justo lo que interesa
// probar: que el saldo contra el que se valida ya trae el IVA.
const pagar = async (pedido_id, monto) => {
  const { data: s } = await db.from('pedidos_saldo').select('saldo').eq('id', pedido_id).single()
  if (!s) return { message: 'Pedido no encontrado' }
  if (monto > Number(s.saldo)) return { message: `El monto (${monto}) excede el saldo (${s.saldo})` }
  const { error } = await db.from('pagos').insert({
    pedido_id, monto, metodo: 'transferencia', referencia: NOTA,
    fecha_pago: new Date().toISOString().slice(0, 10), registrado_por: ACTOR.userId,
  })
  return error
}
ok(!(await pagar(d.pedido_id, 400)), 'primer abono de 400 aceptado')
let vd2 = await vista(d.pedido_id)
eq(vd2.pagado, 400, 'pagado')
eq(vd2.saldo, 444.42, 'saldo = total con IVA - pagado')
ok(vd2.estado_cobro === 'parcial', `estado_cobro = ${vd2.estado_cobro}`)

// El IVA es cobrable: sin el, 800 pasaria del saldo y el RPC lo rechazaria.
ok(!(await pagar(d.pedido_id, 400)), 'segundo abono de 400 aceptado (el saldo incluye el IVA)')
vd2 = await vista(d.pedido_id)
eq(vd2.pagado, 800, 'pagado')
eq(vd2.saldo, 44.42, 'saldo restante')
// Sin IVA el pedido valdria 727.95, asi que el segundo abono de 400 habria
// sido rechazado por la misma regla: el IVA no es decorativo, es cobrable.
ok(400 > 727.95 - 400, 'sin IVA ese segundo abono de 400 habria excedido el saldo')

// ── F. Apagar el IVA con pagos encima ───────────────────────
console.log('\nF. Apagar el IVA de D, que ya tiene 800 pagados')
const prediccion = sobrepagoDe({
  total: 650, descuento_tipo: 'porcentaje', descuento_valor: 7, costo_envio: 123.45,
  incluye_iva: false, iva_tasa: 0.16, pagado: 800,
})
ok(prediccion !== null, `sobrepagoDe avisa: sobra ${prediccion?.sobra}`)
eq(prediccion.aCobrar, 727.95, 'aCobrar sin IVA')
eq(prediccion.sobra, 72.05, 'sobrepago anunciado')

await db.from('pedidos').update({ incluye_iva: false }).eq('id', d.pedido_id)
const vd3 = await vista(d.pedido_id)
eq(vd3.iva_monto, 0, 'iva_monto tras apagar')
eq(vd3.total_con_envio, prediccion.aCobrar, 'la vista cobra lo que sobrepagoDe predijo')
eq(vd3.saldo, -72.05, 'saldo negativo: el sobrepago que la UI pide confirmar')

// Y encenderlo de vuelta deja todo como estaba.
await db.from('pedidos').update({ incluye_iva: true }).eq('id', d.pedido_id)
eq((await vista(d.pedido_id)).total_con_envio, 844.42, 'prender de vuelta restituye el total')

// ── G. La tasa vive en el pedido ────────────────────────────
console.log('\nG. Cambiar la tasa del pedido no toca a los demas')
await db.from('pedidos').update({ iva_tasa: 0.08 }).eq('id', b.pedido_id)
const vb2 = await vista(b.pedido_id)
eq(vb2.iva_monto, 40, 'B al 8%: la vista usa la tasa DEL PEDIDO, no app_config')
eq((await vista(d.pedido_id)).iva_monto, 116.47, 'D sigue al 16%')
await db.from('pedidos').update({ iva_tasa: 0.16 }).eq('id', b.pedido_id)

// ── H. Comision: la misma mercancia comisiona igual ─────────
console.log('\nH. Comision sobre los pedidos reales A (sin IVA) y B (con IVA)')
const filaCom = v => ({ id: v.id, total: v.total, descuento_monto: v.descuento_monto, total_con_envio: v.total_con_envio })
const hoy = new Date().toISOString().slice(0, 10)
const periodo = hoy.slice(0, 7)
const ESC = [{ desde: 0, hasta: null, porcentaje: 10 }]
const comA = calcularComision({
  pagos: [{ pago_id: 'x1', pedido_id: a.pedido_id, monto: 500, fecha_pago: hoy, cancelado_at: null }],
  pedidos: [filaCom(await vista(a.pedido_id))], tramos: ESC, periodo,
})
const comB = calcularComision({
  pagos: [{ pago_id: 'x2', pedido_id: b.pedido_id, monto: 580, fecha_pago: hoy, cancelado_at: null }],
  pedidos: [filaCom(await vista(b.pedido_id))], tramos: ESC, periodo,
})
eq(comA.base, comB.base, 'misma base de comision cobrando 500 sin IVA y 580 con IVA')
eq(comA.base, 395.26, '500 / 1.265 (solo IEPS)')

// ── Limpieza ────────────────────────────────────────────────
console.log('\nLimpieza')
await db.from('pagos').delete().in('pedido_id', creados)
await db.from('pedido_items').delete().in('pedido_id', creados)
const { error: eDel } = await db.from('pedidos').delete().in('id', creados)
ok(!eDel, `${creados.length} pedidos de prueba borrados`)

const despues = await snap()
ok(despues.stock === antes.stock, 'el stock quedo byte a byte igual (nada se entrego)')
eq(despues.nPed, antes.nPed, 'filas en pedidos')
eq(despues.nItems, antes.nItems, 'filas en pedido_items')
eq(despues.nPagos, antes.nPagos, 'filas en pagos')
console.log(`\naudit_log: ${antes.nAudit} -> ${despues.nAudit} (+${despues.nAudit - antes.nAudit}) — NO se borran`)

const { data: vivos } = await db.from('pedidos').select('id').eq('notas', NOTA)
ok((vivos || []).length === 0, 'no quedo ningun pedido con la nota de prueba')

console.log(`\n${fallas === 0 ? 'TODO OK' : fallas + ' FALLAS'}`)

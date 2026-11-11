/**
 * Flujo completo del IVA POR PARTIDA contra produccion.
 *
 *   node --import ./scripts/resolver-ts.mjs scripts/verificar-iva-partida.mjs
 *
 * Crea pedidos de prueba, los ejercita y los BORRA al final, luego comprueba
 * que pedidos, pedido_items, pagos y el stock queden con el mismo conteo de
 * antes. No toca audit_log.
 *
 * Usa las funciones REALES de la app —crearPedido, baseGravableDe, ivaDe,
 * sobrepagoDe, calcularComision— y no reimplementaciones: una copia del
 * calculo aqui probaria la copia y no lo que corre.
 *
 * Lo que NO prueba, y hay que decirlo: la capa HTTP y RLS. El service client
 * se salta las policies, asi que esto verifica el MODELO de datos, los
 * triggers y la aritmetica, no quien tiene permiso de que.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const R = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
for (const l of readFileSync(`${R}/.env.local`, 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const { crearPedido } = await import(`${R}/src/lib/crear-pedido.ts`)
const { baseGravableDe, ivaDe } = await import(`${R}/src/lib/iva.ts`)
const { sobrepagoDe } = await import(`${R}/src/lib/editar-partidas.ts`)
const { calcularComision } = await import(`${R}/src/lib/comisiones.ts`)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let fallas = 0
const ok = (c, m) => { if (!c) fallas++; console.log(`${c ? '  OK  ' : ' FALLA'} ${m}`) }
const eq = (a, b, m) => ok(Number(a) === Number(b), `${m} — ${a}${Number(a) === Number(b) ? '' : ` (esperado ${b})`}`)

const SIN_FACTURA = '5cc4ff44-42c5-4be1-be6a-bde2f0a084d7'   // Alejandro Butron, publico
const CHULA = '75d2e8e3-f7a8-4521-904e-b5e1e78fdbd3'          // lata publico $50
const CALIZA = 'a9f92b23-d10a-4086-970e-bfec1ff9c69c'         // lata publico $50
const ACTOR = { userId: '7242348c-5f3e-46f9-b2ee-4ccb2e890530', userEmail: 'luis@tarabana.mx', role: 'super_admin' }
const NOTA = 'PRUEBA IVA POR PARTIDA — borrar'

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
/** Crea un pedido con dos partidas de 10 latas y las banderas que se le pasen. */
const crear = async (ivaChula, ivaCaliza, extra = {}) => {
  const r = await crearPedido(
    {
      cliente_id: SIN_FACTURA,
      items: [
        { producto_id: `${CHULA}-lata`, cantidad: 10, incluye_iva: ivaChula },
        { producto_id: `${CALIZA}-lata`, cantidad: 10, incluye_iva: ivaCaliza },
      ],
      notas: NOTA,
      ...extra,
    },
    { ...ACTOR, db, service: db, sinInvitacion: true }
  )
  if (!r.ok) { fallas++; console.log(' FALLA  crearPedido:', r.error); return null }
  creados.push(r.pedido_id)
  return r
}
const vista = async id => (await db.from('pedidos_saldo').select('*').eq('id', id).maybeSingle()).data

// ── A. Nada gravado ─────────────────────────────────────────
console.log('A. Nada gravado — 2 partidas de 10 latas a $50')
const a = await crear(false, false)
const va = await vista(a.pedido_id)
eq(va.total, 1_000, 'total bruto')
eq(va.base_gravable, 0, 'base_gravable')
eq(va.iva_monto, 0, 'iva_monto')
eq(va.total_con_envio, 1_000, 'total_con_envio')
ok(va.incluye_iva === false, 'resumen incluye_iva = false')

// ── B. Todo gravado ────────────────────────────────────────
console.log('\nB. Todo gravado — la misma mercancia')
const b = await crear(true, true)
const vb = await vista(b.pedido_id)
eq(vb.total, 1_000, 'total bruto SIN IVA (las partidas no cambian)')
eq(vb.base_gravable, 1_000, 'base_gravable')
eq(vb.iva_monto, 160, 'iva_monto')
eq(vb.total_con_envio, 1_160, 'total_con_envio')
ok(vb.incluye_iva === true, 'el trigger prendio el resumen solo')

// ── C. Mixto ───────────────────────────────────────────────
console.log('\nC. Mixto — una partida gravada de dos')
const c = await crear(true, false)
const vc = await vista(c.pedido_id)
eq(vc.base_gravable, 500, 'base_gravable = solo la partida marcada')
eq(vc.iva_monto, 80, 'iva_monto')
eq(vc.total_con_envio, 1_080, 'total_con_envio')
ok(vc.incluye_iva === false, 'el resumen dice false: no es "todo con IVA"')
eq(vc.base_gravable, baseGravableDe({ subtotal: 1_000, gravable: 500 }), 'la vista coincide con baseGravableDe')

// ── D. Mixto con descuento porcentual ──────────────────────
console.log('\nD. Mixto con descuento del 7%')
const d = await crear(true, false, {
  descuento_tipo: 'porcentaje', descuento_valor: 7, descuento_motivo: 'Prueba IVA partida',
})
const vd = await vista(d.pedido_id)
eq(vd.descuento_monto, 70, 'descuento 7% de 1,000')
// 500 x (1000-70)/1000 = 465
eq(vd.base_gravable, 465, 'base_gravable con el descuento prorrateado')
eq(vd.base_gravable, baseGravableDe({ subtotal: 1_000, gravable: 500, descuento: 70 }), 'coincide con baseGravableDe')
eq(vd.iva_monto, ivaDe(465, 0.16), 'iva_monto = ivaDe(465, 0.16)')
eq(vd.total_con_envio, 1_004.4, 'total_con_envio')

// ── E. Mixto con descuento de monto y envio ────────────────
console.log('\nE. Mixto con descuento de 333.33 y envio de 123.45')
const e = await crear(true, false, {
  descuento_tipo: 'monto', descuento_valor: 333.33, descuento_motivo: 'Prueba IVA partida',
  costo_envio: 123.45,
})
const ve = await vista(e.pedido_id)
const baseE = baseGravableDe({ subtotal: 1_000, gravable: 500, descuento: 333.33, envio: 123.45 })
eq(ve.base_gravable, baseE, `base_gravable ${ve.base_gravable} = baseGravableDe (envio exento)`)
// 500 x 666.67/1000 = 333.335 -> 333.34 (medio centavo arriba)
eq(ve.base_gravable, 333.34, 'el prorrateo redondeo 333.335 hacia arriba')
eq(ve.iva_monto, ivaDe(333.34, 0.16), 'iva_monto')

// ── F. El envio gravado ────────────────────────────────────
console.log('\nF. El mismo pedido con el flete gravado')
await db.from('pedidos').update({ envio_incluye_iva: true }).eq('id', e.pedido_id)
const vf = await vista(e.pedido_id)
// Redondeado porque 333.34 + 123.45 da 456.78999999999996 en float: el
// numero correcto es el de la vista, que suma en numeric.
eq(vf.base_gravable, Math.round((333.34 + 123.45) * 100) / 100, 'el flete entra completo a la base')
eq(
  vf.base_gravable,
  baseGravableDe({ subtotal: 1_000, gravable: 500, descuento: 333.33, envio: 123.45, envioConIva: true }),
  'coincide con baseGravableDe'
)
ok(vf.incluye_iva === false, 'el resumen sigue false: falta una partida')

// ── G. El trigger y el resumen ─────────────────────────────
console.log('\nG. El resumen lo mantiene el trigger')
const { data: suyas } = await db.from('pedido_items').select('id').eq('pedido_id', e.pedido_id)
await db.from('pedido_items').update({ incluye_iva: true }).in('id', suyas.map(i => i.id))
ok((await vista(e.pedido_id)).incluye_iva === true, 'gravar la ultima partida prendio el resumen')
await db.from('pedidos').update({ envio_incluye_iva: false }).eq('id', e.pedido_id)
ok((await vista(e.pedido_id)).incluye_iva === false, 'desgravar el envio lo apago (hay flete > 0)')
await db.from('pedidos').update({ costo_envio: 0 }).eq('id', e.pedido_id)
ok((await vista(e.pedido_id)).incluye_iva === true, 'con envio en 0 el flete deja de contar (decision C)')

// ── H. Pagos y sobrepago ───────────────────────────────────
console.log('\nH. Pago parcial y sobrepago, sobre el mixto C')
const pagar = async (pedido_id, monto) => {
  const { data: s } = await db.from('pedidos_saldo').select('saldo').eq('id', pedido_id).single()
  if (monto > Number(s.saldo)) return { message: `excede el saldo (${s.saldo})` }
  const { error } = await db.from('pagos').insert({
    pedido_id, monto, metodo: 'transferencia', referencia: NOTA,
    fecha_pago: new Date().toISOString().slice(0, 10), registrado_por: ACTOR.userId,
  })
  return error
}
ok(!(await pagar(c.pedido_id, 1_080)), 'se cobra el total con IVA parcial: 1,080')
const vc2 = await vista(c.pedido_id)
eq(vc2.saldo, 0, 'saldo')
ok(vc2.estado_cobro === 'pagado', `estado_cobro = ${vc2.estado_cobro}`)

const prediccion = sobrepagoDe({ total: 1_000, gravable: 0, iva_tasa: 0.16, pagado: 1_080 })
ok(prediccion !== null, `desgravar avisaria sobrepago de ${prediccion?.sobra}`)
eq(prediccion.aCobrar, 1_000, 'aCobrar sin IVA')
eq(prediccion.sobra, 80, 'sobrepago anunciado')

const { data: deC } = await db.from('pedido_items').select('id').eq('pedido_id', c.pedido_id)
await db.from('pedido_items').update({ incluye_iva: false }).in('id', deC.map(i => i.id))
const vc3 = await vista(c.pedido_id)
eq(vc3.total_con_envio, prediccion.aCobrar, 'la vista cobra lo que sobrepagoDe predijo')
eq(vc3.saldo, -80, 'saldo negativo: el sobrepago que la UI pide confirmar')

// ── I. Comision con IVA mixto ──────────────────────────────
console.log('\nI. Comision: la mercancia manda, no el IVA')
const filaCom = v => ({ id: v.id, total: v.total, descuento_monto: v.descuento_monto, total_con_envio: v.total_con_envio })
const hoy = new Date().toISOString().slice(0, 10)
const ESC = [{ desde: 0, hasta: null, porcentaje: 10 }]
const base = async (pedidoId, monto) => calcularComision({
  pagos: [{ pago_id: 'x', pedido_id: pedidoId, monto, fecha_pago: hoy, cancelado_at: null }],
  pedidos: [filaCom(await vista(pedidoId))], tramos: ESC, periodo: hoy.slice(0, 7),
}).base
const bSin = await base(a.pedido_id, 1_000)
const bTodo = await base(b.pedido_id, 1_160)
eq(bSin, bTodo, 'cobrar 1,000 sin IVA y 1,160 con IVA en todo dan la misma base')
eq(bSin, 790.51, '1,000 / 1.265 (solo IEPS)')

// ── J. set_pedido_items con la bandera ─────────────────────
console.log('\nJ. set_pedido_items acepta el IVA por partida')
const { error: eRpc } = await db.rpc('set_pedido_items', {
  p_pedido_id: a.pedido_id,
  p_items: [{ producto_id: CHULA, unidad: 'lata', cantidad: 10, precio_unitario: 50, metadata: null, incluye_iva: true }],
  p_total: 500,
})
if (eRpc) { fallas++; console.log(' FALLA  set_pedido_items:', eRpc.message) }
else {
  const vj = await vista(a.pedido_id)
  eq(vj.total, 500, 'el total se recalculo desde las partidas')
  eq(vj.base_gravable, 500, 'la partida quedo gravada')
  eq(vj.iva_monto, 80, 'iva_monto')
  ok(vj.incluye_iva === true, 'y el trigger actualizo el resumen')
}

// ── Limpieza ───────────────────────────────────────────────
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
console.log(`audit_log: ${antes.nAudit} -> ${despues.nAudit} (+${despues.nAudit - antes.nAudit}) — NO se borran`)

const { data: vivos } = await db.from('pedidos').select('id').eq('notas', NOTA)
ok((vivos || []).length === 0, 'no quedo ningun pedido con la nota de prueba')
const { data: gravadas } = await db.from('pedido_items').select('id').eq('incluye_iva', true)
ok((gravadas || []).length === 0, 'ninguna partida de produccion quedo gravada')

console.log(`\n${fallas === 0 ? 'TODO OK' : fallas + ' FALLAS'}`)

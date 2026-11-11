/**
 * Flujo completo del AJUSTE contra produccion.
 *
 *   node --import ./scripts/resolver-ts.mjs scripts/verificar-ajuste.mjs
 *
 * Crea pedidos de prueba marcados en `notas`, los ejercita y los BORRA al
 * final, luego comprueba que pedidos, pedido_items, pagos y el stock queden
 * con el mismo conteo de antes. NO toca audit_log: las entradas de
 * `pedido.crear` se reportan y se dejan.
 *
 * Usa las funciones REALES —crearPedido, ajusteParaCuadrar, excedeTolerancia,
 * sobrepagoDeTotal, calcularComision— y no reimplementaciones.
 *
 * Lo que NO prueba: la capa HTTP y RLS. El service client las salta.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const R = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
for (const l of readFileSync(`${R}/.env.local`, 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const { crearPedido } = await import(`${R}/src/lib/crear-pedido.ts`)
const { ajusteParaCuadrar, excedeTolerancia } = await import(`${R}/src/lib/ajuste.ts`)
const { sobrepagoDeTotal } = await import(`${R}/src/lib/editar-partidas.ts`)
const { calcularComision } = await import(`${R}/src/lib/comisiones.ts`)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let fallas = 0
const ok = (c, m) => { if (!c) fallas++; console.log(`${c ? '  OK  ' : ' FALLA'} ${m}`) }
const eq = (a, b, m) => ok(Number(a) === Number(b), `${m} — ${a}${Number(a) === Number(b) ? '' : ` (esperado ${b})`}`)

const CLIENTE = '5cc4ff44-42c5-4be1-be6a-bde2f0a084d7'   // Alejandro Butron, publico
const CHULA = '75d2e8e3-f7a8-4521-904e-b5e1e78fdbd3'      // lata publico $50
const CALIZA = 'a9f92b23-d10a-4086-970e-bfec1ff9c69c'     // lata publico $50
const ACTOR = { userId: '7242348c-5f3e-46f9-b2ee-4ccb2e890530', userEmail: 'luis@tarabana.mx', role: 'super_admin' }
const NOTA = 'PRUEBA AJUSTE — borrar'

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
const crear = async (extra = {}) => {
  const r = await crearPedido(
    {
      cliente_id: CLIENTE,
      items: [
        { producto_id: `${CHULA}-lata`, cantidad: 10, incluye_iva: !!extra.ivaChula },
        { producto_id: `${CALIZA}-lata`, cantidad: 10, incluye_iva: !!extra.ivaCaliza },
      ],
      notas: NOTA,
      ...extra,
    },
    { ...ACTOR, db, service: db, sinInvitacion: true }
  )
  if (r.ok) creados.push(r.pedido_id)
  return r
}
const vista = async id => (await db.from('pedidos_saldo').select('*').eq('id', id).maybeSingle()).data

// ── A. Ajuste positivo de centavos ──────────────────────────
console.log('A. Ajuste positivo — 2 partidas de 10 latas a $50, ajuste +0.27')
const a = await crear({ ajuste: 0.27, ajuste_motivo: 'Redondeo OC 4471' })
ok(a.ok, a.ok ? 'creado' : `crearPedido: ${a.error}`)
const va = await vista(a.pedido_id)
eq(va.total, 1_000, 'total bruto')
eq(va.ajuste, 0.27, 'ajuste guardado')
eq(va.total_con_envio, 1_000.27, 'total con ajuste')
eq(va.saldo, 1_000.27, 'saldo')
eq(va.base_gravable, 0, 'el ajuste NO entro a la base gravable')
eq(va.iva_monto, 0, 'ni causo IVA')

// ── B. Ajuste negativo, que pasa del 5% ─────────────────────
console.log('\nB. Ajuste negativo de -500 (50% del total): pide confirmacion')
const sinConfirmar = await crear({ ajuste: -500, ajuste_motivo: 'Cortesía' })
ok(!sinConfirmar.ok && /pasa del/.test(sinConfirmar.error || ''), `rechazado sin confirmar: ${sinConfirmar.error?.slice(0, 60)}`)
const b = await crear({ ajuste: -500, ajuste_motivo: 'Cortesía', confirmar_ajuste: true })
ok(b.ok, b.ok ? 'aceptado con confirmar_ajuste' : `FALLO: ${b.error}`)
const vb = await vista(b.pedido_id)
eq(vb.ajuste, -500, 'ajuste negativo guardado')
eq(vb.total_con_envio, 500, 'total con el ajuste negativo')

// ── C. Sin motivo, rechazado ────────────────────────────────
console.log('\nC. Ajuste sin motivo')
const sinMotivo = await crear({ ajuste: 10 })
ok(!sinMotivo.ok && /motivo/.test(sinMotivo.error || ''), `rechazado por crearPedido: ${sinMotivo.error}`)
// Y el constraint de la DB, por si alguien escribe por otro lado.
const { error: eConstraint } = await db.from('pedidos')
  .update({ ajuste: 10, ajuste_motivo: '   ' }).eq('id', a.pedido_id).select('id')
ok(!!eConstraint && eConstraint.code === '23514', `la DB tambien lo rechaza: ${eConstraint?.code} ${eConstraint?.message?.slice(0, 48)}`)

// ── D. Mixto con IVA y descuento ────────────────────────────
console.log('\nD. IVA mixto + descuento 10% + ajuste')
const d = await crear({
  ivaChula: true,
  descuento_tipo: 'porcentaje', descuento_valor: 10, descuento_motivo: 'Prueba ajuste',
  ajuste: -0.4, ajuste_motivo: 'Cuadrar OC',
})
ok(d.ok, d.ok ? 'creado' : `FALLO: ${d.error}`)
const vd = await vista(d.pedido_id)
eq(vd.descuento_monto, 100, 'descuento 10% de 1,000')
eq(vd.base_gravable, 450, 'base gravable: 500 gravados x 0.9, sin tocar el ajuste')
eq(vd.iva_monto, 72, 'IVA sobre 450')
eq(vd.ajuste, -0.4, 'ajuste')
// 1,000 - 100 + 72 - 0.40 = 971.60
eq(vd.total_con_envio, 971.6, 'total: subtotal - descuento + IVA + ajuste')

// ── E. Cuadrar contra OC, de ida y vuelta ───────────────────
console.log('\nE. Cuadrar contra una OC de $980.00')
const totalAntes = Number(vd.total_con_envio) - Number(vd.ajuste)
const META = 980
const calculado = ajusteParaCuadrar(META, totalAntes)
eq(calculado, META - totalAntes, `ajusteParaCuadrar(${META}, ${totalAntes.toFixed(2)})`)
ok(!excedeTolerancia(calculado, totalAntes), 'no excede el 5%, no pide confirmacion')
await db.from('pedidos').update({ ajuste: calculado, ajuste_motivo: `Cuadrar OC ${META}` }).eq('id', d.pedido_id)
const ve = await vista(d.pedido_id)
eq(ve.total_con_envio, META, 'la vista cierra EXACTAMENTE en el total de la OC')
eq(ve.base_gravable, 450, 'y la base gravable no se movio')
eq(ve.iva_monto, 72, 'ni el IVA')

// ── F. Pago y sobrepago ─────────────────────────────────────
console.log('\nF. Se cobra el total y despues se ajusta hacia abajo')
const { error: ePago } = await db.from('pagos').insert({
  pedido_id: d.pedido_id, monto: META, metodo: 'transferencia', referencia: NOTA,
  fecha_pago: new Date().toISOString().slice(0, 10), registrado_por: ACTOR.userId,
})
ok(!ePago, `cobrado ${META}`)
const vf = await vista(d.pedido_id)
eq(vf.saldo, 0, 'saldo')
ok(vf.estado_cobro === 'pagado', `estado_cobro = ${vf.estado_cobro}`)

const prediccion = sobrepagoDeTotal(totalAntes - 50, META)
ok(prediccion !== null, `bajar el ajuste a -50 avisaria sobrepago de ${prediccion?.sobra}`)
await db.from('pedidos').update({ ajuste: -50, ajuste_motivo: 'Prueba sobrepago' }).eq('id', d.pedido_id)
const vg = await vista(d.pedido_id)
eq(vg.total_con_envio, prediccion.aCobrar, 'la vista cobra lo que predijo sobrepagoDeTotal')
eq(vg.saldo, -prediccion.sobra, 'saldo negativo: el sobrepago que la UI pide confirmar')

// ── G. Comision ─────────────────────────────────────────────
console.log('\nG. Comision: el ajuste no la mueve')
const filaCom = v => ({ id: v.id, total: v.total, descuento_monto: v.descuento_monto, total_con_envio: v.total_con_envio })
const hoy = new Date().toISOString().slice(0, 10)
const ESC = [{ desde: 0, hasta: null, porcentaje: 10 }]
const base = async (id, monto) => calcularComision({
  pagos: [{ pago_id: 'x', pedido_id: id, monto, fecha_pago: hoy, cancelado_at: null }],
  pedidos: [filaCom(await vista(id))], tramos: ESC, periodo: hoy.slice(0, 7),
}).base
const bPos = await base(a.pedido_id, 1_000.27)   // ajuste +0.27
const bNeg = await base(b.pedido_id, 500)        // ajuste -500
eq(bPos, bNeg, 'cobrar un pedido con ajuste +0.27 y otro con -500 da la misma base')
eq(bPos, 790.51, '1,000 de mercancia / 1.265 (solo IEPS)')

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
const { data: vivos } = await db.from('pedidos').select('id').eq('notas', NOTA)
ok((vivos || []).length === 0, 'no quedo ningun pedido con la nota de prueba')
const { data: conAjuste } = await db.from('pedidos').select('id').neq('ajuste', 0)
ok((conAjuste || []).length === 0, 'ningun pedido de produccion quedo con ajuste')

console.log(`\naudit_log: ${antes.nAudit} -> ${despues.nAudit} (+${despues.nAudit - antes.nAudit}) — NO se borran`)
console.log(`\n${fallas === 0 ? 'TODO OK' : fallas + ' FALLAS'}`)

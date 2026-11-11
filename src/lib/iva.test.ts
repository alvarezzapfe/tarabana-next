import test from 'node:test'
import assert from 'node:assert/strict'
import { ivaDe, desglosar, etiquetaTasa, tasaIvaDeConfig, IVA_TASA_DEFAULT } from './iva.ts'

// ── El redondeo ─────────────────────────────────────────────
//
// Estos numeros tienen que ser los mismos que da `round(base * iva_tasa, 2)`
// en la vista pedidos_saldo. Si alguna vez dejan de serlo, el carrito promete
// un total y la cobranza espera otro.

test('el IVA al 16% de una base redonda', () => {
  assert.equal(ivaDe(1_000, 0.16), 160)
  assert.equal(ivaDe(2_134, 0.16), 341.44)
  assert.equal(ivaDe(0, 0.16), 0)
})

test('medio centavo SUBE, como round(numeric, 2)', () => {
  // 0.04 * 0.125 = 0.005 exacto. En float, 0.04 * 0.125 * 100 = 0.5 y
  // Math.round lo sube; con otras combinaciones el float cae del otro lado.
  // Aqui el desempate se decide con enteros, asi que nunca depende de eso.
  assert.equal(ivaDe(0.04, 0.125), 0.01)
  // 0.12 * 0.125 = 0.015 -> 0.02
  assert.equal(ivaDe(0.12, 0.125), 0.02)
  // 0.20 * 0.125 = 0.025 -> 0.03
  assert.equal(ivaDe(0.2, 0.125), 0.03)
})

test('no arrastra el error del float', () => {
  // 2134 * 0.16 da 341.44000000000005 en float.
  assert.equal(ivaDe(2_134, 0.16), 341.44)
  // 1.1 * 3 da 3.3000000000000003.
  assert.equal(ivaDe(1.1, 0.03), 0.03)
  // 8.99 * 0.16 = 1.4384 -> 1.44
  assert.equal(ivaDe(8.99, 0.16), 1.44)
})

test('tasa 0 o base 0 no cobran nada', () => {
  assert.equal(ivaDe(1_000, 0), 0)
  assert.equal(ivaDe(0, 0.16), 0)
})

test('nunca devuelve NaN: un NaN se veria como "$NaN" en el carrito', () => {
  assert.equal(ivaDe(NaN, 0.16), 0)
  assert.equal(ivaDe(1_000, NaN), 0)
  assert.equal(ivaDe(Infinity, 0.16), 0)
})

test('una base negativa conserva el signo', () => {
  // No deberia pasar, pero si una nota de credito llega aqui, el IVA sigue al
  // monto en vez de invertirse.
  assert.equal(ivaDe(-1_000, 0.16), -160)
})

// ── El desglose ─────────────────────────────────────────────

test('sin IVA el total es el de siempre', () => {
  const d = desglosar({ subtotal: 1_000, descuento: 100, envio: 50 })
  assert.equal(d.base, 950)
  assert.equal(d.iva, 0)
  assert.equal(d.total, 950)
})

test('el IVA va sobre la base, no sobre el subtotal', () => {
  // Con descuento de 226 y envio de 100: 2,260 - 226 + 100 = 2,134.
  const d = desglosar({ subtotal: 2_260, descuento: 226, envio: 100, incluyeIva: true, tasa: 0.16 })
  assert.equal(d.base, 2_134)
  assert.equal(d.iva, 341.44)
  assert.equal(d.total, 2_475.44)
  // Cobrar IVA sobre el subtotal daria 361.60: 20.16 de mas sobre un
  // descuento que nadie pago.
  assert.notEqual(d.iva, ivaDe(2_260, 0.16))
})

test('el envio tambien causa IVA', () => {
  const sinEnvio = desglosar({ subtotal: 1_000, incluyeIva: true, tasa: 0.16 })
  const conEnvio = desglosar({ subtotal: 1_000, envio: 100, incluyeIva: true, tasa: 0.16 })
  assert.equal(sinEnvio.iva, 160)
  assert.equal(conEnvio.iva, 176)
})

test('sin tasa explicita usa la general', () => {
  const d = desglosar({ subtotal: 1_000, incluyeIva: true })
  assert.equal(d.iva, ivaDe(1_000, IVA_TASA_DEFAULT))
})

test('la tasa del pedido manda sobre la vigente', () => {
  // Un pedido viejo guardado al 16% no se mueve porque hoy la tasa sea otra:
  // esa es toda la razon de que iva_tasa viva en el pedido.
  const d = desglosar({ subtotal: 1_000, incluyeIva: true, tasa: 0.08 })
  assert.equal(d.iva, 80)
})

test('nulos de la base de datos no rompen el desglose', () => {
  const d = desglosar({ subtotal: 1_000, descuento: null, envio: null, incluyeIva: null, tasa: null })
  assert.deepEqual(d, { subtotal: 1_000, descuento: 0, envio: 0, base: 1_000, iva: 0, total: 1_000 })
})

// ── Tasa y etiqueta ─────────────────────────────────────────

test('la etiqueta se lee como en el documento', () => {
  assert.equal(etiquetaTasa(0.16), '16%')
  assert.equal(etiquetaTasa(0.08), '8%')
  assert.equal(etiquetaTasa(0.1625), '16.25%')
})

test('tasaIvaDeConfig acepta lo que trae app_config', () => {
  assert.equal(tasaIvaDeConfig({ iva_tasa: 0.16, ieps_tasa: 0.265 }), 0.16)
  assert.equal(tasaIvaDeConfig({ iva_tasa: '0.08' }), 0.08)
})

test('tasaIvaDeConfig cae al default en vez de dejar el pedido sin IVA', () => {
  // Alguien prendio el switch: cobrar 0 de IVA seria peor que cobrar 16%.
  assert.equal(tasaIvaDeConfig(null), IVA_TASA_DEFAULT)
  assert.equal(tasaIvaDeConfig({}), IVA_TASA_DEFAULT)
  assert.equal(tasaIvaDeConfig({ iva_tasa: 'dieciseis' }), IVA_TASA_DEFAULT)
  // Fuera de rango: una tasa de 16 (y no 0.16) multiplicaria el pedido por 17.
  assert.equal(tasaIvaDeConfig({ iva_tasa: 16 }), IVA_TASA_DEFAULT)
  assert.equal(tasaIvaDeConfig({ iva_tasa: -0.16 }), IVA_TASA_DEFAULT)
})

test('tasaIvaDeConfig respeta un 0 explicito', () => {
  // Es el unico caso en que 0 es una respuesta y no un error de lectura.
  assert.equal(tasaIvaDeConfig({ iva_tasa: 0 }), 0)
})

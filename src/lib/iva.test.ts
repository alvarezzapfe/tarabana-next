import test from 'node:test'
import assert from 'node:assert/strict'
import { ivaDe, baseGravableDe, desglosar, etiquetaTasa, tasaIvaDeConfig, IVA_TASA_DEFAULT } from './iva.ts'

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

// ── La base gravable ────────────────────────────────────────
//
// El IVA ya no es del pedido sino de cada partida: la base sale de sumar
// SOLO las partidas marcadas, con el descuento prorrateado encima.

test('todo gravado: la base es el subtotal menos el descuento', () => {
  assert.equal(baseGravableDe({ subtotal: 1_000, gravable: 1_000 }), 1_000)
  assert.equal(baseGravableDe({ subtotal: 1_000, gravable: 1_000, descuento: 100 }), 900)
})

test('nada gravado: la base es 0 aunque el pedido valga', () => {
  assert.equal(baseGravableDe({ subtotal: 1_000, gravable: 0, descuento: 100, envio: 50 }), 0)
})

test('mixto: solo cuenta lo marcado', () => {
  // 600 de 1,000 gravados, sin descuento.
  assert.equal(baseGravableDe({ subtotal: 1_000, gravable: 600 }), 600)
})

test('mixto con descuento: el descuento se PRORRATEA', () => {
  // 600 gravados de 1,000, descuento de 100 (10% del pedido).
  // Lo gravado baja ese mismo 10%: 600 x 0.9 = 540.
  assert.equal(baseGravableDe({ subtotal: 1_000, gravable: 600, descuento: 100 }), 540)
  // Cobrar el IVA sobre los 600 enteros le cobraria impuesto de un descuento
  // que el cliente si recibio.
  assert.notEqual(baseGravableDe({ subtotal: 1_000, gravable: 600, descuento: 100 }), 600)
})

test('el envio decide por su cuenta', () => {
  const base = { subtotal: 1_000, gravable: 600, descuento: 100, envio: 150 }
  assert.equal(baseGravableDe(base), 540)
  assert.equal(baseGravableDe({ ...base, envioConIva: true }), 690)
  // El flete entra COMPLETO: no se prorratea, porque el descuento es sobre
  // la mercancia y la vista lo suma aparte.
  assert.equal(baseGravableDe({ ...base, envioConIva: true }) - baseGravableDe(base), 150)
})

test('un descuento mayor que el subtotal deja la base en 0, no en negativo', () => {
  assert.equal(baseGravableDe({ subtotal: 500, gravable: 500, descuento: 900 }), 0)
})

test('subtotal 0 no divide entre cero', () => {
  assert.equal(baseGravableDe({ subtotal: 0, gravable: 0, descuento: 0 }), 0)
  // Y si llegara un gravable sin subtotal, se respeta en vez de dar NaN.
  assert.equal(baseGravableDe({ subtotal: 0, gravable: 100 }), 100)
})

test('el prorrateo redondea a centavos, medio hacia arriba', () => {
  // 1,000 gravados de 2,000, descuento 33.33 -> 1,000 x 1966.67/2000 = 983.335
  assert.equal(baseGravableDe({ subtotal: 2_000, gravable: 1_000, descuento: 33.33 }), 983.34)
})

test('nulos de la base de datos no rompen la base', () => {
  assert.equal(
    baseGravableDe({ subtotal: 1_000, gravable: null, descuento: null, envio: null, envioConIva: null }),
    0
  )
})

// ── El desglose ─────────────────────────────────────────────

test('sin nada gravado el total es el de siempre', () => {
  const d = desglosar({ subtotal: 1_000, gravable: 0, descuento: 100, envio: 50 })
  assert.equal(d.baseGravable, 0)
  assert.equal(d.iva, 0)
  assert.equal(d.total, 950)
})

test('el total NO sale de la base gravable', () => {
  // Es el error facil: una sola partida gravada de cinco da base chica y
  // total grande, y el cliente paga el total.
  const d = desglosar({ subtotal: 1_000, gravable: 200, tasa: 0.16 })
  assert.equal(d.baseGravable, 200)
  assert.equal(d.iva, 32)
  assert.equal(d.total, 1_032)
})

test('todo gravado con descuento y envio', () => {
  // 2,260 - 226 = 2,034 de mercancia gravada, mas 100 de flete gravado.
  const d = desglosar({
    subtotal: 2_260, gravable: 2_260, descuento: 226, envio: 100,
    envioConIva: true, tasa: 0.16,
  })
  assert.equal(d.baseGravable, 2_134)
  assert.equal(d.iva, 341.44)
  assert.equal(d.total, 2_475.44)
})

test('mismo pedido con el flete exento', () => {
  const d = desglosar({
    subtotal: 2_260, gravable: 2_260, descuento: 226, envio: 100,
    envioConIva: false, tasa: 0.16,
  })
  assert.equal(d.baseGravable, 2_034)
  assert.equal(d.iva, 325.44)
  // El flete sigue en el total aunque no cause IVA.
  assert.equal(d.total, 2_459.44)
})

test('sin tasa explicita usa la general', () => {
  const d = desglosar({ subtotal: 1_000, gravable: 1_000 })
  assert.equal(d.iva, ivaDe(1_000, IVA_TASA_DEFAULT))
})

test('la tasa del pedido manda sobre la vigente', () => {
  // Un pedido viejo guardado al 16% no se mueve porque hoy la tasa sea otra.
  assert.equal(desglosar({ subtotal: 1_000, gravable: 1_000, tasa: 0.08 }).iva, 80)
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

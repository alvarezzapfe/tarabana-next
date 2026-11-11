import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TOLERANCIA_AJUSTE, ajusteParaCuadrar, excedeTolerancia, motivoRechazo, motivoValido,
} from './ajuste.ts'

// ── Cuadrar contra la OC ────────────────────────────────────

test('cuadrar contra OC: la diferencia, con su signo', () => {
  // La OC pide mas de lo que calculamos: el ajuste sube.
  assert.equal(ajusteParaCuadrar(10_000, 9_999.73), 0.27)
  // La OC pide menos: baja.
  assert.equal(ajusteParaCuadrar(9_500, 10_000), -500)
})

test('cuadrar contra OC: si ya coincide, el ajuste es 0', () => {
  // No hay nada que ajustar, y un ajuste de cero obligaria a capturar un
  // motivo para nada.
  assert.equal(ajusteParaCuadrar(2_475.44, 2_475.44), 0)
})

test('cuadrar contra OC: redondea a centavos', () => {
  // El campo es numeric(12,2): un ajuste con tres decimales lo redondearia la
  // base de datos y el total dejaria de ser el de la OC.
  assert.equal(ajusteParaCuadrar(1_000.555, 1_000), 0.56)
  assert.equal(ajusteParaCuadrar(1_000, 999.994), 0.01)
})

test('cuadrar contra OC: no devuelve NaN con basura', () => {
  assert.equal(ajusteParaCuadrar(NaN, 1_000), -1_000)
  assert.equal(ajusteParaCuadrar(1_000, NaN), 1_000)
})

test('cuadrar contra OC: el float no se cuela', () => {
  // 1,004.40 - 1,004.13 en float da 0.2699999999999818.
  assert.equal(ajusteParaCuadrar(1_004.4, 1_004.13), 0.27)
})

// ── La tolerancia del 5% ────────────────────────────────────

test('tolerancia: exactamente 5% NO pide confirmacion', () => {
  // El limite es estricto. 5% de 1,000 son 50.
  assert.equal(excedeTolerancia(50, 1_000), false)
  assert.equal(excedeTolerancia(-50, 1_000), false)
  assert.equal(excedeTolerancia(50.01, 1_000), true)
  assert.equal(excedeTolerancia(-50.01, 1_000), true)
})

test('tolerancia: el borde no depende del float', () => {
  // 2,134 x 0.05 da 106.70000000000002 en float; el 5% exacto son 106.70.
  assert.equal(excedeTolerancia(106.7, 2_134), false)
  assert.equal(excedeTolerancia(106.71, 2_134), true)
})

test('tolerancia: un ajuste de centavos nunca excede', () => {
  assert.equal(excedeTolerancia(0.27, 10_000), false)
  assert.equal(excedeTolerancia(-0.27, 10_000), false)
})

test('tolerancia: sin ajuste no hay nada que confirmar', () => {
  assert.equal(excedeTolerancia(0, 1_000), false)
  assert.equal(excedeTolerancia(0, 0), false)
})

test('tolerancia: con total en 0, cualquier ajuste excede', () => {
  // Ahi el ajuste no esta cuadrando nada: es el pedido entero.
  assert.equal(excedeTolerancia(1, 0), true)
  assert.equal(excedeTolerancia(-1, 0), true)
})

test('TOLERANCIA_AJUSTE es el 5% y esta expuesta para la UI', () => {
  assert.equal(TOLERANCIA_AJUSTE, 0.05)
})

// ── El motivo ───────────────────────────────────────────────

test('el motivo no acepta espacios', () => {
  assert.equal(motivoValido('Redondeo OC 4471'), true)
  assert.equal(motivoValido('   '), false)
  assert.equal(motivoValido(''), false)
  assert.equal(motivoValido(null), false)
})

test('un ajuste sin motivo se rechaza, uno de cero no lo necesita', () => {
  assert.match(motivoRechazo({ ajuste: 10, totalAntes: 1_000 })!, /motivo/)
  assert.match(motivoRechazo({ ajuste: 10, motivo: '  ', totalAntes: 1_000 })!, /motivo/)
  assert.equal(motivoRechazo({ ajuste: 10, motivo: 'Redondeo', totalAntes: 1_000 }), null)
  // Sin ajuste no hay nada que explicar.
  assert.equal(motivoRechazo({ ajuste: 0, totalAntes: 1_000 }), null)
})

test('un ajuste que deja el pedido en negativo se rechaza', () => {
  // No se clampa a 0: el pedido saldria como "pagado" con un saldo negativo
  // que nada explica.
  assert.match(motivoRechazo({ ajuste: -1_500, motivo: 'Error', totalAntes: 1_000 })!, /negativo/)
  // Justo en cero si se permite: un pedido de cortesia es legitimo.
  assert.equal(motivoRechazo({ ajuste: -1_000, motivo: 'Cortesía', totalAntes: 1_000 }), null)
})

test('un ajuste que no es numero se rechaza antes que nada', () => {
  assert.match(motivoRechazo({ ajuste: NaN, motivo: 'x', totalAntes: 1_000 })!, /número/)
})

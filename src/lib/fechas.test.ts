/**
 * Tests de la fecha de negocio.
 *
 *   npm test
 *
 * Lo que se prueba es la frontera: los instantes en que la fecha de UTC y la
 * de Mexico NO coinciden. Son seis horas cada noche, y ahi es donde un pedido
 * o un corte de comisiones caen en el mes equivocado.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ZONA_MX, esFutura, etiquetaFecha, fechaMx, hoyMx,
  periodoDeFechaDB, periodoMx, sumarDias,
} from './fechas.ts'

test('la zona es la del negocio', () => {
  assert.equal(ZONA_MX, 'America/Mexico_City')
})

// ── La frontera, que es todo el punto ───────────────────────

test('despues de las 18:00 de CDMX, UTC ya esta en el dia siguiente', () => {
  // 19:30 del 31 de octubre en CDMX = 01:30 del 1 de noviembre en UTC.
  const noche = new Date('2026-10-31T19:30:00-06:00')

  assert.equal(noche.toISOString().slice(0, 10), '2026-11-01', 'cambio el supuesto de UTC')
  assert.equal(fechaMx(noche), '2026-10-31')
  // Y por lo tanto el MES tambien difiere: es el caso que rompia el corte.
  assert.equal(periodoMx(noche), '2026-10')
})

test('toda la franja de 18:00 a 23:59 cae en el dia correcto', () => {
  for (const hora of ['18:00', '20:15', '23:59']) {
    const d = new Date(`2026-03-15T${hora}:00-06:00`)
    assert.equal(fechaMx(d), '2026-03-15', `fallo a las ${hora}`)
    // Control: en UTC ya es el 16.
    assert.equal(d.toISOString().slice(0, 10), '2026-03-16')
  }
})

test('antes de las 18:00 las dos zonas coinciden', () => {
  const d = new Date('2026-03-15T10:00:00-06:00')
  assert.equal(fechaMx(d), '2026-03-15')
  assert.equal(d.toISOString().slice(0, 10), '2026-03-15')
})

test('la madrugada no retrocede de dia', () => {
  // 00:30 CDMX = 06:30 UTC del mismo dia: aqui no hay discrepancia.
  const d = new Date('2026-03-15T00:30:00-06:00')
  assert.equal(fechaMx(d), '2026-03-15')
})

test('el cambio de año tambien respeta la zona', () => {
  const nochevieja = new Date('2026-12-31T20:00:00-06:00')
  assert.equal(nochevieja.toISOString().slice(0, 10), '2027-01-01')
  assert.equal(fechaMx(nochevieja), '2026-12-31')
  assert.equal(periodoMx(nochevieja), '2026-12')
})

// ── Formato ─────────────────────────────────────────────────

test('fechaMx devuelve YYYY-MM-DD, que es el formato de una columna date', () => {
  assert.match(fechaMx(new Date('2026-07-04T12:00:00-06:00')), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(fechaMx(new Date('2026-01-02T12:00:00-06:00')), '2026-01-02')
  // Con ceros a la izquierda, para que ordene bien como string.
  assert.equal(periodoMx(new Date('2026-01-02T12:00:00-06:00')), '2026-01')
})

test('hoyMx no revienta y tiene la forma correcta', () => {
  assert.match(hoyMx(), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(hoyMx(), fechaMx(new Date()))
})

// ── Fechas que ya vienen de la DB ───────────────────────────

test('el mes de una fecha de la DB se corta del string, sin pasar por Date', () => {
  // `new Date('2026-08-01')` seria medianoche UTC = 31 de julio en CDMX.
  assert.equal(periodoDeFechaDB('2026-08-01'), '2026-08')
  assert.equal(periodoDeFechaDB('2026-01-31'), '2026-01')
  // Control de que el atajo ingenuo si estaba mal.
  assert.equal(fechaMx(new Date('2026-08-01')), '2026-07-31')
})

// ── Comparaciones y aritmetica ──────────────────────────────

test('esFutura compara contra hoy en Mexico', () => {
  assert.equal(esFutura(hoyMx()), false)
  assert.equal(esFutura(sumarDias(hoyMx(), 1)), true)
  assert.equal(esFutura(sumarDias(hoyMx(), -1)), false)
  assert.equal(esFutura('2020-01-01'), false)
})

test('sumarDias no pierde ni gana un dia en los bordes', () => {
  assert.equal(sumarDias('2026-11-05', 15), '2026-11-20')
  assert.equal(sumarDias('2026-11-05', 30), '2026-12-05')
  assert.equal(sumarDias('2026-11-05', 0), '2026-11-05')
  assert.equal(sumarDias('2026-11-05', -5), '2026-10-31')
  // Fin de mes y año bisiesto.
  assert.equal(sumarDias('2026-01-31', 1), '2026-02-01')
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(sumarDias('2028-02-28', 1), '2028-02-29')
})

test('sumarDias replica lo que calcula el trigger', () => {
  // fecha_vencimiento = fecha_pedido + dias(condiciones_pago)
  const dias: Record<string, number> = { contado: 0, '15_dias': 15, '30_dias': 30 }
  assert.equal(sumarDias('2026-08-06', dias['30_dias']), '2026-09-05')
  assert.equal(sumarDias('2026-08-08', dias['30_dias']), '2026-09-07')
  assert.equal(sumarDias('2026-11-05', dias['15_dias']), '2026-11-20')
  assert.equal(sumarDias('2026-08-03', dias.contado), '2026-08-03')
})

// ── Etiquetas ───────────────────────────────────────────────

test('etiquetaFecha no retrocede un dia al formatear', () => {
  // El bug clasico: formatear '2026-08-01' en local lo muestra como 31 de julio.
  assert.match(etiquetaFecha('2026-08-01'), /1 ago/)
  assert.match(etiquetaFecha('2026-01-01'), /1 ene/)
  assert.match(etiquetaFecha('2026-12-31'), /31 dic/)
})

test('etiquetaFecha tolera lo que no es una fecha', () => {
  assert.equal(etiquetaFecha(null), '—')
  assert.equal(etiquetaFecha(undefined), '—')
  assert.equal(etiquetaFecha(''), '—')
  assert.equal(etiquetaFecha('basura'), '—')
})

test('etiquetaFecha acepta un timestamp completo', () => {
  // Por si llega created_at en vez de una columna date.
  assert.match(etiquetaFecha('2026-08-01T23:00:00+00:00'), /1 ago/)
})

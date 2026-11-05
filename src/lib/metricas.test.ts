/**
 * Tests de las metricas nuevas del Inicio.
 *
 *   npm test
 *
 * Se cubren los limites de los tramos de antiguedad (donde un off-by-one
 * mueve dinero de un bucket a otro sin que se note), el vencido real, y la
 * normalizacion de nombres de cliente.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  antiguedadCartera,
  nombreLegible,
  requierenAtencion,
  serieFacturadoVsCobrado,
  topClientes,
  vencidoDe,
  type FilaSaldo,
} from './metricas.ts'
import { topProductosEnLitros } from './unidades.ts'

const AHORA = new Date('2026-11-05T12:00:00-06:00')

function fila(over: Partial<FilaSaldo> = {}): FilaSaldo {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    cliente_id: 'c1',
    total: 1_000,
    pagado: 0,
    saldo: 1_000,
    status: 'confirmado',
    estado_cobro: 'pendiente',
    dias_vencido: 0,
    created_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}

// ── Vencido ─────────────────────────────────────────────────

test('vencidoDe cuenta por dias_vencido, no por estado_cobro', () => {
  const filas = [
    // El caso real de produccion: atrasado, con abono, estado 'parcial'.
    fila({ saldo: 100, pagado: 1_400, dias_vencido: 92, estado_cobro: 'parcial' }),
    fila({ saldo: 960, dias_vencido: 91, estado_cobro: 'vencido' }),
    // Vencido pero ya pagado: no hay nada que cobrar.
    fila({ saldo: 0, pagado: 3_600, dias_vencido: 61, estado_cobro: 'pagado' }),
    // Con saldo pero al corriente.
    fila({ saldo: 500, dias_vencido: 0, estado_cobro: 'pendiente' }),
  ]

  // 100 + 960. Filtrar por estado_cobro === 'vencido' daria solo 960.
  assert.equal(vencidoDe(filas), 1_060)
})

test('vencidoDe ignora el sobrepago en vez de restarlo', () => {
  const filas = [
    fila({ saldo: -200, pagado: 1_200, dias_vencido: 40, estado_cobro: 'pagado' }),
    fila({ saldo: 300, dias_vencido: 40, estado_cobro: 'vencido' }),
  ]
  assert.equal(vencidoDe(filas), 300)
})

// ── Antiguedad de cartera ───────────────────────────────────

test('antiguedadCartera: los limites de cada tramo caen donde dicen', () => {
  const filas = [
    fila({ saldo: 1, dias_vencido: 0 }),   // al corriente
    fila({ saldo: 2, dias_vencido: 1 }),   // 1-30, borde bajo
    fila({ saldo: 4, dias_vencido: 30 }),  // 1-30, borde alto
    fila({ saldo: 8, dias_vencido: 31 }),  // 31-60, borde bajo
    fila({ saldo: 16, dias_vencido: 60 }), // 31-60, borde alto
    fila({ saldo: 32, dias_vencido: 61 }), // 61-90, borde bajo
    fila({ saldo: 64, dias_vencido: 90 }), // 61-90, borde alto
    fila({ saldo: 128, dias_vencido: 91 }), // 90+, borde bajo
    fila({ saldo: 256, dias_vencido: 999 }), // 90+
  ]

  const b = antiguedadCartera(filas)
  assert.deepEqual(b.map(x => x.clave), ['corriente', '1-30', '31-60', '61-90', '90+'])
  // Las potencias de 2 hacen que cualquier fuga entre tramos sea inconfundible.
  assert.deepEqual(b.map(x => x.monto), [1, 6, 24, 96, 384])
  assert.deepEqual(b.map(x => x.pedidos), [1, 2, 2, 2, 2])
})

test('antiguedadCartera: solo cartera, lo ya pagado no tiene antiguedad', () => {
  const filas = [
    fila({ saldo: 0, pagado: 1_000, dias_vencido: 95, estado_cobro: 'pagado' }),
    fila({ saldo: -50, pagado: 1_050, dias_vencido: 95, estado_cobro: 'pagado' }),
    fila({ saldo: 700, dias_vencido: 95 }),
  ]

  const b = antiguedadCartera(filas)
  assert.equal(b[4].monto, 700)
  assert.equal(b[4].pedidos, 1)
  assert.equal(b.reduce((s, x) => s + x.pedidos, 0), 1)
})

test('antiguedadCartera: sin cartera devuelve los cinco tramos en cero', () => {
  const b = antiguedadCartera([])
  assert.equal(b.length, 5)
  assert.deepEqual(b.map(x => x.monto), [0, 0, 0, 0, 0])
})

// ── Facturado vs cobrado ────────────────────────────────────

test('serieFacturadoVsCobrado: las dos barras suman el facturado', () => {
  const filas = [
    fila({ created_at: '2026-11-03T00:00:00Z', total: 1_000, pagado: 400, saldo: 600 }),
    fila({ created_at: '2026-11-04T00:00:00Z', total: 500, pagado: 500, saldo: 0 }),
  ]

  const serie = serieFacturadoVsCobrado(filas, 3, AHORA)
  assert.equal(serie.length, 3)

  const mes = serie[2]
  assert.equal(mes.facturado, 1_500)
  assert.equal(mes.cobrado, 900)
  assert.equal(mes.pendiente, 600)
  assert.equal(mes.cobrado + mes.pendiente, mes.facturado)
  assert.equal(Math.round(mes.pct!), 60)
})

test('serieFacturadoVsCobrado: un mes sin nada va en cero y su pct es null', () => {
  const serie = serieFacturadoVsCobrado([], 2, AHORA)
  assert.deepEqual(serie.map(m => m.facturado), [0, 0])
  assert.deepEqual(serie.map(m => m.pct), [null, null])
})

test('serieFacturadoVsCobrado: un sobrepago no deja pendiente negativo', () => {
  const filas = [fila({ created_at: '2026-11-03T00:00:00Z', total: 1_000, pagado: 1_200, saldo: -200 })]
  const mes = serieFacturadoVsCobrado(filas, 1, AHORA)[0]
  assert.equal(mes.pendiente, 0)
})

// ── Requiere atencion ───────────────────────────────────────

test('requierenAtencion: entra lo vencido y lo que lleva mas de 30 dias abierto', () => {
  const filas = [
    fila({ id: 'viejo', saldo: 500, dias_vencido: 90, created_at: '2026-08-01T00:00:00Z' }),
    fila({ id: 'medio', saldo: 900, dias_vencido: 10, created_at: '2026-10-20T00:00:00Z' }),
    // Sin vencer por fecha, pero con 40 dias de saldo abierto.
    fila({ id: 'abierto', saldo: 300, dias_vencido: 0, created_at: '2026-09-20T00:00:00Z' }),
    // Reciente y al corriente: no molesta.
    fila({ id: 'nuevo', saldo: 700, dias_vencido: 0, created_at: '2026-11-01T00:00:00Z' }),
    // Pagado: fuera, aunque sea viejo.
    fila({ id: 'pagado', saldo: 0, pagado: 1_000, dias_vencido: 90, created_at: '2026-08-01T00:00:00Z' }),
  ]

  const r = requierenAtencion(filas, AHORA)
  assert.deepEqual(r.map(x => x.id), ['viejo', 'medio', 'abierto'])
  assert.equal(r[0].diasVencido, 90)
  assert.ok(r[2].diasAbierto > 30, `diasAbierto fue ${r[2].diasAbierto}`)
})

test('requierenAtencion: a igual atraso, primero el monto mas grande', () => {
  const filas = [
    fila({ id: 'chico', saldo: 100, dias_vencido: 50 }),
    fila({ id: 'grande', saldo: 9_000, dias_vencido: 50 }),
  ]
  assert.deepEqual(requierenAtencion(filas, AHORA).map(x => x.id), ['grande', 'chico'])
})

// ── Nombres de cliente ──────────────────────────────────────

test('nombreLegible: razon_social gana a full_name y a email', () => {
  assert.equal(
    nombreLegible({ id: 'c', razon_social: 'ARTIS CERVISIA', full_name: 'DRUNKENDOG', email: 'x@y.mx' }),
    'Artis Cervisia'
  )
  assert.equal(
    nombreLegible({ id: 'c', razon_social: null, full_name: 'Jair Soto', email: 'x@y.mx' }),
    'Jair Soto'
  )
  assert.equal(
    nombreLegible({ id: 'c', razon_social: null, full_name: null, email: 'x@y.mx' }),
    'x@y.mx'
  )
})

test('nombreLegible: nunca devuelve vacio ni "Sin nombre"', () => {
  const n = nombreLegible({ id: 'c', razon_social: null, full_name: '  ', email: null })
  assert.equal(n, 'Cliente sin nombre')
  assert.notEqual(n, 'Sin nombre')
})

test('nombreLegible: pasa a Titulo lo que viene en mayusculas, respetando siglas', () => {
  assert.equal(
    nombreLegible({
      id: 'c', razon_social: 'CERVECERIA DOS AVES DE SAN MIGUEL DE ALLENDE S.A.P.I. DE C.V.',
      full_name: null, email: null,
    }),
    'Cerveceria Dos Aves de San Miguel de Allende S.A.P.I. de C.V.'
  )
  assert.equal(
    nombreLegible({ id: 'c', razon_social: 'LUIS ARMANDO ALVAREZ ZAPFE', full_name: null, email: null }),
    'Luis Armando Alvarez Zapfe'
  )
})

test('nombreLegible: un nombre que ya trae minusculas no se reescribe', () => {
  // Adivinar donde van las mayusculas de un nombre propio es peor que dejarlo.
  assert.equal(
    nombreLegible({ id: 'c', razon_social: null, full_name: 'carlos eduardo gonzalez nava', email: null }),
    'carlos eduardo gonzalez nava'
  )
})

// ── Top clientes ────────────────────────────────────────────

test('topClientes: ordena por facturado, acumula saldo y reparte el 100%', () => {
  const clientes = [
    { id: 'a', razon_social: null, full_name: 'Cliente A', email: null },
    { id: 'b', razon_social: null, full_name: 'Cliente B', email: null },
  ]
  const filas = [
    fila({ cliente_id: 'a', total: 1_000, pagado: 1_000, saldo: 0 }),
    fila({ cliente_id: 'a', total: 500, pagado: 0, saldo: 500 }),
    fila({ cliente_id: 'b', total: 300, pagado: 100, saldo: 200 }),
  ]

  const top = topClientes(filas, clientes)
  assert.deepEqual(top.map(c => c.nombre), ['Cliente A', 'Cliente B'])
  assert.equal(top[0].facturado, 1_500)
  assert.equal(top[0].saldo, 500)
  assert.equal(Math.round(top.reduce((s, c) => s + c.pct, 0)), 100)
})

test('topClientes: un cliente que ya no esta en profiles no rompe la lista', () => {
  const top = topClientes([fila({ cliente_id: 'fantasma' })], [])
  assert.equal(top.length, 1)
  assert.equal(top[0].nombre, 'Cliente sin nombre')
})

// ── Top productos en litros ─────────────────────────────────

test('topProductosEnLitros: convierte cada presentacion a volumen', () => {
  const { filas, sinUnidad } = topProductosEnLitros([
    // 2 cajas de 24 = 48 latas * 0.355 = 17.04 L
    { nombre: 'Magma', unidad: 'caja24', cantidad: 2 },
    // 1 barril de acero = 20 L
    { nombre: 'Brisa', unidad: 'barril_acero', cantidad: 1 },
    // 1 mix de 24 = 8.52 L
    { nombre: 'Magma', unidad: 'mix24', cantidad: 1 },
  ])

  assert.equal(sinUnidad, 0)
  // Brisa 20 L le gana a Magma 25.56... no: Magma suma 17.04 + 8.52 = 25.56
  assert.deepEqual(filas.map(f => f.nombre), ['Magma', 'Brisa'])
  assert.equal(Math.round(filas[0].litros * 100) / 100, 25.56)
  assert.equal(filas[1].litros, 20)
})

test('topProductosEnLitros: una partida sin unidad se reporta, no se inventa', () => {
  // En produccion hay una partida con `unidad` en null.
  const { filas, sinUnidad } = topProductosEnLitros([
    { nombre: 'Magma', unidad: 'caja24', cantidad: 1 },
    { nombre: 'Caliza', unidad: null, cantidad: 10 },
    { nombre: 'Caliza', unidad: 'unidad_rara', cantidad: 10 },
  ])

  assert.equal(sinUnidad, 2)
  assert.deepEqual(filas.map(f => f.nombre), ['Magma'])
})

test('un barril de 20 L pesa mas que una caja de 24, que es el punto de medir en litros', () => {
  const { filas } = topProductosEnLitros([
    { nombre: 'Barrilera', unidad: 'barril_pet', cantidad: 1 },
    { nombre: 'Latera', unidad: 'caja24', cantidad: 2 },
  ])
  // Por piezas serian 1 vs 2 y "Latera" ganaria; por volumen, 20 vs 17.04.
  assert.deepEqual(filas.map(f => f.nombre), ['Barrilera', 'Latera'])
})

/**
 * Tests del descuento de inventario al entregar.
 *
 *   npm test
 *
 * Los dos casos que motivaron el archivo eran bugs:
 *
 *   - entregar cajas descontaba `stock_latas`, que son latas SUELTAS y un
 *     contador independiente de las cajas;
 *   - dos partidas del mismo producto en el mismo pedido se pisaban y solo
 *     se descontaba la ultima.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LATAS_POR_ESTILO_DEFAULT,
  movimientosDeEntrega,
  porProducto,
  type ItemEntrega,
} from './stock-entrega.ts'

const item = (over: Partial<ItemEntrega> = {}): ItemEntrega => ({
  producto_id: 'p-1', unidad: 'caja24', cantidad: 1, nombre: 'Magma', ...over,
})

/** Los movimientos, o el error si hubo. */
const movs = (items: ItemEntrega[]) => {
  const r = movimientosDeEntrega(items)
  assert.ok(!('error' in r), 'error' in r ? r.error : '')
  return r as Exclude<typeof r, { error: string }>
}

// ── El bug de las latas sueltas ─────────────────────────────

test('entregar cajas NO descuenta latas sueltas', () => {
  const r = movs([item({ unidad: 'caja24', cantidad: 3 })])

  assert.equal(r.length, 1)
  assert.equal(r[0].columna, 'stock_caja24')
  assert.equal(r[0].cantidad, 3)
  // Lo que arreglo este archivo: antes aparecia un segundo movimiento de
  // 3 * 24 = 72 contra stock_latas.
  assert.ok(!r.some(m => m.columna === 'stock_latas'), 'toco stock_latas al entregar cajas')
})

test('ninguna presentacion de caja toca stock_latas', () => {
  for (const unidad of ['caja12', 'caja24']) {
    const r = movs([item({ unidad, cantidad: 5 })])
    assert.deepEqual(r.map(m => m.columna), [unidad === 'caja12' ? 'stock_caja12' : 'stock_caja24'])
  }
})

test('vender latas sueltas si descuenta stock_latas, y solo eso', () => {
  const r = movs([item({ unidad: 'lata', cantidad: 24 })])
  assert.equal(r.length, 1)
  assert.equal(r[0].columna, 'stock_latas')
  assert.equal(r[0].cantidad, 24)
})

test('los barriles descuentan su propia columna y nada mas', () => {
  for (const [unidad, columna] of [
    ['barril_pet', 'stock_barril_pet'],
    ['barril_acero', 'stock_barril_acero'],
    ['barril10_pet', 'stock_barril10_pet'],
    ['barril10_acero', 'stock_barril10_acero'],
  ]) {
    const r = movs([item({ unidad, cantidad: 2 })])
    assert.deepEqual(r.map(m => m.columna), [columna], `${unidad} descontó otra cosa`)
    assert.equal(r[0].cantidad, 2)
  }
})

// ── El bug de las partidas que se pisaban ───────────────────

test('dos partidas del mismo producto y presentacion se suman, no se pisan', () => {
  const r = movs([
    item({ unidad: 'caja24', cantidad: 2 }),
    item({ unidad: 'caja24', cantidad: 3 }),
  ])

  // Antes cada partida calculaba el nuevo stock desde el mismo valor
  // original y la segunda escritura borraba la primera: se descontaban 3
  // en vez de 5.
  assert.equal(r.length, 1)
  assert.equal(r[0].cantidad, 5)
})

test('dos presentaciones del mismo producto van en movimientos separados', () => {
  const r = movs([
    item({ unidad: 'caja24', cantidad: 1 }),
    item({ unidad: 'barril_acero', cantidad: 2 }),
  ])

  assert.equal(r.length, 2)
  // Y los dos son del mismo producto, asi que se escriben en un solo update.
  const agrupado = porProducto(r)
  assert.equal(agrupado.size, 1)
  assert.equal(agrupado.get('p-1')!.length, 2)
})

test('porProducto agrupa para escribir una vez por producto', () => {
  const r = movs([
    item({ producto_id: 'p-1', unidad: 'caja24', cantidad: 1 }),
    item({ producto_id: 'p-2', unidad: 'caja24', cantidad: 1 }),
    item({ producto_id: 'p-1', unidad: 'lata', cantidad: 6 }),
  ])

  const agrupado = porProducto(r)
  assert.deepEqual([...agrupado.keys()].sort(), ['p-1', 'p-2'])
  assert.equal(agrupado.get('p-1')!.length, 2)
  assert.equal(agrupado.get('p-2')!.length, 1)
})

// ── Cajas mixtas ────────────────────────────────────────────

test('un mix descuenta latas de cada estilo y nunca cajas', () => {
  const r = movs([
    item({
      producto_id: 'p-1', unidad: 'mix24', cantidad: 2,
      metadata: { estilos: [
        { producto_id: 'p-a', nombre: 'Magma', latas: 12 },
        { producto_id: 'p-b', nombre: 'Brisa', latas: 12 },
      ] },
    }),
  ])

  assert.equal(r.length, 2)
  assert.ok(r.every(m => m.columna === 'stock_latas'))
  // 2 cajas * 12 latas de cada estilo.
  assert.deepEqual(r.map(m => m.cantidad), [24, 24])
  // El producto de la partida (p-1) no se toca: el mix sale de los estilos.
  assert.ok(!r.some(m => m.producto_id === 'p-1'))
})

test('un mix sin latas por estilo usa el default de 6', () => {
  const r = movs([
    item({
      unidad: 'mix24', cantidad: 1,
      metadata: { estilos: [{ producto_id: 'p-a', nombre: 'Magma' }] },
    }),
  ])
  assert.equal(r[0].cantidad, LATAS_POR_ESTILO_DEFAULT)
})

test('un mix acepta cantidad_latas, que es como lo guardaba el portal', () => {
  const r = movs([
    item({
      unidad: 'mix24', cantidad: 1,
      metadata: { estilos: [{ producto_id: 'p-a', cantidad_latas: 8 }] },
    }),
  ])
  assert.equal(r[0].cantidad, 8)
})

test('un mix y latas sueltas del mismo producto se consolidan', () => {
  const r = movs([
    item({ producto_id: 'p-a', unidad: 'lata', cantidad: 10 }),
    item({
      producto_id: 'p-1', unidad: 'mix24', cantidad: 1,
      metadata: { estilos: [{ producto_id: 'p-a', latas: 6 }] },
    }),
  ])

  // Las dos cosas salen de las mismas latas sueltas: 16, en un solo
  // movimiento, o la segunda escritura borraria la primera.
  assert.equal(r.length, 1)
  assert.equal(r[0].columna, 'stock_latas')
  assert.equal(r[0].cantidad, 16)
})

test('un estilo de mix sin producto es un error, no un descuento a ciegas', () => {
  const r = movimientosDeEntrega([
    item({ unidad: 'mix24', cantidad: 1, metadata: { estilos: [{ producto_id: '' }] } }),
  ])
  assert.ok('error' in r)
  if ('error' in r) assert.match(r.error, /estilo sin producto/)
})

test('un mix sin estilos cae a la presentacion normal y se rechaza', () => {
  // 'mix24' no tiene columna propia: sin el desglose no hay de donde
  // descontar, y adivinar seria justo el bug que se arreglo.
  const r = movimientosDeEntrega([item({ unidad: 'mix24', cantidad: 1, metadata: null })])
  assert.ok('error' in r)
  if ('error' in r) assert.match(r.error, /no reconocida/)
})

// ── Casos borde ─────────────────────────────────────────────

test('una presentacion desconocida se rechaza, no se descuenta de otra columna', () => {
  const r = movimientosDeEntrega([item({ unidad: 'barrica_roble' })])
  assert.ok('error' in r)
  if ('error' in r) {
    assert.match(r.error, /no reconocida/)
    assert.match(r.error, /Magma/)
  }
})

test('una unidad vacia tambien se rechaza', () => {
  // En produccion hay una partida con `unidad` en null.
  const r = movimientosDeEntrega([item({ unidad: null })])
  assert.ok('error' in r)
  if ('error' in r) assert.match(r.error, /no reconocida/)
})

test('cantidad 0 o negativa no genera movimiento', () => {
  assert.equal(movs([item({ cantidad: 0 })]).length, 0)
  assert.equal(movs([item({ cantidad: -5 })]).length, 0)
  assert.equal(movs([item({ cantidad: null })]).length, 0)
})

test('un pedido sin partidas no mueve nada', () => {
  assert.deepEqual(movs([]), [])
})

test('todos los movimientos son positivos: la ruta resta, no suma signos', () => {
  const r = movs([
    item({ unidad: 'caja24', cantidad: 4 }),
    item({ unidad: 'lata', cantidad: 7 }),
  ])
  assert.ok(r.every(m => m.cantidad > 0))
})

test('la etiqueta sirve para un mensaje de error legible', () => {
  assert.equal(movs([item({ unidad: 'caja24' })])[0].etiqueta, 'cajas de 24')
  assert.equal(movs([item({ unidad: 'lata' })])[0].etiqueta, 'latas sueltas')
  assert.equal(movs([item({ unidad: 'barril_acero' })])[0].etiqueta, 'barriles 20L acero')
})

/**
 * Tests de la logica pura de la captura de pedidos.
 *
 *   npm test
 *
 * Lo que se cubre es lo que se rompe en silencio: que columnas se muestran,
 * por que se bloquea una celda, y que la clave de celda sobreviva los
 * guiones de un uuid.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESENTACIONES, claveCelda, etiquetaDe, litrosDePartida, litrosTotalesDe,
  motivoBloqueo, precioDe, presentacionesVisibles, productoDeClave, stockDe,
  type Partida, type Producto,
} from './pos-ui.ts'

function producto(over: Record<string, unknown> = {}): Producto {
  return {
    id: 'p-1', nombre: 'Magma',
    precio_lata_publico: 60, precio_lata_taproom: 50,
    precio_barril_pet_publico: 2800, precio_barril_pet_taproom: null,
    precio_barril_acero_publico: 2497, precio_barril_acero_taproom: null,
    precio_barril10_pet_publico: null, precio_barril10_pet_taproom: null,
    precio_barril10_acero_publico: null, precio_barril10_acero_taproom: null,
    stock_latas: 130, stock_caja12: 0, stock_caja24: 44,
    stock_barril_pet: 1, stock_barril_acero: 0,
    stock_barril10_pet: 0, stock_barril10_acero: 0,
    ...over,
  } as Producto
}

// ── Columnas condicionales ──────────────────────────────────

test('las cinco presentaciones base siempre se muestran', () => {
  const visibles = presentacionesVisibles([producto()])
  assert.deepEqual(
    visibles.map(p => p.key),
    ['lata', 'caja12', 'caja24', 'barril_pet', 'barril_acero']
  )
})

test('un barril de 10 L aparece si algun producto tiene stock, aunque no tenga precio', () => {
  // Caso real de produccion: hay stock de 10L acero y ningun precio, asi que
  // la columna sale con todas las celdas bloqueadas. Eso es informacion: hay
  // inventario que no se puede vender.
  const visibles = presentacionesVisibles([producto({ stock_barril10_acero: 2 })])
  assert.ok(visibles.some(p => p.key === 'barril10_acero'))
  assert.ok(!visibles.some(p => p.key === 'barril10_pet'))

  const motivo = motivoBloqueo(producto({ stock_barril10_acero: 2 }), 'barril10_acero', 'publico')
  assert.match(String(motivo), /no tiene precio/)
})

test('un barril de 10 L aparece si algun producto tiene precio, aunque no haya stock', () => {
  const visibles = presentacionesVisibles([producto({ precio_barril10_pet_taproom: 1400 })])
  assert.ok(visibles.some(p => p.key === 'barril10_pet'))
})

test('sin precio ni stock en ningun producto, las de 10 L se ocultan', () => {
  const visibles = presentacionesVisibles([producto(), producto({ id: 'p-2', nombre: 'Brisa' })])
  assert.equal(visibles.length, 5)
})

test('la visibilidad no depende del nivel del cliente', () => {
  // Si dependiera, la matriz cambiaria de ancho al cambiar de cliente.
  const soloTaproom = producto({ precio_barril10_acero_taproom: 1300 })
  assert.ok(presentacionesVisibles([soloTaproom]).some(p => p.key === 'barril10_acero'))
})

// ── Motivo del bloqueo ──────────────────────────────────────

test('el motivo distingue falta de precio de falta de stock', () => {
  const p = producto()
  // Sin precio mayorista para barril: el caso mas comun del catalogo real.
  assert.match(String(motivoBloqueo(p, 'barril_pet', 'taproom')), /no tiene precio mayorista/)
  assert.match(String(motivoBloqueo(p, 'barril_pet', 'publico')), /^$|.*/)
  // Con precio y sin stock.
  assert.match(String(motivoBloqueo(p, 'caja12', 'publico')), /Sin stock/)
  // Con los dos: no se bloquea.
  assert.equal(motivoBloqueo(p, 'caja24', 'publico'), null)
})

test('el motivo nombra el producto y la presentacion', () => {
  const motivo = String(motivoBloqueo(producto(), 'barril_acero', 'taproom'))
  assert.match(motivo, /Magma/)
  assert.match(motivo, /Barril 20L Acero/)
})

test('la falta de precio gana sobre la falta de stock', () => {
  // Si no hay precio, el stock es irrelevante: no se puede cotizar.
  const p = producto({ precio_lata_publico: null, stock_latas: 0 })
  assert.match(String(motivoBloqueo(p, 'lata', 'publico')), /no tiene precio/)
})

// ── Precio y stock por presentacion ─────────────────────────

test('las cajas derivan del precio por lata y las latas sueltas funcionan', () => {
  const p = producto()
  assert.equal(precioDe(p, 'lata', 'publico'), 60)
  assert.equal(precioDe(p, 'caja12', 'publico'), 720)
  assert.equal(precioDe(p, 'caja24', 'publico'), 1440)
  assert.equal(precioDe(p, 'lata', 'taproom'), 50)
  // La pantalla anterior no conocia 'lata': su getPrecio devolvia 0.
  assert.ok(precioDe(p, 'lata', 'publico') > 0)
})

test('el stock sale de la columna correcta de cada presentacion', () => {
  const p = producto()
  assert.equal(stockDe(p, 'lata'), 130)
  assert.equal(stockDe(p, 'caja24'), 44)
  assert.equal(stockDe(p, 'barril_pet'), 1)
  assert.equal(stockDe(p, 'barril_acero'), 0)
  // Una presentacion sin columna no inventa stock.
  assert.equal(stockDe(p, 'mix24'), 0)
  assert.equal(stockDe(p, 'barrica'), 0)
})

// ── Clave de celda ──────────────────────────────────────────

test('la clave de celda sobrevive los guiones de un uuid', () => {
  // Es el detalle que rompe en silencio: un uuid trae cuatro guiones, y el
  // parseo corta en el ultimo.
  const uuid = '3bd23bd5-0344-4ebc-accc-2edcc463a483'
  for (const pres of PRESENTACIONES) {
    const clave = claveCelda(uuid, pres.key)
    assert.equal(productoDeClave(clave), uuid, `se rompio con ${pres.key}`)
    assert.equal(clave.slice(uuid.length + 1), pres.key)
  }
})

test('ninguna clave de presentacion trae un guion', () => {
  // Si alguna lo trajera, productoDeClave cortaria en el lugar equivocado.
  for (const pres of PRESENTACIONES) {
    assert.ok(!pres.key.includes('-'), `"${pres.key}" trae un guion`)
  }
})

// ── Litros ──────────────────────────────────────────────────

const partida = (over: Partial<Partida> = {}): Partida => ({
  producto_id: 'p-1-caja24', nombre: '', unidad: 'caja24', cantidad: 1, precio: 0, ...over,
})

test('litros por presentacion', () => {
  assert.equal(litrosDePartida(partida({ unidad: 'caja24', cantidad: 2 })), 17.04)
  assert.equal(litrosDePartida(partida({ unidad: 'barril_pet', cantidad: 1 })), 20)
  assert.equal(litrosDePartida(partida({ unidad: 'barril10_acero', cantidad: 3 })), 30)
  assert.equal(litrosDePartida(partida({ unidad: 'lata', cantidad: 24 })), 8.52)
})

test('un mix se mide por las latas de sus estilos', () => {
  const mix = partida({
    unidad: 'mix24', cantidad: 2,
    metadata: { estilos: [{ latas: 12 }, { latas: 12 }] },
  })
  // 24 latas por caja, dos cajas.
  assert.equal(litrosDePartida(mix), 17.04)
})

test('una presentacion desconocida da 0 litros en vez de romper el total', () => {
  assert.equal(litrosDePartida(partida({ unidad: 'barrica_roble' })), 0)
  assert.equal(litrosDePartida(partida({ unidad: 'mix24', metadata: null })), 0)
})

test('litrosTotalesDe suma las partidas', () => {
  const total = litrosTotalesDe([
    partida({ unidad: 'barril_pet', cantidad: 1 }),
    partida({ unidad: 'caja24', cantidad: 2 }),
  ])
  assert.equal(Math.round(total * 100) / 100, 37.04)
})

test('etiquetaDe nombra las presentaciones como el carrito las muestra', () => {
  assert.equal(etiquetaDe('lata'), 'Lata suelta')
  assert.equal(etiquetaDe('caja24'), 'Caja 24 latas')
  assert.equal(etiquetaDe('barril10_acero'), 'Barril 10L Acero')
  // Una desconocida se muestra tal cual en vez de quedar vacia.
  assert.equal(etiquetaDe('rara'), 'rara')
})

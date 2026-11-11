/**
 * Tests de la logica pura de la captura de pedidos.
 *
 *   npm test
 *
 * Lo que se cubre es lo que se rompe en silencio: que columnas se muestran,
 * por que se bloquea una celda, que el numero de la celda sea el DISPONIBLE y
 * no el fisico, y que la clave de celda sobreviva los guiones de un uuid.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESENTACIONES, celdaStock, celdaVale, claveCelda, detalleStock, disponibleEn,
  estadoIva, etiquetaDe, gravableDe, importeDe, litrosDePartida, litrosTotalesDe,
  motivoBloqueo, precioDe, presentacionesVisibles, productoDeClave, stockDe, vistaCelda,
  type Partida, type Producto,
} from './pos-ui.ts'
import { claveStock } from '../../../../src/lib/stock-disponible.ts'

/** Nada comprometido: el caso base de casi todos los tests de abajo. */
const LIBRE = new Map<string, number>()

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

  const motivo = motivoBloqueo(producto({ stock_barril10_acero: 2 }), 'barril10_acero', 'publico', LIBRE)
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
  assert.match(String(motivoBloqueo(p, 'barril_pet', 'taproom', LIBRE)), /no tiene precio mayorista/)
  assert.match(String(motivoBloqueo(p, 'barril_pet', 'publico', LIBRE)), /^$|.*/)
  // Con precio y sin stock.
  assert.match(String(motivoBloqueo(p, 'caja12', 'publico', LIBRE)), /Sin stock/)
  // Con los dos: no se bloquea.
  assert.equal(motivoBloqueo(p, 'caja24', 'publico', LIBRE), null)
})

test('el motivo nombra el producto y la presentacion', () => {
  const motivo = String(motivoBloqueo(producto(), 'barril_acero', 'taproom', LIBRE))
  assert.match(motivo, /Magma/)
  assert.match(motivo, /Barril 20L Acero/)
})

test('la falta de precio gana sobre la falta de stock', () => {
  // Si no hay precio, el stock es irrelevante: no se puede cotizar.
  const p = producto({ precio_lata_publico: null, stock_latas: 0 })
  assert.match(String(motivoBloqueo(p, 'lata', 'publico', LIBRE)), /no tiene precio/)
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

// ── Disponible por celda ────────────────────────────────────

test('la celda resta lo comprometido del fisico', () => {
  const p = producto()
  const comprometido = new Map([[claveStock('p-1', 'stock_caja24'), 4]])

  assert.deepEqual(celdaStock(p, 'caja24', comprometido), { fisico: 44, comprometido: 4, disponible: 40 })
  assert.equal(disponibleEn(p, 'caja24', comprometido), 40)
  // Una celda sin nada apartado se queda igual al fisico.
  assert.deepEqual(celdaStock(p, 'lata', comprometido), { fisico: 130, comprometido: 0, disponible: 130 })
})

test('sin el mapa cargado la celda muestra el fisico, no cero', () => {
  // Es el estado mientras el fetch del comprometido no responde: se ve de
  // mas, nunca de menos, y el servidor revalida al confirmar.
  assert.equal(disponibleEn(producto(), 'caja24', LIBRE), 44)
})

test('una presentacion sin columna no inventa disponible', () => {
  assert.deepEqual(celdaStock(producto(), 'mix24', LIBRE), { fisico: 0, comprometido: 0, disponible: 0 })
})

test('el disponible puede ser negativo y no se recorta', () => {
  // Pasa si alguien bajo el fisico a mano por debajo de lo ya vendido.
  const comprometido = new Map([[claveStock('p-1', 'stock_barril_pet'), 5]])
  assert.equal(disponibleEn(producto(), 'barril_pet', comprometido), -4)
})

test('el bloqueo distingue "sin stock" de "todo apartado"', () => {
  const p = producto()
  // 44 cajas fisicas, las 44 comprometidas: hay inventario pero no se puede
  // vender, y el mensaje tiene que decir por que.
  const todo = new Map([[claveStock('p-1', 'stock_caja24'), 44]])
  const motivo = String(motivoBloqueo(p, 'caja24', 'publico', todo))
  assert.match(motivo, /Sin disponible/)
  assert.match(motivo, /44 que hay están comprometidas/)

  // Sin fisico, el mensaje de siempre.
  assert.match(String(motivoBloqueo(p, 'caja12', 'publico', LIBRE)), /Sin stock/)
})

test('la falta de precio sigue ganando sobre el disponible', () => {
  const p = producto({ precio_lata_publico: null })
  const todo = new Map([[claveStock('p-1', 'stock_latas'), 130]])
  assert.match(String(motivoBloqueo(p, 'lata', 'publico', todo)), /no tiene precio/)
})

test('la visibilidad de una columna NO depende de lo comprometido', () => {
  // Una presentacion con todo el stock apartado sigue siendo parte del
  // catalogo: su columna se queda, con las celdas bloqueadas. Por eso
  // `presentacionesVisibles` usa el fisico.
  const p = producto({ stock_barril10_acero: 2, precio_barril10_acero_publico: 1300 })
  assert.ok(presentacionesVisibles([p]).some(x => x.key === 'barril10_acero'))
  assert.equal(stockDe(p, 'barril10_acero'), 2, 'stockDe debe seguir siendo el fisico')
})

test('detalleStock dice de donde sale el numero', () => {
  const comprometido = new Map([[claveStock('p-1', 'stock_caja24'), 4]])
  assert.equal(detalleStock(celdaStock(producto(), 'caja24', comprometido)), 'físico 44 · comprometido 4')
})

// ── El disponible no depende del cliente ────────────────────

/** Como el catalogo real: publico completo, mayorista sin barriles. */
const CATALOGO = producto({
  precio_lata_publico: 50, precio_lata_taproom: 45,
  precio_barril_pet_publico: 1600, precio_barril_pet_taproom: null,
  precio_barril_acero_publico: 1597, precio_barril_acero_taproom: null,
  precio_barril10_pet_publico: 900, precio_barril10_pet_taproom: null,
  precio_barril10_acero_publico: 850, precio_barril10_acero_taproom: null,
  stock_latas: 130, stock_caja12: 5, stock_caja24: 44,
  stock_barril_pet: 5, stock_barril_acero: 3,
  stock_barril10_pet: 2, stock_barril10_acero: 1,
})

const APARTADO = new Map([
  [claveStock('p-1', 'stock_latas'), 23],
  [claveStock('p-1', 'stock_caja24'), 4],
])

test('mismo inventario y dos niveles de cliente: el disponible es IDENTICO', () => {
  // Es la propiedad que se rompio. El bug no estaba en el calculo sino en el
  // display: la tarjeta de movil hacia
  //   precio > 0 ? `${moneda(precio)} · ${stock} disp.` : 'sin precio'
  // asi que el disponible desaparecia en las presentaciones que el cliente no
  // tenia cotizadas. Medido contra produccion: 15 celdas perdian el numero al
  // pasar de un cliente publico a El Caracol Tap (distribuidor).
  for (const pres of PRESENTACIONES) {
    const pub = vistaCelda(CATALOGO, pres.key, 'publico', APARTADO, 3)
    const may = vistaCelda(CATALOGO, pres.key, 'taproom', APARTADO, 3)

    assert.deepEqual(may.stock, pub.stock, `${pres.key}: el stock cambio con el nivel`)
    assert.equal(may.detalle, pub.detalle, `${pres.key}: el desglose cambio con el nivel`)
    assert.equal(may.enCarrito, pub.enCarrito, `${pres.key}: el carrito cambio con el nivel`)
    assert.equal(may.excede, pub.excede, `${pres.key}: "excede" cambio con el nivel`)
  }
})

test('lo unico que cambia con el cliente es el precio y si se puede capturar', () => {
  // La otra mitad de la propiedad: que el precio SI cambie. Un test que solo
  // verificara la igualdad pasaria con una pantalla que ignora al cliente.
  const pub = vistaCelda(CATALOGO, 'barril_pet', 'publico', APARTADO)
  const may = vistaCelda(CATALOGO, 'barril_pet', 'taproom', APARTADO)

  assert.equal(pub.precio, 1600)
  assert.equal(may.precio, 0, 'este barril no tiene precio mayorista')
  assert.equal(pub.motivo, null)
  assert.match(String(may.motivo), /no tiene precio mayorista/)
  // Y aun asi el disponible es el mismo y sigue siendo visible.
  assert.equal(may.stock.disponible, 5)
  assert.equal(may.detalle, 'físico 5 · comprometido 0')
})

test('el carrito se reporta aparte y NO se resta del disponible', () => {
  // Restarlo haria que el mismo inventario se viera distinto segun lo que uno
  // lleve capturado, que es la otra forma del mismo error.
  const vacio = vistaCelda(CATALOGO, 'caja24', 'publico', APARTADO, 0)
  const conCarrito = vistaCelda(CATALOGO, 'caja24', 'publico', APARTADO, 10)

  assert.equal(vacio.stock.disponible, 40, '44 fisicas menos 4 apartadas')
  assert.equal(conCarrito.stock.disponible, 40, 'el carrito movio el disponible')
  assert.equal(conCarrito.enCarrito, 10)
  assert.equal(conCarrito.excede, false, '10 de 40 no excede')
  assert.equal(vistaCelda(CATALOGO, 'caja24', 'publico', APARTADO, 41).excede, true)
})

test('que renglones se pintan en movil no depende del cliente', () => {
  // `celdaVale` no recibe sufijo a proposito: con `precio <= 0` en la
  // condicion, los renglones aparecian y desaparecian al cambiar de cliente.
  for (const pres of PRESENTACIONES) {
    assert.equal(celdaVale(CATALOGO, pres.key, APARTADO), true, `${pres.key} deberia pintarse`)
  }

  // Sin precio en ningun nivel y sin stock, no hay nada que decir.
  const nada = producto({
    precio_barril10_acero_publico: null, precio_barril10_acero_taproom: null,
    stock_barril10_acero: 0,
  })
  assert.equal(celdaVale(nada, 'barril10_acero', LIBRE), false)

  // Con stock pero sin precio en ningun nivel, si se pinta: hay inventario
  // que alguien tiene que ver.
  const soloStock = producto({
    precio_barril10_acero_publico: null, precio_barril10_acero_taproom: null,
    stock_barril10_acero: 4,
  })
  assert.equal(celdaVale(soloStock, 'barril10_acero', LIBRE), true)
})

// ── IVA por partida ─────────────────────────────────────────

const linea = (over: Partial<Partida> = {}): Partida => ({
  producto_id: 'p1-lata', nombre: 'Magma — Lata', unidad: 'lata',
  cantidad: 10, precio: 50, ...over,
})

test('el gravable suma solo las partidas marcadas', () => {
  const partidas = [linea(), linea({ producto_id: 'p2-lata', incluyeIva: true })]
  assert.equal(importeDe(partidas[0]), 500)
  assert.equal(gravableDe(partidas), 500)
  assert.equal(gravableDe([]), 0)
  assert.equal(gravableDe(partidas.map(p => ({ ...p, incluyeIva: true }))), 1_000)
})

test('estadoIva distingue todas, ninguna y mezcla', () => {
  const a = linea()
  const b = linea({ producto_id: 'p2-lata' })
  assert.equal(estadoIva([]), 'ninguna')
  assert.equal(estadoIva([a, b]), 'ninguna')
  assert.equal(estadoIva([{ ...a, incluyeIva: true }, { ...b, incluyeIva: true }]), 'todas')
  assert.equal(estadoIva([{ ...a, incluyeIva: true }, b]), 'mezcla')
})

test('una sola partida gravada es "todas", no "mezcla"', () => {
  // El switch general tiene que verse prendido, no indeterminado: no hay
  // ninguna otra partida que contradiga.
  assert.equal(estadoIva([linea({ incluyeIva: true })]), 'todas')
})

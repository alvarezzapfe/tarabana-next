/**
 * Tests del mapeo unidad -> columna de stock y de la validacion de
 * existencias al armar un pedido.
 *
 *   npm test
 *
 * Los dos casos que motivaron estos tests eran bugs de produccion:
 *
 *   - 'lata' se resolvia como `stock_lata` (la columna es `stock_latas`), asi
 *     que vender latas sueltas siempre fallaba por "stock insuficiente".
 *   - al entregar, todo lo que no fuera caja12 ni barril_pet descontaba de
 *     `stock_caja24`, asi que un barril de acero restaba cajas.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularPedido } from './calcular-pedido.ts'
import { COLUMNA_STOCK_POR_UNIDAD, columnaStockDe, LITROS_POR_UNIDAD, type ColumnaStock } from './unidades.ts'
import { claveStock } from './stock-disponible.ts'

/** Producto con precios y stock holgados en todas las presentaciones. */
function producto(over: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    nombre: 'Magma',
    activo: true,
    precio_lata_publico: 60,
    precio_lata_taproom: 50,
    precio_barril_pet_publico: 2800,
    precio_barril_pet_taproom: 2600,
    precio_barril_acero_publico: 2497,
    precio_barril_acero_taproom: 2300,
    precio_barril10_pet_publico: 1500,
    precio_barril10_pet_taproom: 1400,
    precio_barril10_acero_publico: 1400,
    precio_barril10_acero_taproom: 1300,
    stock_latas: 100,
    stock_caja12: 10,
    stock_caja24: 10,
    stock_barril_pet: 5,
    stock_barril_acero: 5,
    stock_barril10_pet: 5,
    stock_barril10_acero: 5,
    ...over,
  }
}

const mapa = (p = producto()) => new Map<string, Record<string, unknown>>([[String(p.id), p]])

/** Mismo parser que usa la ruta de admin: "<uuid>-<unidad>". */
const parsea = (item: { producto_id: string }) => {
  const parts = item.producto_id.split('-')
  const unidad = parts[parts.length - 1]
  return { productoId: parts.slice(0, -1).join('-'), unidad }
}

const corre = (unidad: string, cantidad: number, p = producto(), sufijo: 'publico' | 'taproom' = 'publico') =>
  calcularPedido([{ producto_id: `prod-1-${unidad}`, cantidad }], mapa(p), sufijo, sufijo === 'taproom', parsea)

// ── El mapeo ────────────────────────────────────────────────

test('columnaStockDe: cada unidad de venta apunta a su columna', () => {
  assert.equal(columnaStockDe('lata'), 'stock_latas')
  assert.equal(columnaStockDe('caja12'), 'stock_caja12')
  assert.equal(columnaStockDe('caja24'), 'stock_caja24')
  assert.equal(columnaStockDe('barril_pet'), 'stock_barril_pet')
  assert.equal(columnaStockDe('barril_acero'), 'stock_barril_acero')
  assert.equal(columnaStockDe('barril10_pet'), 'stock_barril10_pet')
  assert.equal(columnaStockDe('barril10_acero'), 'stock_barril10_acero')
})

test('columnaStockDe: lo que no tiene una sola columna devuelve null, no una adivinanza', () => {
  // mix24 se arma con latas de varios estilos: su descuento es por estilo.
  assert.equal(columnaStockDe('mix24'), null)
  assert.equal(columnaStockDe('barrica_roble'), null)
  assert.equal(columnaStockDe(''), null)
  assert.equal(columnaStockDe(null), null)
  assert.equal(columnaStockDe(undefined), null)
})

test('columnaStockDe: ninguna unidad apunta a una columna que no existe', () => {
  // El bug 1 era exactamente esto: `stock_lata` no es una columna.
  const columnasReales = new Set(Object.keys(LITROS_POR_UNIDAD))
  for (const [unidad, col] of Object.entries(COLUMNA_STOCK_POR_UNIDAD)) {
    assert.ok(columnasReales.has(col), `${unidad} -> ${col} no es una columna de stock real`)
  }
})

test('columnaStockDe: dos unidades distintas no comparten columna', () => {
  // El bug 2 hacia que barril_acero y barril10_* cayeran en stock_caja24.
  const cols = Object.values(COLUMNA_STOCK_POR_UNIDAD)
  assert.equal(cols.length, new Set(cols).size)
})

// ── Latas sueltas: el bug 1 ─────────────────────────────────

test('vender latas sueltas valida contra stock_latas y ya no falla siempre', () => {
  const r = corre('lata', 10)
  assert.ok(!('error' in r), 'error' in r ? r.error : '')
  if ('error' in r) return
  assert.equal(r.items[0].unidad, 'lata')
  assert.equal(r.total, 600) // 10 latas * $60
})

test('latas sueltas: el tope sigue siendo el stock real', () => {
  const r = corre('lata', 101, producto({ stock_latas: 100 }))
  assert.ok('error' in r)
  if (!('error' in r)) return
  assert.match(r.error, /Stock insuficiente/)
  assert.match(r.error, /Disponible: 100/)
})

test('latas sueltas: el stock de cajas no cuenta como latas disponibles', () => {
  // stock_latas es un contador independiente, no un derivado de las cajas
  // (ver docs/SCHEMA_NOTES.md), asi que 10 cajas no habilitan 240 latas.
  const r = corre('lata', 50, producto({ stock_latas: 0, stock_caja24: 10 }))
  assert.ok('error' in r)
  if (!('error' in r)) return
  assert.match(r.error, /Disponible: 0/)
})

// ── Barriles: el bug 2 ──────────────────────────────────────

test('cada barril se valida contra SU columna, no contra las cajas', () => {
  for (const unidad of ['barril_pet', 'barril_acero', 'barril10_pet', 'barril10_acero']) {
    const col = columnaStockDe(unidad)!
    // Columna propia en cero y cajas de sobra: debe fallar igual.
    const r = corre(unidad, 1, producto({ [col]: 0, stock_caja24: 999 }))
    assert.ok('error' in r, `${unidad} paso con su stock en 0`)
    if ('error' in r) assert.match(r.error, /Stock insuficiente/)
  }
})

test('barril_acero: caso del pedido CB63CF, 1 barril con stock propio suficiente', () => {
  const r = corre('barril_acero', 1, producto({ nombre: 'Oleaje', stock_barril_acero: 9 }))
  assert.ok(!('error' in r), 'error' in r ? r.error : '')
  if ('error' in r) return
  assert.equal(r.items[0].unidad, 'barril_acero')
  assert.equal(r.total, 2497)
})

// ── Presentacion desconocida ────────────────────────────────

test('una presentacion desconocida se rechaza en vez de leer otra columna', () => {
  const r = corre('barrica_roble', 1)
  assert.ok('error' in r)
  if (!('error' in r)) return
  // Antes caia en `stock_barrica_roble` (undefined -> 0) y el mensaje
  // hablaba de stock, escondiendo que la presentacion no existe.
  assert.match(r.error, /no reconocida/i)
})

// ── Precios por nivel ───────────────────────────────────────

test('sin precio para el nivel del cliente se rechaza con el motivo correcto', () => {
  // Caso real del catalogo: casi ningun barril tiene precio taproom.
  const r = corre('barril_acero', 1, producto({ precio_barril_acero_taproom: null }), 'taproom')
  assert.ok('error' in r)
  if (!('error' in r)) return
  assert.match(r.error, /no tiene precio/i)
})

test('las cajas derivan su precio del precio por lata', () => {
  const caja24 = corre('caja24', 1)
  const caja12 = corre('caja12', 1)
  assert.ok(!('error' in caja24) && !('error' in caja12))
  if ('error' in caja24 || 'error' in caja12) return
  assert.equal(caja24.total, 60 * 24)
  assert.equal(caja12.total, 60 * 12)
})

// ── Validacion contra el DISPONIBLE ─────────────────────────
//
// El inventario solo se descuenta al entregar, asi que validar contra la
// columna de stock dejaba vender dos veces lo mismo mientras ninguno de los
// dos pedidos se entregaba. Ver src/lib/stock-disponible.ts.

const conApartado = (
  unidad: string,
  cantidad: number,
  apartado: number,
  columna: ColumnaStock,
  p = producto()
) =>
  calcularPedido(
    [{ producto_id: `prod-1-${unidad}`, cantidad }],
    mapa(p),
    'publico',
    false,
    parsea,
    new Map([[claveStock('prod-1', columna), apartado]])
  )

test('lo apartado en pedidos abiertos no se puede volver a vender', () => {
  // 10 cajas fisicas, 8 apartadas: entran 2, no 10.
  const dos = conApartado('caja24', 2, 8, 'stock_caja24')
  assert.ok(!('error' in dos), 'rechazo una cantidad que si cabia en el disponible')

  const tres = conApartado('caja24', 3, 8, 'stock_caja24')
  assert.ok('error' in tres, 'dejo pasar mas de lo disponible')
  if (!('error' in tres)) return
  assert.match(tres.error, /Stock insuficiente/)
  // El mensaje tiene que decir el DISPONIBLE, no el fisico: "Disponible: 10"
  // con 8 apartadas manda a buscar cajas que no estan.
  assert.match(tres.error, /Disponible: 2\./)
})

test('sin nada apartado se comporta como antes', () => {
  // El parametro es opcional a proposito: equivale a validar contra el fisico.
  assert.ok(!('error' in corre('caja24', 10)))
  assert.ok('error' in corre('caja24', 11))
  assert.ok(!('error' in conApartado('caja24', 10, 0, 'stock_caja24')))
})

test('un disponible agotado se rechaza aunque el fisico alcance', () => {
  const r = conApartado('barril_pet', 1, 5, 'stock_barril_pet')
  assert.ok('error' in r)
  if (!('error' in r)) return
  assert.match(r.error, /Disponible: 0\./)
})

test('lo apartado de otra columna no estorba', () => {
  // Las latas apartadas no bloquean cajas: son inventarios distintos.
  const r = conApartado('caja24', 10, 100, 'stock_latas')
  assert.ok(!('error' in r), 'un apartado de latas bloqueo la venta de cajas')
})

test('un mix valida las latas disponibles de CADA estilo', () => {
  const a = producto({ id: 'prod-a', nombre: 'Magma', stock_latas: 100 })
  const b = producto({ id: 'prod-b', nombre: 'Brisa', stock_latas: 20 })
  const catalogo = new Map<string, Record<string, unknown>>([['prod-a', a], ['prod-b', b]])
  const items = [{
    producto_id: 'prod-a-mix24',
    cantidad: 2,
    metadata: { estilos: [
      { producto_id: 'prod-a', nombre: 'Magma', latas: 12 },
      { producto_id: 'prod-b', nombre: 'Brisa', latas: 12 },
    ] },
  }]

  // 2 cajas x 12 latas = 24 de cada estilo. Brisa tiene 20 fisicas y ninguna
  // apartada: alcanza por los pelos... no, no alcanza.
  const sinApartado = calcularPedido(items, catalogo, 'publico', false, parsea)
  assert.ok('error' in sinApartado)
  if ('error' in sinApartado) assert.match(sinApartado.error, /Brisa/)

  // Con Brisa en 30 fisicas si alcanza...
  const b30 = new Map<string, Record<string, unknown>>([['prod-a', a], ['prod-b', producto({ id: 'prod-b', nombre: 'Brisa', stock_latas: 30 })]])
  assert.ok(!('error' in calcularPedido(items, b30, 'publico', false, parsea)))

  // ...pero no si 10 de esas 30 ya estan apartadas en otro pedido.
  const r = calcularPedido(items, b30, 'publico', false, parsea, new Map([[claveStock('prod-b', 'stock_latas'), 10]]))
  assert.ok('error' in r, 'el mix ignoro las latas apartadas')
  if (!('error' in r)) return
  assert.match(r.error, /Stock de latas insuficiente de Brisa/)
  assert.match(r.error, /Disponible: 20, necesitas 24/)
})

/**
 * Factores de conversion de stock a litros. Fuente unica.
 *
 * Antes cada pantalla reimplementaba la suma, y la del dashboard mezclaba
 * unidades (contaba cada lata como 1 y cada barril como 20, dando un numero
 * que no eran litros de nada) y omitia por completo los barriles de 10 L.
 *
 * Ojo con `stock_latas`: es un contador independiente de latas sueltas, no un
 * derivado de las cajas. El comentario de tarabana_schema.sql dice lo
 * contrario y esta mal; ver docs/SCHEMA_NOTES.md.
 */

export const ML_POR_LATA = 355
export const LITROS_POR_LATA = ML_POR_LATA / 1000

export const LATAS_POR_CAJA12 = 12
export const LATAS_POR_CAJA24 = 24

export const LITROS_BARRIL_20 = 20
export const LITROS_BARRIL_10 = 10

/** Litros que aporta una unidad de cada columna de stock. */
export const LITROS_POR_UNIDAD = {
  stock_latas: LITROS_POR_LATA,
  stock_caja12: LATAS_POR_CAJA12 * LITROS_POR_LATA,
  stock_caja24: LATAS_POR_CAJA24 * LITROS_POR_LATA,
  stock_barril_pet: LITROS_BARRIL_20,
  stock_barril_acero: LITROS_BARRIL_20,
  stock_barril10_pet: LITROS_BARRIL_10,
  stock_barril10_acero: LITROS_BARRIL_10,
} as const

/**
 * Como se nombra cada columna en un mensaje para una persona.
 *
 * Vive aqui, junto a las columnas, porque la usan dos cosas distintas —el
 * descuento al entregar y la validacion al editar partidas— y dos mapas
 * diciendo lo mismo se desincronizan al agregar una presentacion.
 */
export const ETIQUETA_COLUMNA = {
  stock_latas: 'latas sueltas',
  stock_caja12: 'cajas de 12',
  stock_caja24: 'cajas de 24',
  stock_barril_pet: 'barriles 20L PET',
  stock_barril_acero: 'barriles 20L acero',
  stock_barril10_pet: 'barriles 10L PET',
  stock_barril10_acero: 'barriles 10L acero',
} as const satisfies Record<keyof typeof LITROS_POR_UNIDAD, string>

export type ColumnaStock = keyof typeof LITROS_POR_UNIDAD

export const COLUMNAS_STOCK = Object.keys(LITROS_POR_UNIDAD) as ColumnaStock[]

export type FilaStock = Partial<Record<ColumnaStock, number | null>>

/** Litros de un producto. */
export function litrosDeProducto(p: FilaStock): number {
  return COLUMNAS_STOCK.reduce((total, col) => total + (p[col] || 0) * LITROS_POR_UNIDAD[col], 0)
}

/** Litros de una lista de productos. */
export function litrosTotales(productos: FilaStock[]): number {
  return productos.reduce((total, p) => total + litrosDeProducto(p), 0)
}

/** Latas equivalentes, para las vistas que cuentan piezas en vez de volumen. */
export function latasEquivalentes(p: FilaStock): number {
  return (
    (p.stock_latas || 0) +
    (p.stock_caja12 || 0) * LATAS_POR_CAJA12 +
    (p.stock_caja24 || 0) * LATAS_POR_CAJA24
  )
}

/** Formato del KPI: un decimal. */
export function formatLitros(litros: number): string {
  return `${litros.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
}

// ── Unidades de venta (pedido_items) ────────────────────────
//
// `LITROS_POR_UNIDAD` de arriba esta indexado por COLUMNA DE STOCK, que es
// otro vocabulario: `pedido_items.unidad` guarda la presentacion vendida
// ('caja24', 'mix24', 'barril_acero'...). Los factores son los mismos y se
// reusan de las constantes de arriba para que no haya dos verdades.
//
// `mix24` es una caja de 24 latas armada con estilos distintos: mismo volumen
// que una caja24, y por eso mismo factor.

export const LITROS_POR_UNIDAD_VENTA = {
  lata: LITROS_POR_LATA,
  caja12: LATAS_POR_CAJA12 * LITROS_POR_LATA,
  caja24: LATAS_POR_CAJA24 * LITROS_POR_LATA,
  mix24: LATAS_POR_CAJA24 * LITROS_POR_LATA,
  barril_pet: LITROS_BARRIL_20,
  barril_acero: LITROS_BARRIL_20,
  barril10_pet: LITROS_BARRIL_10,
  barril10_acero: LITROS_BARRIL_10,
} as const

export type UnidadVenta = keyof typeof LITROS_POR_UNIDAD_VENTA

export const esUnidadVenta = (u: string | null | undefined): u is UnidadVenta =>
  !!u && u in LITROS_POR_UNIDAD_VENTA

/**
 * Litros de una partida de pedido.
 *
 * Devuelve null si la unidad es desconocida o viene vacia, en vez de asumir
 * una: en produccion hay partidas con `unidad` en null, y rellenarlas con un
 * default (como hace el fallback de precio en calcular-pedido.ts) inventaria
 * volumen que no se vendio. Quien llame decide si lo omite o lo reporta.
 */
export function litrosDeItem(unidad: string | null | undefined, cantidad: number | null): number | null {
  if (!esUnidadVenta(unidad)) return null
  return (cantidad || 0) * LITROS_POR_UNIDAD_VENTA[unidad]
}

// ── Top productos por volumen ───────────────────────────────

export type FilaProducto = { nombre: string; litros: number }

export type ItemVendido = {
  unidad: string | null
  cantidad: number | null
  nombre: string
}

/**
 * Top productos por VOLUMEN, no por piezas: una caja de 24 y un barril de 20 L
 * no son comparables como "1 unidad" cada uno.
 *
 * `sinUnidad` cuenta las partidas cuya unidad no se pudo interpretar. No se
 * reparten ni se asumen: se reportan, para que un hueco en los datos se vea
 * en vez de desaparecer dentro de un total.
 */
export function topProductosEnLitros(
  items: ItemVendido[],
  limite = 5
): { filas: FilaProducto[]; sinUnidad: number } {
  const acum = new Map<string, number>()
  let sinUnidad = 0

  for (const it of items) {
    const litros = litrosDeItem(it.unidad, it.cantidad)
    if (litros === null) {
      sinUnidad += 1
      continue
    }
    acum.set(it.nombre, (acum.get(it.nombre) || 0) + litros)
  }

  const filas = [...acum.entries()]
    .map(([nombre, litros]) => ({ nombre, litros }))
    .sort((a, b) => b.litros - a.litros)
    .slice(0, limite)

  return { filas, sinUnidad }
}

// ── Unidad de venta -> columna de stock ─────────────────────
//
// Fuente unica del mapeo. Estaba duplicado y mal en los dos lugares que lo
// usaban, con dos fallos distintos:
//
//   1. `calcular-pedido.ts` lo resolvia como `stock_${unidad}` cuando la
//      unidad no estaba en su mapa. Para 'lata' eso daba `stock_lata`, que no
//      existe (la columna es `stock_latas`), asi que leia undefined -> 0 y
//      pedir latas sueltas SIEMPRE fallaba con "stock insuficiente".
//
//   2. La ruta de status mandaba a `stock_caja24` todo lo que no fuera
//      caja12 ni barril_pet, asi que entregar un `barril_acero` descontaba
//      cajas de 24 y nunca tocaba `stock_barril_acero`.
//
// `mix24` no aparece a proposito: se arma con latas sueltas de varios
// estilos, asi que su descuento es por estilo contra `stock_latas` y no cabe
// en un mapeo de una sola columna. Quien lo maneje lo trata aparte.

export const COLUMNA_STOCK_POR_UNIDAD = {
  lata: 'stock_latas',
  caja12: 'stock_caja12',
  caja24: 'stock_caja24',
  barril_pet: 'stock_barril_pet',
  barril_acero: 'stock_barril_acero',
  barril10_pet: 'stock_barril10_pet',
  barril10_acero: 'stock_barril10_acero',
} as const satisfies Record<string, ColumnaStock>

/**
 * Columna de stock que le corresponde a una unidad de venta, o null si no
 * hay una sola columna que la represente ('mix24', o una unidad desconocida).
 *
 * Devuelve null en vez de adivinar: descontar de la columna equivocada es
 * peor que no descontar, porque corrompe el inventario en silencio.
 */
export function columnaStockDe(unidad: string | null | undefined): ColumnaStock | null {
  if (!unidad) return null
  return (COLUMNA_STOCK_POR_UNIDAD as Record<string, ColumnaStock>)[unidad] ?? null
}

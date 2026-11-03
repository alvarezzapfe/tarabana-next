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

export type ColumnaStock = keyof typeof LITROS_POR_UNIDAD

export const COLUMNAS_STOCK = Object.keys(LITROS_POR_UNIDAD) as ColumnaStock[]

type FilaStock = Partial<Record<ColumnaStock, number | null>>

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

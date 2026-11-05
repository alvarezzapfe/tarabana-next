/**
 * La fecha de hoy en la zona del negocio. Fuente unica.
 *
 * `new Date().getMonth()` y compania usan la zona de DONDE CORRE el codigo:
 * en el navegador de alguien en CDMX da una cosa, y en el servidor (UTC) otra.
 * Eso convierte cualquier agrupacion por mes en algo que depende de donde se
 * ejecuto, y rompe de verdad en las fronteras:
 *
 *   31 de octubre, 19:30 CDMX
 *     en UTC  -> 2026-11-01   (noviembre)
 *     en MX   -> 2026-10-31   (octubre)
 *
 * Seis horas cada noche en las que un pedido, un corte de comisiones o una
 * grafica caen en el mes equivocado. Por eso la fecha de negocio se calcula
 * siempre contra `America/Mexico_City`, sin importar donde corra.
 *
 * El equivalente en SQL es `public.hoy_mx()`, que existe por la misma razon:
 * `current_date` se evalua en UTC.
 */

export const ZONA_MX = 'America/Mexico_City'

/**
 * 'en-CA' da el formato YYYY-MM-DD, que es justo el de una columna `date` de
 * Postgres y ordena bien como string. No es un truco: es el formato oficial
 * de fecha de Canada.
 */
const FORMATO_FECHA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_MX,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** La fecha de un instante, en Mexico. 'YYYY-MM-DD'. */
export function fechaMx(momento: Date = new Date()): string {
  return FORMATO_FECHA.format(momento)
}

/** Hoy en Mexico. 'YYYY-MM-DD'. */
export const hoyMx = (): string => fechaMx()

/** El mes de un instante, en Mexico. 'YYYY-MM'. */
export const periodoMx = (momento: Date = new Date()): string => fechaMx(momento).slice(0, 7)

/** El mes de hoy, en Mexico. 'YYYY-MM'. */
export const periodoActualMx = (): string => periodoMx()

/**
 * El mes de una fecha que ya viene como 'YYYY-MM-DD' de la DB.
 *
 * No pasa por `Date` a proposito: una columna `date` no tiene hora ni zona, y
 * `new Date('2026-08-01')` la interpretaria como medianoche UTC, que en CDMX
 * es el 31 de julio. Cortar el string es exacto.
 */
export const periodoDeFechaDB = (fecha: string): string => fecha.slice(0, 7)

/** true si la fecha 'YYYY-MM-DD' es posterior a hoy en Mexico. */
export const esFutura = (fecha: string): boolean => fecha > hoyMx()

/**
 * Suma dias a una fecha 'YYYY-MM-DD' y devuelve otra igual.
 *
 * Se arma a mediodia UTC para que ningun corrimiento de zona mueva el dia:
 * sumar dias a una medianoche es la forma clasica de perder o ganar uno.
 */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const base = new Date(Date.UTC(a, m - 1, d, 12))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

/** Etiqueta corta de una fecha de la DB: "5 nov 2026". */
export function etiquetaFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return '—'
  // Mediodia UTC por lo mismo de arriba: evita que el formateo retroceda un dia.
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

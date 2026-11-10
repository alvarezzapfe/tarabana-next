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

/**
 * Dias entre dos fechas 'YYYY-MM-DD'. Positivo si `hasta` es posterior.
 *
 * Se ancla a mediodia UTC para que la resta no dependa de la zona ni del
 * horario de verano: con medianoche, una diferencia de 60 minutos puede
 * cambiar el resultado en un dia entero.
 */
export function diasEntre(desde: string, hasta: string): number {
  const ms = (f: string) => {
    const [a, m, d] = f.slice(0, 10).split('-').map(Number)
    return Date.UTC(a, m - 1, d, 12)
  }
  return Math.round((ms(hasta) - ms(desde)) / 86400000)
}

/** true si el string tiene la forma 'YYYY-MM-DD' y es una fecha que existe. */
export function esFechaDB(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [a, m, d] = valor.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  return d <= diasDelMes(a, m)
}

/** Dias que tiene el mes `m` (1-12) del anio `a`. Cuenta los bisiestos. */
const diasDelMes = (a: number, m: number): number => new Date(Date.UTC(a, m, 0)).getUTCDate()

const dosDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * Suma meses a una fecha 'YYYY-MM-DD'. Si el mes destino es mas corto, el dia
 * se RECORTA al ultimo que existe.
 *
 * El recorte no es un detalle: sin el, "un anio antes del 29 de febrero" o "un
 * mes despues del 31 de enero" se desbordarian al mes siguiente, y la
 * comparacion contra el anio anterior quedaria corrida un dia justo en los
 * bordes. Postgres (`date + interval '1 year'`) recorta igual.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const total = a * 12 + (m - 1) + meses
  // Con `total` negativo, `%` en JS da negativo; se despeja desde el floor.
  const anio = Math.floor(total / 12)
  const mes = total - anio * 12 + 1
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(Math.min(d, diasDelMes(anio, mes)))}`
}

/** El dia 1 del mes de una fecha 'YYYY-MM-DD'. */
export const inicioMes = (fecha: string): string => `${fecha.slice(0, 7)}-01`

/** El ultimo dia del mes de una fecha 'YYYY-MM-DD'. */
export function finMes(fecha: string): string {
  const [a, m] = fecha.split('-').map(Number)
  return `${fecha.slice(0, 7)}-${dosDigitos(diasDelMes(a, m))}`
}

/**
 * El LUNES de la semana de una fecha 'YYYY-MM-DD'.
 *
 * Lunes y no domingo porque la semana del negocio empieza el lunes; con
 * domingo, un corte semanal parte el fin de semana en dos.
 *
 * El dia de la semana se saca a mediodia UTC por lo mismo que `sumarDias`:
 * desde medianoche, cualquier corrimiento de zona cambia el dia.
 */
export function inicioSemana(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay() // 0 = domingo
  return sumarDias(fecha, -((dow + 6) % 7))
}

/** Etiqueta de eje para un dia: "5 nov". */
export function etiquetaDiaCorto(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** Etiqueta de eje para un mes: "nov 26". */
export function etiquetaMesCorto(fecha: string): string {
  const [a, m] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 1, 12)).toLocaleDateString('es-MX', {
    month: 'short', year: '2-digit', timeZone: 'UTC',
  })
}

/** Etiqueta de tooltip para un mes: "noviembre 2026". */
export function etiquetaMesLargo(fecha: string): string {
  const [a, m] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 1, 12)).toLocaleDateString('es-MX', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

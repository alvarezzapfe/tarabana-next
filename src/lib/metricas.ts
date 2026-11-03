/**
 * Metricas del admin derivadas de la vista `pedidos_saldo`, fuente unica.
 *
 * Por que la vista y no la tabla `pedidos`: la vista ya excluye cancelados y
 * trae `pagado`, `saldo`, `estado_cobro` y `dias_vencido` calculados en SQL.
 *
 * OJO con `pagado`: en la tabla `pedidos` es un boolean, en la vista es la
 * suma numerica de los pagos no cancelados. Filtrar por verdad (`p.pagado`)
 * sobre la vista significaria "tiene algun pago" y contaria como cobrado
 * completo un pedido pagado a medias. Aqui siempre se suman montos.
 *
 * OJO con `total`: es el importe BRUTO, antes de descuento y de envio. La
 * vista viva calcula saldo = total - descuento + costo_envio - pagado
 * (verificado contra produccion, 15/15 filas; ver docs/SCHEMA_NOTES.md), asi
 * que el importe realmente facturado de un pedido es pagado + saldo, no
 * total. Usar `total` para montos sobreestima lo facturado por el descuento y
 * no cuadra con Cobrado ni con Por cobrar.
 */

/** Ventana de inactividad de un cliente. La comparte Reportes. */
export const DIAS_INACTIVIDAD = 45

/** Status que ya no cuentan como pedido en curso (la vista excluye cancelados). */
const STATUS_CERRADOS = ['entregado']

export type FilaSaldo = {
  id: string
  cliente_id: string | null
  total: number | null
  pagado: number | null
  saldo: number | null
  status: string
  estado_cobro: string
  dias_vencido: number | null
  created_at: string
}

/** El saldo puede venir negativo si hubo sobrepago; no resta de lo por cobrar. */
const saldoPositivo = (f: FilaSaldo) => Math.max(0, f.saldo || 0)

/**
 * Importe neto facturado de un pedido: lo ya cobrado mas lo que falta.
 * Es la unica base consistente con Cobrado y Por cobrar.
 */
export const netoDe = (f: FilaSaldo) => (f.pagado || 0) + (f.saldo || 0)

export function netoTotal(filas: FilaSaldo[]): number {
  return filas.reduce((s, f) => s + netoDe(f), 0)
}

export function cobradoDe(filas: FilaSaldo[]): number {
  return filas.reduce((s, f) => s + (f.pagado || 0), 0)
}

export function porCobrarDe(filas: FilaSaldo[]): number {
  return filas.reduce((s, f) => s + saldoPositivo(f), 0)
}

/** Fraccion cobrada sobre lo facturado. null si no hay nada que cobrar. */
export function pctCobradoDe(filas: FilaSaldo[]): number | null {
  const cobrado = cobradoDe(filas)
  const porCobrar = porCobrarDe(filas)
  const base = cobrado + porCobrar
  if (base <= 0) return null
  return (cobrado / base) * 100
}

export function pedidosActivosDe(filas: FilaSaldo[]): number {
  return filas.filter(f => !STATUS_CERRADOS.includes(f.status)).length
}

export function hayVencidos(filas: FilaSaldo[]): boolean {
  return filas.some(f => f.estado_cobro === 'vencido')
}

/** Clientes con al menos un pedido en los ultimos DIAS_INACTIVIDAD dias. */
export function clientesActivosDe(filas: FilaSaldo[], ahora = new Date()): number {
  const corte = ahora.getTime() - DIAS_INACTIVIDAD * 86400000
  const ids = new Set<string>()
  for (const f of filas) {
    if (!f.cliente_id) continue
    if (new Date(f.created_at).getTime() >= corte) ids.add(f.cliente_id)
  }
  return ids.size
}

// ── Meses ───────────────────────────────────────────────────

export type Mes = { clave: string; etiqueta: string }

const clave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Los ultimos `n` meses hasta el actual, siempre completos.
 *
 * Se generan desde la fecha, no desde las claves de los datos: antes la
 * grafica hacia slice(-6) sobre un objeto indexado por mes localizado, asi
 * que los meses salian en orden de insercion y los vacios desaparecian.
 */
export function ultimosMeses(n = 12, ahora = new Date()): Mes[] {
  const meses: Mes[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    meses.push({
      clave: clave(d),
      etiqueta: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
    })
  }
  return meses
}

/** Agrupa por mes de creacion. Devuelve un mapa clave -> filas. */
export function porMes(filas: FilaSaldo[]): Map<string, FilaSaldo[]> {
  const mapa = new Map<string, FilaSaldo[]>()
  for (const f of filas) {
    const k = clave(new Date(f.created_at))
    const actual = mapa.get(k)
    if (actual) actual.push(f)
    else mapa.set(k, [f])
  }
  return mapa
}

/**
 * Serie de facturacion neta por mes, con los meses vacios en cero.
 * Neta, no bruta: ver la nota sobre `total` al inicio del archivo.
 */
export function serieFacturada(filas: FilaSaldo[], n = 12, ahora = new Date()) {
  const mapa = porMes(filas)
  return ultimosMeses(n, ahora).map(m => ({
    mes: m.etiqueta,
    total: netoTotal(mapa.get(m.clave) || []),
  }))
}

// ── Variacion ───────────────────────────────────────────────

export type Variacion = { pct: number; dir: 'up' | 'down' }

/**
 * Variacion porcentual. Devuelve null cuando no hay base de comparacion:
 * si el mes previo fue cero no hay porcentaje que calcular. Antes esto
 * devolvia +100% cuando el previo era 0, que es un dato inventado.
 */
export function variacion(actual: number, previo: number): Variacion | null {
  if (!Number.isFinite(actual) || !Number.isFinite(previo)) return null
  if (previo === 0) return null
  const pct = ((actual - previo) / previo) * 100
  if (!Number.isFinite(pct)) return null
  return { pct: Math.abs(Math.round(pct)), dir: pct >= 0 ? 'up' : 'down' }
}

/** Claves del mes en curso y del anterior. */
export function clavesMesActualYPrevio(ahora = new Date()) {
  const actual = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const previo = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  return { actual: clave(actual), previo: clave(previo) }
}

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

import {
  diasEntre, esFechaDB, etiquetaDiaCorto, etiquetaFecha, etiquetaMesCorto, etiquetaMesLargo,
  fechaMx, finMes, inicioMes, inicioSemana, periodoDeFechaDB, periodoMx, sumarDias, sumarMeses,
} from './fechas.ts'
import { litrosDeItem, type ItemVendido } from './unidades.ts'

/**
 * Ventana de inactividad de un cliente.
 *
 * OJO: Reportes NO importa esta constante, repite el literal 45 en
 * `app/admin/finanzas/ReportesClient.tsx`. Si se cambia aqui, alla no cambia.
 */
export const DIAS_INACTIVIDAD = 45

/**
 * Ventana del KPI "Clientes activos" del Inicio.
 *
 * Aparte de DIAS_INACTIVIDAD a proposito: son dos preguntas distintas (quien
 * sigue comprando vs a quien hay que volver a buscar) y mover una no deberia
 * mover la otra en silencio.
 */
export const DIAS_CLIENTE_ACTIVO = 90

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
  /**
   * Fecha del PEDIDO, 'YYYY-MM-DD'. Es la que agrupa por mes y la que mide la
   * antiguedad del saldo.
   *
   * No es `created_at`: eso es cuando se CAPTURO. Un pedido levantado el lunes
   * y capturado el jueves pertenece al lunes, y si se captura con fecha
   * retroactiva la diferencia puede ser de meses.
   */
  fecha_pedido: string
  /** AUDITORIA: cuando se capturo. No se usa para agrupar. */
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

/**
 * Clientes con al menos un pedido en los ultimos `dias`.
 *
 * La ventana se compara como fecha, no como instante: `fecha_pedido` no tiene
 * hora, asi que restarle milisegundos a un `Date` metia un corrimiento de
 * hasta un dia segun la hora en que se mirara la pantalla.
 */
export function clientesActivosDe(filas: FilaSaldo[], ahora = new Date(), dias = DIAS_CLIENTE_ACTIVO): number {
  const corte = sumarDias(fechaMx(ahora), -dias)
  const ids = new Set<string>()
  for (const f of filas) {
    if (!f.cliente_id) continue
    if (f.fecha_pedido >= corte) ids.add(f.cliente_id)
  }
  return ids.size
}

// ── Meses ───────────────────────────────────────────────────

export type Mes = { clave: string; etiqueta: string }

/**
 * Clave de mes, en la zona del negocio.
 *
 * Antes era `getFullYear`/`getMonth`, que es la zona de donde corre el codigo.
 * En un servidor en UTC, un pedido de las 19:00 del 31 de octubre caia en
 * noviembre; en el navegador de alguien en CDMX, en octubre. La misma grafica
 * daba numeros distintos segun donde se calculara.
 */
const clave = (d: Date) => periodoMx(d)

/**
 * Mes de una fila, desde su `fecha_pedido`.
 *
 * Se corta el string y no se pasa por `Date` a proposito: `fecha_pedido` es
 * una columna `date`, sin hora ni zona, y `new Date('2026-08-01')` seria
 * medianoche UTC, que en CDMX es el 31 de julio.
 */
const claveDeFila = (f: FilaSaldo) => periodoDeFechaDB(f.fecha_pedido)

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

/** Agrupa por mes del PEDIDO. Devuelve un mapa clave -> filas. */
export function porMes(filas: FilaSaldo[]): Map<string, FilaSaldo[]> {
  const mapa = new Map<string, FilaSaldo[]>()
  for (const f of filas) {
    const k = claveDeFila(f)
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

// ── Vencido ─────────────────────────────────────────────────

/**
 * Saldo realmente vencido.
 *
 * Se filtra por `dias_vencido > 0` y NO por `estado_cobro === 'vencido'`, que
 * es lo que uno esperaria. Motivo: la vista viva evalua la rama 'parcial'
 * ANTES de 'vencido' (ver docs/SCHEMA_NOTES.md), asi que un pedido atrasado
 * que ya recibio un abono sale 'parcial' y su saldo no se contaria.
 *
 * En produccion eso pasa hoy: el pedido B1465D lleva 92 dias de atraso con
 * $100 de saldo y estado 'parcial'. Con `estado_cobro` el KPI daria
 * $36,873.85 en vez de $36,973.85, y ademas no cuadraria con la antiguedad de
 * cartera de la misma pantalla, que si usa `dias_vencido`.
 */
export function vencidoDe(filas: FilaSaldo[]): number {
  return filas
    .filter(f => (f.dias_vencido || 0) > 0)
    .reduce((s, f) => s + saldoPositivo(f), 0)
}

// ── Antiguedad de cartera ───────────────────────────────────

export type BucketCartera = {
  clave: string
  etiqueta: string
  monto: number
  pedidos: number
}

/**
 * Los tramos de atraso. `hasta` es inclusivo y `null` es sin tope.
 * 'Al corriente' son los que tienen saldo pero todavia no vencen.
 */
const TRAMOS_CARTERA: { clave: string; etiqueta: string; desde: number; hasta: number | null }[] = [
  { clave: 'corriente', etiqueta: 'Al corriente', desde: 0, hasta: 0 },
  { clave: '1-30', etiqueta: '1–30 días', desde: 1, hasta: 30 },
  { clave: '31-60', etiqueta: '31–60 días', desde: 31, hasta: 60 },
  { clave: '61-90', etiqueta: '61–90 días', desde: 61, hasta: 90 },
  { clave: '90+', etiqueta: '90+ días', desde: 91, hasta: null },
]

/**
 * Antiguedad de lo que falta por cobrar, por dias de atraso.
 *
 * Solo entran pedidos con saldo > 0: la cartera es lo que se debe, no lo que
 * se facturo. Un pedido ya pagado no tiene antiguedad que medir, aunque su
 * fecha de vencimiento haya quedado atras.
 */
export function antiguedadCartera(filas: FilaSaldo[]): BucketCartera[] {
  const buckets = TRAMOS_CARTERA.map(t => ({ ...t, monto: 0, pedidos: 0 }))

  for (const f of filas) {
    const saldo = saldoPositivo(f)
    if (saldo <= 0) continue
    const dias = Math.max(0, f.dias_vencido || 0)
    const b = buckets.find(x => dias >= x.desde && (x.hasta === null || dias <= x.hasta))
    if (!b) continue
    b.monto += saldo
    b.pedidos += 1
  }

  return buckets.map(({ clave, etiqueta, monto, pedidos }) => ({ clave, etiqueta, monto, pedidos }))
}

// ── Requiere atencion ───────────────────────────────────────

/** Dias con saldo abierto a partir de los cuales un pedido pide atencion. */
export const DIAS_ATENCION = 30

export type FilaAtencion = {
  id: string
  cliente_id: string | null
  saldo: number
  /** Dias de atraso sobre la fecha de vencimiento. 0 si aun no vence. */
  diasVencido: number
  /** Dias desde que se levanto el pedido. */
  diasAbierto: number
  estado_cobro: string
}

/**
 * Pedidos con saldo que ya vencieron, o que llevan mas de DIAS_ATENCION dias
 * abiertos aunque sus condiciones de pago todavia no venzan.
 *
 * Lo segundo no es redundante: un pedido a 30 dias levantado hace 40 vence
 * por fecha, pero uno de contado mal capturado puede quedarse con
 * `fecha_vencimiento` nula y nunca contar como vencido. La antiguedad del
 * saldo lo pesca igual.
 *
 * Ordenados por atraso y, a igual atraso, por monto: lo mas viejo y mas caro
 * primero.
 */
export function requierenAtencion(filas: FilaSaldo[], ahora = new Date()): FilaAtencion[] {
  const salida: FilaAtencion[] = []

  for (const f of filas) {
    const saldo = saldoPositivo(f)
    if (saldo <= 0) continue

    const diasVencido = Math.max(0, f.dias_vencido || 0)
    // Dias desde la fecha del PEDIDO, no desde la captura: un pedido
    // capturado hoy con fecha de hace dos meses lleva dos meses abierto.
    const diasAbierto = Math.max(0, diasEntre(f.fecha_pedido, fechaMx(ahora)))
    if (diasVencido === 0 && diasAbierto <= DIAS_ATENCION) continue

    salida.push({
      id: f.id,
      cliente_id: f.cliente_id,
      saldo,
      diasVencido,
      diasAbierto,
      estado_cobro: f.estado_cobro,
    })
  }

  return salida.sort((a, b) =>
    b.diasVencido !== a.diasVencido ? b.diasVencido - a.diasVencido : b.saldo - a.saldo
  )
}

// ── Top clientes ────────────────────────────────────────────

export type FilaCliente = {
  id: string
  /** razon_social > full_name > email, ya normalizado. */
  nombre: string
  facturado: number
  saldo: number
  /** Fraccion del facturado total del periodo. */
  pct: number
}

export type DatosCliente = {
  id: string
  full_name: string | null
  email: string | null
  razon_social: string | null
  /**
   * El nombre comercial: como se conoce el NEGOCIO.
   *
   * Opcional en el tipo porque hay consultas que no lo traen (los perfiles de
   * staff, por ejemplo, no tienen uno) y porque asi los call sites viejos
   * siguen compilando. Cuando viene, manda.
   */
  marca_negocio?: string | null
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'el', 'a'])

/**
 * El nombre con el que se muestra un cliente, en formato Titulo si hace falta.
 *
 * Precedencia: nombre comercial, razon social, nombre, correo. El comercial va
 * primero porque el cliente es el NEGOCIO — una persona fisica puede facturar
 * por un bar con su propia marca, y en la tabla se busca el bar, no a la
 * persona.
 *
 * El formato Titulo se aplica solo si viene TODO EN MAYUSCULAS. Los nombres
 * que ya traen minusculas se dejan como estan: reescribirlos seria adivinar
 * donde van las mayusculas de un nombre propio.
 *
 * Respeta las siglas y las formas legales: un token con puntos ('S.A.P.I.')
 * o de la lista de sufijos se queda en mayusculas, para que
 * 'CERVECERIA ... S.A.P.I. DE C.V.' quede 'Cerveceria ... S.A.P.I. de C.V.'
 * y no 'S.a.p.i. De C.v.'.
 */
const SIGLAS = new Set(['SA', 'SAPI', 'CV', 'SC', 'SAS', 'RL', 'SRL', 'SOFOM', 'ENR', 'MI'])

export function nombreLegible(c: DatosCliente): string {
  const crudo = (c.marca_negocio || c.razon_social || c.full_name || c.email || '').trim()
  if (!crudo) return 'Cliente sin nombre'
  // Si trae alguna minuscula, no se toca.
  if (/[a-záéíóúñü]/.test(crudo)) return crudo

  return crudo
    .toLowerCase()
    .split(/\s+/)
    .map((palabra, i) => {
      const original = crudo.split(/\s+/)[i]
      if (original.includes('.') || SIGLAS.has(original.replace(/\./g, ''))) return original
      if (i > 0 && MINUSCULAS.has(palabra)) return palabra
      return palabra.charAt(0).toUpperCase() + palabra.slice(1)
    })
    .join(' ')
}

/**
 * El par que se pinta en dos renglones: el nombre arriba, el dato fiscal en
 * gris abajo.
 *
 * `secundario` solo sale cuando aporta algo distinto: si el negocio se llama
 * igual que la razon social, repetirlo en gris es ruido. Compara normalizado
 * para que "BAR LA ESQUINA" y "Bar La Esquina" cuenten como lo mismo.
 */
export function nombreCliente(c: DatosCliente): { principal: string; secundario: string | null } {
  const principal = nombreLegible(c)
  const clave = principal.trim().toLowerCase()

  for (const crudo of [c.razon_social, c.email]) {
    const v = (crudo || '').trim()
    if (v && v.toLowerCase() !== clave) return { principal, secundario: v }
  }
  return { principal, secundario: null }
}

/** Top clientes por facturacion neta, con su saldo y su peso en el total. */
export function topClientes(filas: FilaSaldo[], clientes: DatosCliente[], limite = 8): FilaCliente[] {
  const datos = new Map(clientes.map(c => [c.id, c]))
  const acum = new Map<string, { facturado: number; saldo: number }>()

  for (const f of filas) {
    if (!f.cliente_id) continue
    const a = acum.get(f.cliente_id) || { facturado: 0, saldo: 0 }
    a.facturado += netoDe(f)
    a.saldo += saldoPositivo(f)
    acum.set(f.cliente_id, a)
  }

  const total = [...acum.values()].reduce((s, a) => s + a.facturado, 0)

  return [...acum.entries()]
    .map(([id, a]) => ({
      id,
      nombre: nombreLegible(datos.get(id) || { id, full_name: null, email: null, razon_social: null }),
      facturado: a.facturado,
      saldo: a.saldo,
      pct: total > 0 ? (a.facturado / total) * 100 : 0,
    }))
    .sort((a, b) => b.facturado - a.facturado)
    .slice(0, limite)
}

// ── Periodos ────────────────────────────────────────────────
//
// Todo lo de aqui abajo trabaja con fechas 'YYYY-MM-DD' y las compara como
// STRING. No es pereza: `fecha_pedido` y `pagos.fecha_pago` son columnas
// `date` en produccion (ver docs/SCHEMA_NOTES.md), no tienen hora ni zona, y
// pasarlas por `Date` las movia un dia en CDMX. Como 'YYYY-MM-DD' ordena
// lexicograficamente igual que cronologicamente, `>=` y `<=` sobre el string
// son exactos.
//
// El unico `Date` que entra es el `ahora` que viene del servidor, y lo
// primero que se le hace es `fechaMx()`.

/** Un rango de fechas, inclusivo en los dos extremos. */
export type Rango = { desde: string; hasta: string }

export type ClavePeriodo =
  | 'mes' | 'mes_anterior' | 'trimestre' | 'ytd' | '12m' | '24m' | 'personalizado'

export const PERIODOS: { clave: ClavePeriodo; label: string }[] = [
  { clave: 'mes', label: 'Este mes' },
  { clave: 'mes_anterior', label: 'Mes anterior' },
  { clave: 'trimestre', label: 'Trimestre' },
  { clave: 'ytd', label: 'Año a la fecha' },
  { clave: '12m', label: '12 meses' },
  { clave: '24m', label: '24 meses' },
  { clave: 'personalizado', label: 'Personalizado' },
]

export const PERIODO_DEFAULT: ClavePeriodo = '12m'

export const etiquetaPeriodo = (c: ClavePeriodo): string =>
  PERIODOS.find(p => p.clave === c)?.label || ''

export const esClavePeriodo = (v: unknown): v is ClavePeriodo =>
  typeof v === 'string' && PERIODOS.some(p => p.clave === v)

/**
 * Tope de un rango personalizado, en dias (~5 anios).
 *
 * No es una regla de negocio, es una defensa: el rango llega por la URL y
 * `?desde=0001-01-01` generaria miles de buckets. Se RECORTA en vez de
 * rechazarse para que la pantalla siga contestando algo, y los inputs del
 * selector muestran las fechas recortadas, asi que el ajuste se ve.
 */
export const RANGO_MAX_DIAS = 1830

/**
 * El rango de un periodo con nombre, en la zona del negocio.
 *
 * Los periodos "a la fecha" (este mes, trimestre, YTD, 12m, 24m) terminan HOY
 * y no al final del mes: es lo que uno espera de un tablero, y un rango que se
 * extiende al futuro mete buckets vacios a la derecha de la grafica.
 *
 * 'mes_anterior' si es el mes completo, porque ya cerro.
 */
export function rangoDePeriodo(clave: ClavePeriodo, ahora: Date = new Date()): Rango {
  const hoy = fechaMx(ahora)
  switch (clave) {
    case 'mes':
      return { desde: inicioMes(hoy), hasta: hoy }
    case 'mes_anterior': {
      const primero = sumarMeses(inicioMes(hoy), -1)
      return { desde: primero, hasta: finMes(primero) }
    }
    case 'trimestre': {
      // Trimestre CALENDARIO en curso: ene-mar, abr-jun, jul-sep, oct-dic.
      const mes = Number(hoy.slice(5, 7))
      const primero = mes - ((mes - 1) % 3)
      return { desde: `${hoy.slice(0, 4)}-${String(primero).padStart(2, '0')}-01`, hasta: hoy }
    }
    case 'ytd':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }
    case '12m':
      return { desde: sumarMeses(inicioMes(hoy), -11), hasta: hoy }
    case '24m':
      return { desde: sumarMeses(inicioMes(hoy), -23), hasta: hoy }
    case 'personalizado':
      // Sin fechas explicitas no hay rango propio; `resolverPeriodo` es quien
      // decide cuando esta clave aplica. Esto es solo el fallback.
      return rangoDePeriodo(PERIODO_DEFAULT, ahora)
  }
}

/** Dias que abarca un rango, contando los dos extremos. */
export const diasDeRango = (r: Rango): number => diasEntre(r.desde, r.hasta) + 1

/**
 * Normaliza un rango pedido a mano: ordena los extremos si vienen al reves y
 * recorta `desde` si el rango pasa de RANGO_MAX_DIAS.
 */
export function normalizarRango(desde: string, hasta: string): Rango {
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde]
  if (diasEntre(a, b) + 1 <= RANGO_MAX_DIAS) return { desde: a, hasta: b }
  return { desde: sumarDias(b, -(RANGO_MAX_DIAS - 1)), hasta: b }
}

/**
 * El periodo que pide la URL.
 *
 * Un `desde`/`hasta` valido manda sobre `periodo`: si los dos vienen, el
 * rango es explicito y la clave es 'personalizado'. Cualquier basura cae en el
 * default en vez de reventar — es una URL, la escribe quien sea.
 */
export function resolverPeriodo(
  params: { periodo?: string | string[]; desde?: string | string[]; hasta?: string | string[] },
  ahora: Date = new Date()
): { clave: ClavePeriodo; rango: Rango } {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const desde = uno(params.desde)
  const hasta = uno(params.hasta)

  if (esFechaDB(desde) && esFechaDB(hasta)) {
    return { clave: 'personalizado', rango: normalizarRango(desde, hasta) }
  }

  const pedido = uno(params.periodo)
  const clave = esClavePeriodo(pedido) && pedido !== 'personalizado' ? pedido : PERIODO_DEFAULT
  return { clave, rango: rangoDePeriodo(clave, ahora) }
}

/**
 * El periodo anterior de la MISMA DURACION, pegado al que se mira.
 *
 * Se corre por dias y no por meses a proposito: "la misma duracion" es lo que
 * hace comparable la variacion de cualquier rango, incluido uno personalizado
 * de 10 dias. El efecto lateral conocido: para 'mes_anterior' (octubre, 31
 * dias) la base no es septiembre completo sino los 31 dias previos al 1 de
 * octubre, o sea del 31 de agosto al 30 de septiembre. Comparar 31 dias contra
 * 30 seria peor.
 */
export function rangoAnterior(r: Rango): Rango {
  const n = diasDeRango(r)
  return { desde: sumarDias(r.desde, -n), hasta: sumarDias(r.desde, -1) }
}

/**
 * El mismo periodo un anio antes, por fecha de calendario.
 *
 * Por calendario y no "menos 365 dias": lo que se compara contra noviembre es
 * noviembre, no una ventana corrida que empieza a media semana. El 29 de
 * febrero lo recorta `sumarMeses`.
 */
export function rangoAnoAnterior(r: Rango): Rango {
  return { desde: sumarMeses(r.desde, -12), hasta: sumarMeses(r.hasta, -12) }
}

// ── Granularidad y buckets ──────────────────────────────────

export type Granularidad = 'dia' | 'semana' | 'mes'

export const GRANULARIDADES: { clave: Granularidad; label: string }[] = [
  { clave: 'dia', label: 'Día' },
  { clave: 'semana', label: 'Semana' },
  { clave: 'mes', label: 'Mes' },
]

/** Cuantas barras caben antes de que la grafica deje de leerse. */
export const MAX_BUCKETS = 120

/**
 * La granularidad que le toca a un rango por su largo.
 *
 * Los cortes son 31 y 120 dias: hasta un mes se lee dia por dia, hasta cuatro
 * meses por semana (17 barras), y de ahi en adelante por mes.
 */
export function granularidadAuto(r: Rango): Granularidad {
  const dias = diasDeRango(r)
  if (dias <= 31) return 'dia'
  if (dias <= 120) return 'semana'
  return 'mes'
}

/** Cuantos buckets daria un rango con esa granularidad, sin construirlos. */
export function contarBuckets(r: Rango, gran: Granularidad): number {
  if (gran === 'dia') return diasDeRango(r)
  if (gran === 'semana') return Math.floor(diasEntre(inicioSemana(r.desde), r.hasta) / 7) + 1
  const [a1, m1] = r.desde.split('-').map(Number)
  const [a2, m2] = r.hasta.split('-').map(Number)
  return (a2 - a1) * 12 + (m2 - m1) + 1
}

/**
 * Las granularidades que se pueden ofrecer para un rango: las que no pasan de
 * MAX_BUCKETS. Siempre devuelve al menos una, para que el override tenga algo
 * que elegir aunque el rango sea enorme.
 */
export function granularidadesPosibles(r: Rango): Granularidad[] {
  const cabe = GRANULARIDADES.map(g => g.clave).filter(g => contarBuckets(r, g) <= MAX_BUCKETS)
  return cabe.length ? cabe : ['mes']
}

/** La granularidad que se usa: el override si cabe en el rango, si no la automatica. */
export function granularidadEfectiva(r: Rango, override?: Granularidad | null): Granularidad {
  if (override && granularidadesPosibles(r).includes(override)) return override
  const auto = granularidadAuto(r)
  return granularidadesPosibles(r).includes(auto) ? auto : 'mes'
}

/** Un tramo del eje X. `clave` es su `desde`, que ya es unico. */
export type Bucket = {
  clave: string
  /** Corta, para el eje: "5 nov", "nov 26". */
  etiqueta: string
  /** Completa, para el tooltip: "5 nov 2026", "5 nov – 11 nov 2026". */
  rotulo: string
  desde: string
  hasta: string
  gran: Granularidad
}

/** Hasta donde llega el bucket que arranca en `desde`, sin recortar al rango. */
const finDeBucket = (desde: string, gran: Granularidad): string =>
  gran === 'dia' ? desde
  : gran === 'semana' ? sumarDias(inicioSemana(desde), 6)
  : finMes(desde)

function armarBucket(desde: string, hasta: string, gran: Granularidad): Bucket {
  const etiqueta = gran === 'mes' ? etiquetaMesCorto(desde) : etiquetaDiaCorto(desde)
  const rotulo =
    gran === 'dia' ? etiquetaFecha(desde)
    : gran === 'semana' ? `${etiquetaDiaCorto(desde)} – ${etiquetaFecha(hasta)}`
    : etiquetaMesLargo(desde)
  return { clave: desde, etiqueta, rotulo, desde, hasta, gran }
}

/**
 * Los tramos del eje X, contiguos y cubriendo el rango completo.
 *
 * El primero y el ultimo se RECORTAN al rango: un periodo que empieza un
 * miercoles tiene una primera semana de cinco dias. Recortar y no desbordar es
 * lo que hace que la suma de los buckets sea exactamente el total del periodo
 * — si el primer bucket se extendiera hacia atras, la grafica mostraria dinero
 * que el KPI no cuenta.
 *
 * Los buckets vacios NO se omiten: salen en cero, que es justo lo que hay que
 * ver en un mes sin ventas.
 */
export function bucketsDe(r: Rango, gran: Granularidad): Bucket[] {
  const salida: Bucket[] = []
  let cursor = r.desde
  while (cursor <= r.hasta) {
    const fin = finDeBucket(cursor, gran)
    const hasta = fin < r.hasta ? fin : r.hasta
    salida.push(armarBucket(cursor, hasta, gran))
    cursor = sumarDias(hasta, 1)
  }
  return salida
}

/**
 * El mismo bucket un anio antes. Uno a uno contra el actual, para que la linea
 * de comparacion no se desalinee cuando los dos anios no parten los meses en
 * la misma cantidad de semanas.
 */
export const bucketAnoAnterior = (b: Bucket): Bucket =>
  armarBucket(sumarMeses(b.desde, -12), sumarMeses(b.hasta, -12), b.gran)

// ── Filtrado por rango ──────────────────────────────────────

export const enRango = (fecha: string, r: Rango): boolean => fecha >= r.desde && fecha <= r.hasta

/** Pedidos cuya FECHA DE PEDIDO cae en el rango. */
export const filasEnRango = (filas: FilaSaldo[], r: Rango): FilaSaldo[] =>
  filas.filter(f => enRango(f.fecha_pedido, r))

/**
 * Un pago, para medir Cobrado por FECHA DE PAGO.
 *
 * `pedidos_saldo.pagado` no sirve para esto: es la suma de los pagos de un
 * pedido, sin fecha, asi que agrupando por la vista el dinero queda en el mes
 * del PEDIDO. Un pedido de agosto cobrado en noviembre aparece como cobro de
 * agosto. Para la pregunta "cuanto entro este mes" hace falta `pagos`.
 */
export type PagoFila = {
  monto: number | null
  /** 'YYYY-MM-DD'. Es `date` en produccion, no timestamptz. */
  fecha_pago: string
}

export const pagosEnRango = (pagos: PagoFila[], r: Rango): PagoFila[] =>
  pagos.filter(p => enRango(p.fecha_pago, r))

/** Lo que REALMENTE entro en el rango, por fecha de pago. */
export const cobradoEnRango = (pagos: PagoFila[], r: Rango): number =>
  pagosEnRango(pagos, r).reduce((s, p) => s + (p.monto || 0), 0)

// ── Litros vendidos ─────────────────────────────────────────

/** Supabase tipa un to-one anidado como arreglo segun la version. */
export type ProductoRef = { nombre?: string | null } | { nombre?: string | null }[] | null

export type PartidaPedido = {
  cantidad: number | null
  unidad: string | null
  productos?: ProductoRef
}

/** Un pedido con sus partidas. `fecha_pedido` es la que lo ubica en el periodo. */
export type PedidoConItems = {
  id: string
  fecha_pedido: string
  pedido_items?: PartidaPedido[] | null
}

const nombreProducto = (ref: ProductoRef): string => {
  const p = Array.isArray(ref) ? ref[0] : ref
  return p?.nombre || 'Sin producto'
}

/** Las partidas de los pedidos del rango, listas para `topProductosEnLitros`. */
export function itemsVendidosEn(pedidos: PedidoConItems[], r: Rango): ItemVendido[] {
  return pedidos
    .filter(p => enRango(p.fecha_pedido, r))
    .flatMap(p =>
      (p.pedido_items || []).map(it => ({
        unidad: it.unidad,
        cantidad: it.cantidad,
        nombre: nombreProducto(it.productos ?? null),
      }))
    )
}

/**
 * Litros de un conjunto de partidas. Las de unidad desconocida se OMITEN, no
 * se asumen: `litrosDeItem` devuelve null ahi, y rellenarlo inventaria volumen
 * que no se vendio. Quien quiera reportar el hueco usa `topProductosEnLitros`,
 * que si cuenta las partidas sin unidad.
 */
export const litrosDeItems = (items: ItemVendido[]): number =>
  items.reduce((s, it) => s + (litrosDeItem(it.unidad, it.cantidad) || 0), 0)

// ── Resumen del periodo (los KPIs) ──────────────────────────

/** Lo que necesita cualquier agregacion por periodo. Nada mas. */
export type DatosPeriodo = {
  saldos: FilaSaldo[]
  pagos: PagoFila[]
  pedidos: PedidoConItems[]
}

export type ResumenPeriodo = {
  /** Neto facturado de los pedidos del periodo (fecha de pedido). */
  facturado: number
  /** Lo que entro en el periodo (fecha de pago). NO es parte de `facturado`. */
  cobrado: number
  /**
   * Que fraccion de lo facturado EN EL PERIODO ya se cobro.
   *
   * Es la cohorte del pedido, no el cociente de los dos KPIs de arriba:
   * Cobrado va por fecha de pago y puede traer dinero de pedidos viejos, asi
   * que cobrado/facturado podria pasar del 100% y no significaria nada.
   * null si el periodo no facturo.
   */
  pctCobrado: number | null
  pedidos: number
  litros: number
  /** facturado / pedidos. null si no hubo pedidos. */
  ticket: number | null
  /** Clientes distintos con al menos un pedido en el periodo. */
  clientes: number
}

const clientesDistintos = (filas: FilaSaldo[]): number =>
  new Set(filas.map(f => f.cliente_id).filter(Boolean) as string[]).size

export function resumenDePeriodo(datos: DatosPeriodo, r: Rango): ResumenPeriodo {
  const filas = filasEnRango(datos.saldos, r)
  const facturado = netoTotal(filas)
  return {
    facturado,
    cobrado: cobradoEnRango(datos.pagos, r),
    pctCobrado: facturado > 0 ? (cobradoDe(filas) / facturado) * 100 : null,
    pedidos: filas.length,
    litros: litrosDeItems(itemsVendidosEn(datos.pedidos, r)),
    ticket: filas.length > 0 ? facturado / filas.length : null,
    clientes: clientesDistintos(filas),
  }
}

// ── Serie por bucket (la grafica y los sparklines) ──────────

export type PuntoSerie = Bucket & {
  /** Neto facturado de los pedidos del bucket. */
  facturado: number
  /**
   * De ese facturado, lo que ya entro — por cohorte del PEDIDO, no por fecha
   * de pago. Es la mitad de abajo de la barra apilada.
   */
  cobradoCohorte: number
  /** facturado - cobradoCohorte. Nunca negativo: un sobrepago no resta. */
  pendiente: number
  /** Cobrado por FECHA DE PAGO: el dinero que entro dentro del bucket. */
  cobrado: number
  litros: number
  pedidos: number
  clientes: number
  /** facturado / pedidos. 0 si no hubo pedidos (para el sparkline). */
  ticket: number
  /** cobradoCohorte / facturado, o null si el bucket no facturo. */
  pct: number | null
}

/**
 * Ubica una fecha en los buckets. -1 si cae fuera.
 *
 * Busqueda binaria sobre `desde`, que esta ordenado por construccion: con
 * granularidad diaria y 24 meses esto se llama una vez por fila y por bucket,
 * y recorrer la lista completa cada vez es gratis hasta que deja de serlo.
 */
function indiceBucket(buckets: Bucket[], fecha: string): number {
  let lo = 0
  let hi = buckets.length - 1
  let res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (buckets[mid].desde <= fecha) {
      res = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (res < 0 || fecha > buckets[res].hasta) return -1
  return res
}

/**
 * La serie completa de un juego de buckets.
 *
 * Un solo recorrido por cada fuente, repartiendo a su bucket: asi la grafica
 * no vuelve a filtrar las filas una vez por barra. Los buckets sin nada se
 * quedan en cero.
 */
export function serieDePeriodo(datos: DatosPeriodo, buckets: Bucket[]): PuntoSerie[] {
  const puntos: PuntoSerie[] = buckets.map(b => ({
    ...b,
    facturado: 0, cobradoCohorte: 0, pendiente: 0, cobrado: 0,
    litros: 0, pedidos: 0, clientes: 0, ticket: 0, pct: null,
  }))
  const clientesPorBucket = buckets.map(() => new Set<string>())

  for (const f of datos.saldos) {
    const i = indiceBucket(buckets, f.fecha_pedido)
    if (i < 0) continue
    puntos[i].facturado += netoDe(f)
    puntos[i].cobradoCohorte += f.pagado || 0
    puntos[i].pedidos += 1
    if (f.cliente_id) clientesPorBucket[i].add(f.cliente_id)
  }

  for (const p of datos.pagos) {
    const i = indiceBucket(buckets, p.fecha_pago)
    if (i < 0) continue
    puntos[i].cobrado += p.monto || 0
  }

  for (const ped of datos.pedidos) {
    const i = indiceBucket(buckets, ped.fecha_pedido)
    if (i < 0) continue
    for (const it of ped.pedido_items || []) {
      puntos[i].litros += litrosDeItem(it.unidad, it.cantidad) || 0
    }
  }

  return puntos.map((p, i) => ({
    ...p,
    clientes: clientesPorBucket[i].size,
    pendiente: Math.max(0, p.facturado - p.cobradoCohorte),
    ticket: p.pedidos > 0 ? p.facturado / p.pedidos : 0,
    pct: p.facturado > 0 ? (p.cobradoCohorte / p.facturado) * 100 : null,
  }))
}

// ── Metricas de la grafica ──────────────────────────────────

export type Metrica = 'facturado' | 'cobrado' | 'litros' | 'pedidos'

export const METRICAS: { clave: Metrica; label: string }[] = [
  { clave: 'facturado', label: 'Facturado' },
  { clave: 'cobrado', label: 'Cobrado' },
  { clave: 'litros', label: 'Litros' },
  { clave: 'pedidos', label: 'Pedidos' },
]

export const valorDe = (p: PuntoSerie, m: Metrica): number => p[m]

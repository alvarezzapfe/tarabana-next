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
 * OJO con `total`: es el importe BRUTO, antes de descuento, de envio y de
 * IVA. La vista viva calcula saldo = total - descuento + costo_envio + IVA -
 * pagado (ver docs/SCHEMA_NOTES.md), asi que el importe realmente facturado
 * de un pedido es pagado + saldo, no total. Usar `total` para montos
 * sobreestima lo facturado por el descuento y no cuadra con Cobrado ni con
 * Por cobrar.
 *
 * ── Las dos unidades de este archivo ───────────────────────
 *
 * Desde que existe el switch de IVA hay DOS monedas y mezclarlas es el error
 * facil, porque las dos se llaman "pesos":
 *
 *   VENTA, sin IVA (`ventaDe`, `ventaTotal`). Es la base analitica: Inicio,
 *   reporte, tops, ticket promedio, crecimiento. Un pedido con IVA y uno sin
 *   IVA por la misma mercancia tienen que pesar lo mismo en la grafica; si no,
 *   prender el switch se veria como un 16% de crecimiento que nadie vendio.
 *
 *   COBRANZA, con IVA (`netoDe`, `cobradoDe`, `porCobrarDe`, `vencidoDe`,
 *   `antiguedadCartera`). Es lo que el cliente DEBE, y el cliente debe el IVA.
 *   Quitarlo aqui haria que un pedido pagado completo quedara con saldo.
 *
 * Cuando un numero divide uno entre otro —el % cobrado de una cohorte— los
 * dos lados se expresan en la misma unidad; ver `cobradoSinIvaDe`.
 */

import {
  diasEntre, esFechaDB, etiquetaDiaCorto, etiquetaFecha, etiquetaMesCorto, etiquetaMesLargo,
  fechaMx, finMes, inicioMes, inicioSemana, periodoDeFechaDB, periodoMx, sumarDias, sumarMeses,
} from './fechas.ts'
import { esUnidadVenta, litrosDeItem, type ItemVendido } from './unidades.ts'

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
  /**
   * IVA facturado del pedido. 0 en los que no lo llevan, que hoy son todos
   * salvo los que alguien marque.
   *
   * Es obligatoria a proposito aunque casi siempre valga 0: si fuera opcional,
   * una consulta que se olvidara de pedirla reportaria la venta CON IVA sin
   * que nada fallara, y el numero se veria perfectamente normal.
   */
  iva_monto: number | null
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
  /**
   * Fecha de vencimiento del pedido, 'YYYY-MM-DD'. Es `date` en produccion,
   * aunque el archivo de migracion la declare timestamptz.
   *
   * Opcional porque hay consultas que no la piden; `dias_vencido` ya viene
   * calculada por la vista y es la que decide el atraso. Esta columna es para
   * MOSTRARLA en el reporte de cobranza, no para recalcular nada.
   */
  fecha_vencimiento?: string | null
}

/** El saldo puede venir negativo si hubo sobrepago; no resta de lo por cobrar. */
const saldoPositivo = (f: FilaSaldo) => Math.max(0, f.saldo || 0)

/**
 * Importe facturado de un pedido CON IVA: lo ya cobrado mas lo que falta.
 * Es `total_con_envio`, y la unica base consistente con Cobrado y Por cobrar.
 */
export const netoDe = (f: FilaSaldo) => (f.pagado || 0) + (f.saldo || 0)

export function netoTotal(filas: FilaSaldo[]): number {
  return filas.reduce((s, f) => s + netoDe(f), 0)
}

/** El IVA facturado del pedido. 0 en los que no lo llevan. */
export const ivaDeFila = (f: FilaSaldo) => f.iva_monto || 0

export function ivaTotal(filas: FilaSaldo[]): number {
  return filas.reduce((s, f) => s + ivaDeFila(f), 0)
}

/**
 * La VENTA del pedido: lo facturado sin IVA. La base de todo lo analitico.
 *
 * El IVA no es ingreso de la cervecera, es dinero que se cobra para
 * enterarlo. Contarlo como venta inflaria el ticket promedio, el top de
 * clientes y el crecimiento de un mes contra otro segun cuantos pedidos se
 * facturaron con IVA, que no dice nada del negocio.
 */
export const ventaDe = (f: FilaSaldo) => netoDe(f) - ivaDeFila(f)

export function ventaTotal(filas: FilaSaldo[]): number {
  return filas.reduce((s, f) => s + ventaDe(f), 0)
}

/**
 * Lo cobrado de un pedido, expresado SIN IVA.
 *
 * Sirve para una sola cosa: dividir cobrado entre venta sin mezclar unidades.
 * Si el numerador trajera IVA y el denominador no, un pedido con IVA pagado
 * completo daria 116% cobrado.
 *
 * El reparto es proporcional —de cada peso que entra, la parte que
 * corresponde a la mercancia— que es el mismo criterio con el que
 * ./comisiones prorratea un pago parcial.
 */
export function cobradoSinIvaDe(f: FilaSaldo): number {
  const pagado = f.pagado || 0
  const neto = netoDe(f)
  if (pagado === 0 || neto <= 0) return pagado
  // A centavos: 580 * (1000 / 1160) da 499.99999999999994 en float, y ese
  // numero se suma y se imprime como dinero.
  return Math.round(pagado * (ventaDe(f) / neto) * 100) / 100
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
 * Serie de VENTA por mes, con los meses vacios en cero.
 * Neta y sin IVA: ver las dos unidades al inicio del archivo.
 */
export function serieFacturada(filas: FilaSaldo[], n = 12, ahora = new Date()) {
  const mapa = porMes(filas)
  return ultimosMeses(n, ahora).map(m => ({
    mes: m.etiqueta,
    total: ventaTotal(mapa.get(m.clave) || []),
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

/**
 * Top clientes por VENTA (sin IVA), con su saldo y su peso en el total.
 *
 * `facturado` va sin IVA y `saldo` con IVA a proposito: la primera columna
 * ordena por quien compra mas y la segunda dice cuanto debe. Son las dos
 * preguntas distintas de la misma tabla.
 */
export function topClientes(filas: FilaSaldo[], clientes: DatosCliente[], limite = 8): FilaCliente[] {
  const datos = new Map(clientes.map(c => [c.id, c]))
  const acum = new Map<string, { facturado: number; saldo: number }>()

  for (const f of filas) {
    if (!f.cliente_id) continue
    const a = acum.get(f.cliente_id) || { facturado: 0, saldo: 0 }
    a.facturado += ventaDe(f)
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
 * La query del periodo: el inverso de `resolverPeriodo`.
 *
 * Existe para que el selector del Inicio, el link al reporte y la ruta del
 * export escriban la MISMA URL. Cuando cada uno la armaba por su cuenta, basto
 * con que uno omitiera el default para que el link al reporte abriera un
 * periodo distinto al que se estaba viendo.
 *
 * El periodo default no se escribe: asi /admin a secas sigue siendo la
 * direccion limpia del tablero.
 */
export function queryPeriodo(clave: ClavePeriodo, rango: Rango): string {
  if (clave === 'personalizado') {
    return new URLSearchParams({ desde: rango.desde, hasta: rango.hasta }).toString()
  }
  if (clave === PERIODO_DEFAULT) return ''
  return new URLSearchParams({ periodo: clave }).toString()
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
export type DatosProducto = { id?: string | null; nombre?: string | null; estilo?: string | null }
export type ProductoRef = DatosProducto | DatosProducto[] | null

/** El desglose de latas por estilo de una caja mixta, en `metadata.estilos`. */
export type MixEstilo = { producto_id?: string | null; nombre?: string | null; latas?: number | null }

export type PartidaPedido = {
  cantidad: number | null
  unidad: string | null
  productos?: ProductoRef
  /**
   * Precio de UNA unidad de la presentacion. Bruto: el descuento y el envio
   * viven a nivel de pedido, no de partida (ver `partidasValuadas`).
   */
  precio_unitario?: number | null
  /** `{ tipo: 'mix24', estilos: [...] }` en las cajas mixtas. */
  metadata?: { estilos?: MixEstilo[] | null } | null
}

/** Un pedido con sus partidas. `fecha_pedido` es la que lo ubica en el periodo. */
export type PedidoConItems = {
  id: string
  fecha_pedido: string
  pedido_items?: PartidaPedido[] | null
}

const unProducto = (ref: ProductoRef): DatosProducto | null =>
  (Array.isArray(ref) ? ref[0] : ref) ?? null

const nombreProducto = (ref: ProductoRef): string => unProducto(ref)?.nombre || 'Sin producto'

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
  /** VENTA del periodo (fecha de pedido): neto de descuento y SIN IVA. */
  facturado: number
  /**
   * IVA facturado en el periodo. Renglon aparte, no parte de `facturado`.
   * 0 mientras nadie prenda el switch.
   */
  iva: number
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
  const facturado = ventaTotal(filas)
  // Los dos lados del cociente van sin IVA. `cobrado` de aqui arriba no:
  // ese es dinero que entro y entro con IVA.
  const cobradoCohorte = filas.reduce((t, f) => t + cobradoSinIvaDe(f), 0)
  return {
    facturado,
    iva: ivaTotal(filas),
    cobrado: cobradoEnRango(datos.pagos, r),
    pctCobrado: facturado > 0 ? (cobradoCohorte / facturado) * 100 : null,
    pedidos: filas.length,
    litros: litrosDeItems(itemsVendidosEn(datos.pedidos, r)),
    ticket: filas.length > 0 ? facturado / filas.length : null,
    clientes: clientesDistintos(filas),
  }
}

// ── Serie por bucket (la grafica y los sparklines) ──────────

export type PuntoSerie = Bucket & {
  /** VENTA de los pedidos del bucket, sin IVA. */
  facturado: number
  /** IVA de esos pedidos. Aparte, no sumado a `facturado`. */
  iva: number
  /**
   * De esa venta, lo que ya entro — por cohorte del PEDIDO, no por fecha de
   * pago, y prorrateado sin IVA para que divida contra `facturado`. Es la
   * mitad de abajo de la barra apilada.
   */
  cobradoCohorte: number
  /** facturado - cobradoCohorte. Nunca negativo: un sobrepago no resta. */
  pendiente: number
  /**
   * Cobrado por FECHA DE PAGO: el dinero que entro dentro del bucket. CON
   * IVA, porque es caja: es lo que llego al banco.
   */
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
    facturado: 0, iva: 0, cobradoCohorte: 0, pendiente: 0, cobrado: 0,
    litros: 0, pedidos: 0, clientes: 0, ticket: 0, pct: null,
  }))
  const clientesPorBucket = buckets.map(() => new Set<string>())

  for (const f of datos.saldos) {
    const i = indiceBucket(buckets, f.fecha_pedido)
    if (i < 0) continue
    puntos[i].facturado += ventaDe(f)
    // Prorrateado sin IVA para que `pct` y `pendiente` no dividan peras
    // entre manzanas: el facturado de arriba ya no trae IVA.
    puntos[i].cobradoCohorte += cobradoSinIvaDe(f)
    puntos[i].iva += ivaDeFila(f)
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

// ── Reporte: el importe neto de cada partida ────────────────

/**
 * Las partidas del periodo, con su importe NETO.
 *
 * El problema: el importe de una partida es `cantidad * precio_unitario`, que
 * es BRUTO — el descuento y el envio viven a nivel de PEDIDO, no de partida.
 * Si el reporte sumara eso, la seccion de presentaciones no cuadraria con el
 * Facturado del resumen, y quien compare las dos secciones encontraria una
 * diferencia sin explicacion.
 *
 * La solucion: repartir el neto del pedido (`pagado + saldo`) entre sus
 * partidas en proporcion a su bruto. Verificado contra produccion el
 * 2026-11-09: `suma(cantidad * precio_unitario)` coincide con `pedidos.total`
 * en 15/15 pedidos, asi que el bruto de las partidas es una base de reparto
 * exacta y no una aproximacion.
 *
 * Un pedido con bruto 0 no se puede repartir: sus partidas quedan en cero y su
 * neto se devuelve aparte en `sinReparto`, para que el reporte pueda decir que
 * hay dinero que no se pudo clasificar en vez de esconderlo.
 */
export type PartidaValuada = {
  pedido_id: string
  /** Del renglon de `pedidos_saldo`, que es donde `cliente_id` siempre viene. */
  cliente_id: string | null
  fecha_pedido: string
  unidad: string | null
  cantidad: number
  /** null si la unidad es desconocida: no se asume volumen. */
  litros: number | null
  /** Importe neto ya repartido. */
  importe: number
  producto: string
  producto_id: string | null
  estilo: string | null
  /** Desglose de latas por estilo si la partida es una caja mixta. */
  mix: MixEstilo[] | null
}

export function partidasValuadas(
  datos: DatosPeriodo,
  r: Rango
): { partidas: PartidaValuada[]; sinReparto: number } {
  // Sin IVA: estas partidas alimentan las secciones de presentacion y estilo
  // del reporte, que tienen que sumar lo mismo que el Facturado del resumen.
  const netoPorPedido = new Map(datos.saldos.map(f => [f.id, ventaDe(f)]))
  const clientePorPedido = new Map(datos.saldos.map(f => [f.id, f.cliente_id]))

  const partidas: PartidaValuada[] = []
  let sinReparto = 0

  for (const ped of datos.pedidos) {
    if (!enRango(ped.fecha_pedido, r)) continue

    const items = ped.pedido_items || []
    const bruto = items.reduce((s, it) => s + (it.cantidad || 0) * (it.precio_unitario || 0), 0)
    const neto = netoPorPedido.get(ped.id) ?? 0
    if (bruto <= 0 && neto !== 0) sinReparto += neto

    for (const it of items) {
      const prod = unProducto(it.productos ?? null)
      const brutoItem = (it.cantidad || 0) * (it.precio_unitario || 0)
      const mix = it.metadata?.estilos
      partidas.push({
        pedido_id: ped.id,
        cliente_id: clientePorPedido.get(ped.id) ?? null,
        fecha_pedido: ped.fecha_pedido,
        unidad: it.unidad,
        cantidad: it.cantidad || 0,
        litros: litrosDeItem(it.unidad, it.cantidad),
        importe: bruto > 0 ? neto * (brutoItem / bruto) : 0,
        producto: prod?.nombre || 'Sin producto',
        producto_id: prod?.id ?? null,
        estilo: prod?.estilo ?? null,
        mix: mix && mix.length ? mix : null,
      })
    }
  }

  return { partidas, sinReparto }
}

// ── Reporte: ventas por presentacion ────────────────────────

/**
 * Las presentaciones del reporte, en el orden en que se leen.
 *
 * `mix24` sale como su propio renglon y no sumada a `caja24`: es el mismo
 * volumen, pero en produccion son 8 de 29 partidas y meterlas en caja 24
 * esconderia a que se le vende de verdad. Los barriles de 10 L estan en la
 * lista aunque hoy no se vendan; `ventasPorPresentacion` decide cuales pinta.
 */
export const PRESENTACIONES: { unidad: string; label: string; siempre: boolean }[] = [
  { unidad: 'lata', label: 'Lata', siempre: true },
  { unidad: 'caja12', label: 'Caja 12', siempre: true },
  { unidad: 'caja24', label: 'Caja 24', siempre: true },
  { unidad: 'mix24', label: 'Caja 24 mixta', siempre: false },
  { unidad: 'barril_pet', label: 'Barril PET 20 L', siempre: true },
  { unidad: 'barril_acero', label: 'Barril acero 20 L', siempre: true },
  { unidad: 'barril10_pet', label: 'Barril PET 10 L', siempre: false },
  { unidad: 'barril10_acero', label: 'Barril acero 10 L', siempre: false },
]

/** Clave del renglon que agrupa las partidas sin presentacion registrada. */
export const SIN_PRESENTACION = 'sin_presentacion'

export type FilaPresentacion = {
  unidad: string
  label: string
  unidades: number
  litros: number
  importe: number
  /** % del importe total del periodo. */
  pct: number
}

/**
 * Unidades, litros, importe y peso de cada presentacion.
 *
 * Las presentaciones de siempre salen aunque esten en cero: un cero dice
 * "este mes no se vendio ni un barril", que es informacion. Las opcionales
 * solo si hubo, para no llenar la tabla de renglones vacios.
 *
 * Las partidas sin presentacion registrada van a su propio renglon al final:
 * tienen importe pero no litros, y mezclarlas con las demas haria que la
 * columna de litros no cuadre con el total sin que se vea por que.
 */
export function ventasPorPresentacion(partidas: PartidaValuada[]): FilaPresentacion[] {
  const acum = new Map<string, { unidades: number; litros: number; importe: number }>()
  for (const p of partidas) {
    const clave = esUnidadVenta(p.unidad) ? p.unidad : SIN_PRESENTACION
    const a = acum.get(clave) || { unidades: 0, litros: 0, importe: 0 }
    a.unidades += p.cantidad
    a.litros += p.litros || 0
    a.importe += p.importe
    acum.set(clave, a)
  }

  const total = [...acum.values()].reduce((s, a) => s + a.importe, 0)
  const fila = (unidad: string, label: string) => {
    const a = acum.get(unidad) || { unidades: 0, litros: 0, importe: 0 }
    return { unidad, label, ...a, pct: total > 0 ? (a.importe / total) * 100 : 0 }
  }

  const filas = PRESENTACIONES
    .filter(p => p.siempre || acum.has(p.unidad))
    .map(p => fila(p.unidad, p.label))

  if (acum.has(SIN_PRESENTACION)) filas.push(fila(SIN_PRESENTACION, 'Sin presentación'))
  return filas
}

// ── Reporte: ventas por estilo ──────────────────────────────

export type FilaEstilo = {
  estilo: string
  litros: number
  importe: number
  /** % del importe total del periodo. */
  pct: number
}

export const SIN_ESTILO = 'Sin estilo'

/**
 * Litros e importe por estilo de cerveza.
 *
 * Las cajas MIXTAS se desglosan por su `metadata.estilos`, repartiendo litros
 * e importe en proporcion a las latas de cada estilo. Sin eso, una caja mixta
 * entera se le atribuiria al producto de la partida (que es solo el primero de
 * la mezcla) y el reporte diria que se vendio cuatro veces mas de ese estilo
 * del que salio de la bodega. En produccion son 8 de 29 partidas, asi que no
 * es un caso de borde.
 *
 * El estilo de cada componente se resuelve por `producto_id` contra el
 * catalogo, no por el `nombre` que trae la metadata: ese nombre es el del
 * PRODUCTO ("Chula Vista"), no el del estilo, y meterlo en esta columna
 * mezclaria dos vocabularios en la misma tabla.
 */
export function ventasPorEstilo(
  partidas: PartidaValuada[],
  estiloDeProducto: Map<string, string | null>
): FilaEstilo[] {
  const acum = new Map<string, { litros: number; importe: number }>()
  const sumar = (estilo: string, litros: number, importe: number) => {
    const a = acum.get(estilo) || { litros: 0, importe: 0 }
    a.litros += litros
    a.importe += importe
    acum.set(estilo, a)
  }

  for (const p of partidas) {
    const totalLatas = (p.mix || []).reduce((s, e) => s + (e.latas || 0), 0)

    // Una mezcla sin latas por estilo no se puede repartir; cae al estilo del
    // producto de la partida, que es lo unico que se sabe de ella.
    if (p.mix && totalLatas > 0) {
      for (const e of p.mix) {
        const parte = (e.latas || 0) / totalLatas
        const estilo = (e.producto_id && estiloDeProducto.get(e.producto_id)) || SIN_ESTILO
        sumar(estilo, (p.litros || 0) * parte, p.importe * parte)
      }
      continue
    }

    sumar(p.estilo || SIN_ESTILO, p.litros || 0, p.importe)
  }

  const total = [...acum.values()].reduce((s, a) => s + a.importe, 0)
  return [...acum.entries()]
    .map(([estilo, a]) => ({ estilo, ...a, pct: total > 0 ? (a.importe / total) * 100 : 0 }))
    .sort((a, b) => b.litros - a.litros || b.importe - a.importe)
}

// ── Reporte: ventas por cliente ─────────────────────────────

export type ClaveCobranza = 'pagado' | 'corriente' | 'parcial' | 'vencido'

export type EstadoCobranza = {
  clave: ClaveCobranza
  /** Dias del atraso mas viejo. 0 si no hay nada vencido. */
  dias: number
}

/**
 * En que esta la cobranza de un conjunto de pedidos.
 *
 * El atraso se mide con `dias_vencido`, NO con `estado_cobro`: la vista viva
 * evalua la rama 'parcial' antes que 'vencido' (ver docs/SCHEMA_NOTES.md), asi
 * que un pedido atrasado con un abono sale 'parcial' y no se contaria como
 * vencido. Es el mismo criterio que `vencidoDe`, para que las dos secciones
 * del reporte no se contradigan.
 *
 * El orden importa: vencido gana a parcial. Quien lee la tabla quiere ver
 * primero que hay un atraso, y que ademas haya un abono no lo arregla.
 */
export function estadoCobranzaDe(filas: FilaSaldo[]): EstadoCobranza {
  const conSaldo = filas.filter(f => saldoPositivo(f) > 0)
  if (conSaldo.length === 0) return { clave: 'pagado', dias: 0 }

  const dias = Math.max(0, ...conSaldo.map(f => f.dias_vencido || 0))
  if (dias > 0) return { clave: 'vencido', dias }
  if (cobradoDe(filas) > 0) return { clave: 'parcial', dias: 0 }
  return { clave: 'corriente', dias: 0 }
}

export type FilaVentasCliente = {
  cliente_id: string | null
  nombre: string
  pedidos: number
  litros: number
  facturado: number
  /** Lo cobrado DE ESOS PEDIDOS (cohorte), no los pagos del periodo. */
  cobrado: number
  saldo: number
  estado: EstadoCobranza
}

/**
 * Ventas del periodo por cliente, de mas a menos facturado.
 *
 * `cobrado` es la cohorte del pedido y no los pagos con fecha en el periodo:
 * la pregunta de esta tabla es "de lo que le vendi a este cliente, cuanto ya
 * me pago", y para eso un pago de ayer sobre un pedido de hace tres meses no
 * cuenta como venta de ayer. El KPI de Cobrado del resumen si va por fecha de
 * pago, y por eso los dos numeros no tienen que coincidir.
 */
export function ventasPorCliente(
  datos: DatosPeriodo,
  clientes: DatosCliente[],
  r: Rango
): FilaVentasCliente[] {
  const datosCliente = new Map(clientes.map(c => [c.id, c]))
  const filas = filasEnRango(datos.saldos, r)

  const porCliente = new Map<string, FilaSaldo[]>()
  for (const f of filas) {
    const k = f.cliente_id || ''
    const lista = porCliente.get(k)
    if (lista) lista.push(f)
    else porCliente.set(k, [f])
  }

  const litros = new Map<string, number>()
  for (const p of partidasValuadas(datos, r).partidas) {
    const k = p.cliente_id || ''
    litros.set(k, (litros.get(k) || 0) + (p.litros || 0))
  }

  return [...porCliente.entries()]
    .map(([k, suyos]) => ({
      cliente_id: k || null,
      nombre: k
        ? nombreLegible(datosCliente.get(k) || { id: k, full_name: null, email: null, razon_social: null })
        : 'Sin cliente',
      pedidos: suyos.length,
      litros: litros.get(k) || 0,
      facturado: netoTotal(suyos),
      cobrado: cobradoDe(suyos),
      saldo: porCobrarDe(suyos),
      estado: estadoCobranzaDe(suyos),
    }))
    .sort((a, b) => b.facturado - a.facturado)
}

export type TotalesCliente = {
  pedidos: number
  litros: number
  facturado: number
  cobrado: number
  saldo: number
}

/** El renglon de totales. Se suma de la tabla para que cuadre con lo impreso. */
export function totalesDeClientes(filas: FilaVentasCliente[]): TotalesCliente {
  return filas.reduce(
    (t, f) => ({
      pedidos: t.pedidos + f.pedidos,
      litros: t.litros + f.litros,
      facturado: t.facturado + f.facturado,
      cobrado: t.cobrado + f.cobrado,
      saldo: t.saldo + f.saldo,
    }),
    { pedidos: 0, litros: 0, facturado: 0, cobrado: 0, saldo: 0 }
  )
}

// ── Reporte: pedidos con saldo ──────────────────────────────

export type FilaCobranza = {
  id: string
  cliente_id: string | null
  nombre: string
  fecha_pedido: string
  fecha_vencimiento: string | null
  /** Dias de atraso. 0 si todavia no vence. */
  dias: number
  saldo: number
}

/**
 * Los pedidos que siguen debiendo, al dia de hoy.
 *
 * Sin filtro de periodo a proposito: una deuda no pertenece al mes en que se
 * facturo, es la que existe en este momento. Filtrarla por el selector daria
 * un "por cobrar de marzo" que no significa nada.
 */
export function pedidosConSaldo(saldos: FilaSaldo[], clientes: DatosCliente[]): FilaCobranza[] {
  const datosCliente = new Map(clientes.map(c => [c.id, c]))

  return saldos
    .filter(f => saldoPositivo(f) > 0)
    .map(f => ({
      id: f.id,
      cliente_id: f.cliente_id,
      nombre: f.cliente_id
        ? nombreLegible(
            datosCliente.get(f.cliente_id) || { id: f.cliente_id, full_name: null, email: null, razon_social: null }
          )
        : 'Sin cliente',
      fecha_pedido: f.fecha_pedido,
      fecha_vencimiento: f.fecha_vencimiento ?? null,
      dias: Math.max(0, f.dias_vencido || 0),
      saldo: saldoPositivo(f),
    }))
    .sort((a, b) => b.dias - a.dias || b.saldo - a.saldo)
}

// ── Reporte: crecimiento ────────────────────────────────────

/** La tendencia nunca baja de 12 meses, aunque el periodo sea de una semana. */
export const MESES_TENDENCIA_MIN = 12

/**
 * Cuantos meses de tendencia: 12, o 24 si el periodo elegido ya pasa de 12.
 *
 * Un periodo de 24 meses con una tendencia de 12 dejaria fuera la mitad de lo
 * que el resto del reporte esta sumando.
 */
export function mesesDeTendencia(r: Rango): 12 | 24 {
  return contarBuckets(r, 'mes') > MESES_TENDENCIA_MIN ? 24 : 12
}

/** Rango de la tendencia mensual: los ultimos `meses` meses hasta hoy. */
export function rangoTendencia(meses: number, ahora: Date = new Date()): Rango {
  const hoy = fechaMx(ahora)
  return { desde: sumarMeses(inicioMes(hoy), -(meses - 1)), hasta: hoy }
}

/**
 * Primera fecha de pedido de cada cliente, sobre TODO el historial.
 *
 * Es lo que distingue a un cliente nuevo de uno recurrente, y por eso se
 * calcula sobre todas las filas y no sobre las del periodo: si se mirara solo
 * la ventana, cada cliente seria "nuevo" el primer mes en que aparece dentro
 * de ella, y un cliente de hace tres anios saldria como nuevo.
 */
export function primerPedidoPorCliente(filas: FilaSaldo[]): Map<string, string> {
  const primero = new Map<string, string>()
  for (const f of filas) {
    if (!f.cliente_id) continue
    const actual = primero.get(f.cliente_id)
    if (!actual || f.fecha_pedido < actual) primero.set(f.cliente_id, f.fecha_pedido)
  }
  return primero
}

export type PuntoCrecimiento = PuntoSerie & {
  /** Facturado del mismo bucket un anio antes. */
  anoAnterior: number
  /** Contra el anio anterior. */
  varAnual: Variacion | null
  /** Contra el bucket inmediato anterior. null en el primero: no hay base. */
  varMes: Variacion | null
  clientesNuevos: number
  clientesRecurrentes: number
}

/**
 * La serie de crecimiento: la de siempre, mas las dos comparaciones y el corte
 * de clientes nuevos contra recurrentes.
 */
export function serieCrecimiento(datos: DatosPeriodo, buckets: Bucket[]): PuntoCrecimiento[] {
  const base = serieDePeriodo(datos, buckets)
  const previa = serieDePeriodo(datos, buckets.map(bucketAnoAnterior))
  const primero = primerPedidoPorCliente(datos.saldos)

  const nuevos = buckets.map(() => new Set<string>())
  const recurrentes = buckets.map(() => new Set<string>())
  for (const f of datos.saldos) {
    if (!f.cliente_id) continue
    const i = buckets.findIndex(b => enRango(f.fecha_pedido, b))
    if (i < 0) continue
    const debut = primero.get(f.cliente_id)
    if (debut && enRango(debut, buckets[i])) nuevos[i].add(f.cliente_id)
    else recurrentes[i].add(f.cliente_id)
  }

  return base.map((p, i) => ({
    ...p,
    anoAnterior: previa[i].facturado,
    varAnual: variacion(p.facturado, previa[i].facturado),
    varMes: i === 0 ? null : variacion(p.facturado, base[i - 1].facturado),
    clientesNuevos: nuevos[i].size,
    clientesRecurrentes: recurrentes[i].size,
  }))
}

export type MezclaBucket = {
  clave: string
  etiqueta: string
  litros: number
  /** Litros por unidad de venta. Las desconocidas no entran: no tienen litros. */
  porUnidad: Record<string, number>
}

/** Mezcla de presentaciones por bucket, en litros. El % lo saca quien pinta. */
export function mezclaPorBucket(datos: DatosPeriodo, buckets: Bucket[]): MezclaBucket[] {
  const salida: MezclaBucket[] = buckets.map(b => ({
    clave: b.clave,
    etiqueta: b.etiqueta,
    litros: 0,
    porUnidad: {},
  }))

  for (const ped of datos.pedidos) {
    const i = buckets.findIndex(b => enRango(ped.fecha_pedido, b))
    if (i < 0) continue
    for (const it of ped.pedido_items || []) {
      const litros = litrosDeItem(it.unidad, it.cantidad)
      if (litros === null) continue
      const u = it.unidad as string
      salida[i].porUnidad[u] = (salida[i].porUnidad[u] || 0) + litros
      salida[i].litros += litros
    }
  }

  return salida
}

export const DIAS_ANO = 365

/**
 * Ritmo anualizado: a lo que va el periodo si el paso se mantiene un anio.
 *
 * Es una extrapolacion lineal y nada mas: no sabe de temporadas ni de que el
 * periodo pueda llevar tres dias. Se rotula como ritmo y no como pronostico.
 */
export function ritmoAnualizado(facturado: number, r: Rango): number {
  const dias = diasDeRango(r)
  return dias > 0 ? (facturado / dias) * DIAS_ANO : 0
}

// ── Reporte: hallazgos ──────────────────────────────────────

export type Hallazgo = {
  clave: string
  texto: string
  tono: 'neutral' | 'bueno' | 'malo'
}

/**
 * Pesos redondeados.
 *
 * Repetido de `dash-ui.moneda` a proposito: los hallazgos son frases armadas, y
 * la pagina y el Excel tienen que decir exactamente la misma. Que esta
 * libreria importara un modulo de la UI para formatear seria peor que esta
 * linea.
 */
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

/**
 * Tres o cuatro cosas que el reporte dice en palabras.
 *
 * Reglas fijas, no un ranking: se buscan las cuatro preguntas que alguien hace
 * al recibir el reporte (vamos mejor o peor, quien me debe, que se vende, que
 * tan mal esta la cobranza). Un hallazgo sin dato no se inventa: se omite.
 *
 * `productos` puede venir recortado; lo unico que se le pide es que el primero
 * sea el mas vendido.
 */
export function hallazgos(entrada: {
  resumen: ResumenPeriodo
  previo: ResumenPeriodo
  cobranza: FilaCobranza[]
  productos: { nombre: string; litros: number }[]
  porCobrar: number
  vencido: number
}): Hallazgo[] {
  const { resumen, previo, cobranza, productos, porCobrar, vencido } = entrada
  const salida: Hallazgo[] = []

  // 1. Como vamos contra el periodo anterior.
  const v = variacion(resumen.facturado, previo.facturado)
  if (v) {
    salida.push({
      clave: 'facturado',
      texto: `Lo facturado ${v.dir === 'up' ? 'subió' : 'bajó'} ${v.pct}% contra el periodo anterior: ${pesos(resumen.facturado)} frente a ${pesos(previo.facturado)}.`,
      tono: v.dir === 'up' ? 'bueno' : 'malo',
    })
  } else if (resumen.facturado > 0) {
    salida.push({
      clave: 'facturado',
      texto: `Se facturaron ${pesos(resumen.facturado)}. El periodo anterior no tuvo ventas, así que no hay base para comparar.`,
      tono: 'neutral',
    })
  }

  // 2. Quien concentra la deuda. Se agrupa por cliente: un cliente con cinco
  //    pedidos chicos puede deber mas que otro con uno grande.
  const porDeudor = new Map<string, { nombre: string; saldo: number }>()
  for (const c of cobranza) {
    const k = c.cliente_id || c.nombre
    const a = porDeudor.get(k) || { nombre: c.nombre, saldo: 0 }
    a.saldo += c.saldo
    porDeudor.set(k, a)
  }
  const peor = [...porDeudor.values()].sort((a, b) => b.saldo - a.saldo)[0]
  if (peor && porCobrar > 0) {
    salida.push({
      clave: 'deudor',
      texto: `${peor.nombre} concentra ${pesos(peor.saldo)} de saldo, el ${Math.round((peor.saldo / porCobrar) * 100)}% de todo lo que está por cobrar.`,
      tono: 'neutral',
    })
  }

  // 3. Que se vende. En litros, que es lo comparable entre presentaciones.
  //
  // El denominador es el volumen del PERIODO y no la suma de `productos`: esa
  // lista puede llegar recortada a los primeros N, y entonces el porcentaje
  // seria "del top N", que no es lo que la frase dice.
  const top = productos[0]
  if (top && top.litros > 0) {
    const pct = resumen.litros > 0 ? Math.round((top.litros / resumen.litros) * 100) : 0
    salida.push({
      clave: 'producto',
      texto: `${top.nombre} fue lo más vendido con ${top.litros.toLocaleString('es-MX', { maximumFractionDigits: 1 })} L, el ${pct}% del volumen del periodo.`,
      tono: 'neutral',
    })
  }

  // 4. Que tan mal esta la cartera. Al dia de hoy, no del periodo.
  if (porCobrar > 0) {
    const pct = Math.round((vencido / porCobrar) * 100)
    salida.push({
      clave: 'vencido',
      texto: vencido > 0
        ? `${pesos(vencido)} ya pasaron su fecha de vencimiento: el ${pct}% de la cartera.`
        : 'Nada de la cartera está vencido: todo el saldo abierto está dentro de su plazo.',
      tono: pct >= 50 ? 'malo' : pct > 0 ? 'neutral' : 'bueno',
    })
  }

  return salida
}

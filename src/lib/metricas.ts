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

import { diasEntre, fechaMx, periodoDeFechaDB, periodoMx, sumarDias } from './fechas.ts'

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

// ── Facturado vs cobrado por mes ────────────────────────────

export type MesFacturado = {
  mes: string
  /** Neto facturado: pagado + saldo. */
  facturado: number
  cobrado: number
  /** Lo que falta por cobrar de los pedidos de ese mes. */
  pendiente: number
  /** Fraccion cobrada, o null si ese mes no facturo nada. */
  pct: number | null
}

/**
 * Serie mensual de facturado y cobrado, con los meses vacios en cero.
 *
 * `pendiente` es la resta y no `porCobrarDe` para que las dos barras apiladas
 * sumen exactamente `facturado` y la grafica no mienta por un centavo de
 * redondeo. Puede dar 0 pero nunca negativo: un sobrepago no resta.
 */
export function serieFacturadoVsCobrado(filas: FilaSaldo[], n = 12, ahora = new Date()): MesFacturado[] {
  const mapa = porMes(filas)
  return ultimosMeses(n, ahora).map(m => {
    const delMes = mapa.get(m.clave) || []
    const facturado = netoTotal(delMes)
    const cobrado = cobradoDe(delMes)
    return {
      mes: m.etiqueta,
      facturado,
      cobrado,
      pendiente: Math.max(0, facturado - cobrado),
      pct: facturado > 0 ? (cobrado / facturado) * 100 : null,
    }
  })
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

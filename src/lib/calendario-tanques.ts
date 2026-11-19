/**
 * Geometria del calendario de ocupacion de tanques.
 *
 * Sin React y sin Supabase, para que `node --test` la pueda cargar. Los
 * imports llevan extension .ts por lo mismo, igual que produccion.ts.
 *
 * ── Una decision que define todo lo demas ──
 *
 * Las fechas son STRINGS 'YYYY-MM-DD' de punta a punta. Nunca pasan por
 * `Date`. La razon esta escrita en el encabezado de fechas.ts: una columna
 * `date` no tiene hora ni zona, y `new Date('2026-08-01')` la interpreta como
 * medianoche UTC, que en CDMX es el 31 de julio. En un eje de dias eso es una
 * barra corrida un dia, que es justo el error que nadie detecta a ojo.
 *
 * La unica excepcion legitima es `etapa_desde`, que SI es un timestamptz: ahi
 * hay que convertir, y para eso esta `fechaMx` de fechas.ts.
 */
import { diasEntre, fechaMx, sumarDias } from './fechas.ts'
import { esTerminal, type Etapa } from './produccion.ts'

export const DIAS_ATRAS = 30
export const DIAS_ADELANTE = 45

export type Ventana = {
  desde: string
  hasta: string
  /** Cuantos dias cubre, contando los dos extremos. */
  dias: number
}

/** La ventana del calendario alrededor de `hoy`. */
export function ventana(hoy: string, atras = DIAS_ATRAS, adelante = DIAS_ADELANTE): Ventana {
  const desde = sumarDias(hoy, -atras)
  const hasta = sumarDias(hoy, adelante)
  return { desde, hasta, dias: atras + adelante + 1 }
}

/** Indice de columna de una fecha dentro de la ventana. Puede ser negativo. */
export const indiceDia = (v: Ventana, fecha: string): number => diasEntre(v.desde, fecha)

// ── Tramos de ocupacion ─────────────────────────────────────

/**
 * Lo que el calendario necesita de una fila de `public.tanque_ocupacion`.
 *
 * `fin` puede ser null: un tramo abierto de un lote sin receta completa no
 * tiene fecha estimada, y no se le invent una. Usar los umbrales de
 * `DIAS_NORMALES` para rellenarlo seria tomar un umbral de atencion —"un
 * lote en coccion dos dias es un lote que alguien olvido"— y presentarlo como
 * un plan.
 */
export type TramoCrudo = {
  id: string
  lote_id: string
  tanque_id: string
  folio: string | null
  producto_nombre: string | null
  etapa: Etapa
  desde: string
  hasta: string | null
  fin: string | null
  estimado: boolean
  tiene_receta: boolean
}

export type Tramo = {
  id: string
  loteId: string
  tanqueId: string
  folio: string | null
  producto: string | null
  etapa: Etapa
  /** Columna inicial (0-based) ya recortada a la ventana. */
  col: number
  /** Cuantas columnas ocupa. Siempre >= 1. */
  ancho: number
  cortadoIzq: boolean
  cortadoDer: boolean
  /** El fin es una estimacion, no un hecho. */
  estimado: boolean
  /** No se pudo proyectar: sin receta completa. */
  sinFin: boolean
  /** Carril, para tanques con tramos traslapados. */
  carril: number
  /** Fechas reales, para el tooltip. */
  inicioReal: string
  finReal: string | null
}

/**
 * Recorta un tramo a la ventana.
 *
 * Un tramo ABIERTO sin `fin` se dibuja hasta el borde derecho de la ventana y
 * se marca `sinFin`: el lote sigue ocupando el tanque hoy —eso es un hecho—
 * pero no se sabe hasta cuando. Cortarlo en "hoy" diria que el tanque se
 * libera hoy, que es una afirmacion que nadie hizo.
 *
 * Devuelve null si queda completamente fuera.
 */
export function recortar(t: TramoCrudo, v: Ventana): Omit<Tramo, 'carril'> | null {
  if (v.dias <= 0) return null

  const i = indiceDia(v, t.desde)
  const sinFin = t.fin === null
  // El fin es INCLUSIVO: un tramo de un dia ocupa una columna, no cero.
  const f = sinFin ? v.dias : indiceDia(v, t.fin as string) + 1

  if (f <= 0 || i >= v.dias) return null

  const col = Math.max(0, i)
  const der = Math.min(v.dias, f)
  if (der <= col) return null

  return {
    id: t.id,
    loteId: t.lote_id,
    tanqueId: t.tanque_id,
    folio: t.folio,
    producto: t.producto_nombre,
    etapa: t.etapa,
    col,
    ancho: der - col,
    cortadoIzq: i < 0,
    cortadoDer: f > v.dias,
    estimado: t.estimado,
    sinFin,
    inicioReal: t.desde,
    finReal: t.fin,
  }
}

/**
 * Asigna carriles a tramos que se traslapan.
 *
 * Hace falta porque los traslapes son ALCANZABLES, no teoricos: el alta de
 * lote solo ofrece tanques libres, pero `PATCH /lotes/[id]` acepta cualquier
 * `tanque_id` sin revisar ocupacion. Dos lotes en el mismo tanque a la vez es
 * un error de captura, y el calendario es donde se tiene que ver.
 *
 * Greedy sobre los tramos ordenados por inicio: cada uno va al primer carril
 * cuyo ultimo tramo ya termino. Dos tramos CONSECUTIVOS en el mismo tanque
 * —lo normal— comparten carril y no se señalan.
 */
export function asignarCarriles<T extends { col: number; ancho: number }>(tramos: T[]): number[] {
  const orden = tramos
    .map((t, i) => ({ i, ini: t.col, fin: t.col + t.ancho }))
    .sort((a, b) => a.ini - b.ini || a.fin - b.fin)

  const finDeCarril: number[] = []
  const carriles = new Array<number>(tramos.length).fill(0)

  for (const { i, ini, fin } of orden) {
    let c = finDeCarril.findIndex(f => f <= ini)
    if (c === -1) { c = finDeCarril.length; finDeCarril.push(fin) }
    else finDeCarril[c] = fin
    carriles[i] = c
  }
  return carriles
}

/** Agrupa los tramos por tanque, ya recortados y con carril. */
export function tramosPorTanque(crudos: TramoCrudo[], v: Ventana): Map<string, Tramo[]> {
  const por = new Map<string, Omit<Tramo, 'carril'>[]>()

  for (const c of crudos) {
    const r = recortar(c, v)
    if (!r) continue
    const arr = por.get(c.tanque_id) || []
    arr.push(r)
    por.set(c.tanque_id, arr)
  }

  const salida = new Map<string, Tramo[]>()
  for (const [tanque, arr] of por) {
    const carriles = asignarCarriles(arr)
    salida.set(tanque, arr.map((t, i) => ({ ...t, carril: carriles[i] })))
  }
  return salida
}

/** Cuantos carriles necesita un tanque. Al menos 1, para que la fila exista. */
export const carrilesDe = (tramos: Tramo[] | undefined): number =>
  tramos && tramos.length ? Math.max(...tramos.map(t => t.carril)) + 1 : 1

/**
 * Pares de tramos que de verdad se traslapan en el tiempo.
 *
 * Tener dos carriles NO implica conflicto por si solo —podrian ser dos tramos
 * del mismo lote que cambio de tanque y volvio—, asi que el aviso se calcula
 * sobre el traslape real y no sobre el numero de carriles.
 */
export function hayTraslape(tramos: Tramo[]): boolean {
  const orden = [...tramos].sort((a, b) => a.col - b.col)
  for (let i = 1; i < orden.length; i++) {
    if (orden[i].col < orden[i - 1].col + orden[i - 1].ancho) return true
  }
  return false
}

// ── El fin estimado, para cuando se calcula en el cliente ───

/**
 * El dia de un `etapa_desde` (timestamptz) en la zona del negocio.
 *
 * `.slice(0, 10)` seria el error clasico: una etapa avanzada a las 19:00 CDMX
 * se guarda como un instante UTC cuyo dia ya es el de mañana, asi que cortar
 * el string cuesta un dia entero en un eje de dias.
 */
export const diaDeEtapa = (etapaDesde: string): string => fechaMx(new Date(etapaDesde))

/** Un tramo sigue ocupando el tanque hoy. */
export const estaOcupando = (t: { hasta: string | null; etapa: Etapa }): boolean =>
  t.hasta === null && !esTerminal(t.etapa)

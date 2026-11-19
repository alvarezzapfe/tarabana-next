/**
 * Logica del modulo de Produccion. Sin React y sin Supabase, para que
 * `node --test` la pueda cargar.
 *
 * Los imports llevan extension .ts a proposito, misma razon que dash-ui.ts y
 * pos-ui.ts: asi este modulo se carga sin bundler.
 */
import { LITROS_POR_UNIDAD, type ColumnaStock } from './unidades.ts'

// ── Etapas ──────────────────────────────────────────────────

export const ETAPAS = [
  'planeado', 'coccion', 'fermentacion', 'maduracion',
  'envasado', 'liberado', 'descartado',
] as const

export type Etapa = (typeof ETAPAS)[number]

export const ETAPA_LABEL: Record<Etapa, string> = {
  planeado: 'Planeado',
  coccion: 'Cocción',
  fermentacion: 'Fermentación',
  maduracion: 'Maduración',
  envasado: 'Envasado',
  liberado: 'Liberado',
  descartado: 'Descartado',
}

/** Columnas del kanban. 'descartado' no es una columna: es una salida. */
export const ETAPAS_TABLERO = [
  'planeado', 'coccion', 'fermentacion', 'maduracion', 'envasado',
] as const satisfies readonly Etapa[]

export const ETAPAS_TERMINALES = ['liberado', 'descartado'] as const

export function esTerminal(etapa: Etapa): boolean {
  return (ETAPAS_TERMINALES as readonly string[]).includes(etapa)
}

/**
 * Orden de etapa. Espejo EXACTO de public.lote_etapa_orden() en
 * supabase/migrations/20261118000000_produccion.sql.
 *
 * Si divergen, el boton Avanzar ofrece una transicion que la funcion SQL
 * rechaza, y el usuario ve un error en vez de una accion deshabilitada.
 */
const ORDEN: Record<Etapa, number> = {
  planeado: 0, coccion: 1, fermentacion: 2, maduracion: 3,
  envasado: 4, liberado: 5, descartado: 99,
}

export function ordenDe(etapa: Etapa): number {
  return ORDEN[etapa]
}

/** La etapa que sigue en la linea normal, o null si ya no hay. */
export function siguienteEtapa(etapa: Etapa): Etapa | null {
  if (esTerminal(etapa)) return null
  const i = ETAPAS.indexOf(etapa)
  const sig = ETAPAS[i + 1]
  return sig && sig !== 'descartado' ? sig : null
}

// ── Requisitos de avance ────────────────────────────────────

/** Lo que `puedeAvanzar` necesita saber de un lote. */
export type LoteParaAvance = {
  etapa: Etapa
  fg: number | null
  /** Renglones de envasado capturados. */
  envasado: number
}

export type Veredicto =
  | { ok: true }
  | { ok: false; motivo: string }

/**
 * Puede el lote moverse a `destino`.
 *
 * Espejo de las validaciones de public.avanzar_lote(). La autorizacion real
 * vive en SQL —esta funcion solo decide si el boton se puede apretar y con
 * que explicacion—, pero las reglas tienen que ser las MISMAS, con los
 * mismos mensajes, para que deshabilitado y rechazado digan lo mismo.
 */
export function puedeAvanzar(lote: LoteParaAvance, destino: Etapa): Veredicto {
  if (lote.etapa === destino) {
    return { ok: false, motivo: `Ya está en ${ETAPA_LABEL[destino].toLowerCase()}.` }
  }
  if (esTerminal(lote.etapa)) {
    return { ok: false, motivo: `El lote está ${ETAPA_LABEL[lote.etapa].toLowerCase()} y ya no avanza.` }
  }
  if (destino !== 'descartado' && ordenDe(destino) < ordenDe(lote.etapa)) {
    return { ok: false, motivo: 'Las etapas solo avanzan.' }
  }
  if (destino === 'envasado' && lote.fg === null) {
    return { ok: false, motivo: 'Falta registrar la FG.' }
  }
  if (destino === 'liberado' && lote.envasado === 0) {
    return { ok: false, motivo: 'Falta registrar el envasado.' }
  }
  return { ok: true }
}

// ── Merma ───────────────────────────────────────────────────

export type LoteMerma = {
  litros_reales: number | null
  litros_envasados: number | null
  fecha_liberado: string | null
}

/**
 * Merma del periodo, PONDERADA por volumen.
 *
 * No es el promedio de los porcentajes: eso le da el mismo peso a un lote de
 * 50 L que a uno de 1000 L, y un lote chico con merma rara mueve el KPI mas
 * que la realidad. Aqui se suman los litros de los dos lados y se divide una
 * vez, que es la merma que de verdad tuvo la fabrica en el periodo.
 *
 * Los lotes sin `litros_reales` o sin envasado quedan FUERA y se reportan en
 * `sinDatos`. Contarlos como merma 0 bajaria el KPI con lotes que no dicen
 * nada — el mismo criterio que `sinUnidad` en topProductosEnLitros.
 *
 * Devuelve `pct: null` cuando no hay ni un lote con los dos lados: no hay
 * merma "de cero", hay merma desconocida.
 */
export function mermaDelPeriodo(
  lotes: LoteMerma[],
  desde: Date,
  hasta: Date
): { pct: number | null; litros: number | null; lotes: number; sinDatos: number } {
  let reales = 0
  let envasados = 0
  let n = 0
  let sinDatos = 0

  for (const l of lotes) {
    if (!l.fecha_liberado) continue
    const t = new Date(l.fecha_liberado)
    if (t < desde || t > hasta) continue

    if (l.litros_reales === null || l.litros_envasados === null || l.litros_reales <= 0) {
      sinDatos += 1
      continue
    }
    reales += l.litros_reales
    envasados += l.litros_envasados
    n += 1
  }

  if (n === 0) return { pct: null, litros: null, lotes: 0, sinDatos }

  return {
    pct: Math.round(((reales - envasados) / reales) * 1000) / 10,
    litros: Math.round((reales - envasados) * 1000) / 1000,
    lotes: n,
    sinDatos,
  }
}

/** Ventana de los ultimos `dias` dias terminando ahora. */
export function ventanaDias(dias: number, ahora = new Date()): { desde: Date; hasta: Date } {
  const desde = new Date(ahora)
  desde.setDate(desde.getDate() - dias)
  return { desde, hasta: ahora }
}

// ── Presentaciones de envasado ──────────────────────────────

/**
 * Las presentaciones en que se envasa, con su factor a litros.
 *
 * Son las COLUMNAS DE STOCK de inventario, no las unidades de venta de
 * pedido_items: el envasado alimenta `productos.stock_*`, y mezclar los dos
 * vocabularios manda el stock a la columna equivocada (ver el comentario de
 * COLUMNA_STOCK_POR_UNIDAD en unidades.ts).
 *
 * `mix24` no aparece porque no es algo que se envase: se arma al vender.
 */
export const PRESENTACIONES_ENVASADO = [
  { columna: 'stock_latas', label: 'Latas sueltas' },
  { columna: 'stock_caja12', label: 'Caja de 12' },
  { columna: 'stock_caja24', label: 'Caja de 24' },
  { columna: 'stock_barril_pet', label: 'Barril 20 L PET' },
  { columna: 'stock_barril_acero', label: 'Barril 20 L acero' },
  { columna: 'stock_barril10_pet', label: 'Barril 10 L PET' },
  { columna: 'stock_barril10_acero', label: 'Barril 10 L acero' },
] as const satisfies readonly { columna: ColumnaStock; label: string }[]

/**
 * Litros que aporta una cantidad de una presentacion.
 *
 * Reusa LITROS_POR_UNIDAD y no reimplementa los factores. Es el mismo
 * calculo que la columna generada `lote_envasado.litros_equivalentes`: aqui
 * sirve para previsualizar antes de guardar, la verdad la pone la DB.
 */
export function litrosDeEnvasado(columna: ColumnaStock, cantidad: number): number {
  return Math.round(cantidad * LITROS_POR_UNIDAD[columna] * 1000) / 1000
}

// ── Formato ─────────────────────────────────────────────────

/** Gravedad con 3 decimales: 1.055, no 1.055000001. */
export const fmtGravedad = (g: number | null | undefined) =>
  g === null || g === undefined ? '—' : g.toFixed(3)

export const fmtLitros = (l: number | null | undefined) =>
  l === null || l === undefined
    ? '—'
    : `${l.toLocaleString('es-MX', { maximumFractionDigits: 1 })} L`

export const fmtPct = (p: number | null | undefined) =>
  p === null || p === undefined ? '—' : `${p.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`

export const fmtAbv = (a: number | null | undefined) =>
  a === null || a === undefined ? '—' : `${a.toFixed(1)}% ABV`

/** "3 días", "1 día", "hoy". */
export function fmtDias(d: number | null | undefined): string {
  if (d === null || d === undefined) return '—'
  if (d === 0) return 'hoy'
  return d === 1 ? '1 día' : `${d} días`
}

// ── Export CSV del historico ────────────────────────────────

export type FilaHistorico = {
  folio: string | null
  producto_nombre: string | null
  producto_estilo: string | null
  etapa: Etapa
  tanque_nombre: string | null
  fecha_coccion: string | null
  fecha_envasado: string | null
  fecha_liberado: string | null
  litros_objetivo: number | null
  litros_reales: number | null
  litros_envasados: number | null
  merma_litros: number | null
  merma_pct: number | null
  og: number | null
  fg: number | null
  abv: number | null
  levadura_cepa: string | null
}

const COLUMNAS_CSV: { header: string; valor: (f: FilaHistorico) => string | number | null }[] = [
  { header: 'Folio', valor: f => f.folio },
  { header: 'Producto', valor: f => f.producto_nombre },
  { header: 'Estilo', valor: f => f.producto_estilo },
  { header: 'Etapa', valor: f => ETAPA_LABEL[f.etapa] ?? f.etapa },
  { header: 'Tanque', valor: f => f.tanque_nombre },
  { header: 'Cocción', valor: f => f.fecha_coccion },
  { header: 'Envasado', valor: f => f.fecha_envasado },
  // Solo la fecha: fecha_liberado es timestamptz y la hora no aporta en un CSV.
  { header: 'Liberado', valor: f => f.fecha_liberado?.slice(0, 10) ?? null },
  { header: 'Litros objetivo', valor: f => f.litros_objetivo },
  { header: 'Litros reales', valor: f => f.litros_reales },
  { header: 'Litros envasados', valor: f => f.litros_envasados },
  { header: 'Merma L', valor: f => f.merma_litros },
  { header: 'Merma %', valor: f => f.merma_pct },
  { header: 'OG', valor: f => f.og },
  { header: 'FG', valor: f => f.fg },
  { header: 'ABV', valor: f => f.abv },
  { header: 'Levadura', valor: f => f.levadura_cepa },
]

/**
 * Una celda de CSV.
 *
 * Entrecomilla SIEMPRE que haya coma, comilla, salto de linea o punto y coma.
 * El punto y coma entra porque Excel en es-MX usa `;` como separador de
 * lista: un nombre con `;` adentro parte la fila en dos columnas al abrirlo.
 */
function celda(v: string | number | null): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV del historico.
 *
 * Lleva BOM UTF-8: sin el, Excel en Windows abre `Cocción` como `CocciÃ³n`.
 * Es el mismo motivo por el que los CSV del proyecto lo incluyen.
 */
export function historicoCsv(filas: FilaHistorico[]): string {
  const lineas = [
    COLUMNAS_CSV.map(c => celda(c.header)).join(','),
    ...filas.map(f => COLUMNAS_CSV.map(c => celda(c.valor(f))).join(',')),
  ]
  return '﻿' + lineas.join('\r\n')
}

// ── Filtros del historico ───────────────────────────────────

export type FiltroHistorico = {
  estilo: string
  etapa: string
  desde: string
  hasta: string
}

export const FILTRO_VACIO: FiltroHistorico = { estilo: '', etapa: '', desde: '', hasta: '' }

/**
 * Aplica los filtros del historico.
 *
 * El rango de fechas se compara contra `fecha_coccion`, que es la fecha que
 * define cuando se hizo el lote. Las comparaciones son sobre el STRING
 * 'YYYY-MM-DD' y no sobre Date: `fecha_coccion` es `date`, y pasarla por
 * `new Date()` la corre un dia hacia atras en CDMX (ver docs/SCHEMA_NOTES.md
 * sobre pagos.fecha_pago). Lexicografico sobre ISO es cronologico.
 */
export function filtrarHistorico<T extends {
  producto_estilo: string | null
  etapa: string
  fecha_coccion: string | null
}>(filas: T[], f: FiltroHistorico): T[] {
  return filas.filter(fila => {
    if (f.estilo && fila.producto_estilo !== f.estilo) return false
    if (f.etapa && fila.etapa !== f.etapa) return false
    if (f.desde && (!fila.fecha_coccion || fila.fecha_coccion < f.desde)) return false
    if (f.hasta && (!fila.fecha_coccion || fila.fecha_coccion > f.hasta)) return false
    return true
  })
}

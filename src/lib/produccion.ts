/**
 * Logica del modulo de Produccion. Sin React y sin Supabase, para que
 * `node --test` la pueda cargar.
 *
 * Los imports llevan extension .ts a proposito, misma razon que dash-ui.ts y
 * pos-ui.ts: asi este modulo se carga sin bundler.
 */
import { LITROS_POR_UNIDAD, type ColumnaStock } from './unidades.ts'
import { diasEntre } from './fechas.ts'

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

// ── F2: alertas ─────────────────────────────────────────────
//
// Las REGLAS viven en SQL, en `lotes_vista` (ver la migracion
// 20261119000000_produccion_f2.sql). Aqui solo esta como se LEEN: el texto y
// el orden de severidad.
//
// Esa division es a proposito. Con los umbrales en la vista hay una sola
// verdad y el contador del sidebar es un `count(*)` barato; si las reglas
// estuvieran aqui, el layout tendria que cargar todos los lotes en cada
// pagina del panel para contar. Lo que SI vive aqui es el copy, porque un
// texto para personas no tiene por que viajar desde una vista.

export const NIVELES_ALERTA = ['ninguna', 'ambar', 'rojo'] as const
export type NivelAlerta = (typeof NIVELES_ALERTA)[number]

/** Los motivos que emite la vista, con su texto. */
export const MOTIVO_ALERTA: Record<string, string> = {
  sin_lectura_48h: 'Sin lectura en más de 48 h',
  etapa_vencida: 'Lleva más días de los planeados en esta etapa',
  etapa_muy_vencida: 'Pasa del doble de los días planeados',
  fg_fuera_rango: 'FG fuera del objetivo',
  merma_alta: 'Merma arriba del 10%',
}

/**
 * El mismo motivo, en corto, para el chip de una tarjeta del kanban.
 *
 * Existe aparte y no como un `slice()` del texto largo porque una frase
 * recortada a la mitad no es una etiqueta: "Lleva mas dias de los pla..." no
 * dice nada que "Etapa vencida" no diga mejor en un tercio del ancho. La
 * frase completa sigue viajando en el `title` del chip, y el contexto la
 * respalda — al lado del chip esta la barra de progreso en "Dia 12 de 7".
 *
 * Las claves son las MISMAS que MOTIVO_ALERTA; si se agrega una alla sin
 * agregarla aqui, el chip cae al texto largo y se nota.
 *
 * Tope practico: 16 caracteres. Es lo que cabe en una columna del kanban con
 * las cinco etapas ocupadas en una ventana de 1100 px (145 px de columna, 107
 * de contenido). Arriba de eso el chip se recorta solo. Lo cuida una prueba.
 */
export const MOTIVO_CHIP: Record<string, string> = {
  sin_lectura_48h: 'Sin lectura 48 h',
  etapa_vencida: 'Etapa vencida',
  etapa_muy_vencida: 'Muy vencida',
  fg_fuera_rango: 'FG fuera',
  merma_alta: 'Merma > 10%',
}

/**
 * Texto de un motivo. Un motivo desconocido se devuelve tal cual y no se
 * esconde: si la vista empieza a emitir una clave nueva, se tiene que ver en
 * la pantalla para que alguien la traduzca, no desaparecer en silencio.
 */
export const textoMotivo = (clave: string): string => MOTIVO_ALERTA[clave] ?? clave

export function textosMotivos(motivos: string[] | null | undefined): string[] {
  return (motivos ?? []).map(textoMotivo)
}

/** Un motivo listo para pintar como chip: el corto y la frase completa. */
export type MotivoChip = { clave: string; corto: string; largo: string }

/**
 * Los motivos de un lote, en corto y en largo.
 *
 * Una clave sin texto corto cae al largo en LOS DOS campos, por la misma
 * razon que `textoMotivo`: un motivo nuevo tiene que verse feo en pantalla,
 * no desaparecer.
 */
export function motivosChip(motivos: string[] | null | undefined): MotivoChip[] {
  return (motivos ?? []).map(clave => ({
    clave,
    corto: MOTIVO_CHIP[clave] ?? textoMotivo(clave),
    largo: textoMotivo(clave),
  }))
}

/** Orden de severidad, para ordenar una lista por "lo que urge primero". */
export function pesoAlerta(nivel: NivelAlerta | null | undefined): number {
  return nivel === 'rojo' ? 2 : nivel === 'ambar' ? 1 : 0
}

export const hayAlerta = (nivel: NivelAlerta | null | undefined): boolean =>
  pesoAlerta(nivel) > 0

// ── F2: proyeccion de fin de lote ───────────────────────────

/**
 * Dias objetivo de una etapa segun la receta. Espejo EXACTO de
 * `public.receta_dias_etapa()` en la migracion.
 *
 * `null` cuando la receta no define esa etapa: null no es cero. Un producto
 * sin dias de maduracion capturados no madura "cero dias"; no se sabe
 * cuanto, y tratarlo como 0 adelantaria la proyeccion.
 */
export type DiasReceta = {
  dias_coccion: number | null
  dias_fermentacion: number | null
  dias_maduracion: number | null
  dias_envasado: number | null
}

export function diasObjetivoEtapa(etapa: Etapa, r: DiasReceta | null): number | null {
  if (!r) return null
  switch (etapa) {
    case 'coccion': return r.dias_coccion
    case 'fermentacion': return r.dias_fermentacion
    case 'maduracion': return r.dias_maduracion
    case 'envasado': return r.dias_envasado
    // planeado, liberado y descartado no tienen duracion objetivo.
    default: return null
  }
}

/**
 * Suma del plan completo, o `null` si la receta no define las cuatro etapas.
 *
 * Un total a medias proyectaria una fecha falsa que se ve igual de legitima
 * que una buena, asi que se devuelve null y la pantalla dice "sin receta
 * completa".
 */
export function diasObjetivoTotal(r: DiasReceta | null): number | null {
  if (!r) return null
  const { dias_coccion: c, dias_fermentacion: f, dias_maduracion: m, dias_envasado: e } = r
  if (c === null || f === null || m === null || e === null) return null
  return c + f + m + e
}

// ── F2: progreso de la etapa ────────────────────────────────

export type Progreso = {
  /** El dia en que va, contando el de entrada como 1. */
  dia: number
  objetivo: number
  /** Fraccion de la etapa consumida, topada en 1. */
  fraccion: number
  nivel: NivelAlerta
}

/**
 * En que dia de su etapa va el lote, y si eso ya es tarde.
 *
 * El `nivel` es un ESPEJO de las reglas `etapa_vencida` y `etapa_muy_vencida`
 * de `lotes_vista` (migracion 20261119000000, bloque `alertas`): ambar cuando
 * los dias pasan del objetivo, rojo cuando pasan del doble. Se recalcula aqui
 * en vez de leer `alerta_nivel` porque la barra habla de UNA etapa, mientras
 * que `alerta_nivel` es el maximo de los cuatro motivos: un lote al dia en su
 * etapa pero con la FG fuera de rango llega en rojo, y pintar la barra de
 * rojo diria que va tarde cuando no va tarde. Si las reglas de SQL cambian,
 * este espejo se mueve con ellas.
 *
 * El dia se cuenta desde 1 y no desde 0: el dia en que el lote entro a la
 * etapa es su primer dia, no su dia cero. Por eso un lote con
 * `dias_en_etapa = 0` lee "Dia 1 de 7", y uno con 7 lee "Dia 8 de 7", que es
 * justo el umbral en que la regla de SQL lo marca vencido.
 *
 * Devuelve null cuando no hay objetivo contra el que medir — sin receta, o en
 * una etapa que no tiene duracion (`planeado`). Un objetivo de 0 tambien da
 * null: la receta lo permite (`coalesce(dias_x, 0) >= 0` en la migracion), y
 * "dia 1 de 0" no es una barra, es una division entre cero.
 */
export function progresoEtapa(diasEnEtapa: number, objetivo: number | null): Progreso | null {
  if (objetivo === null || objetivo <= 0) return null

  const dia = diasEnEtapa + 1
  return {
    dia,
    objetivo,
    fraccion: Math.min(1, dia / objetivo),
    nivel:
      diasEnEtapa > objetivo * 2 ? 'rojo' :
      diasEnEtapa > objetivo ? 'ambar' : 'ninguna',
  }
}

// ── F2: litros en camino ────────────────────────────────────

export type LoteEnCamino = {
  producto_id: string
  etapa: Etapa
  litros_reales: number | null
  litros_objetivo: number | null
  fecha_fin_estimada: string | null
}

/**
 * Litros proyectados por producto dentro de una ventana de fechas.
 *
 * Espeja la forma de `src/lib/stock-disponible.ts`: agregacion pura que
 * devuelve el dato Y SUS HUECOS. Los lotes sin fecha estimada no se reparten
 * ni se asumen — se cuentan en `sinFecha` para que la pantalla los muestre,
 * igual que `sinClasificar` en `comprometidoDe`.
 *
 * Las fechas se comparan como strings 'YYYY-MM-DD'. Pasarlas por `Date` las
 * corre un dia en CDMX (ver el encabezado de fechas.ts).
 */
export function litrosEnCamino(
  lotes: LoteEnCamino[],
  desde: string,
  hasta: string
): { por: Map<string, number>; lotesPor: Map<string, number>; sinFecha: Map<string, number> } {
  const por = new Map<string, number>()
  const lotesPor = new Map<string, number>()
  const sinFecha = new Map<string, number>()

  for (const l of lotes) {
    if (esTerminal(l.etapa)) continue

    if (!l.fecha_fin_estimada) {
      sinFecha.set(l.producto_id, (sinFecha.get(l.producto_id) || 0) + 1)
      continue
    }
    if (l.fecha_fin_estimada < desde || l.fecha_fin_estimada > hasta) continue

    // Los reales cuando ya se midieron, el objetivo mientras no: un lote
    // recien encubado no aporta cero.
    const litros = l.litros_reales ?? l.litros_objetivo
    if (litros === null) {
      sinFecha.set(l.producto_id, (sinFecha.get(l.producto_id) || 0) + 1)
      continue
    }
    por.set(l.producto_id, (por.get(l.producto_id) || 0) + litros)
    lotesPor.set(l.producto_id, (lotesPor.get(l.producto_id) || 0) + 1)
  }

  return { por, lotesPor, sinFecha }
}

// ── F2: geometria del calendario ────────────────────────────

/** Ventana del calendario: 30 dias atras, 45 adelante. */
export const CAL_DIAS_ATRAS = 30
export const CAL_DIAS_ADELANTE = 45

/**
 * Posicion y ancho de una barra en la ventana, en FRACCION del ancho total.
 *
 * Fracciones y no pixeles por lo mismo que `GraficaPeriodo`: el contenedor no
 * conoce su ancho real, pero las proporciones no cambian, asi que la barra se
 * posiciona con porcentajes y sobrevive al scroll horizontal y al zoom.
 *
 * Recorta a la ventana y lo DICE: `cortadaIzq` / `cortadaDer` dejan que la
 * barra se dibuje con el borde abierto, para que no parezca que el lote
 * empieza o acaba justo en el borde del calendario.
 *
 * Devuelve null si la barra queda completamente fuera.
 */
export type Barra = {
  izq: number
  ancho: number
  cortadaIzq: boolean
  cortadaDer: boolean
}

export function barraEnVentana(
  inicio: string,
  fin: string,
  ventanaInicio: string,
  dias: number
): Barra | null {
  if (dias <= 0) return null

  const i = diasDesde(ventanaInicio, inicio)
  // El fin es INCLUSIVO: un lote que empieza y acaba el mismo dia ocupa un
  // dia, no cero.
  const f = diasDesde(ventanaInicio, fin) + 1

  if (f <= 0 || i >= dias) return null

  const iRec = Math.max(0, i)
  const fRec = Math.min(dias, f)

  return {
    izq: iRec / dias,
    ancho: (fRec - iRec) / dias,
    cortadaIzq: i < 0,
    cortadaDer: f > dias,
  }
}

/**
 * Dias entre dos fechas 'YYYY-MM-DD', sin pasar por Date.
 *
 * Reimplementar esto seria un error: `diasEntre` de fechas.ts ya lo resuelve
 * ancorado a mediodia UTC justo para que ningun corrimiento de zona mueva el
 * resultado. Esto es solo el alias con el nombre que usa el calendario.
 */
function diasDesde(desde: string, hasta: string): number {
  return diasEntre(desde, hasta)
}

/**
 * Dias que FALTAN desde la etapa actual. Espejo de
 * `public.receta_dias_restantes()`.
 *
 * `planeado` y `coccion` devuelven el plan completo: en las dos todavia falta
 * todo. Cualquier null hace null el total, porque una receta incompleta no se
 * proyecta a medias.
 */
export function diasRestantes(etapa: Etapa, r: DiasReceta | null): number | null {
  if (!r) return null
  const { dias_coccion: c, dias_fermentacion: f, dias_maduracion: m, dias_envasado: e } = r
  const suma = (...xs: (number | null)[]): number | null =>
    xs.some(x => x === null) ? null : (xs as number[]).reduce((a, b) => a + b, 0)

  switch (etapa) {
    case 'planeado':
    case 'coccion': return suma(c, f, m, e)
    case 'fermentacion': return suma(f, m, e)
    case 'maduracion': return suma(m, e)
    case 'envasado': return suma(e)
    // liberado y descartado: ya no falta nada.
    default: return null
  }
}

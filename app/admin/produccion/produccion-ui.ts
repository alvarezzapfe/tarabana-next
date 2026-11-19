import { ETAPA_LABEL, type Etapa } from '../../../src/lib/produccion.ts'
import { ACENTO, GRIS, GRIS_SUAVE, PISTA } from '../dash-ui.ts'

/**
 * Tipos y tokens que comparten las tres pestanas de Produccion.
 *
 * Los imports llevan extension .ts por lo mismo que dash-ui.ts: asi este
 * modulo se puede cargar con `node --test`.
 */

// ── Lo que devuelve public.lotes_vista ──────────────────────
//
// Las columnas estan ENUMERADAS en la vista (no `l.*`), asi que este tipo y
// la vista se tienen que mover juntos. Agregar una columna a `lotes` pide
// tocar los dos.

export type LoteFila = {
  id: string
  folio: string | null
  producto_id: string
  etapa: Etapa
  etapa_desde: string
  tanque_id: string | null
  litros_objetivo: number | null
  litros_reales: number | null
  og: number | null
  fg: number | null
  abv: number | null
  levadura_cepa: string | null
  levadura_proveedor: string | null
  levadura_generacion: number | null
  fecha_coccion: string | null
  fecha_envasado: string | null
  fecha_liberado: string | null
  notas: string | null
  created_at: string
  producto_nombre: string | null
  producto_estilo: string | null
  tanque_nombre: string | null
  tanque_tipo: TanqueTipo | null
  tanque_capacidad: number | null
  litros_envasados: number | null
  merma_litros: number | null
  merma_pct: number | null
  ultima_gravedad: number | null
  ultima_lectura_fecha: string | null
  dias_en_etapa: number
}

export type TanqueTipo = 'fermentador' | 'madurador' | 'brite'

export const TANQUE_TIPO_LABEL: Record<TanqueTipo, string> = {
  fermentador: 'Fermentador',
  madurador: 'Madurador',
  brite: 'Brite',
}

export type TanqueFila = {
  id: string
  nombre: string
  tipo: TanqueTipo
  capacidad_litros: number
  activo: boolean
  notas: string | null
}

export type LecturaFila = {
  id: string
  lote_id: string
  fecha: string
  gravedad: number | null
  temperatura_c: number | null
  ph: number | null
  nota: string | null
}

export type EnvasadoFila = {
  id: string
  lote_id: string
  producto_id: string
  columna_stock: string
  cantidad: number
  litros_equivalentes: number
}

export type EventoFila = {
  id: string
  lote_id: string
  etapa_de: Etapa | null
  etapa_a: Etapa
  actor_id: string | null
  nota: string | null
  created_at: string
}

export type ProductoFila = {
  id: string
  nombre: string
  estilo: string
  folio_prefijo: string | null
}

// ── Color como senal, no como decoracion ────────────────────
//
// El OS reserva el color para lo que hay que mirar. Las etapas NO se pintan
// cada una de un color: siete colores en un tablero hacen que ninguno
// signifique nada, y el usuario tendria que aprender una leyenda para leer
// una columna que ya dice su nombre arriba.
//
// Lo unico que se tinta es lo que pide atencion: un lote parado mas de lo
// normal en su etapa, y las dos etapas terminales.

/**
 * Dias despues de los cuales un lote llama la atencion en su etapa.
 *
 * No son reglas de proceso ni limites duros: son el umbral a partir del cual
 * vale la pena preguntar. Un lote en coccion cuatro dias es un lote que
 * alguien se olvido de avanzar.
 */
export const DIAS_NORMALES: Record<Etapa, number> = {
  planeado: 14,
  coccion: 2,
  fermentacion: 21,
  maduracion: 45,
  envasado: 7,
  liberado: Infinity,
  descartado: Infinity,
}

export function estaParado(etapa: Etapa, dias: number): boolean {
  return dias > DIAS_NORMALES[etapa]
}

export const AMBAR = '#b45309'

/** Fondo de la columna del kanban. Neutro: la senal va en las tarjetas. */
export const COLUMNA_FONDO = PISTA

export const etiquetaEtapa = (e: Etapa): string => ETAPA_LABEL[e] ?? e

// ── Estilos compartidos ─────────────────────────────────────

export const inputBase = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 13.5,
  color: '#1a1a1a',
  background: '#fff',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
}

export const labelBase = {
  display: 'block',
  color: GRIS,
  fontSize: 11.5,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  marginBottom: 6,
}

/**
 * Boton de accion primaria.
 *
 * Usa la constante ACENTO de dash-ui (#D95F2E), NO el acento tematico que
 * `contextoAdmin()` saca de `app_config.branding.color_primary`. Es lo que
 * hace Pedidos con su "+ Nuevo pedido" (ver PedidosClient), y por eso ese
 * sale naranja mientras el subrayado de las pestanas sale del color de
 * marca. Hilar el acento tematico aqui era lo que pintaba este boton de azul
 * claro cuando el branding es #1cabe9.
 */
export const botonPrimario = () => ({
  background: ACENTO,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
})

export const botonNeutro = {
  background: '#fff',
  color: '#374151',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 13.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export const vacio = {
  color: GRIS_SUAVE,
  fontSize: 13,
  textAlign: 'center' as const,
  padding: '48px 20px',
}

// ── Iconos SVG (sin emojis, como el resto del OS) ───────────
//
// `path` de un <svg viewBox="0 0 24 24"> con stroke currentColor, mismo
// formato que los iconos del sidebar en admin-nav.ts.

export const ICONOS = {
  /** Tanque: cilindro con base. */
  tanque: 'M6 4h12v14a3 3 0 01-3 3H9a3 3 0 01-3-3z M6 8h12 M10 21v-3 M14 21v-3',
  /** Termometro. */
  termometro: 'M14 14.76V4a2 2 0 10-4 0v10.76a4 4 0 104 0z',
  /** Flecha a la derecha, para Avanzar. */
  avanzar: 'M5 12h14 M12 5l7 7-7 7',
  /** Descarga, para el CSV. */
  descargar: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  /** Mas, para las altas. */
  mas: 'M12 5v14 M5 12h14',
  /** Cerrar. */
  cerrar: 'M18 6L6 18 M6 6l12 12',
  /** Gota, para la gravedad. */
  gota: 'M12 2.69l5.66 5.66a8 8 0 11-11.31 0z',
} as const

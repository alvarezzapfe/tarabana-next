import { etiquetaFecha } from '../../src/lib/fechas'
import type { Rango } from '../../src/lib/metricas'

/**
 * Tokens del Inicio. Un solo lugar para que los seis paneles se vean como
 * una sola pantalla y no como seis widgets pegados.
 *
 * El color es senal, no decoracion: un unico acento para "lo cobrado / lo
 * que importa", rojo solo para lo que esta mal, y grises para todo lo demas.
 * Si todo esta de color, nada resalta.
 */

export const ACENTO = '#D95F2E'
export const ROJO = '#dc2626'

export const TINTA = '#111827'
export const TINTA_MEDIA = '#374151'
export const GRIS = '#6b7280'
export const GRIS_SUAVE = '#9ca3af'
export const BORDE = '#e5e7eb'
export const PISTA = '#f3f4f6'

export const card = {
  background: '#fff',
  border: `1px solid ${BORDE}`,
  borderRadius: 12,
  padding: '20px 22px',
} as const

export const tituloPanel = {
  margin: 0,
  color: TINTA,
  fontSize: 13.5,
  fontWeight: 600,
} as const

export const subtituloPanel = {
  margin: '3px 0 0',
  color: GRIS_SUAVE,
  fontSize: 11.5,
} as const

/** Numeros alineados en columna: imprescindible en tablas de dinero. */
export const tabular = { fontVariantNumeric: 'tabular-nums' } as const

/** Pesos redondeados. En los paneles no se muestran centavos. */
export const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

/** Pesos compactos para ejes: $12k, $1.2M. */
export function monedaCorta(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export const pctCorto = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`

/** Un rango en una linea: "1 dic 2025 – 5 nov 2026". */
export const rangoLegible = (r: Rango): string =>
  r.desde === r.hasta ? etiquetaFecha(r.desde) : `${etiquetaFecha(r.desde)} – ${etiquetaFecha(r.hasta)}`

/** Conteos: miles con separador y sin decimales. */
export const enteros = (n: number) => Math.round(n).toLocaleString('es-MX')

/** Litros compactos para ejes: 340 L, 12k L. */
export function litrosCorto(n: number): string {
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}k L`
  return `${Math.round(n)} L`
}

/** Fondo de la fila "Al dia de hoy": separa lo que NO se mueve con el periodo. */
export const FONDO_HOY = '#f9fafb'
export const VERDE = '#059669'

/**
 * El CSS responsive del Inicio.
 *
 * Va como <style> y no en los `style` de cada div porque las media queries no
 * existen en estilos inline, y el layout tiene que colapsar a una columna en
 * pantallas angostas en vez de encoger las graficas hasta que no se lean.
 */
export const CSS_DASH = `
  .dash-kpis {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
    margin-bottom: 14px;
  }
  .dash-2-1, .dash-1-1 { display: grid; gap: 14px; margin-bottom: 14px; }
  .dash-2-1 { grid-template-columns: 2fr 1fr; }
  .dash-1-1 { grid-template-columns: 1fr 1fr; }
  .dash-min { min-width: 0; }

  @media (max-width: 1080px) {
    .dash-2-1, .dash-1-1 { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .dash-kpis { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  }

  /* Nombres largos: una sola linea con ellipsis y el completo en el title. */
  .dash-elipsis {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .dash-fila-link { text-decoration: none; color: inherit; display: block; }
  .dash-fila-link:hover .dash-nombre { color: ${ACENTO}; }
  .dash-fila-link:hover { background: #fafafa; }

  /* Encabezado: titulo a la izquierda, selector de periodo a la derecha. */
  .dash-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  /* La fila "Al dia de hoy". Mismo grid que los KPIs pero sin sparkline. */
  .dash-hoy {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  }

  /* Control segmentado: metricas de la grafica, granularidad, periodos. */
  .dash-seg { display: inline-flex; background: ${PISTA}; border-radius: 8px; padding: 2px; gap: 2px; }
  .dash-seg > button {
    appearance: none;
    border: none;
    background: transparent;
    color: ${GRIS};
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 11px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: color 120ms ease, background 120ms ease;
  }
  .dash-seg > button:hover { color: ${TINTA}; }
  .dash-seg > button[aria-pressed="true"] {
    background: #fff;
    color: ${TINTA};
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(17,24,39,0.08);
  }

  /* Boton neutro de barra de herramientas (comparar, aplicar, el selector). */
  .dash-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #fff;
    border: 1px solid ${BORDE};
    border-radius: 8px;
    color: ${TINTA_MEDIA};
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .dash-btn:hover { background: #fafafa; border-color: #d1d5db; }
  .dash-btn[aria-pressed="true"] { border-color: ${ACENTO}; color: ${ACENTO}; }
  .dash-btn:focus-visible, .dash-seg > button:focus-visible {
    outline: 2px solid ${ACENTO};
    outline-offset: 1px;
  }

  /* Popover del selector de periodo. */
  .dash-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    min-width: 232px;
    background: #fff;
    border: 1px solid ${BORDE};
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(17,24,39,0.12);
    padding: 6px;
  }
  .dash-pop-op {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 7px;
    color: ${TINTA_MEDIA};
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    padding: 7px 9px;
    cursor: pointer;
  }
  .dash-pop-op:hover { background: ${PISTA}; color: ${TINTA}; }
  .dash-pop-op[aria-current="true"] { color: ${TINTA}; font-weight: 600; }

  @media (max-width: 760px) {
    .dash-pop { right: auto; left: 0; }
  }
`

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
`

/**
 * Tokens y CSS del reporte imprimible.
 *
 * Dos medios, una hoja: en pantalla se dibuja una hoja carta sobre fondo gris
 * para que lo que se ve sea lo que sale impreso, y en impresion se apaga el
 * chrome del admin y se deja solo la hoja. Si la pantalla no se pareciera al
 * papel, nadie sabria lo que va a salir antes de gastar tinta.
 *
 * El color es casi todo gris: una grafica a color se imprime como manchas
 * indistinguibles en una laser en blanco y negro. Solo el acento se usa, y
 * solo para la serie principal.
 */

export const ACENTO = '#D95F2E'

/** Escala de grises de las graficas, de la mas oscura a la mas clara. */
export const GRISES = ['#374151', '#6b7280', '#9ca3af', '#c7cbd1', '#e5e7eb']

export const TINTA = '#111827'
export const TINTA_MEDIA = '#374151'
export const GRIS = '#6b7280'
export const GRIS_SUAVE = '#9ca3af'
export const BORDE = '#d1d5db'
export const PISTA = '#eef0f2'
export const ROJO = '#b91c1c'
export const VERDE = '#047857'

/** Ancho util de una carta con margenes de 12 mm, en px a 96 dpi. */
export const ANCHO_HOJA = 700

export const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

export function monedaCorta(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export const enteros = (n: number) => Math.round(n).toLocaleString('es-MX')
export const litros = (n: number) =>
  `${n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
export const litrosCorto = (n: number) =>
  Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(1)}k L` : `${Math.round(n)} L`
export const pct = (n: number) => (n === 0 ? '0%' : `${n.toFixed(n < 10 ? 1 : 0)}%`)

/** Variacion como texto, con el guion cuando no hay base. */
export const varTexto = (v: { pct: number; dir: 'up' | 'down' } | null) =>
  v ? `${v.dir === 'up' ? '▲' : '▼'} ${v.pct}%` : '—'

export const CSS_REPORTE = `
  /* ── Pantalla: la hoja sobre el escritorio ─────────────── */

  .rep-fondo { background: #f3f4f6; margin: -36px -44px; padding: 28px 0 48px; }

  .rep-hoja {
    width: ${ANCHO_HOJA}px;
    max-width: calc(100vw - 32px);
    margin: 0 auto;
    background: #fff;
    border: 1px solid ${BORDE};
    border-radius: 2px;
    box-shadow: 0 2px 12px rgba(17,24,39,0.07);
    padding: 34px 38px 42px;
    color: ${TINTA};
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 11.5px;
    line-height: 1.45;
  }

  .rep-hoja h1, .rep-hoja h2, .rep-hoja h3, .rep-hoja p, .rep-hoja table { margin: 0 }

  /* ── Encabezado ────────────────────────────────────────── */

  .rep-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 2px solid ${TINTA};
    padding-bottom: 10px;
    margin-bottom: 22px;
  }
  .rep-marca { font-size: 17px; font-weight: 700; letter-spacing: -0.01em }
  .rep-nombre { font-size: 12.5px; font-weight: 600; color: ${TINTA_MEDIA}; margin-top: 2px }
  .rep-meta { text-align: right; font-size: 10.5px; color: ${GRIS}; font-variant-numeric: tabular-nums }

  /* ── Secciones ─────────────────────────────────────────── */

  .rep-sec { margin-bottom: 26px }
  .rep-sec-titulo {
    font-size: 13px;
    font-weight: 700;
    border-bottom: 1px solid ${BORDE};
    padding-bottom: 5px;
    margin-bottom: 14px;
  }
  .rep-sec-titulo span { color: ${GRIS_SUAVE}; font-weight: 600; margin-right: 7px }
  .rep-sub {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${TINTA_MEDIA};
    margin: 18px 0 8px;
  }
  .rep-nota { font-size: 10px; color: ${GRIS}; margin-top: 6px }

  /* ── KPIs ──────────────────────────────────────────────── */

  .rep-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px }
  .rep-kpis-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px }
  .rep-kpi {
    border: 1px solid ${BORDE};
    border-radius: 5px;
    padding: 8px 10px;
  }
  .rep-kpi-hoy { background: ${PISTA} }
  .rep-kpi dt {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: ${GRIS};
  }
  .rep-kpi dd {
    margin: 3px 0 0;
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .rep-kpi small { display: block; font-size: 9.5px; font-weight: 500; color: ${GRIS}; margin-top: 2px }

  /* ── Hallazgos ─────────────────────────────────────────── */

  .rep-hallazgos { list-style: none; padding: 0; margin: 14px 0 0 }
  .rep-hallazgos li {
    display: flex;
    gap: 8px;
    padding: 7px 10px;
    border-left: 3px solid ${GRIS_SUAVE};
    background: #fafafa;
    margin-bottom: 5px;
    font-size: 11px;
  }
  .rep-hallazgos li.bueno { border-left-color: ${VERDE} }
  .rep-hallazgos li.malo { border-left-color: ${ROJO} }

  /* ── Tablas ────────────────────────────────────────────── */

  .rep-tabla { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums }
  .rep-tabla th {
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${GRIS};
    border-bottom: 1px solid ${BORDE};
    padding: 0 6px 5px 0;
  }
  .rep-tabla td { padding: 4px 6px 4px 0; border-bottom: 1px solid ${PISTA}; font-size: 10.5px }
  .rep-tabla th.num, .rep-tabla td.num { text-align: right; padding-right: 0; white-space: nowrap }
  .rep-tabla tfoot td {
    font-weight: 700;
    border-top: 1.5px solid ${TINTA};
    border-bottom: none;
    padding-top: 6px;
  }
  .rep-tabla .nombre { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .rep-tabla tbody tr:nth-child(even) { background: #fcfcfd }

  .rep-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid ${BORDE};
    color: ${TINTA_MEDIA};
    white-space: nowrap;
  }
  .rep-badge.vencido { border-color: ${ROJO}; color: ${ROJO} }
  .rep-badge.parcial { border-color: #b45309; color: #b45309 }
  .rep-badge.pagado { border-color: ${VERDE}; color: ${VERDE} }

  .rep-grafica { margin: 10px 0 2px }
  .rep-leyenda { display: flex; flex-wrap: wrap; gap: 12px; font-size: 9.5px; color: ${GRIS}; margin-top: 4px }
  .rep-leyenda i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; margin-right: 4px; vertical-align: -1px }

  .rep-dos { display: grid; grid-template-columns: 1fr 1fr; gap: 20px }

  .rep-pie {
    border-top: 1px solid ${BORDE};
    margin-top: 26px;
    padding-top: 8px;
    font-size: 9.5px;
    color: ${GRIS_SUAVE};
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  @media (max-width: 760px) {
    .rep-fondo { margin: -36px -16px; padding: 16px 0 32px }
    .rep-hoja { padding: 20px 18px 28px }
    .rep-kpis, .rep-kpis-3, .rep-dos { grid-template-columns: repeat(2, 1fr) }
  }

  /* ── Impresion ─────────────────────────────────────────── */

  @media print {
    @page { size: letter; margin: 12mm }

    /* El chrome del admin no se imprime. \`aside\` es el sidebar del layout y
       \`main\` su contenedor: una page no puede salirse del layout de su
       segmento, asi que se apaga aqui. Los botones llevan .no-print. */
    aside, .no-print { display: none !important }
    main {
      margin-left: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      min-height: 0 !important;
    }
    html, body { background: #fff !important }

    .rep-fondo { background: #fff; margin: 0; padding: 0 }
    .rep-hoja {
      width: auto;
      max-width: none;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
      font-size: 9.6pt;
    }

    /* Sin esto el navegador tira los fondos, y los rellenos de las graficas
       salen en blanco: la mezcla apilada quedaria ilegible. */
    .rep-hoja, .rep-hoja * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Una seccion por pagina, que es como se lee un reporte: el resumen no
       debe terminar a media hoja con la tabla de clientes encima. */
    .rep-sec { break-before: page; margin-bottom: 0 }
    .rep-sec:first-of-type { break-before: auto }

    /* Nada que se lea como una unidad se parte a la mitad. */
    .rep-kpi, .rep-grafica, .rep-hallazgos li, .rep-head { break-inside: avoid }
    .rep-sub { break-inside: avoid; break-after: avoid }
    .rep-tabla tr { break-inside: avoid }
    /* Una tabla larga si se parte, pero repitiendo su encabezado en cada
       pagina; si no, la segunda hoja es una lista de numeros sin columnas. */
    .rep-tabla thead { display: table-header-group }
    .rep-tabla tfoot { display: table-row-group }
  }
`

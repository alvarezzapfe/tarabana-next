import { ACENTO, ANCHO_HOJA, GRIS, PISTA, TINTA, TINTA_MEDIA } from './reporte-ui'

/**
 * Barras horizontales del reporte, en SVG plano.
 *
 * Horizontales y no verticales porque las etiquetas son nombres largos
 * ("Barril acero 20 L", "31–60 días"): en vertical hay que girarlas o
 * abreviarlas, y en una hoja impresa no hay hover que recupere el texto
 * completo.
 *
 * La barra mas larga marca la escala. Un cero se dibuja como una marca minima
 * y no como nada, para que el renglon no parezca un error de impresion.
 */

const ALTO_FILA = 19
const ANCHO_ETIQUETA = 128
const ANCHO_VALOR = 96

type Props = {
  filas: { label: string; valor: number; nota?: string }[]
  /** Formato del valor que se escribe a la derecha. */
  formato: (n: number) => string
  color?: string
}

export default function BarrasH({ filas, formato, color = ACENTO }: Props) {
  if (filas.length === 0) return null

  const max = Math.max(0, ...filas.map(f => f.valor))
  const pista = ANCHO_HOJA - ANCHO_ETIQUETA - ANCHO_VALOR
  const alto = filas.length * ALTO_FILA

  return (
    <svg
      viewBox={`0 0 ${ANCHO_HOJA} ${alto}`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
      role="img"
      aria-label="Barras horizontales"
    >
      {filas.map((f, i) => {
        const y = i * ALTO_FILA
        const ancho = max > 0 ? (f.valor / max) * pista : 0
        return (
          <g key={f.label}>
            <text x={0} y={y + 12.5} fontSize={9.5} fill={TINTA_MEDIA}>
              {f.label}
            </text>
            <rect x={ANCHO_ETIQUETA} y={y + 4} width={pista} height={10} fill={PISTA} rx={1.5} />
            <rect
              x={ANCHO_ETIQUETA}
              y={y + 4}
              width={Math.max(f.valor > 0 ? 1.5 : 0, ancho)}
              height={10}
              fill={color}
              rx={1.5}
            />
            <text x={ANCHO_HOJA} y={y + 12.5} textAnchor="end" fontSize={9.5} fontWeight={600} fill={TINTA}>
              {formato(f.valor)}
            </text>
            {f.nota && (
              <text x={ANCHO_HOJA - ANCHO_VALOR + 6} y={y + 12.5} fontSize={8.5} fill={GRIS}>
                {f.nota}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

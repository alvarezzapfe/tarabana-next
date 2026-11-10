import { escalaEje } from '../dash-ui'
import { ANCHO_HOJA, BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA_MEDIA } from './reporte-ui'

/**
 * Grafica de columnas del reporte, en SVG plano.
 *
 * SVG y no canvas: un canvas se imprime como un bitmap de la resolucion de la
 * pantalla —borroso en papel a 600 dpi— y en algunos navegadores no se imprime
 * del todo. Un SVG lo rasteriza la impresora a su propia resolucion, y el
 * texto de los ejes sale como texto.
 *
 * Tampoco hay libreria: no hay interaccion que justificar (una hoja impresa no
 * tiene tooltips) y recharts necesita medir el contenedor en el cliente, que
 * es justo lo que una pagina pensada para imprimirse no deberia esperar.
 *
 * Las series se APILAN en el orden en que llegan, de abajo hacia arriba.
 */

export type SerieColumnas = { label: string; color: string }

const ALTO = 170
/** Espacio del eje Y a la izquierda y de las etiquetas abajo. */
const EJE_Y = 48
const EJE_X = 16
/** Lineas guia que se piden; la escala puede devolver una mas. */
const LINEAS = 4
/** Cuantas etiquetas caben en el eje X sin encimarse. */
const MAX_ETIQUETAS = 13

type Props = {
  /** Un punto por columna. `valores` lleva un numero por serie. */
  puntos: { etiqueta: string; valores: number[] }[]
  series: SerieColumnas[]
  /** Linea punteada de comparacion: un valor por columna. */
  comparacion?: { label: string; valores: number[] } | null
  /** Formato de las marcas del eje Y. */
  eje: (n: number) => string
  /**
   * Apilado al 100%: cada columna llena el alto y el eje va en porcentaje.
   * Para la mezcla de presentaciones, donde lo que importa es la proporcion.
   */
  normalizar?: boolean
  /**
   * El eje cuenta cosas enteras (pedidos, clientes), asi que su paso no puede
   * ser fraccionario: con un maximo de 2 clientes, las marcas salian
   * "0 1 1 2 2".
   */
  entero?: boolean
  alto?: number
}

export default function Columnas({ puntos, series, comparacion, eje, normalizar = false, entero = false, alto = ALTO }: Props) {
  const n = puntos.length
  if (n === 0) return null

  const suma = (vs: number[]) => vs.reduce((s, v) => s + v, 0)

  // Normalizado, cada columna se convierte a porcentajes y el techo es 100.
  // Una columna en cero se queda en cero: repartirla en partes iguales
  // dibujaria una mezcla que nadie vendio.
  const valores = normalizar
    ? puntos.map(p => {
        const t = suma(p.valores)
        return t > 0 ? p.valores.map(v => (v / t) * 100) : p.valores.map(() => 0)
      })
    : puntos.map(p => p.valores)

  const maxDatos = Math.max(0, ...valores.map(suma), ...(comparacion ? comparacion.valores : []))
  const { techo, paso, lineas } = normalizar
    ? { techo: 100, paso: 25, lineas: 4 }
    : escalaEje(maxDatos, LINEAS, entero)

  const plotAncho = ANCHO_HOJA - EJE_Y
  const plotAlto = alto - EJE_X - 4
  /** Separacion horizontal entre centros de columna. `paso` es el del eje Y. */
  const pasoX = plotAncho / n
  const anchoCol = Math.max(1.5, pasoX * 0.66)
  const centro = (i: number) => EJE_Y + pasoX * (i + 0.5)
  const y = (v: number) => 4 + plotAlto * (1 - v / techo)

  const guias = Array.from({ length: lineas + 1 }, (_, i) => paso * i)
  const pasoEtiqueta = Math.ceil(n / MAX_ETIQUETAS)

  return (
    <svg
      viewBox={`0 0 ${ANCHO_HOJA} ${alto}`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
      role="img"
      aria-label={`Columnas de ${series.map(s => s.label).join(', ')}`}
    >
      {/* Lineas guia y eje Y */}
      {guias.map((v, i) => (
        <g key={v}>
          <line
            x1={EJE_Y} x2={ANCHO_HOJA} y1={y(v)} y2={y(v)}
            stroke={i === 0 ? BORDE : PISTA} strokeWidth={i === 0 ? 1 : 0.75}
          />
          <text x={EJE_Y - 6} y={y(v) + 3} textAnchor="end" fontSize={8.5} fill={GRIS_SUAVE}>
            {normalizar ? `${Math.round(v)}%` : eje(v)}
          </text>
        </g>
      ))}

      {/* Columnas apiladas, de abajo hacia arriba */}
      {valores.map((vs, i) => {
        let acumulado = 0
        return (
          <g key={puntos[i].etiqueta + i}>
            {vs.map((v, j) => {
              if (v <= 0) return null
              const desde = acumulado
              acumulado += v
              const altoBarra = Math.max(0.6, y(desde) - y(acumulado))
              return (
                <rect
                  key={j}
                  x={centro(i) - anchoCol / 2}
                  y={y(acumulado)}
                  width={anchoCol}
                  height={altoBarra}
                  fill={series[j]?.color || GRIS}
                />
              )
            })}
          </g>
        )
      })}

      {/* La comparacion, punteada y encima de las columnas */}
      {comparacion && (
        <polyline
          points={comparacion.valores.map((v, i) => `${centro(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke={TINTA_MEDIA}
          strokeWidth={1.2}
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
      )}

      {/* Eje X */}
      {puntos.map((p, i) =>
        i % pasoEtiqueta === 0 || i === n - 1 ? (
          <text
            key={p.etiqueta + i}
            x={centro(i)}
            y={alto - 4}
            textAnchor="middle"
            fontSize={8.5}
            fill={GRIS}
          >
            {p.etiqueta}
          </text>
        ) : null
      )}
    </svg>
  )
}

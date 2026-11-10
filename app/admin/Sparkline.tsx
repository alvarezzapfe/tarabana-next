import { ACENTO } from './dash-ui'

/**
 * Sparkline de un KPI: la forma del periodo, sin ejes ni numeros.
 *
 * La base es CERO, no el minimo de la serie. Escalar entre min y max es lo que
 * hace que una variacion de 2% se vea como un acantilado, y en una tarjeta que
 * ya trae el % al lado eso solo desinforma.
 *
 * Los `null` cortan la linea en vez de dibujarse como cero: el "% cobrado" de
 * un mes que no facturo no es 0%, es que no hay dato. Unir los extremos de un
 * hueco inventaria una pendiente que nadie midio.
 *
 * SVG estirado (`preserveAspectRatio="none"`) para que ocupe el ancho de la
 * tarjeta sea el que sea; el trazo se mantiene de 1.5px con
 * `vectorEffect="non-scaling-stroke"`, que es justo lo que el estiramiento
 * deformaria.
 *
 * Por lo mismo no lleva un punto en el ultimo valor: un `<circle>` dentro de
 * un viewBox estirado sale ovalado, y la correccion no vale la pena para un
 * adorno de 26px de alto.
 */

const ALTO = 26
const ANCHO = 100
/** Aire arriba y abajo para que el trazo no se corte en los extremos. */
const AIRE = 1.5

type Props = {
  /** Un valor por bucket del periodo. `null` = ese bucket no tiene dato. */
  puntos: (number | null)[]
  color?: string
}

export default function Sparkline({ puntos, color = ACENTO }: Props) {
  const validos = puntos.filter((v): v is number => v !== null && Number.isFinite(v))

  // Sin datos se reserva el espacio igual: si la tarjeta se encoge, la fila de
  // KPIs queda con alturas distintas.
  if (validos.length === 0) return <div style={{ height: ALTO }} aria-hidden />

  const max = Math.max(...validos)
  const min = Math.min(0, ...validos)
  const rango = max - min

  const x = (i: number) => (puntos.length < 2 ? ANCHO / 2 : (i / (puntos.length - 1)) * ANCHO)
  // Serie plana (todo en cero, por ejemplo): la linea va al piso.
  const y = (v: number) => (rango === 0 ? ALTO - AIRE : ALTO - AIRE - ((v - min) / rango) * (ALTO - AIRE * 2))

  /** Tramos continuos: cada hueco de `null` abre uno nuevo. */
  const tramos: { i: number; v: number }[][] = []
  let actual: { i: number; v: number }[] = []
  puntos.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (actual.length) tramos.push(actual)
      actual = []
    } else {
      actual.push({ i, v })
    }
  })
  if (actual.length) tramos.push(actual)

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      width="100%"
      height={ALTO}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
      focusable="false"
    >
      {tramos.map(tramo => {
        const linea = tramo.map(p => `${x(p.i)},${y(p.v)}`).join(' ')
        const base = ALTO - AIRE
        return (
          <g key={tramo[0].i}>
            {tramo.length > 1 && (
              <polygon
                points={`${x(tramo[0].i)},${base} ${linea} ${x(tramo[tramo.length - 1].i)},${base}`}
                fill={color}
                opacity={0.1}
              />
            )}
            <polyline
              points={linea}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </svg>
  )
}

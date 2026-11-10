import Sparkline from './Sparkline'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, ROJO, VERDE } from './dash-ui'
import type { Variacion } from '../../src/lib/metricas'

/**
 * Tarjeta de KPI neutra: fondo blanco, borde gris y el numero grande.
 *
 * El color se reserva para senal, no para decorar. Antes cada tarjeta tenia
 * su propio fondo pastel (azul, verde, ambar, violeta, rosa), lo que hacia
 * que seis numeros compitieran entre si y que el color no significara nada.
 * Aqui solo se tinta cuando hay algo que mirar: `senal="alerta"` y la
 * variacion.
 */

export type Senal = 'neutral' | 'alerta'

/**
 * Tinte del numero cuando el dato en si es la alarma.
 *
 * Distinto de `senal`: 'alerta' es ambar y marca "esto hay que vigilarlo"
 * siempre (Por cobrar lo lleva aunque este en cero); 'rojo' lo pone quien
 * llama solo cuando el valor lo amerita, para que un $0 no salga en rojo y
 * entrene a ignorar el color.
 */
export type Tono = 'rojo'

type Props = {
  label: string
  /** Valor ya formateado. */
  valor: string
  /**
   * Variacion contra el periodo de comparacion. `null` o ausente no pinta
   * nada, salvo con `mostrarSinBase`.
   */
  variacion?: Variacion | null
  /** Base de la comparacion, p.ej. "vs periodo anterior". */
  nota?: string
  /**
   * Unidad de la variacion. '%' por default.
   *
   * Existe por el KPI de "% cobrado": la variacion RELATIVA de un porcentaje
   * es una trampa de lectura — de 40% a 50% es "+25%", y quien lo lee entiende
   * 65%. Ese KPI pasa la diferencia en puntos y 'pp' como sufijo.
   */
  sufijoVariacion?: string
  /**
   * Con una comparacion declarada pero sin base (el periodo anterior fue
   * cero), muestra "—" en vez de callarse.
   *
   * Es opt-in para que las pantallas que solo comparan cuando hay con que
   * (el Inicio del vendedor) no se llenen de guiones.
   */
  mostrarSinBase?: boolean
  senal?: Senal
  tono?: Tono
  /** true si un aumento es malo (por cobrar, vencido). */
  subirEsMalo?: boolean
  /** Leyenda siempre visible bajo el numero, independiente de la variacion. */
  detalle?: string
  /** Un valor por bucket del periodo. `null` donde no hay dato. */
  sparkline?: (number | null)[]
  /** Fondo distinto, para separar visualmente una fila de tarjetas. */
  fondo?: string
}

export default function KpiCard({
  label, valor, variacion, nota, sufijoVariacion = '%', mostrarSinBase = false,
  senal = 'neutral', tono, subirEsMalo = false, detalle, sparkline, fondo,
}: Props) {
  const esBueno = variacion ? (variacion.dir === 'up') !== subirEsMalo : false
  const colorValor = tono === 'rojo' ? ROJO : senal === 'alerta' ? '#b45309' : '#1a1a1a'
  const sinBase = !variacion && mostrarSinBase

  return (
    <div
      style={{
        background: fondo || '#fff',
        border: `1px solid ${BORDE}`,
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <p
        style={{
          margin: 0,
          color: GRIS,
          fontSize: 11.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        {label}
      </p>

      <p
        style={{
          margin: 0,
          color: colorValor,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </p>

      {detalle && (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.4 }}>{detalle}</p>
      )}

      {(variacion || sinBase) && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12 }}>
          {variacion ? (
            <span style={{ color: esBueno ? VERDE : ROJO, fontWeight: 600 }}>
              {variacion.dir === 'up' ? '↑' : '↓'} {variacion.pct}{sufijoVariacion}
            </span>
          ) : (
            // Sin base no hay porcentaje. Un "0%" o un "+100%" aqui serian
            // numeros inventados.
            <span style={{ color: GRIS_SUAVE, fontWeight: 600 }} title="sin base de comparación">—</span>
          )}
          {nota && <span style={{ color: GRIS_SUAVE }}>{nota}</span>}
        </p>
      )}

      {sparkline && sparkline.length > 1 && (
        <div style={{ marginTop: 'auto', paddingTop: 4 }}>
          <Sparkline puntos={sparkline} color={tono === 'rojo' ? ROJO : senal === 'alerta' ? '#b45309' : ACENTO} />
        </div>
      )}
    </div>
  )
}

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

type Props = {
  label: string
  /** Valor ya formateado. */
  valor: string
  /**
   * Variacion contra el mes anterior. `null` o ausente no pinta nada: no se
   * muestra un guion ni un 0%, porque no hay dato que mostrar.
   */
  variacion?: Variacion | null
  /** Base de la comparacion, p.ej. "vs mes anterior". Solo si hay variacion. */
  nota?: string
  senal?: Senal
  /** true si un aumento es malo (por cobrar, vencido). */
  subirEsMalo?: boolean
  /** Leyenda siempre visible bajo el numero, independiente de la variacion. */
  detalle?: string
}

export default function KpiCard({ label, valor, variacion, nota, senal = 'neutral', subirEsMalo = false, detalle }: Props) {
  const esBueno = variacion ? (variacion.dir === 'up') !== subirEsMalo : false
  const colorValor = senal === 'alerta' ? '#b45309' : '#1a1a1a'

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
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
          color: '#6b7280',
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
        <p style={{ margin: 0, color: '#9ca3af', fontSize: 11.5, lineHeight: 1.4 }}>{detalle}</p>
      )}

      {variacion && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12 }}>
          <span style={{ color: esBueno ? '#059669' : '#dc2626', fontWeight: 600 }}>
            {variacion.dir === 'up' ? '↑' : '↓'} {variacion.pct}%
          </span>
          {nota && <span style={{ color: '#9ca3af' }}>{nota}</span>}
        </p>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import type { BucketCartera } from '../../src/lib/metricas'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA, moneda, tabular } from './dash-ui'

/**
 * Antiguedad de la cartera por dias de atraso.
 *
 * La barra segmentada de arriba da la proporcion de un vistazo; la lista de
 * abajo da el monto y el numero de pedidos de cada tramo, que es lo que se
 * necesita para actuar.
 *
 * El color va de acento a rojo conforme envejece el saldo: el tramo al
 * corriente queda en gris porque no es un problema, y el 90+ en rojo porque
 * si lo es. No es una escala decorativa, es la lectura del panel.
 */

const COLORES: Record<string, string> = {
  corriente: '#d1d5db',
  '1-30': '#f3c4ae',
  '31-60': '#eb9b74',
  '61-90': ACENTO,
  '90+': ROJO,
}

type Props = { buckets: BucketCartera[] }

export default function AntiguedadCartera({ buckets }: Props) {
  const [activo, setActivo] = useState<string | null>(null)

  const total = buckets.reduce((s, b) => s + b.monto, 0)
  const pedidos = buckets.reduce((s, b) => s + b.pedidos, 0)

  if (total <= 0) {
    return (
      <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13, textAlign: 'center' }}>
        No hay saldo por cobrar
      </div>
    )
  }

  const vencido = buckets.filter(b => b.clave !== 'corriente').reduce((s, b) => s + b.monto, 0)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ ...tabular, margin: 0, color: TINTA, fontSize: 21, fontWeight: 700 }}>{moneda(total)}</p>
        <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 12 }}>
          por cobrar en {pedidos} {pedidos === 1 ? 'pedido' : 'pedidos'}
          {vencido > 0 && <> · <span style={{ color: ROJO, fontWeight: 600 }}>{moneda(vencido)} vencido</span></>}
        </p>
      </div>

      {/* Barra segmentada */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: PISTA, marginBottom: 18 }}>
        {buckets.map(b =>
          b.monto > 0 ? (
            <div
              key={b.clave}
              title={`${b.etiqueta}: ${moneda(b.monto)}`}
              onMouseEnter={() => setActivo(b.clave)}
              onMouseLeave={() => setActivo(null)}
              style={{
                width: `${(b.monto / total) * 100}%`,
                background: COLORES[b.clave] || GRIS_SUAVE,
                opacity: activo === null || activo === b.clave ? 1 : 0.45,
                transition: 'opacity .12s',
                cursor: 'default',
              }}
            />
          ) : null
        )}
      </div>

      {/* Detalle por tramo */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {buckets.map(b => {
          const pct = total > 0 ? (b.monto / total) * 100 : 0
          const apagado = b.monto <= 0
          return (
            <div
              key={b.clave}
              onMouseEnter={() => setActivo(b.clave)}
              onMouseLeave={() => setActivo(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 0',
                borderTop: `1px solid ${PISTA}`,
                opacity: apagado ? 0.45 : 1,
                background: activo === b.clave ? '#fafafa' : 'transparent',
              }}
            >
              <i
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORES[b.clave] || GRIS_SUAVE,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: TINTA_MEDIA, fontSize: 12.5, flex: 1, minWidth: 0 }}>{b.etiqueta}</span>
              <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 11.5, width: 58, textAlign: 'right' }}>
                {b.pedidos} {b.pedidos === 1 ? 'pedido' : 'pedidos'}
              </span>
              <span style={{ ...tabular, color: TINTA, fontSize: 12.5, fontWeight: 600, width: 84, textAlign: 'right' }}>
                {moneda(b.monto)}
              </span>
              <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 11, width: 36, textAlign: 'right' }}>
                {apagado ? '—' : `${Math.round(pct)}%`}
              </span>
            </div>
          )
        })}
      </div>

      <p style={{ margin: '14px 0 0', paddingTop: 12, borderTop: `1px solid ${BORDE}`, color: GRIS_SUAVE, fontSize: 11 }}>
        Días contados sobre la fecha de vencimiento de cada pedido.
      </p>
    </div>
  )
}

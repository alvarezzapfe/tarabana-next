'use client'
import { useMemo, useState } from 'react'
import type { MesFacturado } from '../../src/lib/metricas'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, moneda, monedaCorta, pctCorto, tabular } from './dash-ui'

/**
 * Facturado vs cobrado por mes, en barras apiladas.
 *
 * Hecho con divs y no con recharts a proposito: con 12 meses, recharts encima
 * las etiquetas del eje X unas sobre otras y la unica salida es saltarse
 * meses (`interval`), que es justo lo que no se quiere en una serie mensual.
 * Aqui cada mes es una columna flex, asi que las etiquetas se reparten el
 * ancho disponible y nunca se traslapan.
 *
 * Las dos barras apiladas suman el facturado del mes: abajo el cobrado, en el
 * acento, y arriba lo que falta por cobrar, en gris. Leer la torre completa da
 * lo facturado y la parte naranja, lo que ya entro.
 */

const ALTO_PLOT = 230
const LINEAS = 4

type Props = { serie: MesFacturado[] }

export default function FacturadoCobradoChart({ serie }: Props) {
  const [activo, setActivo] = useState<number | null>(null)

  const max = useMemo(() => Math.max(0, ...serie.map(m => m.facturado)), [serie])

  const totales = useMemo(() => {
    const facturado = serie.reduce((s, m) => s + m.facturado, 0)
    const cobrado = serie.reduce((s, m) => s + m.cobrado, 0)
    return { facturado, cobrado, pct: facturado > 0 ? (cobrado / facturado) * 100 : null }
  }, [serie])

  if (max <= 0) {
    return (
      <div style={{ height: ALTO_PLOT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
        Sin facturación en los últimos 12 meses
      </div>
    )
  }

  // Techo redondeado hacia arriba para que las lineas guia caigan en numeros
  // legibles en vez de en el maximo exacto de los datos.
  const paso = Math.pow(10, Math.floor(Math.log10(max / LINEAS)))
  const techo = Math.ceil(max / (paso * LINEAS)) * paso * LINEAS || max
  const guias = Array.from({ length: LINEAS + 1 }, (_, i) => (techo / LINEAS) * i)

  return (
    <div>
      {/* Resumen y leyenda */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <span style={{ ...tabular, color: TINTA, fontSize: 21, fontWeight: 700 }}>
          {moneda(totales.facturado)}
        </span>
        <span style={{ color: GRIS, fontSize: 12.5 }}>
          facturado · {moneda(totales.cobrado)} cobrado
          {totales.pct !== null && ` (${pctCorto(totales.pct)})`}
        </span>
        <span style={{ display: 'flex', gap: 14, marginLeft: 'auto', fontSize: 11.5, color: GRIS }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: ACENTO, display: 'inline-block' }} />
            Cobrado
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: BORDE, display: 'inline-block' }} />
            Por cobrar
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {/* Eje Y */}
        <div
          style={{
            ...tabular,
            height: ALTO_PLOT,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 10.5,
            color: GRIS_SUAVE,
            flexShrink: 0,
          }}
        >
          {[...guias].reverse().map(v => <span key={v}>{monedaCorta(v)}</span>)}
        </div>

        {/* Plot */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative', height: ALTO_PLOT }}>
            {/* Lineas guia, detras de las barras */}
            {guias.map((v, i) => (
              <div
                key={v}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${(i / LINEAS) * 100}%`,
                  borderTop: `1px solid ${i === 0 ? BORDE : PISTA}`,
                }}
              />
            ))}

            {/* Barras */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '2%' }}>
              {serie.map((m, i) => {
                const hCobrado = (m.cobrado / techo) * ALTO_PLOT
                const hPendiente = (m.pendiente / techo) * ALTO_PLOT
                const vacio = m.facturado <= 0
                const esActivo = activo === i
                return (
                  <div
                    key={m.mes}
                    onMouseEnter={() => setActivo(i)}
                    onMouseLeave={() => setActivo(null)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      cursor: vacio ? 'default' : 'pointer',
                      // La columna completa es el area sensible, no solo la barra:
                      // asi un mes de $0 tambien responde al hover.
                      background: esActivo ? 'rgba(17,24,39,0.03)' : 'transparent',
                      borderRadius: 4,
                    }}
                  >
                    {hPendiente > 0 && (
                      <div
                        style={{
                          height: Math.max(2, hPendiente),
                          background: BORDE,
                          borderRadius: '3px 3px 0 0',
                          opacity: activo === null || esActivo ? 1 : 0.5,
                          transition: 'opacity .12s',
                        }}
                      />
                    )}
                    {hCobrado > 0 && (
                      <div
                        style={{
                          height: Math.max(2, hCobrado),
                          background: ACENTO,
                          borderRadius: hPendiente > 0 ? 0 : '3px 3px 0 0',
                          opacity: activo === null || esActivo ? 1 : 0.5,
                          transition: 'opacity .12s',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tooltip. Se ancla al centro de la columna y se corre hacia
                dentro en los extremos para no salirse de la tarjeta. */}
            {activo !== null && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: `${((activo + 0.5) / serie.length) * 100}%`,
                  transform: `translateX(${activo < 2 ? '-10%' : activo > serie.length - 3 ? '-90%' : '-50%'})`,
                  marginBottom: 8,
                  background: '#fff',
                  border: `1px solid ${BORDE}`,
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(17,24,39,0.08)',
                  padding: '9px 12px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                <p style={{ margin: '0 0 6px', color: TINTA, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                  {serie[activo].mes}
                </p>
                {[
                  { k: 'Facturado', v: moneda(serie[activo].facturado), c: TINTA },
                  { k: 'Cobrado', v: moneda(serie[activo].cobrado), c: ACENTO },
                  { k: 'Por cobrar', v: moneda(serie[activo].pendiente), c: GRIS },
                ].map(r => (
                  <p key={r.k} style={{ margin: 0, display: 'flex', gap: 14, fontSize: 11.5, lineHeight: 1.65 }}>
                    <span style={{ color: GRIS, minWidth: 62 }}>{r.k}</span>
                    <span style={{ ...tabular, color: r.c, fontWeight: 600, marginLeft: 'auto' }}>{r.v}</span>
                  </p>
                ))}
                <p style={{ margin: '5px 0 0', paddingTop: 5, borderTop: `1px solid ${PISTA}`, display: 'flex', gap: 14, fontSize: 11.5 }}>
                  <span style={{ color: GRIS, minWidth: 62 }}>Cobrado</span>
                  <span style={{ ...tabular, color: TINTA, fontWeight: 600, marginLeft: 'auto' }}>
                    {serie[activo].pct === null ? '—' : pctCorto(serie[activo].pct)}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Eje X */}
          <div style={{ display: 'flex', gap: '2%', marginTop: 7 }}>
            {serie.map((m, i) => (
              <span
                key={m.mes}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'center',
                  fontSize: 10,
                  color: activo === i ? TINTA : GRIS_SUAVE,
                  fontWeight: activo === i ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.mes}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

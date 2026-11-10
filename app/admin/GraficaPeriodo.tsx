'use client'
import { useMemo, useState } from 'react'
import {
  GRANULARIDADES,
  METRICAS,
  bucketAnoAnterior,
  bucketsDe,
  granularidadAuto,
  granularidadEfectiva,
  granularidadesPosibles,
  rangoAnoAnterior,
  serieDePeriodo,
  valorDe,
  variacion,
  type DatosPeriodo,
  type Granularidad,
  type Metrica,
  type PuntoSerie,
  type Rango,
} from '../../src/lib/metricas'
import { formatLitros } from '../../src/lib/unidades'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA,
  enteros, escalaEje, litrosCorto, moneda, monedaCorta, pctCorto, rangoLegible, tabular,
} from './dash-ui'

/**
 * La grafica principal del Inicio.
 *
 * Hecha con divs y no con recharts por lo mismo que la version anterior: con
 * una serie larga, recharts encima las etiquetas del eje X y la unica salida
 * es saltarse tramos (`interval`), que es justo lo que no se quiere. Aqui cada
 * tramo es una columna flex y las etiquetas se reparten el ancho; las que no
 * caben se omiten a proposito y con un paso fijo, no al azar.
 *
 * Decide sola su granularidad por el largo del periodo (dia / semana / mes) y
 * deja cambiarla a mano, pero solo entre las que caben: 12 meses por dia
 * serian 340 barras de 2px, y ofrecerlo seria ofrecer una pantalla ilegible.
 *
 * La comparacion contra el anio anterior se calcula bucket a bucket (ver
 * `bucketAnoAnterior`), no reescalando otra serie: asi noviembre se compara
 * contra noviembre aunque los dos anios partan los meses en distinta cantidad
 * de semanas.
 */

const ALTO_PLOT = 230
/** Lineas guia que se piden; la escala puede devolver una mas. */
const LINEAS = 4
/** Cuantas etiquetas de eje X caben sin traslaparse. */
const MAX_ETIQUETAS = 13

type Formato = { eje: (n: number) => string; pleno: (n: number) => string; unidad: string }

const FORMATO: Record<Metrica, Formato> = {
  facturado: { eje: monedaCorta, pleno: moneda, unidad: 'facturado' },
  cobrado: { eje: monedaCorta, pleno: moneda, unidad: 'cobrado' },
  litros: { eje: litrosCorto, pleno: formatLitros, unidad: 'vendidos' },
  pedidos: { eje: enteros, pleno: enteros, unidad: 'pedidos' },
}

type Props = {
  datos: DatosPeriodo
  rango: Rango
}

export default function GraficaPeriodo({ datos, rango }: Props) {
  const [metrica, setMetrica] = useState<Metrica>('facturado')
  const [granOverride, setGranOverride] = useState<Granularidad | null>(null)
  const [comparar, setComparar] = useState(false)
  const [activo, setActivo] = useState<number | null>(null)

  const posibles = useMemo(() => granularidadesPosibles(rango), [rango])
  const gran = granularidadEfectiva(rango, granOverride)
  const auto = granularidadAuto(rango)

  const buckets = useMemo(() => bucketsDe(rango, gran), [rango, gran])
  const serie = useMemo(() => serieDePeriodo(datos, buckets), [datos, buckets])
  const previa = useMemo(
    () => (comparar ? serieDePeriodo(datos, buckets.map(bucketAnoAnterior)) : null),
    [comparar, datos, buckets]
  )

  const fmt = FORMATO[metrica]
  const apilada = metrica === 'facturado'

  const totales = useMemo(() => {
    const suma = (s: PuntoSerie[]) => s.reduce((a, p) => a + valorDe(p, metrica), 0)
    const actualTotal = suma(serie)
    const previoTotal = previa ? suma(previa) : null
    return {
      actual: actualTotal,
      previo: previoTotal,
      cobradoCohorte: serie.reduce((a, p) => a + p.cobradoCohorte, 0),
      facturado: serie.reduce((a, p) => a + p.facturado, 0),
      var: previoTotal === null ? null : variacion(actualTotal, previoTotal),
    }
  }, [serie, previa, metrica])

  // El techo considera las dos series: si la del anio anterior fue mayor, su
  // linea se saldria del area de dibujo.
  const max = Math.max(
    0,
    ...serie.map(p => valorDe(p, metrica)),
    ...(previa ? previa.map(p => valorDe(p, metrica)) : [])
  )

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      <div className="dash-seg" role="group" aria-label="Métrica">
        {METRICAS.map(m => (
          <button
            key={m.clave}
            type="button"
            aria-pressed={m.clave === metrica}
            onClick={() => { setMetrica(m.clave); setActivo(null) }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {/* La granularidad automatica se puede pisar, pero solo con las que
            caben en el rango. 'Auto' vuelve a dejar que la decida el largo. */}
        {posibles.length > 1 && (
          <div className="dash-seg" role="group" aria-label="Granularidad">
            <button
              type="button"
              aria-pressed={granOverride === null}
              onClick={() => { setGranOverride(null); setActivo(null) }}
              title={`Automática: por ${GRANULARIDADES.find(g => g.clave === auto)?.label.toLowerCase()}`}
            >
              Auto
            </button>
            {GRANULARIDADES.filter(g => posibles.includes(g.clave)).map(g => (
              <button
                key={g.clave}
                type="button"
                aria-pressed={granOverride === g.clave}
                onClick={() => { setGranOverride(g.clave); setActivo(null) }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="dash-btn"
          aria-pressed={comparar}
          onClick={() => setComparar(v => !v)}
          title={`Compara contra ${rangoLegible(rangoAnoAnterior(rango))}`}
        >
          <svg width="16" height="8" aria-hidden>
            <line x1="0" y1="4" x2="16" y2="4" stroke={comparar ? ACENTO : GRIS_SUAVE} strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          Año anterior
        </button>
      </div>
    </div>
  )

  if (max <= 0) {
    return (
      <div>
        {toolbar}
        <div style={{ height: ALTO_PLOT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
          Sin {metrica === 'pedidos' ? 'pedidos' : metrica === 'litros' ? 'volumen' : fmt.unidad} en el periodo
        </div>
      </div>
    )
  }

  // Las marcas del eje caen en numeros redondos. `Pedidos` pide paso entero:
  // con un maximo de 2 pedidos, un paso de 0.5 pintaba "0 1 1 2 2". El numero
  // de lineas lo decide la escala, no al reves (ver escalaEje).
  const { techo, paso, lineas } = escalaEje(max, LINEAS, metrica === 'pedidos')
  const guias = Array.from({ length: lineas + 1 }, (_, i) => paso * i)

  const n = serie.length
  const pasoEtiqueta = Math.ceil(n / MAX_ETIQUETAS)
  const alto = (v: number) => (v / techo) * ALTO_PLOT

  /**
   * El hueco entre columnas, como FRACCION del ancho del plot.
   *
   * En fraccion y no en pixeles porque la linea del anio anterior es un SVG
   * estirado: no conoce el ancho real, pero si las proporciones, y con eso
   * puede caer exactamente en el centro de cada barra. Con el hueco en px la
   * linea quedaba corrida hasta medio hueco en los extremos — unos 6px con 12
   * meses, suficiente para que se viera "entre" barras.
   *
   * Se encoge con el numero de tramos para que los huecos nunca se coman mas
   * de un cuarto del ancho: con 120 barras, un 2% cada una no cabria.
   */
  const hueco = Math.min(0.02, 0.25 / Math.max(1, n - 1))
  const anchoCol = (1 - hueco * (n - 1)) / n
  /** Centro de la columna `i`, en fraccion del ancho del plot. */
  const centro = (i: number) => i * (anchoCol + hueco) + anchoCol / 2
  const gap = `${(hueco * 100).toFixed(4)}%`

  return (
    <div>
      {toolbar}

      {/* Resumen y leyenda */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <span style={{ ...tabular, color: TINTA, fontSize: 21, fontWeight: 700 }}>
          {fmt.pleno(totales.actual)}
        </span>
        <span style={{ color: GRIS, fontSize: 12.5 }}>
          {apilada ? (
            <>
              facturado · {moneda(totales.cobradoCohorte)} cobrado
              {totales.facturado > 0 && ` (${pctCorto((totales.cobradoCohorte / totales.facturado) * 100)})`}
            </>
          ) : (
            fmt.unidad
          )}
        </span>

        {previa && (
          <span style={{ ...tabular, color: GRIS, fontSize: 12 }}>
            vs {fmt.pleno(totales.previo || 0)} un año antes
            {totales.var && (
              <span style={{ color: totales.var.dir === 'up' ? '#059669' : '#dc2626', fontWeight: 600 }}>
                {' '}{totales.var.dir === 'up' ? '↑' : '↓'} {totales.var.pct}%
              </span>
            )}
          </span>
        )}

        <span style={{ display: 'flex', gap: 14, marginLeft: 'auto', fontSize: 11.5, color: GRIS, flexWrap: 'wrap' }}>
          {apilada ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <i style={{ width: 9, height: 9, borderRadius: 2, background: ACENTO, display: 'inline-block' }} />
                Cobrado
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <i style={{ width: 9, height: 9, borderRadius: 2, background: BORDE, display: 'inline-block' }} />
                Por cobrar
              </span>
            </>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: ACENTO, display: 'inline-block' }} />
              {METRICAS.find(m => m.clave === metrica)?.label}
            </span>
          )}
          {previa && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="16" height="8" aria-hidden>
                <line x1="0" y1="4" x2="16" y2="4" stroke={TINTA_MEDIA} strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              Año anterior
            </span>
          )}
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
          {[...guias].reverse().map(v => <span key={v}>{fmt.eje(v)}</span>)}
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
                  bottom: `${(i / lineas) * 100}%`,
                  borderTop: `1px solid ${i === 0 ? BORDE : PISTA}`,
                }}
              />
            ))}

            {/* Barras */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap }}>
              {serie.map((p, i) => {
                const esActivo = activo === i
                const atenuado = activo !== null && !esActivo
                const partes = apilada
                  ? [
                      { h: alto(p.pendiente), color: BORDE, arriba: true },
                      { h: alto(p.cobradoCohorte), color: ACENTO, arriba: p.pendiente <= 0 },
                    ]
                  : [{ h: alto(valorDe(p, metrica)), color: ACENTO, arriba: true }]

                return (
                  <div
                    key={p.clave}
                    onMouseEnter={() => setActivo(i)}
                    onMouseLeave={() => setActivo(null)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      // La columna completa es el area sensible, no solo la
                      // barra: asi un tramo en cero tambien responde al hover.
                      background: esActivo ? 'rgba(17,24,39,0.03)' : 'transparent',
                      borderRadius: 4,
                    }}
                  >
                    {partes.map((parte, j) =>
                      parte.h > 0 ? (
                        <div
                          key={j}
                          style={{
                            height: Math.max(2, parte.h),
                            background: parte.color,
                            borderRadius: parte.arriba ? '3px 3px 0 0' : 0,
                            opacity: atenuado ? 0.5 : 1,
                            transition: 'opacity .12s',
                          }}
                        />
                      ) : null
                    )}
                  </div>
                )
              })}
            </div>

            {/* La linea del anio anterior, encima de las barras.
                `vectorEffect` mantiene el grosor y el punteado parejos aunque
                el viewBox se estire al ancho real. */}
            {previa && (
              <svg
                viewBox={`0 0 1 ${ALTO_PLOT}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
                aria-hidden
              >
                <polyline
                  points={previa.map((p, i) => `${centro(i)},${ALTO_PLOT - alto(valorDe(p, metrica))}`).join(' ')}
                  fill="none"
                  stroke={TINTA_MEDIA}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            {/* Tooltip. Se ancla al centro de la columna y se corre hacia
                dentro en los extremos para no salirse de la tarjeta. */}
            {activo !== null && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: `${centro(activo) * 100}%`,
                  transform: `translateX(${activo < n * 0.2 ? '-10%' : activo > n * 0.8 ? '-90%' : '-50%'})`,
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
                  {serie[activo].rotulo}
                </p>

                {(apilada
                  ? [
                      { k: 'Facturado', v: moneda(serie[activo].facturado), c: TINTA },
                      { k: 'Cobrado', v: moneda(serie[activo].cobradoCohorte), c: ACENTO },
                      { k: 'Por cobrar', v: moneda(serie[activo].pendiente), c: GRIS },
                    ]
                  : [
                      {
                        k: METRICAS.find(m => m.clave === metrica)!.label,
                        v: fmt.pleno(valorDe(serie[activo], metrica)),
                        c: TINTA,
                      },
                    ]
                ).map(r => (
                  <p key={r.k} style={{ margin: 0, display: 'flex', gap: 14, fontSize: 11.5, lineHeight: 1.65 }}>
                    <span style={{ color: GRIS, minWidth: 68 }}>{r.k}</span>
                    <span style={{ ...tabular, color: r.c, fontWeight: 600, marginLeft: 'auto' }}>{r.v}</span>
                  </p>
                ))}

                {apilada && (
                  <p style={{ margin: 0, display: 'flex', gap: 14, fontSize: 11.5, lineHeight: 1.65 }}>
                    <span style={{ color: GRIS, minWidth: 68 }}>% cobrado</span>
                    <span style={{ ...tabular, color: TINTA, fontWeight: 600, marginLeft: 'auto' }}>
                      {serie[activo].pct === null ? '—' : pctCorto(serie[activo].pct)}
                    </span>
                  </p>
                )}

                {/* La comparacion, con su propio rotulo: el tramo del anio
                    anterior no siempre cae en las mismas fechas. */}
                {previa && (
                  <div style={{ marginTop: 5, paddingTop: 5, borderTop: `1px solid ${PISTA}` }}>
                    <p style={{ margin: 0, display: 'flex', gap: 14, fontSize: 11.5, lineHeight: 1.65 }}>
                      <span style={{ color: GRIS, minWidth: 68 }}>{previa[activo].rotulo}</span>
                      <span style={{ ...tabular, color: TINTA_MEDIA, fontWeight: 600, marginLeft: 'auto' }}>
                        {fmt.pleno(valorDe(previa[activo], metrica))}
                      </span>
                    </p>
                    <p style={{ margin: 0, display: 'flex', gap: 14, fontSize: 11.5, lineHeight: 1.65 }}>
                      <span style={{ color: GRIS, minWidth: 68 }}>Variación</span>
                      {(() => {
                        const v = variacion(valorDe(serie[activo], metrica), valorDe(previa[activo], metrica))
                        return (
                          <span
                            style={{
                              ...tabular,
                              marginLeft: 'auto',
                              fontWeight: 600,
                              color: v ? (v.dir === 'up' ? '#059669' : '#dc2626') : GRIS_SUAVE,
                            }}
                            title={v ? undefined : 'sin base de comparación'}
                          >
                            {v ? `${v.dir === 'up' ? '↑' : '↓'} ${v.pct}%` : '—'}
                          </span>
                        )
                      })()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Eje X. Con muchos tramos se omiten etiquetas con un paso fijo: el
              ultimo siempre se pinta, porque es "donde estamos". */}
          <div style={{ display: 'flex', gap, marginTop: 7 }}>
            {serie.map((p, i) => {
              const visible = i % pasoEtiqueta === 0 || i === n - 1
              return (
                <span
                  key={p.clave}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'center',
                    fontSize: 10,
                    color: activo === i ? TINTA : GRIS_SUAVE,
                    fontWeight: activo === i ? 600 : 400,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {visible || activo === i ? p.etiqueta : ''}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

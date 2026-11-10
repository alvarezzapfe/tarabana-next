'use client'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import KpiCard from './KpiCard'
import GraficaPeriodo from './GraficaPeriodo'
import SelectorPeriodo from './SelectorPeriodo'
import AntiguedadCartera from './AntiguedadCartera'
import RequiereAtencion from './RequiereAtencion'
import { formatLitros, litrosTotales, topProductosEnLitros, type FilaStock } from '../../src/lib/unidades'
import {
  DIAS_ATENCION,
  antiguedadCartera,
  bucketsDe,
  filasEnRango,
  granularidadEfectiva,
  itemsVendidosEn,
  nombreLegible,
  porCobrarDe,
  queryPeriodo,
  rangoAnterior,
  rangoDePeriodo,
  requierenAtencion,
  resolverPeriodo,
  resumenDePeriodo,
  serieDePeriodo,
  topClientes,
  variacion,
  vencidoDe,
  type ClavePeriodo,
  type DatosCliente,
  type DatosPeriodo,
  type FilaSaldo,
  type PagoFila,
  type PedidoConItems,
  type Rango,
} from '../../src/lib/metricas'
import {
  ACENTO, BORDE, CSS_DASH, FONDO_HOY, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  card, enteros, moneda, pctCorto, rangoLegible, subtituloPanel, tabular, tituloPanel,
} from './dash-ui'

/**
 * Inicio del staff.
 *
 * Fuente unica de los montos: `pedidos_saldo`. Ninguno se recalcula sobre
 * `pedidos.total`, que es el importe BRUTO antes de descuento y envio (ver
 * docs/SCHEMA_NOTES.md). `pagos` entra solo para medir lo cobrado POR FECHA DE
 * PAGO, `profiles` solo a resolver nombres y `pedido_items` solo a sumar
 * volumen.
 *
 * La pantalla contesta dos clases de pregunta y las separa a proposito:
 *
 *   - Las del PERIODO que elige el selector (KPIs, grafica, tops): como vamos.
 *   - Las de HOY, en su propia fila rotulada: cuanto se debe y que hay en
 *     bodega. Un saldo por cobrar "de marzo" no significa nada — la deuda es
 *     la que existe en este momento —, asi que esas tarjetas NO se mueven con
 *     el selector, y eso tiene que verse sin leer la letra chica.
 *
 * El periodo vive en la URL y el filtrado es local: los datos llegan
 * completos del servidor una sola vez y cambiar de periodo no vuelve a
 * consultar nada.
 */

type Props = {
  saldos: FilaSaldo[]
  productos: FilaStock[]
  clientes: DatosCliente[]
  pedidosItems: PedidoConItems[]
  pagos: PagoFila[]
  /** Si el rol puede abrir el reporte imprimible (el permiso de Finanzas). */
  puedeReporte: boolean
  /** La fecha viene del servidor: llamarla en render seria impuro. */
  ahoraISO: string
}

export default function DashboardClient({ saldos, productos, clientes, pedidosItems, pagos, puedeReporte, ahoraISO }: Props) {
  const ahora = useMemo(() => new Date(ahoraISO), [ahoraISO])
  const searchParams = useSearchParams()

  const nombres = useMemo(
    () => new Map(clientes.map(c => [c.id, nombreLegible(c)])),
    [clientes]
  )

  // ── El periodo ────────────────────────────────────────────

  const { clave, rango } = useMemo(
    () =>
      resolverPeriodo(
        {
          periodo: searchParams.get('periodo') ?? undefined,
          desde: searchParams.get('desde') ?? undefined,
          hasta: searchParams.get('hasta') ?? undefined,
        },
        ahora
      ),
    [searchParams, ahora]
  )

  /**
   * El periodo se mueve con `history.replaceState` y no con `router.replace`.
   *
   * Las dos cosas las sigue `useSearchParams`, pero la del router vuelve al
   * servidor y repetiria las cinco consultas del Inicio cada vez que alguien
   * cambia de periodo, cuando los datos para contestar ya estan en el
   * navegador. Replace y no push para no llenar el historial de periodos: el
   * boton Atras tiene que salir del Inicio, no deshacer clics del selector.
   *
   * El periodo default no se escribe en la URL, para que /admin a secas siga
   * siendo la direccion limpia del tablero.
   */
  const aplicarPeriodo = useCallback(
    (nueva: ClavePeriodo, nuevoRango?: Rango) => {
      const q = new URLSearchParams(searchParams.toString())
      // Los tres parametros del periodo se borran y se vuelven a escribir con
      // `queryPeriodo`, que es el inverso exacto de `resolverPeriodo`. Asi la
      // URL del selector y la del link al reporte se arman con la misma regla
      // y no pueden decir periodos distintos.
      for (const k of ['periodo', 'desde', 'hasta']) q.delete(k)
      const propios = new URLSearchParams(queryPeriodo(nueva, nuevoRango ?? rangoDePeriodo(nueva, ahora)))
      for (const [k, v] of propios) q.set(k, v)

      const texto = q.toString()
      window.history.replaceState(null, '', texto ? `?${texto}` : window.location.pathname)
    },
    [searchParams, ahora]
  )

  /** El periodo que se esta viendo, para que el reporte abra con el mismo. */
  const queryActual = useMemo(() => queryPeriodo(clave, rango), [clave, rango])

  const datos = useMemo<DatosPeriodo>(
    () => ({ saldos, pagos, pedidos: pedidosItems }),
    [saldos, pagos, pedidosItems]
  )

  // ── KPIs del periodo ──────────────────────────────────────

  const resumen = useMemo(() => resumenDePeriodo(datos, rango), [datos, rango])
  const previo = useMemo(() => resumenDePeriodo(datos, rangoAnterior(rango)), [datos, rango])

  /**
   * La serie de los sparklines.
   *
   * Va con la granularidad AUTOMATICA del periodo y no con la que tenga puesta
   * la grafica: el override de la grafica es una decision sobre esa grafica, y
   * si arrastrara a las siete tarjetas, mirar la serie por dia dejaria los
   * sparklines de 24 meses en 730 puntos de un pixel.
   */
  const serieKpi = useMemo(
    () => serieDePeriodo(datos, bucketsDe(rango, granularidadEfectiva(rango, null))),
    [datos, rango]
  )

  const kpis = useMemo(() => {
    const NOTA = 'vs periodo anterior'
    return [
      {
        label: 'Facturado',
        valor: moneda(resumen.facturado),
        variacion: variacion(resumen.facturado, previo.facturado),
        sparkline: serieKpi.map(p => p.facturado),
      },
      {
        label: 'Cobrado',
        valor: moneda(resumen.cobrado),
        detalle: 'por fecha de pago',
        variacion: variacion(resumen.cobrado, previo.cobrado),
        sparkline: serieKpi.map(p => p.cobrado),
      },
      {
        label: '% cobrado',
        valor: resumen.pctCobrado === null ? '—' : pctCorto(resumen.pctCobrado),
        detalle: 'de lo facturado en el periodo',
        // En puntos, no relativo: de 40% a 50% "+25%" se lee como 65%.
        variacion:
          resumen.pctCobrado === null || previo.pctCobrado === null
            ? null
            : {
                pct: Math.abs(Math.round(resumen.pctCobrado - previo.pctCobrado)),
                dir: resumen.pctCobrado >= previo.pctCobrado ? ('up' as const) : ('down' as const),
              },
        sufijoVariacion: ' pp',
        sparkline: serieKpi.map(p => p.pct),
      },
      {
        label: 'Pedidos',
        valor: enteros(resumen.pedidos),
        variacion: variacion(resumen.pedidos, previo.pedidos),
        sparkline: serieKpi.map(p => p.pedidos),
      },
      {
        label: 'Litros vendidos',
        valor: formatLitros(resumen.litros),
        variacion: variacion(resumen.litros, previo.litros),
        sparkline: serieKpi.map(p => p.litros),
      },
      {
        label: 'Ticket promedio',
        // null y no $0: no hubo pedidos, no es que se haya vendido en cero.
        valor: resumen.ticket === null ? '—' : moneda(resumen.ticket),
        variacion: variacion(resumen.ticket || 0, previo.ticket || 0),
        sparkline: serieKpi.map(p => (p.pedidos > 0 ? p.ticket : null)),
      },
      {
        label: 'Clientes',
        valor: enteros(resumen.clientes),
        detalle: 'compraron en el periodo',
        variacion: variacion(resumen.clientes, previo.clientes),
        sparkline: serieKpi.map(p => p.clientes),
      },
    ].map(k => ({ ...k, nota: NOTA }))
  }, [resumen, previo, serieKpi])

  // ── Al dia de hoy (no se mueve con el periodo) ────────────

  const hoy = useMemo(() => {
    const vencido = vencidoDe(saldos)
    return [
      {
        label: 'Por cobrar',
        valor: moneda(porCobrarDe(saldos)),
        detalle: 'saldo abierto total',
        senal: 'alerta' as const,
      },
      {
        // Rojo solo cuando hay algo vencido: un $0 en rojo entrena a ignorar
        // el color justo donde tiene que avisar.
        label: 'Vencido',
        valor: moneda(vencido),
        detalle: vencido > 0 ? 'ya pasó su vencimiento' : 'nada vencido',
        tono: vencido > 0 ? ('rojo' as const) : undefined,
      },
      {
        label: 'Litros en stock',
        valor: formatLitros(litrosTotales(productos)),
        detalle: 'inventario disponible',
      },
    ]
  }, [saldos, productos])

  // ── Paneles ───────────────────────────────────────────────

  const filasPeriodo = useMemo(() => filasEnRango(saldos, rango), [saldos, rango])
  const top = useMemo(() => topClientes(filasPeriodo, clientes, 8), [filasPeriodo, clientes])

  // Cartera y atencion se quedan al dia de hoy: una deuda no pertenece al
  // periodo en que se facturo, sino al dia en que sigue sin pagarse.
  const buckets = useMemo(() => antiguedadCartera(saldos), [saldos])
  const atencion = useMemo(() => requierenAtencion(saldos, ahora), [saldos, ahora])

  const { filas: litrosPorProducto, sinUnidad } = useMemo(
    () => topProductosEnLitros(itemsVendidosEn(pedidosItems, rango), 6),
    [pedidosItems, rango]
  )

  const maxTop = top[0]?.facturado || 1
  const maxLitros = litrosPorProducto[0]?.litros || 1

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{CSS_DASH}</style>

      <div className="dash-head">
        <div>
          <h1 style={{ color: TINTA, fontSize: 21, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.01em' }}>
            Inicio
          </h1>
          <p style={{ color: GRIS, fontSize: 12.5, margin: 0 }}>
            Vista general de la operación · {rangoLegible(rango)}, por fecha del pedido
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, flexShrink: 0 }}>
          {puedeReporte && (
            <Link
              href={`/admin/reporte${queryActual ? `?${queryActual}` : ''}`}
              className="dash-btn"
              style={{ textDecoration: 'none', padding: '7px 12px', minHeight: 38 }}
            >
              Imprimir reporte
            </Link>
          )}
          <SelectorPeriodo clave={clave} rango={rango} onElegir={aplicarPeriodo} />
        </div>
      </div>

      <div className="dash-kpis">
        {kpis.map(k => (
          <KpiCard
            key={k.label}
            label={k.label}
            valor={k.valor}
            variacion={k.variacion}
            nota={k.nota}
            sufijoVariacion={k.sufijoVariacion}
            mostrarSinBase
            detalle={k.detalle}
            sparkline={k.sparkline}
          />
        ))}
      </div>

      {/* Al dia de hoy. Separada con una regla y rotulada: son los tres
          numeros que NO responden al selector, y confundirlos con los de
          arriba seria leer la deuda de hoy como si fuera la de marzo. */}
      <section style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 11 }}>
          <h2 style={{ margin: 0, color: TINTA, fontSize: 13.5, fontWeight: 600 }}>Al día de hoy</h2>
          <span style={{ color: GRIS_SUAVE, fontSize: 11.5 }}>no cambia con el periodo</span>
        </div>

        <div className="dash-hoy">
          {hoy.map(k => (
            <KpiCard
              key={k.label}
              label={k.label}
              valor={k.valor}
              senal={k.senal}
              tono={k.tono}
              detalle={k.detalle}
              fondo={FONDO_HOY}
              subirEsMalo
            />
          ))}
        </div>
      </section>

      <div className="dash-2-1">
        <section style={card} className="dash-min">
          <p style={tituloPanel}>Evolución del periodo</p>
          <p style={{ ...subtituloPanel, marginBottom: 16 }}>
            Facturado, litros y pedidos por fecha del pedido · Cobrado por fecha de pago
          </p>
          <GraficaPeriodo datos={datos} rango={rango} />
        </section>

        <section style={card} className="dash-min">
          <p style={tituloPanel}>Antigüedad de cartera</p>
          <p style={{ ...subtituloPanel, marginBottom: 16 }}>
            Saldo por cobrar según su atraso · al día de hoy
          </p>
          <AntiguedadCartera buckets={buckets} />
        </section>
      </div>

      <div className="dash-1-1">
        <section style={card} className="dash-min">
          <p style={tituloPanel}>Top clientes</p>
          <p style={{ ...subtituloPanel, marginBottom: 14 }}>Por facturación neta del periodo</p>

          {top.length === 0 ? (
            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
              Sin pedidos en el periodo
            </div>
          ) : (
            <div>
              {top.map((c, i) => (
                <a
                  key={c.id}
                  href={`/admin/clientes/edit/${c.id}`}
                  className="dash-fila-link"
                  style={{ padding: '9px 6px', margin: '0 -6px', borderRadius: 6, borderTop: i === 0 ? 'none' : `1px solid ${PISTA}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 11, width: 14, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span
                      className="dash-elipsis dash-nombre"
                      title={c.nombre}
                      style={{ color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 500, flex: 1 }}
                    >
                      {c.nombre}
                    </span>
                    {c.saldo > 0 && (
                      <span
                        title={`Saldo pendiente: ${moneda(c.saldo)}`}
                        style={{
                          ...tabular,
                          flexShrink: 0,
                          padding: '1px 7px',
                          borderRadius: 99,
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: ROJO,
                          fontSize: 10.5,
                          fontWeight: 600,
                        }}
                      >
                        debe {moneda(c.saldo)}
                      </span>
                    )}
                    <span style={{ ...tabular, color: TINTA, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
                      {moneda(c.facturado)}
                    </span>
                    <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 10.5, width: 34, textAlign: 'right', flexShrink: 0 }}>
                      {c.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 3, background: PISTA, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${(c.facturado / maxTop) * 100}%`, height: '100%', background: ACENTO, borderRadius: 2 }} />
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section style={card} className="dash-min">
          <p style={tituloPanel}>Requiere atención</p>
          <p style={{ ...subtituloPanel, marginBottom: 14 }}>
            Vencidos o con saldo de más de {DIAS_ATENCION} días · al día de hoy
          </p>
          <RequiereAtencion filas={atencion} nombres={nombres} />
        </section>
      </div>

      <section style={card}>
        <p style={tituloPanel}>Top productos</p>
        <p style={{ ...subtituloPanel, marginBottom: 16 }}>
          Por volumen vendido en el periodo · un barril de 20 L no es comparable con una caja como &ldquo;una unidad&rdquo;
        </p>

        {litrosPorProducto.length === 0 ? (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
            Sin partidas en el periodo
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px 28px' }}>
            {litrosPorProducto.map((p, i) => (
              <div key={p.nombre}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                  <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 11, width: 14, flexShrink: 0 }}>{i + 1}</span>
                  <span className="dash-elipsis" title={p.nombre} style={{ color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 500, flex: 1 }}>
                    {p.nombre}
                  </span>
                  <span style={{ ...tabular, color: TINTA, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
                    {formatLitros(p.litros)}
                  </span>
                </div>
                <div style={{ height: 3, background: PISTA, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(p.litros / maxLitros) * 100}%`, height: '100%', background: i === 0 ? ACENTO : '#d1d5db', borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Un hueco en los datos se dice, no se esconde dentro del total. */}
        {sinUnidad > 0 && (
          <p style={{ margin: '16px 0 0', paddingTop: 12, borderTop: `1px solid ${BORDE}`, color: GRIS_SUAVE, fontSize: 11 }}>
            {sinUnidad} {sinUnidad === 1 ? 'partida' : 'partidas'} sin presentación registrada; no suman litros.
          </p>
        )}
      </section>
    </div>
  )
}

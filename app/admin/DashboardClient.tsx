'use client'
import { useMemo } from 'react'
import KpiCard from './KpiCard'
import FacturadoCobradoChart from './FacturadoCobradoChart'
import AntiguedadCartera from './AntiguedadCartera'
import RequiereAtencion from './RequiereAtencion'
import { formatLitros, litrosTotales, topProductosEnLitros, type FilaStock, type ItemVendido } from '../../src/lib/unidades'
import {
  DIAS_ATENCION,
  DIAS_CLIENTE_ACTIVO,
  antiguedadCartera,
  clavesMesActualYPrevio,
  clientesActivosDe,
  cobradoDe,
  nombreLegible,
  pctCobradoDe,
  pedidosActivosDe,
  porCobrarDe,
  porMes,
  requierenAtencion,
  serieFacturadoVsCobrado,
  topClientes,
  variacion,
  vencidoDe,
  type DatosCliente,
  type FilaSaldo,
} from '../../src/lib/metricas'
import {
  ACENTO, BORDE, CSS_DASH, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  card, moneda, subtituloPanel, tabular, tituloPanel,
} from './dash-ui'

/**
 * Inicio del staff.
 *
 * Fuente unica: `pedidos_saldo`. Todos los montos salen de ahi y ninguno se
 * recalcula sobre `pedidos.total`, que es el importe BRUTO antes de descuento
 * y envio (ver docs/SCHEMA_NOTES.md). `profiles` entra solo a resolver
 * nombres y `pedido_items` solo a sumar volumen.
 *
 * La pantalla contesta cuatro preguntas en orden: como vamos (KPIs), si lo
 * facturado se esta cobrando (barras apiladas), que tan vieja es la cartera
 * (antiguedad) y a quien hay que llamar hoy (requiere atencion).
 */

type ProductoRef = { nombre?: string | null } | { nombre?: string | null }[] | null
type PedidoItems = {
  id: string
  pedido_items?: { cantidad: number | null; unidad: string | null; productos?: ProductoRef }[] | null
}

/** Supabase tipa un to-one anidado como arreglo segun la version; se normaliza. */
const nombreProducto = (ref: ProductoRef): string => {
  const p = Array.isArray(ref) ? ref[0] : ref
  return p?.nombre || 'Sin producto'
}

type Props = {
  saldos: FilaSaldo[]
  productos: FilaStock[]
  clientes: DatosCliente[]
  pedidosItems: PedidoItems[]
  /** La fecha viene del servidor: llamarla en render seria impuro. */
  ahoraISO: string
}

export default function DashboardClient({ saldos, productos, clientes, pedidosItems, ahoraISO }: Props) {
  const ahora = useMemo(() => new Date(ahoraISO), [ahoraISO])

  const nombres = useMemo(
    () => new Map(clientes.map(c => [c.id, nombreLegible(c)])),
    [clientes]
  )

  const kpis = useMemo(() => {
    const { actual, previo } = clavesMesActualYPrevio(ahora)
    const mapa = porMes(saldos)
    const delMes = mapa.get(actual) || []
    const delPrevio = mapa.get(previo) || []

    const compradoresDe = (filas: FilaSaldo[]) =>
      new Set(filas.map(f => f.cliente_id).filter(Boolean) as string[]).size

    const pct = pctCobradoDe(saldos)
    const vencido = vencidoDe(saldos)

    return [
      {
        label: 'Clientes activos',
        valor: clientesActivosDe(saldos, ahora).toLocaleString('es-MX'),
        detalle: `con pedido en ${DIAS_CLIENTE_ACTIVO} días`,
        variacion: variacion(compradoresDe(delMes), compradoresDe(delPrevio)),
        nota: 'compradores vs mes anterior',
      },
      {
        label: 'Cobrado',
        valor: moneda(cobradoDe(saldos)),
        variacion: variacion(cobradoDe(delMes), cobradoDe(delPrevio)),
        nota: 'pedidos del mes vs anterior',
      },
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
        label: '% cobrado',
        valor: pct === null ? '—' : `${pct.toFixed(1)}%`,
        detalle: 'de lo facturado',
      },
      {
        label: 'Pedidos activos',
        valor: pedidosActivosDe(saldos).toLocaleString('es-MX'),
        variacion: variacion(delMes.length, delPrevio.length),
        nota: 'pedidos del mes vs anterior',
      },
      {
        label: 'Litros en stock',
        valor: formatLitros(litrosTotales(productos)),
      },
    ]
  }, [saldos, productos, ahora])

  const serie = useMemo(() => serieFacturadoVsCobrado(saldos, 12, ahora), [saldos, ahora])
  const buckets = useMemo(() => antiguedadCartera(saldos), [saldos])
  const atencion = useMemo(() => requierenAtencion(saldos, ahora), [saldos, ahora])
  const top = useMemo(() => topClientes(saldos, clientes, 8), [saldos, clientes])

  const itemsVendidos = useMemo<ItemVendido[]>(
    () =>
      pedidosItems.flatMap(p =>
        (p.pedido_items || []).map(it => ({
          unidad: it.unidad,
          cantidad: it.cantidad,
          nombre: nombreProducto(it.productos ?? null),
        }))
      ),
    [pedidosItems]
  )
  const { filas: litrosPorProducto, sinUnidad } = useMemo(
    () => topProductosEnLitros(itemsVendidos, 6),
    [itemsVendidos]
  )

  const maxTop = top[0]?.facturado || 1
  const maxLitros = litrosPorProducto[0]?.litros || 1

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{CSS_DASH}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: TINTA, fontSize: 21, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.01em' }}>
          Inicio
        </h1>
        <p style={{ color: GRIS, fontSize: 12.5, margin: 0 }}>
          Vista general de la operación · clientes activos = con pedido en los últimos {DIAS_CLIENTE_ACTIVO} días
        </p>
      </div>

      <div className="dash-kpis">
        {kpis.map(k => (
          <KpiCard
            key={k.label}
            label={k.label}
            valor={k.valor}
            variacion={k.variacion}
            nota={k.nota}
            senal={k.senal}
            tono={k.tono}
            detalle={k.detalle}
            subirEsMalo={k.label === 'Por cobrar' || k.label === 'Vencido'}
          />
        ))}
      </div>

      <div className="dash-2-1">
        <section style={card} className="dash-min">
          <p style={tituloPanel}>Facturado vs cobrado</p>
          <p style={{ ...subtituloPanel, marginBottom: 16 }}>Últimos 12 meses, por mes del pedido</p>
          <FacturadoCobradoChart serie={serie} />
        </section>

        <section style={card} className="dash-min">
          <p style={tituloPanel}>Antigüedad de cartera</p>
          <p style={{ ...subtituloPanel, marginBottom: 16 }}>Saldo por cobrar según su atraso</p>
          <AntiguedadCartera buckets={buckets} />
        </section>
      </div>

      <div className="dash-1-1">
        <section style={card} className="dash-min">
          <p style={tituloPanel}>Top clientes</p>
          <p style={{ ...subtituloPanel, marginBottom: 14 }}>Por facturación neta histórica</p>

          {top.length === 0 ? (
            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
              Sin pedidos registrados
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
            Vencidos o con saldo de más de {DIAS_ATENCION} días
          </p>
          <RequiereAtencion filas={atencion} nombres={nombres} />
        </section>
      </div>

      <section style={card}>
        <p style={tituloPanel}>Top productos</p>
        <p style={{ ...subtituloPanel, marginBottom: 16 }}>
          Por volumen vendido · un barril de 20 L no es comparable con una caja como &ldquo;una unidad&rdquo;
        </p>

        {litrosPorProducto.length === 0 ? (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
            Sin partidas registradas
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

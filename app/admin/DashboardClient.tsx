'use client'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import KpiCard from './KpiCard'
import { formatLitros, litrosTotales, type FilaStock } from '../../src/lib/unidades'
import {
  clavesMesActualYPrevio,
  clientesActivosDe,
  cobradoDe,
  DIAS_INACTIVIDAD,
  pctCobradoDe,
  pedidosActivosDe,
  porCobrarDe,
  netoDe,
  porMes,
  serieFacturada,
  variacion,
  type FilaSaldo,
} from '../../src/lib/metricas'

/** pedidos_saldo ya excluye cancelados, asi que no aparece como status. */
const STATUS_COLORS: Record<string, { color: string; label: string }> = {
  pendiente: { color: '#d97706', label: 'Pendiente' },
  confirmado: { color: '#2563eb', label: 'Confirmado' },
  enviado: { color: '#7c3aed', label: 'En camino' },
  entregado: { color: '#059669', label: 'Entregado' },
}

type Cliente = { id: string; full_name: string | null; email: string | null }

/**
 * Supabase tipa una relacion anidada como arreglo aunque con FK devuelva un
 * objeto, asi que se aceptan las dos formas y se normaliza al leer.
 */
type ProductoRef = { nombre?: string | null } | { nombre?: string | null }[] | null
type PedidoItems = { id: string; pedido_items?: { cantidad: number | null; productos?: ProductoRef }[] | null }

const nombreProducto = (ref: ProductoRef): string => {
  const p = Array.isArray(ref) ? ref[0] : ref
  return p?.nombre || 'Sin nombre'
}

type Props = {
  saldos: FilaSaldo[]
  productos: FilaStock[]
  clientes: Cliente[]
  pedidosItems: PedidoItems[]
  /** La fecha viene del servidor: llamarla en render seria impuro. */
  ahoraISO: string
}

const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

const Vacio = ({ mensaje, alto = 180 }: { mensaje: string; alto?: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: alto, color: '#9ca3af', fontSize: 13 }}>
    {mensaje}
  </div>
)

export default function DashboardClient({ saldos, productos, clientes, pedidosItems, ahoraISO }: Props) {
  const ahora = useMemo(() => new Date(ahoraISO), [ahoraISO])

  const kpis = useMemo(() => {
    const { actual, previo } = clavesMesActualYPrevio(ahora)
    const mapa = porMes(saldos)
    const delMes = mapa.get(actual) || []
    const delPrevio = mapa.get(previo) || []

    const compradoresDe = (filas: FilaSaldo[]) =>
      new Set(filas.map(f => f.cliente_id).filter(Boolean) as string[]).size

    const pct = pctCobradoDe(saldos)

    return [
      {
        label: 'Clientes activos',
        valor: clientesActivosDe(saldos, ahora).toLocaleString('es-MX'),
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
        // Saldo pendiente al dia de hoy: no hay historico con el que compararlo.
        label: 'Por cobrar',
        valor: moneda(porCobrarDe(saldos)),
        senal: 'alerta' as const,
      },
      {
        label: '% cobrado',
        valor: pct === null ? '—' : `${pct.toFixed(1)}%`,
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

  // Doce meses fijos, con los vacios en cero.
  const ventasPorMes = useMemo(() => serieFacturada(saldos, 12, ahora), [saldos, ahora])

  const statusData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const f of saldos) map[f.status] = (map[f.status] || 0) + 1
    return Object.entries(STATUS_COLORS).map(([key, cfg]) => ({
      key, label: cfg.label, color: cfg.color, count: map[key] || 0,
    }))
  }, [saldos])

  const topClientes = useMemo(() => {
    const nombre = new Map(clientes.map(c => [c.id, c.full_name || c.email || 'Sin nombre']))
    const map = new Map<string, number>()
    for (const f of saldos) {
      if (!f.cliente_id) continue
      map.set(f.cliente_id, (map.get(f.cliente_id) || 0) + netoDe(f))
    }
    return [...map.entries()]
      .map(([id, total]) => ({ nombre: nombre.get(id) || 'Sin nombre', total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [saldos, clientes])

  const topProductos = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of pedidosItems) {
      for (const item of p.pedido_items || []) {
        const n = nombreProducto(item.productos ?? null)
        map.set(n, (map.get(n) || 0) + (item.cantidad || 0))
      }
    }
    return [...map.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
  }, [pedidosItems])

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '22px 24px' }
  const sectionTitle = { color: '#1a1a1a', fontSize: 14, fontWeight: 600 as const, margin: '0 0 16px' }
  const totalPedidos = saldos.length || 1

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Inicio</h1>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Vista general de la operación · clientes activos = con pedido en los últimos {DIAS_INACTIVIDAD} días
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
        {kpis.map(k => (
          <KpiCard
            key={k.label}
            label={k.label}
            valor={k.valor}
            variacion={k.variacion}
            nota={k.nota}
            senal={k.senal}
            subirEsMalo={k.label === 'Por cobrar'}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={card}>
          <p style={sectionTitle}>Facturado por mes · últimos 12 meses</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ventasPorMes}>
              <XAxis dataKey="mes" stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 11 }} interval={0} />
              <YAxis stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: unknown) => [moneda(Number(v) || 0), 'Facturado']}
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a1a1a', fontSize: 12 }}
              />
              <Bar dataKey="total" fill="#9ca3af" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Pedidos por status</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {statusData.map(s => {
              const pct = Math.round((s.count / totalPedidos) * 100)
              return (
                <div key={s.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: '#374151' }}>{s.label}</span>
                    <span style={{ color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                  </div>
                  <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: s.color, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={card}>
          <p style={sectionTitle}>Top clientes por facturación</p>
          {topClientes.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topClientes} layout="vertical">
                <XAxis type="number" stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nombre" width={120} stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip
                  formatter={(v: unknown) => [moneda(Number(v) || 0), 'Facturado']}
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a1a1a', fontSize: 12 }}
                />
                <Bar dataKey="total" fill="#9ca3af" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Vacio mensaje="Sin pedidos registrados" alto={200} />
          )}
        </div>

        <div style={card}>
          <p style={sectionTitle}>Top productos por unidades</p>
          {topProductos.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 4 }}>
              {topProductos.map(p => {
                const max = topProductos[0].cantidad || 1
                return (
                  <div key={p.nombre}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: '#374151' }}>{p.nombre}</span>
                      <span style={{ color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{p.cantidad}</span>
                    </div>
                    <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((p.cantidad / max) * 100)}%`, height: '100%', background: '#9ca3af', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Vacio mensaje="Sin partidas registradas" alto={200} />
          )}
        </div>
      </div>
    </div>
  )
}

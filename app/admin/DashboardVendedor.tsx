'use client'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import KpiCard from './KpiCard'
import {
  clavesMesActualYPrevio,
  cobradoDe,
  netoDe,
  porCobrarDe,
  porMes,
  serieFacturada,
  variacion,
  type FilaSaldo,
} from '../../src/lib/metricas'

/**
 * Inicio del vendedor.
 *
 * No recibe nada filtrado desde el servidor: las filas que llegan ya vienen
 * acotadas por RLS. `pedidos_saldo` tiene security_invoker = on, asi que las
 * policies de `pedidos` se evaluan con el rol que consulta y la vista le
 * devuelve solo sus pedidos. Lo mismo con sus clientes.
 *
 * A proposito no hay nada de inventario, produccion ni cobranza de terceros.
 */

const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

type Props = {
  saldos: FilaSaldo[]
  clientesEnCartera: number
  nombre: string
  /** La fecha viene del servidor: llamarla en render seria impuro. */
  ahoraISO: string
}

export default function DashboardVendedor({ saldos, clientesEnCartera, nombre, ahoraISO }: Props) {
  const ahora = useMemo(() => new Date(ahoraISO), [ahoraISO])

  const kpis = useMemo(() => {
    const { actual, previo } = clavesMesActualYPrevio(ahora)
    const mapa = porMes(saldos)
    const delMes = mapa.get(actual) || []
    const delPrevio = mapa.get(previo) || []

    const pendientes = saldos.filter(f => f.status === 'pendiente').length

    return [
      {
        label: 'Cobrado del mes',
        valor: moneda(cobradoDe(delMes)),
        variacion: variacion(cobradoDe(delMes), cobradoDe(delPrevio)),
        nota: 'vs mes anterior',
      },
      {
        label: 'Pedidos pendientes',
        valor: pendientes.toLocaleString('es-MX'),
      },
      {
        label: 'Por cobrar',
        valor: moneda(porCobrarDe(saldos)),
        senal: 'alerta' as const,
        detalle: 'saldo de tus pedidos',
      },
      {
        label: 'Clientes en cartera',
        valor: clientesEnCartera.toLocaleString('es-MX'),
      },
    ]
  }, [saldos, clientesEnCartera, ahora])

  const serie = useMemo(() => serieFacturada(saldos, 12, ahora), [saldos, ahora])

  const ultimos = useMemo(
    () =>
      [...saldos]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    [saldos]
  )

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '22px 24px' }
  const sectionTitle = { color: '#1a1a1a', fontSize: 14, fontWeight: 600 as const, margin: '0 0 16px' }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Inicio</h1>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          {nombre ? `${nombre} · tus` : 'Tus'} pedidos y tus clientes
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
            detalle={k.detalle}
            subirEsMalo={k.label === 'Por cobrar'}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div style={card}>
          <p style={sectionTitle}>Tu facturación por mes · últimos 12 meses</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={serie}>
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
          <p style={sectionTitle}>Tus últimos pedidos</p>
          {ultimos.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ultimos.map(f => (
                <a
                  key={f.id}
                  href={`/admin/pedidos?tab=todos`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, textDecoration: 'none' }}
                >
                  <span>
                    <span className="font-mono" style={{ display: 'block', color: '#374151', fontSize: 12.5 }}>
                      #{f.id.slice(-6).toUpperCase()}
                    </span>
                    <span style={{ display: 'block', color: '#9ca3af', fontSize: 11 }}>
                      {new Date(f.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {f.estado_cobro}
                    </span>
                  </span>
                  <span style={{ color: '#374151', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {moneda(netoDe(f))}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: '#9ca3af', fontSize: 13 }}>
              Aún no tienes pedidos
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

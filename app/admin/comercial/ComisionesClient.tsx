'use client'
import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  etiquetaPeriodo,
  periodoPrevio,
  resolverTramos,
  type ComisionDeVendedor,
  type RenglonPedido,
  type RenglonTramo,
  type Tramo,
  type TramoFila,
} from '../../../src/lib/comisiones'
import TramosEditor from './TramosEditor'

/**
 * Comisiones del mes por vendedor, mas el editor de escaleras.
 *
 * El mes en curso se calcula en vivo cada vez que se carga la pantalla. Un mes
 * CERRADO muestra lo que dice su snapshot, no el calculo de hoy: eso es el
 * punto de cerrarlo. Si los dos difieren (entro o se cancelo un pago despues
 * del cierre) se avisa, porque es informacion real y no un error.
 */

export type Vendedor = { id: string; nombre: string; activo: boolean; tipo: string | null }

export type Corte = {
  id: string
  vendedor_id: string
  periodo: string
  base: number
  comision: number
  estado: 'pendiente' | 'pagada'
  pagado_at: string | null
  por_tramo: RenglonTramo[]
  detalle: RenglonPedido[]
}

export type Fila = {
  vendedor: Vendedor
  calculo: ComisionDeVendedor
  corte: Corte | null
}

type Props = {
  periodo: string
  /** El periodo que se esta viendo es el mes que corre. */
  esMesEnCurso: boolean
  filas: Fila[]
  tramos: TramoFila[]
  acento: string
  puedeEditar: boolean
  iepsTasa: number
}

const moneda = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const moneda0 = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`
const pct = (n: number) => `${Number(n.toFixed(3))}%`

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }
const th = {
  color: '#9ca3af', fontSize: 11, textAlign: 'left' as const, padding: '0 12px 10px',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600 as const,
}
const td = { padding: '12px', fontSize: 13, color: '#374151', borderTop: '1px solid #f3f4f6' }
const num = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

export default function ComisionesClient(props: Props) {
  const { periodo, esMesEnCurso, filas, tramos, acento, puedeEditar, iepsTasa } = props
  const router = useRouter()

  const [esquema, setEsquema] = useState<string>('global')
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState('')

  const kpis = useMemo(() => {
    const vista = filas.map(f => (f.corte ? { base: f.corte.base, comision: f.corte.comision } : f.calculo))
    const base = vista.reduce((s, v) => s + v.base, 0)
    const comision = vista.reduce((s, v) => s + v.comision, 0)
    const porPagar = filas
      .filter(f => f.corte?.estado === 'pendiente')
      .reduce((s, f) => s + f.corte!.comision, 0)
    const pagado = filas
      .filter(f => f.corte?.estado === 'pagada')
      .reduce((s, f) => s + f.corte!.comision, 0)
    return { base, comision, porPagar, pagado }
  }, [filas])

  const abiertos = filas.filter(f => !f.corte && f.calculo.base > 0)
  const sinEsquemaAlguno = filas.some(f => f.calculo.sinEsquema)

  const escaleraDe = (clave: string): Tramo[] =>
    clave === 'global'
      ? tramos.filter(t => t.vendedor_id === null).map(({ desde, hasta, porcentaje }) => ({ desde, hasta, porcentaje }))
      : tramos.filter(t => t.vendedor_id === clave).map(({ desde, hasta, porcentaje }) => ({ desde, hasta, porcentaje }))

  async function llamar(url: string, init: RequestInit) {
    setError('')
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Algo falló')
      return null
    }
    router.refresh()
    return json
  }

  const guardarTramos = async (nuevos: Tramo[]) => {
    setGuardando(true)
    await llamar('/api/admin/comisiones/tramos', {
      method: 'POST',
      body: JSON.stringify({ vendedor_id: esquema === 'global' ? null : esquema, tramos: nuevos }),
    })
    setGuardando(false)
  }

  const cerrarMes = async (vendedorIds: string[]) => {
    setOcupado(vendedorIds.join(',') || 'todos')
    await llamar('/api/admin/comisiones/cortes', {
      method: 'POST',
      body: JSON.stringify({ periodo, vendedor_ids: vendedorIds }),
    })
    setOcupado(null)
  }

  const moverCorte = async (corte: Corte, accion: 'pagar' | 'despagar') => {
    setOcupado(corte.id)
    await llamar(`/api/admin/comisiones/cortes/${corte.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ accion }),
    })
    setOcupado(null)
  }

  const reabrir = async (corte: Corte) => {
    setOcupado(corte.id)
    await llamar(`/api/admin/comisiones/cortes/${corte.id}`, { method: 'DELETE' })
    setOcupado(null)
  }

  const irA = (p: string) => router.push(`/admin/comercial?tab=comisiones&periodo=${p}`)

  const siguiente = useMemo(() => {
    const [a, m] = periodo.split('-').map(Number)
    const d = new Date(a, m, 1, 12)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [periodo])

  const btn = (fondo: string, color: string, borde = 'transparent') => ({
    padding: '6px 12px', background: fondo, border: `1px solid ${borde}`, borderRadius: 7,
    color, fontSize: 12.5, fontWeight: 600 as const, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* ── Periodo ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => irA(periodoPrevio(periodo))} style={btn('#fff', '#374151', '#d1d5db')}>←</button>
          <button
            onClick={() => irA(siguiente)}
            disabled={esMesEnCurso}
            style={{ ...btn('#fff', esMesEnCurso ? '#d1d5db' : '#374151', '#d1d5db'), cursor: esMesEnCurso ? 'default' : 'pointer' }}
          >
            →
          </button>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a1a', textTransform: 'capitalize' }}>
            {etiquetaPeriodo(periodo)}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
            Por fecha de pago · base sin envío, sin IVA y neta de IEPS {pct(iepsTasa * 100)}
          </p>
        </div>
        {esMesEnCurso && (
          <span style={{ padding: '4px 10px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: 11.5, fontWeight: 600 }}>
            Mes en curso · incompleto
          </span>
        )}
        {puedeEditar && abiertos.length > 1 && (
          <button
            onClick={() => cerrarMes(abiertos.map(f => f.vendedor.id))}
            disabled={!!ocupado}
            style={{ ...btn(acento, '#fff'), marginLeft: 'auto', padding: '8px 16px' }}
          >
            {ocupado ? 'Cerrando…' : `Cerrar el mes de los ${abiertos.length}`}
          </button>
        )}
      </div>

      {error && (
        <p style={{ padding: '10px 14px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </p>
      )}

      {/* ── KPIs ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Base del mes', valor: moneda0(kpis.base), color: '#374151', nota: 'cobrado, neto' },
          { label: 'Comisión del mes', valor: moneda0(kpis.comision), color: acento, nota: 'sobre esa base' },
          { label: 'Por pagar', valor: moneda0(kpis.porPagar), color: '#b45309', nota: 'cortes cerrados' },
          { label: 'Pagado', valor: moneda0(kpis.pagado), color: '#047857', nota: 'del mes' },
        ].map(k => (
          <div key={k.label} style={card}>
            <p style={{ color: '#6b7280', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 21, fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{k.valor}</p>
            <p style={{ color: '#9ca3af', fontSize: 11.5, margin: '4px 0 0' }}>{k.nota}</p>
          </div>
        ))}
      </div>

      {sinEsquemaAlguno && (
        <p style={{ padding: '10px 14px', marginBottom: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13 }}>
          Hay vendedores sin escalera de comisión. Mientras no tengan tramos propios ni haya un esquema global, su comisión es cero y su mes no se puede cerrar.
        </p>
      )}

      {/* ── Tabla por vendedor ────────────────────────────── */}
      <div style={{ ...card, padding: '20px 16px', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Vendedor</th>
              <th style={{ ...th, textAlign: 'right' }}>Cobrado</th>
              <th style={{ ...th, textAlign: 'right' }}>Base neta</th>
              <th style={{ ...th, textAlign: 'right' }}>Comisión</th>
              <th style={{ ...th, textAlign: 'right' }}>Marginal</th>
              <th style={th}>Estado</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, color: '#9ca3af', textAlign: 'center', padding: 36 }}>No hay fichas de vendedor.</td></tr>
            )}
            {filas.map(f => {
              const { vendedor, calculo, corte } = f
              // Un mes cerrado manda lo que dice su snapshot.
              const vista = corte ?? calculo
              const difiere = corte && Math.abs(corte.comision - calculo.comision) >= 0.01
              const desglose = corte ? corte.por_tramo : calculo.porTramo
              const renglones = corte ? corte.detalle : calculo.detalle
              const expandida = abierta === vendedor.id

              return (
                <Fragment key={vendedor.id}>
                  <tr>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{vendedor.nombre}</span>
                      {!vendedor.activo && <span style={{ color: '#9ca3af', fontSize: 11.5 }}> · inactiva</span>}
                      <span style={{ display: 'block', color: '#9ca3af', fontSize: 11 }}>
                        {calculo.sinEsquema
                          ? 'sin escalera'
                          : calculo.global ? 'esquema global' : 'escalera propia'}
                        {calculo.topado && ' · topado'}
                      </span>
                    </td>
                    <td style={num}>{moneda(calculo.cobrado)}</td>
                    <td style={num}>{moneda(vista.base)}</td>
                    <td style={{ ...num, color: acento, fontWeight: 700 }}>
                      {moneda(vista.comision)}
                      {difiere && (
                        <span
                          title={`El cálculo en vivo da ${moneda(calculo.comision)}: hubo movimientos de pago después del cierre.`}
                          style={{ display: 'block', color: '#b45309', fontSize: 11, fontWeight: 400 }}
                        >
                          en vivo: {moneda(calculo.comision)}
                        </span>
                      )}
                    </td>
                    <td style={{ ...num, color: '#6b7280' }}>
                      {calculo.tasaMarginal === null ? '—' : pct(calculo.tasaMarginal)}
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                        background: !corte ? '#f3f4f6' : corte.estado === 'pagada' ? '#d1fae5' : '#fef3c7',
                        color: !corte ? '#6b7280' : corte.estado === 'pagada' ? '#047857' : '#92400e',
                      }}>
                        {!corte ? 'Abierto' : corte.estado === 'pagada' ? 'Pagada' : 'Por pagar'}
                      </span>
                      {corte?.pagado_at && (
                        <span style={{ display: 'block', color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
                          {new Date(corte.pagado_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setAbierta(expandida ? null : vendedor.id)}
                        style={{ ...btn('#fff', '#6b7280', '#e5e7eb'), marginRight: 6 }}
                      >
                        {expandida ? 'Ocultar' : 'Desglose'}
                      </button>
                      {puedeEditar && !corte && (
                        <button
                          onClick={() => cerrarMes([vendedor.id])}
                          disabled={!!ocupado || calculo.sinEsquema}
                          title={calculo.sinEsquema ? 'Captura su escalera antes de cerrar el mes' : undefined}
                          style={btn(calculo.sinEsquema ? '#f3f4f6' : acento, calculo.sinEsquema ? '#9ca3af' : '#fff')}
                        >
                          Cerrar mes
                        </button>
                      )}
                      {puedeEditar && corte?.estado === 'pendiente' && (
                        <>
                          <button onClick={() => moverCorte(corte, 'pagar')} disabled={!!ocupado} style={{ ...btn('#047857', '#fff'), marginRight: 6 }}>
                            Marcar pagada
                          </button>
                          <button onClick={() => reabrir(corte)} disabled={!!ocupado} style={btn('#fff', '#6b7280', '#e5e7eb')}>
                            Reabrir
                          </button>
                        </>
                      )}
                      {puedeEditar && corte?.estado === 'pagada' && (
                        <button onClick={() => moverCorte(corte, 'despagar')} disabled={!!ocupado} style={btn('#fff', '#b91c1c', '#fecaca')}>
                          Desmarcar pago
                        </button>
                      )}
                    </td>
                  </tr>

                  {expandida && (
                    <tr>
                      <td colSpan={7} style={{ padding: '4px 12px 20px', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, paddingTop: 14 }}>
                          <div>
                            <p style={{ margin: '0 0 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', fontWeight: 600 }}>
                              Por tramo {corte && '· como se cerró'}
                            </p>
                            {desglose.length === 0 ? (
                              <p style={{ color: '#9ca3af', fontSize: 12.5, margin: 0 }}>Sin escalera configurada.</p>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                  {desglose.map((t, i) => (
                                    <tr key={i} style={{ opacity: t.porcion > 0 ? 1 : 0.45 }}>
                                      <td style={{ fontSize: 12.5, color: '#6b7280', padding: '3px 0' }}>
                                        {moneda0(t.desde)} – {t.hasta === null ? '∞' : moneda0(t.hasta)}
                                      </td>
                                      <td style={{ fontSize: 12.5, color: '#9ca3af', padding: '3px 8px', textAlign: 'right' }}>{pct(t.porcentaje)}</td>
                                      <td style={{ fontSize: 12.5, color: '#6b7280', padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {moneda0(t.porcion)}
                                      </td>
                                      <td style={{ fontSize: 12.5, color: '#374151', padding: '3px 0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                        {moneda(t.comision)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>

                          <div>
                            <p style={{ margin: '0 0 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', fontWeight: 600 }}>
                              Pedidos que la componen
                            </p>
                            {renglones.length === 0 ? (
                              <p style={{ color: '#9ca3af', fontSize: 12.5, margin: 0 }}>No cobró nada este mes.</p>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                  {renglones.map(r => (
                                    <tr key={r.pedido_id}>
                                      <td className="font-mono" style={{ fontSize: 12, color: '#6b7280', padding: '3px 0' }}>
                                        #{r.pedido_id.slice(-6).toUpperCase()}
                                      </td>
                                      <td style={{ fontSize: 12.5, color: '#9ca3af', padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        cobrado {moneda(r.cobrado)}
                                      </td>
                                      <td style={{ fontSize: 12.5, color: '#374151', padding: '3px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        base {moneda(r.base)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Escaleras ─────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>Escaleras de comisión</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
              Tramos marginales: cada tramo paga su % solo sobre la parte de la base que cae en él.
            </p>
          </div>
          <select
            value={esquema}
            onChange={e => setEsquema(e.target.value)}
            style={{ marginLeft: 'auto', padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 13, cursor: 'pointer' }}
          >
            <option value="global">Esquema global (default)</option>
            {filas.map(f => (
              <option key={f.vendedor.id} value={f.vendedor.id}>
                {f.vendedor.nombre}
                {tramos.some(t => t.vendedor_id === f.vendedor.id) ? ' · escalera propia' : ' · usa la global'}
              </option>
            ))}
          </select>
        </div>

        {esquema !== 'global' && !tramos.some(t => t.vendedor_id === esquema) && (
          <p style={{ padding: '10px 14px', marginBottom: 14, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#6b7280', fontSize: 12.5 }}>
            Hoy usa el esquema global. En cuanto guardes aquí una escalera propia, deja de usarlo: no se mezclan.
          </p>
        )}

        <TramosEditor
          key={esquema}
          inicial={escaleraDe(esquema)}
          etiqueta={esquema === 'global' ? 'El esquema global' : (filas.find(f => f.vendedor.id === esquema)?.vendedor.nombre ?? 'Este vendedor')}
          acento={acento}
          guardando={guardando}
          puedeEditar={puedeEditar}
          onGuardar={guardarTramos}
        />

        {esquema === 'global' && (
          <p style={{ margin: '16px 0 0', fontSize: 12, color: '#9ca3af' }}>
            Le aplica a {filas.filter(f => resolverTramos(tramos, f.vendedor.id).length > 0 && f.calculo.global).length} de {filas.length} vendedores.
          </p>
        )}
      </div>
    </div>
  )
}

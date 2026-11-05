'use client'
import { useEffect, useState } from 'react'
import { METODOS_PAGO } from '../../../src/lib/pagos'
import { hoyMx } from '../../../src/lib/fechas'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type FilaPedido, moneda, tabular,
} from './pedidos-ui'

/**
 * Drawer para registrar un pago.
 *
 * Arranca con el saldo completo y con la fecha de HOY EN MEXICO, que es el
 * caso que ocurre el 90% de las veces. `hoyMx()` y no `new Date()`: despues
 * de las 18:00 de CDMX, la fecha del servidor ya es manana y el pago caeria
 * en el dia siguiente — y el periodo de comisiones va por fecha de pago.
 */

type Props = {
  pedido: FilaPedido
  onCerrar: () => void
  onListo: () => void
}

export default function DrawerPago({ pedido, onCerrar, onListo }: Props) {
  const [monto, setMonto] = useState(String(Math.round(pedido.saldo)))
  const [fecha, setFecha] = useState(hoyMx())
  const [metodo, setMetodo] = useState('transferencia')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCerrar])

  const valor = Number(monto.replace(/[^\d.]/g, '')) || 0
  const excede = valor > pedido.saldo + 0.009
  const bloqueos: string[] = []
  if (valor <= 0) bloqueos.push('El monto tiene que ser mayor a 0.')
  if (excede) bloqueos.push(`El monto excede el saldo (${moneda(pedido.saldo)}).`)
  if (!fecha) bloqueos.push('Falta la fecha del pago.')
  if (fecha > hoyMx()) bloqueos.push('La fecha del pago no puede ser futura.')

  const guardar = async () => {
    if (bloqueos.length || enviando) return
    setEnviando(true); setError('')
    const res = await fetch('/api/admin/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_id: pedido.id,
        monto: valor,
        metodo,
        referencia: referencia || null,
        fecha_pago: fecha,
        notas: notas || null,
      }),
    })
    if (res.ok) { onListo(); return }
    const d = await res.json().catch(() => ({}))
    setError(d.error || 'No se pudo registrar el pago.')
    setEnviando(false)
  }

  const campo: React.CSSProperties = {
    width: '100%', padding: '9px 11px', background: '#fff',
    border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', ...tabular,
  }
  const lbl: React.CSSProperties = {
    display: 'block', color: GRIS, fontSize: 10.5, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
  }

  return (
    <>
      <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)', zIndex: 90 }} />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100%)',
          background: '#fff', borderLeft: `1px solid ${BORDE}`, zIndex: 91,
          padding: '22px 24px', overflowY: 'auto',
          boxShadow: '-12px 0 36px rgba(17,24,39,0.14)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, color: TINTA, fontSize: 16, fontWeight: 700 }}>Registrar pago</h2>
            <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 12 }}>
              <span className="font-mono">{pedido.folio}</span> · {pedido.cliente}
            </p>
          </div>
          <button type="button" onClick={onCerrar} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: GRIS_SUAVE, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Estado del pedido, para no tener que ir a buscarlo */}
        <div style={{ padding: '12px 14px', background: '#fafafa', border: `1px solid ${BORDE}`, borderRadius: 10, marginBottom: 16 }}>
          {[
            { l: 'Total', v: moneda(pedido.total) },
            { l: 'Cobrado', v: moneda(pedido.cobrado) },
            { l: 'Saldo', v: moneda(pedido.saldo), fuerte: true },
          ].map(r => (
            <div key={r.l} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '2px 0' }}>
              <span style={{ color: GRIS, fontSize: 12 }}>{r.l}</span>
              <span style={{ ...tabular, marginLeft: 'auto', color: r.fuerte ? ACENTO : TINTA_MEDIA, fontSize: r.fuerte ? 15 : 12.5, fontWeight: r.fuerte ? 700 : 600 }}>
                {r.v}
              </span>
            </div>
          ))}
          {pedido.dias_vencido > 0 && (
            <p style={{ margin: '7px 0 0', paddingTop: 7, borderTop: `1px solid ${PISTA}`, color: ROJO, fontSize: 11.5, fontWeight: 600 }}>
              {pedido.dias_vencido} días de atraso
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={lbl}>Monto</label>
            <input
              autoFocus
              value={monto}
              onChange={e => setMonto(e.target.value)}
              inputMode="decimal"
              style={{ ...campo, borderColor: excede ? ROJO : BORDE, color: excede ? ROJO : TINTA, fontSize: 17, fontWeight: 700 }}
            />
            {pedido.saldo > 0 && valor !== Math.round(pedido.saldo) && (
              <button
                type="button"
                onClick={() => setMonto(String(Math.round(pedido.saldo)))}
                style={{ marginTop: 6, padding: '4px 9px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6, color: GRIS, fontSize: 11, cursor: 'pointer' }}
              >
                Usar el saldo completo ({moneda(pedido.saldo)})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Fecha</label>
              <input type="date" value={fecha} max={hoyMx()} onChange={e => setFecha(e.target.value)} style={campo} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Método</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)} style={{ ...campo, cursor: 'pointer' }}>
                {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={lbl}>Referencia</label>
            <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Opcional" style={campo} />
          </div>
          <div>
            <label style={lbl}>Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" style={campo} />
          </div>
        </div>

        {error && (
          <p style={{ margin: '14px 0 0', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5 }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={guardar}
          disabled={enviando || bloqueos.length > 0}
          style={{
            width: '100%', marginTop: 18, padding: '12px', borderRadius: 9, border: 'none',
            background: bloqueos.length ? '#e5e7eb' : ACENTO,
            color: bloqueos.length ? GRIS_SUAVE : '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: enviando || bloqueos.length ? 'default' : 'pointer',
            opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? 'Registrando…' : `Registrar ${moneda(valor)}`}
        </button>

        {bloqueos.length > 0 && (
          <ul style={{ margin: '9px 0 0', padding: '0 0 0 16px', color: GRIS, fontSize: 11.5, lineHeight: 1.6 }}>
            {bloqueos.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </aside>
    </>
  )
}

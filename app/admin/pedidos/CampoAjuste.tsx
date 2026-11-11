'use client'
import { useState } from 'react'
import { TOLERANCIA_AJUSTE, ajusteParaCuadrar, excedeTolerancia, motivoRechazo } from '../../../src/lib/ajuste'
import { motivoNoEditable } from '../../../src/lib/editar-partidas'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA, monedaExacta, monedaFirmada, tabular } from './pedidos-ui'

/**
 * El ajuste del pedido, con el atajo para cuadrar contra la orden de compra.
 *
 * Vive junto al desglose, igual que el switch de IVA: la pregunta "por que el
 * total no es el de mi OC" se contesta mirando el total, y se arregla ahi.
 *
 * ── Por que el atajo y no solo el campo ────────────────────
 *
 * La operacion real no es "ponle 0.27 de ajuste", es "cuadrame en 10,000".
 * Pedirle al usuario que reste a mano es pedirle que haga la aritmetica que
 * esta pantalla ya tiene — y restar mal un centavo deja el pedido sin cuadrar,
 * que es exactamente lo que se queria evitar.
 *
 * ── Lo que valida aqui, sabiendo que el servidor manda ─────
 *
 * Las mismas reglas que la ruta, con las mismas funciones (`motivoRechazo`,
 * `excedeTolerancia`): que el servidor sea la autoridad no significa que el
 * usuario tenga que descubrir el error despues de picar Guardar.
 */
export default function CampoAjuste({
  pedidoId, folio, status, ajuste, motivo, totalAntes, canEdit, onGuardado,
}: {
  pedidoId: string
  folio: string
  status: string
  /** El ajuste guardado. */
  ajuste: number
  motivo: string | null
  /** Lo que se cobraria SIN ajuste: `total_con_envio - ajuste` de la vista. */
  totalAntes: number
  canEdit: boolean
  onGuardado: (mensaje: string) => void
}) {
  const [valor, setValor] = useState(ajuste ? String(ajuste) : '')
  const [texto, setTexto] = useState(motivo || '')
  const [oc, setOc] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const noEditable = motivoNoEditable(status)
  const bloqueado = !canEdit || !!noEditable || guardando

  // Se permite el menos y el punto; lo demas se cae. El menos solo al inicio,
  // porque "1-2" no es un numero y dejarlo pasar daria NaN al guardar.
  const limpiar = (v: string) => {
    const sinBasura = v.replace(/[^\d.-]/g, '')
    const negativo = sinBasura.startsWith('-')
    return (negativo ? '-' : '') + sinBasura.replace(/-/g, '')
  }

  const nuevo = Number(valor.replace(/[^\d.-]/g, '')) || 0
  const totalResultante = totalAntes + nuevo
  const rechazo = motivoRechazo({ ajuste: nuevo, motivo: texto, totalAntes })
  const excede = excedeTolerancia(nuevo, totalAntes)
  const cambio = nuevo !== ajuste || texto.trim() !== (motivo || '').trim()

  const cuadrar = () => {
    const meta = Number(oc.replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(meta)) return
    const calculado = ajusteParaCuadrar(meta, totalAntes)
    setValor(calculado === 0 ? '' : String(calculado))
    setError(calculado === 0 ? 'El pedido ya cuadra con esa orden de compra.' : '')
  }

  const guardar = async (confirmaciones: { confirmarAjuste?: boolean; confirmarSobrepago?: boolean } = {}) => {
    setGuardando(true)
    setError('')
    const res = await fetch(`/api/admin/pedidos/${pedidoId}/ajuste`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ajuste: nuevo, ajuste_motivo: texto.trim(), ...confirmaciones }),
    })
    setGuardando(false)

    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      if (!d.sinCambio) onGuardado(`Ajuste guardado en ${folio}.`)
      return
    }

    const d = await res.json().catch(() => ({}))

    // Los dos 409 se preguntan, no se deciden solos. Es el mismo trato que da
    // la pantalla de editar productos.
    if (res.status === 409 && d.requiereConfirmacion) {
      if (d.sobrepago) {
        const ok = window.confirm(
          `${d.error}\n\n` +
          `A cobrar: ${monedaExacta(d.sobrepago.aCobrar)}\n` +
          `Ya pagado: ${monedaExacta(d.sobrepago.pagado)}\n` +
          `Sobra: ${monedaExacta(d.sobrepago.sobra)}\n\n` +
          '¿Guardar de todos modos?'
        )
        if (ok) await guardar({ ...confirmaciones, confirmarSobrepago: true })
        return
      }
      if (d.tolerancia) {
        const ok = window.confirm(
          `${d.error}\n\n` +
          `Ajuste: ${monedaFirmada(d.tolerancia.ajuste)}\n` +
          `Total antes del ajuste: ${monedaExacta(d.tolerancia.totalAntes)}\n\n` +
          '¿Es correcto?'
        )
        if (ok) await guardar({ ...confirmaciones, confirmarAjuste: true })
        return
      }
    }

    setError(d.error || 'No se pudo guardar el ajuste.')
  }

  const campo: React.CSSProperties = {
    width: '100%', padding: '7px 9px', background: bloqueado ? '#fafafa' : '#fff',
    border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA,
    fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
  }
  const rotulo: React.CSSProperties = {
    display: 'block', color: GRIS_SUAVE, fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${PISTA}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 600 }}>Ajuste</span>
        <span style={{ marginLeft: 'auto', ...tabular, color: GRIS_SUAVE, fontSize: 11 }}>
          sin ajuste: {monedaExacta(totalAntes)}
        </span>
      </div>

      {/* Cuadrar contra OC: la operacion real es "cuadrame en 10,000", no
          "ponle 0.27". */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={rotulo}>Total de la OC</label>
          <input
            value={oc}
            onChange={e => setOc(e.target.value)}
            disabled={bloqueado}
            inputMode="decimal"
            placeholder="10,000.00"
            style={{ ...campo, ...tabular }}
          />
        </div>
        <button
          type="button"
          onClick={cuadrar}
          disabled={bloqueado || !oc.trim()}
          style={{
            padding: '7px 11px', background: '#fff', border: `1px solid ${BORDE}`,
            borderRadius: 7, color: bloqueado || !oc.trim() ? GRIS_SUAVE : TINTA_MEDIA,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            cursor: bloqueado || !oc.trim() ? 'default' : 'pointer',
          }}
        >
          Cuadrar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 110 }}>
          <label style={rotulo}>Ajuste $</label>
          <input
            value={valor}
            onChange={e => { setValor(limpiar(e.target.value)); setError('') }}
            disabled={bloqueado}
            inputMode="decimal"
            placeholder="0.00"
            style={{ ...campo, ...tabular, color: nuevo < 0 ? ROJO : nuevo > 0 ? ACENTO : TINTA }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={rotulo}>Motivo {nuevo !== 0 && <span style={{ color: ROJO }}>*</span>}</label>
          <input
            value={texto}
            onChange={e => { setTexto(e.target.value); setError('') }}
            disabled={bloqueado}
            placeholder="Redondeo OC 4471"
            style={{ ...campo, borderColor: nuevo !== 0 && !texto.trim() ? ROJO : BORDE }}
          />
        </div>
      </div>

      {nuevo !== 0 && !rechazo && (
        <p style={{ margin: 0, ...tabular, color: TINTA_MEDIA, fontSize: 11.5 }}>
          Total: {monedaExacta(totalAntes)} {monedaFirmada(nuevo)} = <strong>{monedaExacta(totalResultante)}</strong>
          {excede && (
            <span style={{ color: ACENTO }}>
              {' '}· pasa del {TOLERANCIA_AJUSTE * 100}%, se te va a pedir confirmación
            </span>
          )}
        </p>
      )}

      {rechazo && <p style={{ margin: 0, color: ROJO, fontSize: 11.5 }}>{rechazo}</p>}
      {noEditable && <p style={{ margin: 0, color: GRIS, fontSize: 11 }}>{noEditable}</p>}
      {error && <p style={{ margin: 0, color: ROJO, fontSize: 11.5 }}>{error}</p>}

      <button
        type="button"
        onClick={() => guardar()}
        disabled={bloqueado || !!rechazo || !cambio}
        style={{
          alignSelf: 'flex-start', padding: '7px 13px', borderRadius: 7, border: 'none',
          background: bloqueado || !!rechazo || !cambio ? '#e5e7eb' : ACENTO,
          color: bloqueado || !!rechazo || !cambio ? GRIS_SUAVE : '#fff',
          fontSize: 12.5, fontWeight: 600,
          cursor: bloqueado || !!rechazo || !cambio ? 'default' : 'pointer',
        }}
      >
        {guardando ? 'Guardando…' : 'Guardar ajuste'}
      </button>
    </div>
  )
}

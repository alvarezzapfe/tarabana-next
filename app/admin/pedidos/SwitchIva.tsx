'use client'
import { useState } from 'react'
import { motivoNoEditable } from '../../../src/lib/editar-partidas'
import { IVA_TASA_DEFAULT, etiquetaTasa } from '../../../src/lib/iva'
import { ACENTO, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA_MEDIA, moneda } from './pedidos-ui'

/**
 * Prender o apagar el IVA del pedido.
 *
 * Vive junto al desglose y no en el menu de acciones a proposito: la pregunta
 * "este pedido lleva IVA" se contesta mirando el total, y la respuesta se
 * cambia ahi mismo.
 *
 * No se ESCONDE en un pedido entregado o cancelado: se muestra apagado con el
 * motivo, por la misma razon que 'Editar productos' (ver `motivoNoEditable`).
 * Esconderlo deja a quien lo busca sin saber si no existe, si no tiene
 * permiso o si el pedido no califica.
 */
export default function SwitchIva({
  pedidoId, folio, status, incluyeIva, ivaTasa, canEdit, onGuardado,
}: {
  pedidoId: string
  /** Para el mensaje: "IVA agregado a #0E1B76". */
  folio: string
  status: string
  incluyeIva: boolean
  /** La tasa del pedido. 0 o null si nunca llevo IVA: ahi se muestra la general. */
  ivaTasa?: number | null
  canEdit: boolean
  /** Avisa y refresca: los totales de arriba cambian con esto. */
  onGuardado: (mensaje: string) => void
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const motivo = motivoNoEditable(status)
  const bloqueado = !canEdit || !!motivo || guardando

  const guardar = async (quiere: boolean, confirmarSobrepago = false) => {
    setGuardando(true)
    setError('')
    const res = await fetch(`/api/admin/pedidos/${pedidoId}/iva`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incluye_iva: quiere, ...(confirmarSobrepago ? { confirmarSobrepago: true } : {}) }),
    })
    setGuardando(false)

    if (res.ok) {
      onGuardado(`${quiere ? 'IVA agregado a' : 'IVA quitado de'} ${folio}.`)
      return
    }

    const d = await res.json().catch(() => ({}))

    // 409 con sobrepago: no se decide solo, se pregunta. Es el mismo trato
    // que da la pantalla de editar productos.
    if (res.status === 409 && d.requiereConfirmacion && d.sobrepago) {
      const ok = window.confirm(
        `${d.error}\n\n` +
        `A cobrar: ${moneda(d.sobrepago.aCobrar)}\n` +
        `Ya pagado: ${moneda(d.sobrepago.pagado)}\n` +
        `Sobra: ${moneda(d.sobrepago.sobra)}\n\n` +
        '¿Guardar de todos modos?'
      )
      if (ok) await guardar(quiere, true)
      return
    }

    setError(d.error || 'No se pudo cambiar el IVA.')
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${PISTA}` }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: bloqueado ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={incluyeIva}
          disabled={bloqueado}
          onChange={e => guardar(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: ACENTO, margin: 0, cursor: bloqueado ? 'default' : 'pointer' }}
        />
        <span style={{ color: bloqueado ? GRIS : TINTA_MEDIA, fontSize: 12.5, fontWeight: 600 }}>
          Incluir IVA ({etiquetaTasa(ivaTasa || IVA_TASA_DEFAULT)})
        </span>
        {guardando && <span style={{ color: GRIS_SUAVE, fontSize: 11 }}>Guardando…</span>}
      </label>
      {motivo && <p style={{ margin: '5px 0 0 24px', color: GRIS_SUAVE, fontSize: 11 }}>{motivo}</p>}
      {error && <p style={{ margin: '5px 0 0 24px', color: ROJO, fontSize: 11.5 }}>{error}</p>}
    </div>
  )
}

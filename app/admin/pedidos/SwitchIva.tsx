'use client'
import { useState } from 'react'
import { motivoNoEditable } from '../../../src/lib/editar-partidas'
import { IVA_TASA_DEFAULT, etiquetaTasa } from '../../../src/lib/iva'
import { ACENTO, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA_MEDIA, moneda } from './pedidos-ui'

/**
 * Prender o apagar el IVA del pedido COMPLETO: sus partidas y su envio.
 *
 * Vive junto al desglose y no en el menu de acciones a proposito: la pregunta
 * "este pedido lleva IVA" se contesta mirando el total, asi que la respuesta
 * se cambia ahi mismo.
 *
 * El IVA fino —gravar una partida y no la de al lado— se edita con la matriz,
 * en "Editar productos". Aqui el switch general es el mazo, y cuando el
 * pedido viene mezclado se pinta INDETERMINADO en vez de mentir con un true o
 * un false: lo que dice es "unas si y otras no", que es la verdad.
 *
 * No se ESCONDE en un pedido entregado o cancelado: se muestra apagado con el
 * motivo, por la misma razon que 'Editar productos' (ver `motivoNoEditable`).
 * Esconderlo deja a quien lo busca sin saber si no existe, si no tiene permiso
 * o si el pedido no califica.
 */
export default function SwitchIva({
  pedidoId, folio, status, partidas, partidasConIva, envioConIva, conEnvio, ivaTasa, canEdit, onGuardado,
}: {
  pedidoId: string
  /** Para el mensaje: "IVA agregado a #0E1B76". */
  folio: string
  status: string
  /** Cuantas partidas tiene y cuantas van gravadas, para el estado mezclado. */
  partidas: number
  partidasConIva: number
  envioConIva: boolean
  /** Si hay flete que cobrar. Sin flete, su switch no tiene nada que hacer. */
  conEnvio: boolean
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

  const todas = partidas > 0 && partidasConIva === partidas
  const mezcla = partidasConIva > 0 && partidasConIva < partidas

  const guardar = async (cambio: Record<string, boolean>, confirmarSobrepago = false) => {
    setGuardando(true)
    setError('')
    const res = await fetch(`/api/admin/pedidos/${pedidoId}/iva`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cambio, ...(confirmarSobrepago ? { confirmarSobrepago: true } : {}) }),
    })
    setGuardando(false)

    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      if (d.sinCambio) return
      onGuardado(`IVA actualizado en ${folio}.`)
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
      if (ok) await guardar(cambio, true)
      return
    }

    setError(d.error || 'No se pudo cambiar el IVA.')
  }

  const casilla = (puesta: boolean, indeterminada: boolean) => ({
    type: 'checkbox' as const,
    checked: puesta,
    disabled: bloqueado,
    ref: (el: HTMLInputElement | null) => { if (el) el.indeterminate = indeterminada },
    style: {
      width: 15, height: 15, accentColor: ACENTO, margin: 0,
      cursor: bloqueado ? ('default' as const) : ('pointer' as const),
    },
  })

  return (
    <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${PISTA}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: bloqueado ? 'default' : 'pointer' }}>
        <input {...casilla(todas, mezcla)} onChange={e => guardar({ incluye_iva: e.target.checked })} />
        <span style={{ color: bloqueado ? GRIS : TINTA_MEDIA, fontSize: 12.5, fontWeight: 600 }}>
          IVA en todo ({etiquetaTasa(ivaTasa || IVA_TASA_DEFAULT)})
        </span>
        {mezcla && (
          <span style={{ marginLeft: 'auto', color: GRIS_SUAVE, fontSize: 10.5 }}>
            {partidasConIva} de {partidas}
          </span>
        )}
        {guardando && <span style={{ marginLeft: 'auto', color: GRIS_SUAVE, fontSize: 11 }}>Guardando…</span>}
      </label>

      {conEnvio && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: bloqueado ? 'default' : 'pointer' }}>
          <input {...casilla(envioConIva, false)} onChange={e => guardar({ envio_incluye_iva: e.target.checked })} />
          <span style={{ color: bloqueado ? GRIS : TINTA_MEDIA, fontSize: 12.5 }}>IVA en el envío</span>
        </label>
      )}

      {mezcla && !motivo && (
        <p style={{ margin: '0 0 0 24px', color: GRIS_SUAVE, fontSize: 11 }}>
          Unas partidas van gravadas y otras no. Para cambiarlas una por una, usa «Editar productos».
        </p>
      )}
      {motivo && <p style={{ margin: '0 0 0 24px', color: GRIS_SUAVE, fontSize: 11 }}>{motivo}</p>}
      {error && <p style={{ margin: '0 0 0 24px', color: ROJO, fontSize: 11.5 }}>{error}</p>}
    </div>
  )
}

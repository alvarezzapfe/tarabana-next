'use client'
import { useState } from 'react'
import { TOLERANCIA_AJUSTE, ajusteParaCuadrar, excedeTolerancia, motivoRechazo } from '../../../src/lib/ajuste'
import { motivoNoEditable } from '../../../src/lib/editar-partidas'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA, monedaExacta, monedaFirmada, tabular } from './pedidos-ui'
import { guardarAjuste } from './guardar-ajuste'

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
 *
 * ── Dos modos, y por que ───────────────────────────────────
 *
 * En el panel lateral el bloque trae su propio boton y se guarda solo, como
 * el switch de IVA: ahi no hay un "Guardar" global que compita.
 *
 * En /admin/pedidos/[id]/edit si lo hay, y tener dos botones costo un ajuste
 * perdido en localhost: se capturo con "Cuadrar contra OC", se pico el Guardar
 * grande de la pagina —que llama a /actualizar, ruta que no sabe nada del
 * ajuste— y devolvio 200 tirando el ajuste sin un solo error. Ahi el bloque va
 * con `conBoton={false}` y lo guarda la pagina, por la misma ruta.
 *
 * Cuando hay cambios sin guardar, el bloque lo DICE. Un campo con un valor que
 * no esta en la base es la forma mas barata de perder dinero.
 */
export default function CampoAjuste({
  pedidoId, folio, status, ajuste, motivo, totalAntes, canEdit, onGuardado,
  conBoton = true, valor: valorControlado, onValor, motivoTexto, onMotivoTexto,
}: {
  pedidoId: string
  /** Para el mensaje: "Ajuste guardado en #0E1B76". */
  folio: string
  status: string
  /** El ajuste guardado. */
  ajuste: number
  motivo: string | null
  /** Lo que se cobraria SIN ajuste: `total_con_envio - ajuste` de la vista. */
  totalAntes: number
  canEdit: boolean
  onGuardado: (mensaje: string) => void
  /**
   * false cuando la pantalla tiene su propio "Guardar" y lo guarda ella. Ahi
   * el estado vive arriba, porque la pagina necesita leerlo al guardar.
   */
  conBoton?: boolean
  valor?: string
  onValor?: (v: string) => void
  motivoTexto?: string
  onMotivoTexto?: (v: string) => void
}) {
  const [valorLocal, setValorLocal] = useState(ajuste ? String(ajuste) : '')
  const [textoLocal, setTextoLocal] = useState(motivo || '')
  const [oc, setOc] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Controlado por la pagina o por si mismo, segun el modo.
  const valor = valorControlado ?? valorLocal
  const setValor = onValor ?? setValorLocal
  const texto = motivoTexto ?? textoLocal
  const setTexto = onMotivoTexto ?? setTextoLocal

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

  const guardar = async () => {
    setGuardando(true)
    setError('')
    const r = await guardarAjuste(pedidoId, nuevo, texto.trim())
    setGuardando(false)
    if (r.ok) {
      if (!r.sinCambio) onGuardado(`Ajuste guardado en ${folio}.`)
      return
    }
    setError(r.error)
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

      {/* Un campo con un valor que no esta en la base es la forma mas barata
          de perder dinero: si hay cambios pendientes, el bloque lo dice, y en
          el modo controlado dice tambien QUIEN lo va a guardar. */}
      {cambio && !rechazo && (
        <p style={{ margin: 0, color: ACENTO, fontSize: 11, fontWeight: 600 }}>
          {conBoton
            ? 'Sin guardar — pica «Guardar ajuste».'
            : 'Sin guardar — se guarda con el botón «Guardar» de abajo.'}
        </p>
      )}

      {conBoton && (
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
      )}
    </div>
  )
}

'use client'
import { motivoNoEditable, urlNuevoPedido } from '../../../src/lib/editar-partidas'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA } from './pedidos-ui'

/**
 * La opcion "Editar productos" de un menu, con su regla.
 *
 * Esta en un solo lugar porque aparece en tres —el menu de la fila, el del
 * panel y la pantalla de edicion— y tres copias de la misma condicion se
 * desincronizan: basta que una siga escondiendo la opcion para que la pregunta
 * "¿por que aquí sí y allá no?" vuelva.
 *
 * En un pedido que no se puede editar NO se esconde: se muestra apagada con el
 * motivo y con la salida real —levantar otro pedido para el mismo cliente—,
 * que es lo que la persona iba a terminar haciendo de todos modos. Esconderla
 * deja a quien la busca sin saber si no existe, si no tiene permiso o si el
 * pedido no califica.
 */

export type PedidoDeLaAccion = {
  id: string
  status: string
  cliente_id: string | null
}

type Props = {
  pedido: PedidoDeLaAccion
  /** Estilo del item del menu que lo hospeda. */
  estilo: React.CSSProperties
  onEditar: () => void
  /** Se cierra el menu antes de abrir el modal o de navegar. */
  onAntes?: () => void
}

export default function AccionEditarProductos({ pedido, estilo, onEditar, onAntes }: Props) {
  const motivo = motivoNoEditable(pedido.status)

  if (!motivo) {
    return (
      <button type="button" onClick={() => { onAntes?.(); onEditar() }} style={estilo}>
        Editar productos
      </button>
    )
  }

  return (
    <div style={{ borderTop: `1px solid ${PISTA}`, marginTop: 4, paddingTop: 4 }}>
      <div
        aria-disabled
        title={motivo}
        style={{ ...estilo, color: GRIS_SUAVE, cursor: 'not-allowed' }}
      >
        Editar productos
        <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10.5, fontWeight: 400, whiteSpace: 'normal', maxWidth: 230, lineHeight: 1.35, marginTop: 2 }}>
          {motivo}
        </span>
      </div>
      <a
        href={urlNuevoPedido(pedido.cliente_id)}
        onClick={() => onAntes?.()}
        style={{ ...estilo, color: ACENTO, fontWeight: 600 }}
      >
        Nuevo pedido para este cliente
      </a>
    </div>
  )
}

/**
 * La misma regla como BOTON, para la pantalla de edicion: ahi no hay menu,
 * va arriba de la tabla de productos.
 */
export function BotonEditarProductos({ pedido, onEditar }: { pedido: PedidoDeLaAccion; onEditar: () => void }) {
  const motivo = motivoNoEditable(pedido.status)

  const base: React.CSSProperties = {
    padding: '7px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
    border: `1px solid ${BORDE}`, background: '#fff', cursor: 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap',
  }

  if (!motivo) {
    return (
      <button type="button" onClick={onEditar} style={{ ...base, borderColor: ACENTO, color: ACENTO }}>
        Editar productos
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" disabled title={motivo} style={{ ...base, color: GRIS_SUAVE, cursor: 'not-allowed' }}>
        Editar productos
      </button>
      <span style={{ color: GRIS, fontSize: 11.5, maxWidth: 420, lineHeight: 1.4 }}>{motivo}</span>
      <a href={urlNuevoPedido(pedido.cliente_id)} style={{ ...base, borderColor: ACENTO, color: ACENTO }}>
        Nuevo pedido para este cliente
      </a>
    </div>
  )
}

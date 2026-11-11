'use client'
import { useEffect, useMemo, useState } from 'react'
import { etiquetaFecha, hoyMx } from '../../../src/lib/fechas'
import { formatLitros } from '../../../src/lib/unidades'
import { METODOS_PAGO } from '../../../src/lib/pagos'
import AccionEditarProductos from './AccionEditarProductos'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type FilaPedido, type PagoFila,
  estadoDe, moneda, pasosDe, tabular,
} from './pedidos-ui'

/**
 * Panel de detalle del pedido.
 *
 * Reemplaza la fila expandible. Una fila que crece empuja la tabla, obliga a
 * elegir entre ver el detalle o ver el resto, y no deja espacio para cuatro
 * pestanas; un panel a la derecha deja la tabla donde estaba y da ancho fijo
 * para el detalle.
 *
 * Vive en la URL (`?pedido=<id>`), asi que un detalle se puede compartir por
 * link y el boton Atras del navegador lo cierra.
 *
 * Aqui estan TODAS las acciones que tenia la fila expandida — envio,
 * cancelar un pago, eliminar el pedido —, mas las que estaban sueltas en la
 * fila. Nada quedo sin lugar.
 */

const ANCHO = 560

const CSS = `
  .pp-panel { width: ${ANCHO}px; }
  .pp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }
  @media (max-width: 767px) {
    .pp-panel { width: 100%; }
    .pp-grid { grid-template-columns: 1fr; }
  }
`

type Pestana = 'resumen' | 'pagos' | 'envio' | 'actividad'

const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'envio', label: 'Envío' },
  { key: 'actividad', label: 'Actividad' },
]

const metodoLabel = (m: string | null) =>
  METODOS_PAGO.find(x => x.value === m)?.label ?? (m || '—')

type Props = {
  pedido: FilaPedido
  canEdit: boolean
  /** Descuento y costo de envio: solo admin y super admin. */
  puedeDescuento: boolean
  /** El vendedor no ve montos de descuento ni la accion de eliminar. */
  esVendedor: boolean
  /** Resuelve `pagos.registrado_por` a un nombre legible. */
  nombrePor: (id: string | null) => string | null
  onCerrar: () => void
  /**
   * Hay otra capa encima (el drawer de pago, el modal de status, la carga
   * de Excel). Con eso puesto, Esc es de la capa de arriba y no de aqui.
   */
  tapado: boolean
  onPago: (f: FilaPedido) => void
  onStatus: (f: FilaPedido) => void
  /** Solo super admin ve la opcion de entregar sin descontar inventario. */
  esSuperAdmin: boolean
  onEntregarSinStock: (f: FilaPedido) => void
  /** Editar las partidas. No se ofrece en un pedido entregado o cancelado. */
  onEditarPartidas: (f: FilaPedido) => void
  onCancelarPago: (f: FilaPedido, pagoId: string) => void
  onEliminar: (f: FilaPedido) => void
  /** Guardado el envio: el padre refresca y avisa. */
  onGuardado: (mensaje: string) => void
}

export default function PanelPedido(props: Props) {
  const {
    pedido, canEdit, puedeDescuento, esVendedor, nombrePor, tapado, esSuperAdmin,
    onCerrar, onPago, onStatus, onEntregarSinStock, onEditarPartidas, onCancelarPago, onEliminar, onGuardado,
  } = props

  const [pestana, setPestana] = useState<Pestana>('resumen')
  const [menu, setMenu] = useState(false)

  const es = estadoDe(pedido)
  const pasos = useMemo(() => pasosDe(pedido), [pedido])
  const puedeCobrar = canEdit && pedido.saldo > 0 && pedido.status !== 'cancelado'

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // DrawerPago escucha Esc por su cuenta: sin esta guarda, un Esc con el
      // drawer abierto cerraria el drawer Y el panel de un solo golpe.
      if (tapado) return
      // Esc cierra primero el menu y recien despues el panel: si cerrara las
      // dos cosas de un golpe, salir del menu costaria perder el detalle.
      if (menu) setMenu(false)
      else onCerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [menu, tapado, onCerrar])

  // Con el panel abierto, la rueda del mouse tiene que mover el panel y no
  // la tabla de atras: scrollear el fondo detras de un overlay se siente a
  // pantalla rota.
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previo }
  }, [])

  const numero = (etiqueta: string, valor: number, color: string) => (
    <div>
      <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {etiqueta}
      </p>
      <p style={{ ...tabular, margin: '2px 0 0', color, fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>
        {moneda(valor)}
      </p>
    </div>
  )

  return (
    <>
      <style>{CSS}</style>

      {/* El fondo cierra, como en cualquier panel del admin.

          z-index 70/71 y no 90/91: DrawerPago usa 90/91 y el modal de status
          100, y los dos se abren DESDE aqui. Con el mismo z-index gana el
          ultimo del DOM — que es este panel —, y el drawer de pago quedaria
          detras. El panel es la capa de abajo. */}
      <div
        onClick={onCerrar}
        style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', zIndex: 70 }}
      />

      <aside
        className="pp-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Pedido ${pedido.folio}`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 71,
          maxWidth: '100%', background: '#fff', borderLeft: `1px solid ${BORDE}`,
          boxShadow: '-12px 0 40px rgba(17,24,39,0.14)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* ── Encabezado fijo ─────────────────────────────────── */}
        <header style={{ flex: '0 0 auto', padding: '16px 20px 0', borderBottom: `1px solid ${BORDE}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="font-mono" style={{ color: TINTA, fontSize: 15, fontWeight: 700 }}>
              {pedido.folio}
            </span>
            <span style={{ padding: '2px 9px', borderRadius: 99, background: es.fondo, color: es.color, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {es.label}
            </span>
            {es.sub && <span style={{ color: GRIS_SUAVE, fontSize: 11 }}>{es.sub}</span>}

            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
              style={{ marginLeft: 'auto', padding: '2px 8px', background: 'none', border: 'none', color: GRIS_SUAVE, fontSize: 18, lineHeight: 1, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: 6 }}>
            {pedido.cliente_id ? (
              <a
                href={`/admin/clientes/edit/${pedido.cliente_id}`}
                style={{ color: TINTA_MEDIA, fontSize: 13.5, fontWeight: 600, textDecoration: 'none', borderBottom: `1px solid ${BORDE}` }}
              >
                {pedido.cliente}
              </a>
            ) : (
              <span style={{ color: TINTA_MEDIA, fontSize: 13.5, fontWeight: 600 }}>{pedido.cliente}</span>
            )}
            <span style={{ ...tabular, marginLeft: 9, color: GRIS_SUAVE, fontSize: 12 }}>
              {etiquetaFecha(pedido.fecha_pedido)}
            </span>
          </div>

          {/* Los tres numeros que explican el pedido */}
          <div style={{ display: 'flex', gap: 28, marginTop: 14 }}>
            {numero('Total', pedido.total, TINTA)}
            {numero('Cobrado', pedido.cobrado, pedido.cobrado > 0 ? '#047857' : GRIS_SUAVE)}
            {numero('Saldo', pedido.saldo, pedido.saldo > 0 ? (pedido.dias_vencido > 0 ? ROJO : ACENTO) : GRIS_SUAVE)}
          </div>

          {pedido.total > 0 && (
            <div style={{ marginTop: 9 }}>
              <div style={{ height: 5, background: PISTA, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pedido.pctCobrado}%`, height: '100%', background: pedido.pctCobrado >= 100 ? '#047857' : ACENTO, borderRadius: 3 }} />
              </div>
              <p style={{ ...tabular, margin: '4px 0 0', color: GRIS, fontSize: 11 }}>
                {Math.round(pedido.pctCobrado)}% cobrado
                {pedido.dias_vencido > 0 && (
                  <span style={{ color: ROJO, fontWeight: 600 }}> · vencido {pedido.dias_vencido} d</span>
                )}
              </p>
            </div>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
            {puedeCobrar && (
              <button
                type="button"
                onClick={() => onPago(pedido)}
                style={{ padding: '8px 14px', background: ACENTO, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Registrar pago
              </button>
            )}
            {canEdit && pedido.status !== 'cancelado' && (
              <button
                type="button"
                onClick={() => onStatus(pedido)}
                style={{ padding: '8px 13px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Cambiar status
              </button>
            )}
            <a
              href={`/api/pedidos/${pedido.id}/documento`}
              style={{ padding: '8px 13px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}
            >
              Descargar orden
            </a>

            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => setMenu(v => !v)}
                aria-label="Más acciones"
                style={{ padding: '6px 10px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: GRIS, fontSize: 14, lineHeight: 1.1, cursor: 'pointer' }}
              >
                ⋯
              </button>
              {menu && (
                <>
                  <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 2 }} />
                  <div
                    style={{
                      position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 3,
                      minWidth: 186, padding: '4px 0', background: '#fff',
                      border: `1px solid ${BORDE}`, borderRadius: 9,
                      boxShadow: '0 8px 24px rgba(17,24,39,0.14)',
                    }}
                  >
                    <a href={`/admin/pedidos/${pedido.id}/edit`} style={itemMenu}>Editar pedido</a>
                    {/* Las PARTIDAS, que el formulario de arriba no toca. En
                        un entregado o cancelado NO se esconde: sale apagada
                        con el motivo y con la salida real. */}
                    {canEdit && !esVendedor && (
                      <AccionEditarProductos
                        pedido={pedido}
                        estilo={itemMenu}
                        onEditar={() => onEditarPartidas(pedido)}
                        onAntes={() => setMenu(false)}
                      />
                    )}
                    {/* Para los pedidos que ya se entregaron en la realidad y
                        cuyo inventario se ajusto a mano: marcarlos por el
                        camino normal lo descontaria por segunda vez. Solo
                        super admin, y la ruta lo valida tambien. */}
                    {esSuperAdmin && pedido.status !== 'entregado' && pedido.status !== 'cancelado' && (
                      <button
                        type="button"
                        onClick={() => { setMenu(false); onEntregarSinStock(pedido) }}
                        style={{ ...itemMenu, borderTop: `1px solid ${PISTA}` }}
                      >
                        Marcar entregado
                        <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10.5, fontWeight: 400 }}>
                          sin descontar inventario
                        </span>
                      </button>
                    )}
                    {/* El vendedor no elimina. Y la ruta tambien lo niega: el
                        boton escondido no es la autorizacion. */}
                    {canEdit && !esVendedor && (
                      <button
                        type="button"
                        onClick={() => { setMenu(false); onEliminar(pedido) }}
                        style={{ ...itemMenu, color: ROJO }}
                      >
                        Eliminar pedido
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <LineaTiempo pasos={pasos} />

          {/* Pestanas */}
          <nav style={{ display: 'flex', gap: 2, marginTop: 4 }}>
            {PESTANAS.map(p => {
              const activa = pestana === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPestana(p.key)}
                  style={{
                    padding: '9px 12px', background: 'none', border: 'none',
                    borderBottom: `2px solid ${activa ? ACENTO : 'transparent'}`,
                    color: activa ? TINTA : GRIS, fontSize: 12.5,
                    fontWeight: activa ? 700 : 500, cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </nav>
        </header>

        {/* ── Cuerpo ──────────────────────────────────────────── */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '16px 20px 28px' }}>
          {pestana === 'resumen' && (
            <Resumen pedido={pedido} esVendedor={esVendedor} />
          )}
          {pestana === 'pagos' && (
            <Pagos
              pedido={pedido}
              canEdit={canEdit}
              nombrePor={nombrePor}
              onCancelarPago={onCancelarPago}
            />
          )}
          {pestana === 'envio' && (
            <Envio
              pedido={pedido}
              canEdit={canEdit}
              puedeDescuento={puedeDescuento}
              onGuardado={onGuardado}
            />
          )}
          {pestana === 'actividad' && <Actividad pedidoId={pedido.id} />}
        </div>
      </aside>
    </>
  )
}

const itemMenu: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
  background: 'none', border: 'none', color: TINTA_MEDIA, fontSize: 12.5,
  textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}

const rotulo: React.CSSProperties = {
  margin: '0 0 7px', color: GRIS_SUAVE, fontSize: 10, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

/** Celda de tabla del panel. */
const celda: React.CSSProperties = {
  padding: '6px 6px', fontSize: 11.5, color: TINTA_MEDIA,
  borderBottom: `1px solid ${PISTA}`,
}

const encabezado: React.CSSProperties = {
  padding: '0 6px 5px', fontSize: 9.5, fontWeight: 600, color: GRIS_SUAVE,
  textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
  borderBottom: `1px solid ${BORDE}`, whiteSpace: 'nowrap',
}

// ── Linea de tiempo horizontal ────────────────────────────────

function LineaTiempo({ pasos }: { pasos: ReturnType<typeof pasosDe> }) {
  return (
    <ol style={{ display: 'flex', alignItems: 'flex-start', listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
      {pasos.map((paso, i) => {
        const cancelado = paso.estado === 'cancelado'
        const activo = paso.estado === 'hecho' || paso.estado === 'actual'
        const color = cancelado ? ROJO : activo ? ACENTO : '#d1d5db'

        return (
          <li key={paso.key} style={{ flex: i === pasos.length - 1 ? '0 0 auto' : '1 1 0', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  flex: '0 0 auto', width: 9, height: 9, borderRadius: '50%',
                  background: paso.estado === 'pendiente' ? '#fff' : color,
                  border: `2px solid ${color}`, boxSizing: 'border-box',
                }}
              />
              {i < pasos.length - 1 && (
                <span style={{ flex: '1 1 auto', height: 2, background: activo && !cancelado ? ACENTO : '#e5e7eb' }} />
              )}
            </div>
            <p style={{ margin: '5px 0 0', paddingRight: 8, color: cancelado ? ROJO : activo ? TINTA_MEDIA : GRIS_SUAVE, fontSize: 11, fontWeight: paso.estado === 'actual' || cancelado ? 700 : 500 }}>
              {paso.label}
            </p>
            <p style={{ ...tabular, margin: '1px 0 0', paddingRight: 8, color: GRIS_SUAVE, fontSize: 10 }}>
              {paso.fecha ? etiquetaFecha(paso.fecha) : ''}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

// ── Resumen ───────────────────────────────────────────────────

function Resumen({ pedido, esVendedor }: { pedido: FilaPedido; esVendedor: boolean }) {
  const campos: { label: string; valor: string | null }[] = [
    { label: 'Condiciones', valor: pedido.condiciones_pago ? pedido.condiciones_pago.replace('_', ' ') : null },
    { label: 'Vencimiento', valor: pedido.fecha_vencimiento ? etiquetaFecha(pedido.fecha_vencimiento) : null },
    { label: 'Orden de compra', valor: pedido.orden_compra },
    { label: 'Folio de factura', valor: pedido.folio_factura },
    { label: 'Vendedor', valor: pedido.vendedor },
    // created_at es auditoria: cuando se CAPTURO, no la fecha del pedido.
    { label: 'Capturado el', valor: pedido.created_at ? etiquetaFecha(pedido.created_at) : null },
  ]

  return (
    <>
      <div className="pp-grid">
        {campos.map(c => (
          <div key={c.label}>
            <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {c.label}
            </p>
            <p style={{ margin: '2px 0 0', color: c.valor ? TINTA_MEDIA : GRIS_SUAVE, fontSize: 12.5 }}>
              {c.valor || '—'}
            </p>
          </div>
        ))}
      </div>

      {pedido.notas && (
        <div style={{ marginTop: 16 }}>
          <p style={rotulo}>Notas</p>
          <p style={{ margin: 0, padding: '9px 11px', background: '#fafafa', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {pedido.notas}
          </p>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <p style={rotulo}>Partidas</p>
        {pedido.items.length === 0 ? (
          <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>Sin partidas.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={encabezado}>Producto</th>
                <th style={encabezado}>Present.</th>
                <th style={{ ...encabezado, textAlign: 'right' }}>Cant.</th>
                <th style={{ ...encabezado, textAlign: 'right' }}>P. unit.</th>
                <th style={{ ...encabezado, textAlign: 'right' }}>Litros</th>
                <th style={{ ...encabezado, textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {pedido.items.map((it, i) => (
                <tr key={i}>
                  <td style={celda}>{it.nombre}</td>
                  <td style={{ ...celda, color: GRIS, fontSize: 10.5 }}>{it.unidad || '—'}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right' }}>{it.cantidad}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right', color: GRIS }}>{moneda(it.precio)}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right', color: GRIS_SUAVE, fontSize: 10.5 }}>
                    {it.litros > 0 ? formatLitros(it.litros) : '—'}
                  </td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right', fontWeight: 600 }}>{moneda(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* El desglose, que explica por que el total no es la suma de arriba */}
        <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Renglon etiqueta="Subtotal" valor={moneda(pedido.subtotal)} />
          {/* El vendedor no ve montos de descuento. */}
          {pedido.descuento > 0 && !esVendedor && (
            <Renglon etiqueta="Descuento" valor={`−${moneda(pedido.descuento)}`} color={ACENTO} />
          )}
          {pedido.costo_envio > 0 && <Renglon etiqueta="Envío" valor={moneda(pedido.costo_envio)} />}
          <Renglon etiqueta="Total" valor={moneda(pedido.total)} fuerte />
        </div>
      </div>
    </>
  )
}

function Renglon({ etiqueta, valor, color, fuerte }: { etiqueta: string; valor: string; color?: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: fuerte ? 6 : 0, borderTop: fuerte ? `1px solid ${BORDE}` : 'none' }}>
      <span style={{ color: fuerte ? TINTA_MEDIA : GRIS, fontSize: fuerte ? 12.5 : 12, fontWeight: fuerte ? 600 : 400 }}>
        {etiqueta}
      </span>
      <span style={{ ...tabular, color: color || (fuerte ? TINTA : TINTA_MEDIA), fontSize: fuerte ? 14 : 12.5, fontWeight: fuerte ? 700 : 500 }}>
        {valor}
      </span>
    </div>
  )
}

// ── Pagos ─────────────────────────────────────────────────────

function Pagos({ pedido, canEdit, nombrePor, onCancelarPago }: {
  pedido: FilaPedido
  canEdit: boolean
  nombrePor: (id: string | null) => string | null
  onCancelarPago: (f: FilaPedido, pagoId: string) => void
}) {
  const [menu, setMenu] = useState<string | null>(null)

  if (pedido.pagos.length === 0) {
    return (
      <>
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>Sin pagos registrados.</p>
        <div style={{ marginTop: 14 }}>
          <Renglon etiqueta="Saldo restante" valor={moneda(pedido.saldo)} fuerte />
        </div>
      </>
    )
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={encabezado}>Fecha</th>
            <th style={encabezado}>Método</th>
            <th style={{ ...encabezado, textAlign: 'right' }}>Monto</th>
            <th style={encabezado}>Registrado por</th>
            <th style={{ ...encabezado, width: 28 }} />
          </tr>
        </thead>
        <tbody>
          {pedido.pagos.map((pg: PagoFila) => {
            const cancelado = !!pg.cancelado_at
            const quien = nombrePor(pg.registrado_por)
            return (
              <tr key={pg.id} style={{ opacity: cancelado ? 0.55 : 1 }}>
                <td style={{ ...celda, ...tabular, whiteSpace: 'nowrap' }}>{etiquetaFecha(pg.fecha_pago)}</td>
                {/* La referencia bancaria iba en la fila expandida y es lo
                    que se usa para conciliar: baja en gris, sin gastar una
                    sexta columna. */}
                <td style={{ ...celda, color: GRIS }}>
                  {metodoLabel(pg.metodo)}
                  {pg.referencia && (
                    <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10, wordBreak: 'break-all' }}>
                      {pg.referencia}
                    </span>
                  )}
                </td>
                <td style={{ ...celda, ...tabular, textAlign: 'right', fontWeight: 600, textDecoration: cancelado ? 'line-through' : 'none' }}>
                  {moneda(pg.monto)}
                </td>
                <td style={{ ...celda, color: quien ? GRIS : GRIS_SUAVE, fontSize: 10.5, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={quien || ''}>
                  {quien || '—'}
                </td>
                <td style={{ ...celda, textAlign: 'right', position: 'relative' }}>
                  {cancelado ? (
                    <span style={{ color: ROJO, fontSize: 9.5 }} title={pg.cancelado_motivo || ''}>cancelado</span>
                  ) : canEdit ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setMenu(m => (m === pg.id ? null : pg.id))}
                        aria-label={`Acciones del pago de ${moneda(pg.monto)}`}
                        style={{ padding: '1px 5px', background: 'none', border: 'none', color: GRIS_SUAVE, fontSize: 13, lineHeight: 1, cursor: 'pointer' }}
                      >
                        ⋯
                      </button>
                      {menu === pg.id && (
                        <>
                          <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 2 }} />
                          <div
                            style={{
                              position: 'absolute', top: '100%', right: 0, zIndex: 3,
                              minWidth: 150, padding: '4px 0', background: '#fff',
                              border: `1px solid ${BORDE}`, borderRadius: 8,
                              boxShadow: '0 8px 24px rgba(17,24,39,0.14)',
                            }}
                          >
                            {/* El motivo lo pide el padre: la ruta lo exige, y
                                mandar vacio seria comerse un 400. */}
                            <button
                              type="button"
                              onClick={() => { setMenu(null); onCancelarPago(pedido, pg.id) }}
                              style={{ ...itemMenu, color: ROJO }}
                            >
                              Cancelar pago
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Los pagos cancelados no suman, y por eso el motivo se deja ver. */}
      {pedido.pagos.some(p => p.cancelado_at && p.cancelado_motivo) && (
        <div style={{ marginTop: 10 }}>
          {pedido.pagos.filter(p => p.cancelado_at && p.cancelado_motivo).map(p => (
            <p key={p.id} style={{ margin: '0 0 3px', color: GRIS_SUAVE, fontSize: 10.5 }}>
              {moneda(p.monto)} cancelado: {p.cancelado_motivo}
            </p>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Renglon etiqueta="Total del pedido" valor={moneda(pedido.total)} />
        <Renglon etiqueta="Cobrado" valor={moneda(pedido.cobrado)} />
        <Renglon
          etiqueta="Saldo restante"
          valor={moneda(pedido.saldo)}
          color={pedido.saldo > 0 ? (pedido.dias_vencido > 0 ? ROJO : ACENTO) : '#047857'}
          fuerte
        />
      </div>
    </>
  )
}

// ── Envio ─────────────────────────────────────────────────────

/**
 * Datos de envio, editables.
 *
 * Es la UNICA entrada de paqueteria y guia en todo el admin: el formulario
 * de edicion del pedido no las toca. Antes vivia en un modal aparte.
 *
 * El costo solo lo edita admin — la ruta lo valida tambien —, y por eso no
 * se manda cuando quien guarda es ventas: la ruta lo trata como "dejalo
 * como estaba".
 */
function Envio({ pedido, canEdit, puedeDescuento, onGuardado }: {
  pedido: FilaPedido
  canEdit: boolean
  puedeDescuento: boolean
  onGuardado: (mensaje: string) => void
}) {
  const [paqueteria, setPaqueteria] = useState(pedido.paqueteria || '')
  const [guia, setGuia] = useState(pedido.guia_envio || '')
  const [programada, setProgramada] = useState(pedido.fecha_entrega || '')
  const [real, setReal] = useState(pedido.fecha_entrega_real || '')
  const [costo, setCosto] = useState(pedido.costo_envio ? String(Math.round(pedido.costo_envio)) : '')
  const [guardando, setGuardando] = useState(false)
  // El aviso va AQUI y no solo en la banda de la pagina: esa banda queda
  // detras del panel, asi que guardar no daria ninguna senal visible.
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState('')

  /** Cualquier edicion invalida el "Guardado" anterior. */
  const editar = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setGuardado(false)
    setError('')
  }

  const bloqueos: string[] = []
  if (real && real > hoyMx()) bloqueos.push('La fecha de entrega real no puede ser futura.')

  const guardar = async () => {
    if (bloqueos.length || guardando) return
    setGuardando(true); setError(''); setGuardado(false)
    const res = await fetch(`/api/admin/pedidos/${pedido.id}/envio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paqueteria: paqueteria.trim() || null,
        guia_envio: guia.trim() || null,
        fecha_entrega: programada || null,
        fecha_entrega_real: real || null,
        // Sin `costo_envio` cuando el rol no lo puede tocar: la ruta lo lee
        // como "dejalo como estaba".
        ...(puedeDescuento ? { costo_envio: Number(costo.replace(/[^\d.]/g, '')) || 0 } : {}),
      }),
    })

    // Y aqui si se apaga `guardando`: el panel NO se desmonta al guardar
    // — el modal viejo si —, asi que sin esto el boton se queda en
    // "Guardando..." para siempre.
    setGuardando(false)

    if (res.ok) {
      setGuardado(true)
      onGuardado(`Envío actualizado en ${pedido.folio}.`)
      return
    }
    const d = await res.json().catch(() => ({}))
    setError(d.error || 'No se pudo guardar el envío.')
  }

  const campo: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: canEdit ? '#fff' : '#fafafa',
    border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA,
    fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
  }
  const etiqueta: React.CSSProperties = {
    display: 'block', color: GRIS_SUAVE, fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
  }

  return (
    <>
      <div className="pp-grid">
        <div>
          <label style={etiqueta}>Paquetería</label>
          <input value={paqueteria} onChange={editar(setPaqueteria)} disabled={!canEdit} placeholder="DHL, Estafeta, propia…" style={campo} />
        </div>
        <div>
          <label style={etiqueta}>Guía</label>
          <input value={guia} onChange={editar(setGuia)} disabled={!canEdit} placeholder="Número de rastreo" style={campo} />
        </div>
        <div>
          <label style={etiqueta}>Entrega programada</label>
          <input type="date" value={programada} onChange={editar(setProgramada)} disabled={!canEdit} style={campo} />
        </div>
        <div>
          <label style={etiqueta}>Entrega real</label>
          <input type="date" value={real} onChange={editar(setReal)} disabled={!canEdit} max={hoyMx()} style={campo} />
        </div>
        {puedeDescuento && (
          <div>
            <label style={etiqueta}>Costo de envío</label>
            <input value={costo} onChange={editar(setCosto)} inputMode="decimal" placeholder="0" style={{ ...campo, ...tabular }} />
          </div>
        )}
      </div>

      {puedeDescuento && (
        <p style={{ margin: '7px 0 0', color: GRIS_SUAVE, fontSize: 11 }}>
          El costo de envío se suma al total del pedido y mueve el saldo.
        </p>
      )}

      {bloqueos.map(b => (
        <p key={b} style={{ margin: '9px 0 0', color: ROJO, fontSize: 11.5 }}>{b}</p>
      ))}
      {error && <p style={{ margin: '9px 0 0', color: ROJO, fontSize: 11.5 }}>{error}</p>}

      {canEdit ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 16 }}>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || bloqueos.length > 0}
            style={{
              padding: '9px 16px', background: ACENTO, border: 'none',
              borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 700,
              cursor: guardando || bloqueos.length ? 'default' : 'pointer',
              opacity: guardando || bloqueos.length ? 0.6 : 1,
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar envío'}
          </button>
          {guardado && (
            <span style={{ color: '#047857', fontSize: 11.5, fontWeight: 600 }}>Guardado</span>
          )}
        </div>
      ) : (
        <p style={{ margin: '14px 0 0', color: GRIS_SUAVE, fontSize: 11.5 }}>
          Tu rol no edita datos de envío.
        </p>
      )}
    </>
  )
}

// ── Actividad ─────────────────────────────────────────────────

type Evento = {
  id: string
  accion: string
  entidad: string
  actor_email: string | null
  actor_role: string | null
  detalle: Record<string, unknown> | null
  created_at: string
}

const ACCION_LABEL: Record<string, string> = {
  'pedido.importar': 'Importado de Excel',
  'pedido.editar': 'Pedido editado',
  'pedido.status': 'Status cambiado',
  'pedido.envio': 'Envío actualizado',
  'pedido.pago': 'Campo de pago ajustado',
  'pedido.eliminar': 'Pedido eliminado',
  'pago.registrar': 'Pago registrado',
  'pago.cancelar': 'Pago cancelado',
  'pago.aplicar': 'Pago aplicado',
}

/** Una linea corta que diga QUE cambio, sin volcar el jsonb crudo. */
function resumenEvento(ev: Evento): string | null {
  const d = ev.detalle
  if (!d) return null

  if (ev.accion === 'pedido.status' && d.from && d.to) return `${d.from} → ${d.to}`
  if (ev.accion === 'pago.registrar' && typeof d.monto === 'number') return moneda(d.monto)
  if (ev.accion === 'pago.cancelar') {
    const monto = typeof d.monto === 'number' ? moneda(d.monto) : ''
    return [monto, d.motivo].filter(Boolean).join(' · ') || null
  }
  if (ev.accion === 'pedido.envio') {
    const partes = [d.paqueteria, d.guia_envio].filter(Boolean)
    return partes.length ? partes.join(' · ') : null
  }
  if (ev.accion === 'pedido.editar') {
    const campos = Object.keys(d)
    return campos.length ? campos.join(', ') : 'sin cambios'
  }
  return null
}

const fechaHora = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  })
}

function Actividad({ pedidoId }: { pedidoId: string }) {
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [eventos, setEventos] = useState<Evento[]>([])
  const [puede, setPuede] = useState(true)

  // Sin `setEstado('cargando')` al entrar: el estado inicial ya es ese, y el
  // panel se remonta por `key` cuando cambia de pedido, asi que `pedidoId`
  // no cambia por debajo de este efecto.
  useEffect(() => {
    let vigente = true
    fetch(`/api/admin/pedidos/${pedidoId}/actividad`)
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then(d => {
        if (!vigente) return
        setEventos(d.eventos || [])
        setPuede(!!d.puede)
        setEstado('listo')
      })
      .catch(() => { if (vigente) setEstado('error') })
    // Se cancela el seteo si el panel cambia de pedido antes de que llegue.
    return () => { vigente = false }
  }, [pedidoId])

  if (estado === 'cargando') {
    return <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>Cargando actividad…</p>
  }
  if (estado === 'error') {
    return <p style={{ margin: 0, color: ROJO, fontSize: 12 }}>No se pudo cargar la actividad.</p>
  }
  if (!puede) {
    return (
      <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>
        La bitácora de auditoría la lee solo super admin.
      </p>
    )
  }
  if (eventos.length === 0) {
    return (
      <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>
        Sin eventos registrados para este pedido.
      </p>
    )
  }

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {eventos.map((ev, i) => {
        const resumen = resumenEvento(ev)
        const ultimo = i === eventos.length - 1
        return (
          <li key={ev.id} style={{ display: 'flex', gap: 11 }}>
            {/* El riel vertical: punto y linea hasta el siguiente evento. */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? ACENTO : '#d1d5db' }} />
              {!ultimo && <span style={{ flex: '1 1 auto', width: 2, background: '#e5e7eb', marginTop: 2 }} />}
            </div>

            <div style={{ flex: '1 1 auto', paddingBottom: ultimo ? 0 : 16, minWidth: 0 }}>
              <p style={{ margin: 0, color: TINTA, fontSize: 12.5, fontWeight: 600 }}>
                {ACCION_LABEL[ev.accion] || ev.accion}
              </p>
              {resumen && (
                <p style={{ margin: '1px 0 0', color: TINTA_MEDIA, fontSize: 11.5, wordBreak: 'break-word' }}>
                  {resumen}
                </p>
              )}
              <p style={{ margin: '2px 0 0', color: GRIS_SUAVE, fontSize: 10.5 }}>
                {fechaHora(ev.created_at)}
                {ev.actor_email ? ` · ${ev.actor_email}` : ''}
                {ev.actor_role ? ` (${ev.actor_role})` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

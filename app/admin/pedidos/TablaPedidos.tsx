'use client'
import { Fragment, useMemo } from 'react'
import { etiquetaFecha } from '../../../src/lib/fechas'
import { formatLitros } from '../../../src/lib/unidades'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type ColumnaOrden, type FilaPedido, type Orden,
  cobroDe, moneda, statusDe, tabular, totalesDe,
} from './pedidos-ui'

/**
 * Tabla de Pedidos.
 *
 * Header fijo, orden por cualquier columna, totales del filtro al pie y la
 * fila expandible con partidas y pagos.
 *
 * El total de la columna es `total_con_envio`, no `pedidos.total`: ese es el
 * importe BRUTO antes de descuento y envio, y usarlo haria que la suma del
 * pie no cuadre con lo que se cobra (ver docs/SCHEMA_NOTES.md).
 */

const COLUMNAS: { key: ColumnaOrden; label: string; num?: boolean; ancho?: number }[] = [
  { key: 'folio', label: 'Folio', ancho: 78 },
  { key: 'fecha_pedido', label: 'Fecha', ancho: 96 },
  { key: 'cliente', label: 'Cliente' },
  { key: 'vendedor', label: 'Vendedor', ancho: 110 },
  { key: 'litros', label: 'Litros', num: true, ancho: 78 },
  { key: 'total', label: 'Total', num: true, ancho: 88 },
  { key: 'cobrado', label: 'Cobrado', num: true, ancho: 88 },
  { key: 'saldo', label: 'Saldo', num: true, ancho: 118 },
  { key: 'status', label: 'Status', ancho: 98 },
  { key: 'estado_cobro', label: 'Cobro', ancho: 104 },
  { key: 'entrega', label: 'Entrega', ancho: 96 },
  { key: 'orden_compra', label: 'OC', ancho: 86 },
]

type Props = {
  filas: FilaPedido[]
  orden: Orden
  onOrden: (o: Orden) => void
  expandida: string | null
  onExpandir: (id: string | null) => void
  seleccion: Set<string>
  onSeleccion: (s: Set<string>) => void
  canEdit: boolean
  onPago: (f: FilaPedido) => void
  onStatus: (f: FilaPedido) => void
  /** Las tres acciones poco frecuentes viven en la fila expandida. */
  onEnvio: (f: FilaPedido) => void
  onCancelarPago: (f: FilaPedido, pagoId: string) => void
  onEliminar: (f: FilaPedido) => void
}

export default function TablaPedidos(props: Props) {
  const {
    filas, orden, onOrden, expandida, onExpandir,
    seleccion, onSeleccion, canEdit, onPago, onStatus,
    onEnvio, onCancelarPago, onEliminar,
  } = props

  const totales = useMemo(() => totalesDe(filas), [filas])
  const todasSel = filas.length > 0 && filas.every(f => seleccion.has(f.id))

  const alternarTodas = () => {
    if (todasSel) onSeleccion(new Set())
    else onSeleccion(new Set(filas.map(f => f.id)))
  }
  const alternar = (id: string) => {
    const s = new Set(seleccion)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    onSeleccion(s)
  }

  const clickHeader = (c: ColumnaOrden) => {
    // Primera vez: descendente en lo numerico y en fechas (lo grande y lo
    // reciente primero, que es lo que se busca), ascendente en texto.
    if (orden.columna === c) onOrden({ columna: c, asc: !orden.asc })
    else onOrden({ columna: c, asc: !['fecha_pedido', 'litros', 'total', 'cobrado', 'saldo', 'estado_cobro'].includes(c) })
  }

  const th: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 2, background: '#fff',
    padding: '9px 8px', fontSize: 10, fontWeight: 600, color: GRIS_SUAVE,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: `1px solid ${BORDE}`, whiteSpace: 'nowrap', cursor: 'pointer',
    userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '9px 8px', fontSize: 12.5, borderBottom: `1px solid ${PISTA}`,
    color: TINTA_MEDIA, whiteSpace: 'nowrap',
  }

  if (filas.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
        Ningún pedido coincide con los filtros.
      </div>
    )
  }

  return (
    <div className="tp-scroll" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1180 }}>
        <thead>
          <tr>
            {canEdit && (
              <th style={{ ...th, width: 30, cursor: 'default', paddingLeft: 2 }}>
                <input
                  type="checkbox"
                  checked={todasSel}
                  onChange={alternarTodas}
                  title="Seleccionar todo lo filtrado"
                  style={{ cursor: 'pointer' }}
                />
              </th>
            )}
            {COLUMNAS.map(c => {
              const activa = orden.columna === c.key
              return (
                <th
                  key={c.key}
                  onClick={() => clickHeader(c.key)}
                  title={`Ordenar por ${c.label.toLowerCase()}`}
                  style={{
                    ...th,
                    width: c.ancho,
                    textAlign: c.num ? 'right' : 'left',
                    color: activa ? ACENTO : GRIS_SUAVE,
                  }}
                >
                  {c.label}
                  <span style={{ opacity: activa ? 1 : 0, marginLeft: 3 }}>{orden.asc ? '▲' : '▼'}</span>
                </th>
              )
            })}
            <th style={{ ...th, width: 150, cursor: 'default', textAlign: 'right' }} />
          </tr>
        </thead>

        <tbody>
          {filas.map(f => {
            const st = statusDe(f.status)
            const cb = cobroDe(f.estado_cobro)
            const abierta = expandida === f.id
            const sel = seleccion.has(f.id)
            return (
              <Fragment key={f.id}>
                <tr style={{ background: sel ? '#fff7f3' : abierta ? '#fafafa' : 'transparent' }}>
                  {canEdit && (
                    <td style={{ ...td, paddingLeft: 2 }}>
                      <input type="checkbox" checked={sel} onChange={() => alternar(f.id)} style={{ cursor: 'pointer' }} />
                    </td>
                  )}

                  <td style={{ ...td, cursor: 'pointer' }} onClick={() => onExpandir(abierta ? null : f.id)}>
                    <span className="font-mono" style={{ color: TINTA, fontWeight: 600 }}>{f.folio}</span>
                    <span style={{ color: GRIS_SUAVE, marginLeft: 4, fontSize: 9 }}>{abierta ? '▲' : '▼'}</span>
                  </td>

                  <td style={{ ...td, ...tabular }}>{etiquetaFecha(f.fecha_pedido)}</td>

                  <td style={{ ...td, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.cliente}>
                    {f.cliente_id ? (
                      <a href={`/admin/clientes/edit/${f.cliente_id}`} style={{ color: TINTA_MEDIA, textDecoration: 'none' }}>
                        {f.cliente}
                      </a>
                    ) : f.cliente}
                  </td>

                  <td style={{ ...td, color: f.vendedor ? TINTA_MEDIA : GRIS_SUAVE, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.vendedor || 'Sin vendedor'}>
                    {f.vendedor || '—'}
                  </td>

                  <td style={{ ...td, ...tabular, textAlign: 'right', color: GRIS }}>
                    {f.litros > 0 ? formatLitros(f.litros) : '—'}
                  </td>

                  <td style={{ ...td, ...tabular, textAlign: 'right', color: TINTA, fontWeight: 600 }}>
                    {moneda(f.total)}
                  </td>

                  <td style={{ ...td, ...tabular, textAlign: 'right', color: f.cobrado > 0 ? '#047857' : GRIS_SUAVE }}>
                    {f.cobrado > 0 ? moneda(f.cobrado) : '—'}
                  </td>

                  {/* Saldo con barrita de avance: el numero dice cuanto falta,
                      la barra dice que tan lejos esta de cerrarse. */}
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{ ...tabular, display: 'block', color: f.saldo > 0 ? (f.dias_vencido > 0 ? ROJO : TINTA_MEDIA) : GRIS_SUAVE, fontWeight: f.saldo > 0 ? 600 : 400 }}>
                      {f.saldo > 0 ? moneda(f.saldo) : '—'}
                    </span>
                    {f.total > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 3 }}>
                        <span style={{ width: 54, height: 3, background: PISTA, borderRadius: 2, overflow: 'hidden' }}>
                          <span style={{ display: 'block', width: `${f.pctCobrado}%`, height: '100%', background: f.pctCobrado >= 100 ? '#047857' : ACENTO, borderRadius: 2 }} />
                        </span>
                        <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 9.5, minWidth: 26, textAlign: 'right' }}>
                          {Math.round(f.pctCobrado)}%
                        </span>
                      </span>
                    )}
                  </td>

                  <td style={td}>
                    <Chip label={st.label} color={st.color} fondo={st.fondo} />
                  </td>

                  <td style={td}>
                    <Chip label={cb.label} color={cb.color} fondo={cb.fondo} />
                    {f.dias_vencido > 0 && (
                      <span style={{ ...tabular, display: 'block', color: ROJO, fontSize: 9.5, marginTop: 2 }}>
                        {f.dias_vencido} d
                      </span>
                    )}
                  </td>

                  <td style={{ ...td, ...tabular, color: f.fecha_entrega_real ? '#047857' : GRIS }}>
                    {f.fecha_entrega_real
                      ? etiquetaFecha(f.fecha_entrega_real)
                      : f.fecha_entrega
                        ? <span title="Programada">{etiquetaFecha(f.fecha_entrega)}</span>
                        : '—'}
                  </td>

                  <td style={{ ...td, color: f.orden_compra ? TINTA_MEDIA : GRIS_SUAVE, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.orden_compra || ''}>
                    {f.orden_compra || '—'}
                  </td>

                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <Accion href={`/admin/pedidos/${f.id}/edit`} label="Ver" />
                      {canEdit && f.saldo > 0 && f.status !== 'cancelado' && (
                        <Accion onClick={() => onPago(f)} label="Pago" acento />
                      )}
                      {canEdit && f.status !== 'cancelado' && (
                        <Accion onClick={() => onStatus(f)} label="Status" />
                      )}
                      <Accion href={`/api/pedidos/${f.id}/documento`} label="Word" />
                    </span>
                  </td>
                </tr>

                {abierta && (
                  <tr>
                    <td colSpan={COLUMNAS.length + (canEdit ? 2 : 1)} style={{ padding: 0, background: '#fafafa', borderBottom: `1px solid ${BORDE}` }}>
                      <Detalle
                        fila={f}
                        canEdit={canEdit}
                        onEnvio={onEnvio}
                        onCancelarPago={onCancelarPago}
                        onEliminar={onEliminar}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>

        {/* Totales del filtro, pegados abajo */}
        <tfoot>
          <tr>
            <td colSpan={canEdit ? 5 : 4} style={{ ...td, position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${BORDE}`, borderBottom: 'none', color: GRIS, fontSize: 11.5 }}>
              {totales.pedidos} {totales.pedidos === 1 ? 'pedido' : 'pedidos'} en el filtro
            </td>
            <td style={{ ...td, ...tabular, position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${BORDE}`, borderBottom: 'none', textAlign: 'right', color: GRIS }}>
              {formatLitros(totales.litros)}
            </td>
            <td style={{ ...td, ...tabular, position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${BORDE}`, borderBottom: 'none', textAlign: 'right', color: TINTA, fontWeight: 700 }}>
              {moneda(totales.total)}
            </td>
            <td style={{ ...td, ...tabular, position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${BORDE}`, borderBottom: 'none', textAlign: 'right', color: '#047857', fontWeight: 700 }}>
              {moneda(totales.cobrado)}
            </td>
            <td style={{ ...td, ...tabular, position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${BORDE}`, borderBottom: 'none', textAlign: 'right', color: totales.saldo > 0 ? ACENTO : GRIS_SUAVE, fontWeight: 700 }}>
              {moneda(totales.saldo)}
            </td>
            <td colSpan={5} style={{ ...td, position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${BORDE}`, borderBottom: 'none' }} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Chip({ label, color, fondo }: { label: string; color: string; fondo: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: fondo, color, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function Accion({ label, href, onClick, acento }: { label: string; href?: string; onClick?: () => void; acento?: boolean }) {
  const estilo: React.CSSProperties = {
    padding: '3px 8px', border: `1px solid ${acento ? ACENTO : BORDE}`, borderRadius: 6,
    color: acento ? ACENTO : GRIS, fontSize: 11, fontWeight: 600,
    textDecoration: 'none', cursor: 'pointer', background: '#fff', whiteSpace: 'nowrap',
  }
  if (href) return <a href={href} style={estilo}>{label}</a>
  return <button type="button" onClick={onClick} style={estilo}>{label}</button>
}

/**
 * Partidas y pagos del pedido, mas las acciones poco frecuentes.
 *
 * Envio, cancelar un pago y eliminar el pedido viven aqui y no en la fila:
 * son cosas que se hacen una vez cada tanto, y meterlas junto a Ver y Pago
 * convertiria la columna de acciones en una hilera de seis botones. La fila
 * se queda con las cuatro de todos los dias.
 *
 * Importa que esten: la paqueteria y la guia NO se pueden editar en ningun
 * otro lado — el formulario de edicion no las toca.
 */
function Detalle({ fila, canEdit, onEnvio, onCancelarPago, onEliminar }: {
  fila: FilaPedido
  canEdit: boolean
  onEnvio: (f: FilaPedido) => void
  onCancelarPago: (f: FilaPedido, pagoId: string) => void
  onEliminar: (f: FilaPedido) => void
}) {
  const sub: React.CSSProperties = {
    margin: '0 0 8px', color: GRIS_SUAVE, fontSize: 10,
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const celda: React.CSSProperties = { padding: '4px 6px', fontSize: 11.5, color: TINTA_MEDIA }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, padding: '14px 10px 16px 14px' }}>
      <div>
        <p style={sub}>Partidas</p>
        {fila.items.length === 0 ? (
          <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5 }}>Sin partidas.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {fila.items.map((it, i) => (
                <tr key={i} style={{ borderTop: i ? `1px solid ${PISTA}` : 'none' }}>
                  <td style={celda}>{it.nombre}</td>
                  <td style={{ ...celda, color: GRIS, fontSize: 10.5 }}>{it.unidad || '—'}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right' }}>{it.cantidad}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right', color: GRIS }}>{moneda(it.precio)}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right', fontWeight: 600 }}>{moneda(it.subtotal)}</td>
                  <td style={{ ...celda, ...tabular, textAlign: 'right', color: GRIS_SUAVE, fontSize: 10.5 }}>
                    {it.litros > 0 ? formatLitros(it.litros) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* El desglose, que explica por que el total no es la suma de arriba */}
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${BORDE}`, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: GRIS }}>
          <span>Subtotal <strong style={{ ...tabular, color: TINTA_MEDIA }}>{moneda(fila.subtotal)}</strong></span>
          {fila.descuento > 0 && <span>Descuento <strong style={{ ...tabular, color: ACENTO }}>−{moneda(fila.descuento)}</strong></span>}
          {fila.costo_envio > 0 && <span>Envío <strong style={{ ...tabular, color: TINTA_MEDIA }}>{moneda(fila.costo_envio)}</strong></span>}
          <span>Total <strong style={{ ...tabular, color: TINTA }}>{moneda(fila.total)}</strong></span>
        </div>
      </div>

      <div>
        <p style={sub}>Pagos</p>
        {fila.pagos.length === 0 ? (
          <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5 }}>Sin pagos registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {fila.pagos.map((pg, i) => {
                const cancelado = !!pg.cancelado_at
                return (
                  <tr key={pg.id} style={{ borderTop: i ? `1px solid ${PISTA}` : 'none', opacity: cancelado ? 0.5 : 1 }}>
                    <td style={{ ...celda, ...tabular }}>{etiquetaFecha(pg.fecha_pago)}</td>
                    <td style={{ ...celda, color: GRIS, fontSize: 10.5 }}>{pg.metodo || '—'}</td>
                    <td style={{ ...celda, color: GRIS_SUAVE, fontSize: 10.5, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }} title={pg.referencia || ''}>
                      {pg.referencia || ''}
                    </td>
                    <td style={{ ...celda, ...tabular, textAlign: 'right', fontWeight: 600, textDecoration: cancelado ? 'line-through' : 'none' }}>
                      {moneda(pg.monto)}
                    </td>
                    <td style={{ ...celda, textAlign: 'right' }}>
                      {cancelado ? (
                        <span style={{ color: ROJO, fontSize: 10 }} title={pg.cancelado_motivo || ''}>cancelado</span>
                      ) : canEdit ? (
                        <button
                          type="button"
                          onClick={() => onCancelarPago(fila, pg.id)}
                          style={{ padding: '2px 7px', background: '#fff', border: `1px solid ${PISTA}`, borderRadius: 5, color: GRIS_SUAVE, fontSize: 10, cursor: 'pointer' }}
                        >
                          cancelar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${BORDE}`, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: GRIS }}>
          {fila.condiciones_pago && <span>Condiciones <strong style={{ color: TINTA_MEDIA }}>{fila.condiciones_pago.replace('_', ' ')}</strong></span>}
          {fila.fecha_vencimiento && <span>Vence <strong style={{ ...tabular, color: fila.dias_vencido > 0 ? ROJO : TINTA_MEDIA }}>{etiquetaFecha(fila.fecha_vencimiento)}</strong></span>}
          {fila.folio_factura && <span>Factura <strong style={{ color: TINTA_MEDIA }}>{fila.folio_factura}</strong></span>}
          {/* created_at es auditoria: cuando se CAPTURO, no la fecha del pedido. */}
          <span title="Cuándo se capturó en el sistema">
            Capturado <strong style={{ color: GRIS_SUAVE }}>{etiquetaFecha(fila.created_at)}</strong>
          </span>
        </div>

        {fila.notas && (
          <p style={{ margin: '9px 0 0', color: GRIS, fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{fila.notas}</p>
        )}

        {/* Envio y eliminar: lo poco frecuente, pero sin otro lugar donde vivir. */}
        {canEdit && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: GRIS, fontSize: 11 }}>
              {fila.paqueteria || fila.guia_envio
                ? <>Envio: <strong style={{ color: TINTA_MEDIA }}>{fila.paqueteria || 's/paqueteria'}</strong>{fila.guia_envio ? ` · guia ${fila.guia_envio}` : ''}</>
                : 'Sin datos de envio'}
            </span>
            <button
              type="button"
              onClick={() => onEnvio(fila)}
              style={{ padding: '4px 10px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 6, color: TINTA_MEDIA, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              {fila.paqueteria || fila.guia_envio ? 'Editar envio' : 'Capturar envio'}
            </button>
            <button
              type="button"
              onClick={() => onEliminar(fila)}
              style={{ marginLeft: 'auto', padding: '4px 10px', background: '#fff', border: '1px solid #fecaca', borderRadius: 6, color: ROJO, fontSize: 11, cursor: 'pointer' }}
            >
              Eliminar pedido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

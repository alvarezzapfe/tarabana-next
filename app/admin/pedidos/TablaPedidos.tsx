'use client'
import { useEffect, useMemo, useState } from 'react'
import AccionEditarProductos from './AccionEditarProductos'
import { etiquetaFecha } from '../../../src/lib/fechas'
import { formatLitros } from '../../../src/lib/unidades'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type ColumnaOpcional, type ColumnaOrden, type FilaPedido, type Orden,
  estadoDe, moneda, tabular, totalesDe,
} from './pedidos-ui'

/**
 * Tabla de Pedidos.
 *
 * Header fijo, orden por cualquier columna y totales del filtro al pie. El
 * detalle ya no es una fila que se expande: la fila abre `PanelPedido`, que
 * vive en el padre. Una fila que crece empujaba la tabla y no daba ancho
 * para cuatro pestanas.
 *
 * El total de la columna es `total_con_envio`, no `pedidos.total`: ese es el
 * importe BRUTO antes de descuento y envio, y usarlo haria que la suma del
 * pie no cuadre con lo que se cobra (ver docs/SCHEMA_NOTES.md).
 */

type Columna = {
  key: ColumnaOrden
  label: string
  num?: boolean
  /** Ancho fijo. El cliente no lo lleva: es la columna que crece. */
  ancho?: number
  opcional?: ColumnaOpcional
}

/** Lo que la columna de cliente nunca baja, aunque la ventana apriete. */
const ANCHO_CLIENTE = 220
const ANCHO_ACCIONES = 160
const ANCHO_CHECK = 30

/**
 * Los anchos.
 *
 * Con las opcionales escondidas la suma da 1068, y el area de contenido del
 * admin a 1440px da 1084 (1440 menos 240 de sidebar, 88 de padding y 28 de
 * la card): la vista de todos los dias entra sin scroll horizontal. Con las
 * tres opcionales prendidas no entra, y para eso esta el boton de Columnas.
 */
const COLUMNAS: Columna[] = [
  { key: 'folio', label: 'Folio', ancho: 74 },
  { key: 'fecha_pedido', label: 'Fecha', ancho: 92 },
  { key: 'cliente', label: 'Cliente' },
  { key: 'vendedor', label: 'Vendedor', ancho: 110, opcional: 'vendedor' },
  { key: 'litros', label: 'Litros', num: true, ancho: 78 },
  { key: 'total', label: 'Total', num: true, ancho: 92 },
  { key: 'cobrado', label: 'Cobrado', num: true, ancho: 92 },
  { key: 'saldo', label: 'Saldo', num: true, ancho: 112 },
  { key: 'estado', label: 'Estado', ancho: 118 },
  { key: 'entrega', label: 'Entrega', ancho: 96, opcional: 'entrega' },
  { key: 'orden_compra', label: 'OC', ancho: 92, opcional: 'orden_compra' },
]

/** Primera vez: lo grande y lo reciente primero, que es lo que se busca. */
const DESC_PRIMERO: ColumnaOrden[] = ['fecha_pedido', 'litros', 'total', 'cobrado', 'saldo', 'entrega']

/**
 * Zebra, hover y la fila abierta en CSS y no inline: `:hover` no existe en
 * un style de React, y sin hover una tabla de doce columnas no deja seguir
 * la fila con la vista.
 */
const CSS = `
  .tp-fila { background: #fff; }
  .tp-fila.tp-par { background: #fcfcfd; }
  .tp-fila:hover { background: #f5f6f8; }
  .tp-fila.tp-abierta, .tp-fila.tp-abierta:hover { background: #f2f3f6; }
  .tp-fila.tp-sel, .tp-fila.tp-sel:hover { background: #fff7f3; }
  .tp-mas { opacity: 0.5; }
  .tp-fila:hover .tp-mas { opacity: 1; }
`

type Props = {
  filas: FilaPedido[]
  orden: Orden
  onOrden: (o: Orden) => void
  /** Que opcionales se pintan. Lo decide el padre: dato + preferencia. */
  columnas: Record<ColumnaOpcional, boolean>
  /** El pedido con el panel abierto, para marcar su fila. */
  abierta: string | null
  onAbrir: (id: string) => void
  seleccion: Set<string>
  onSeleccion: (s: Set<string>) => void
  canEdit: boolean
  onPago: (f: FilaPedido) => void
  onStatus: (f: FilaPedido) => void
  onEditarPartidas: (f: FilaPedido) => void
}

export default function TablaPedidos(props: Props) {
  const {
    filas, orden, onOrden, columnas, abierta, onAbrir,
    seleccion, onSeleccion, canEdit, onPago, onStatus, onEditarPartidas,
  } = props

  /** El menu de la fila, anclado al boton en coordenadas de ventana. */
  const [menu, setMenu] = useState<{ fila: FilaPedido; x: number; y: number } | null>(null)

  const visibles = useMemo(
    () => COLUMNAS.filter(c => !c.opcional || columnas[c.opcional]),
    [columnas]
  )
  const totales = useMemo(() => totalesDe(filas), [filas])

  // Un scroll o un resize mueven el boton; el menu se quedaria flotando lejos.
  useEffect(() => {
    if (!menu) return
    const cerrar = () => setMenu(null)
    window.addEventListener('mousedown', cerrar)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      window.removeEventListener('mousedown', cerrar)
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [menu])

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
    if (orden.columna === c) onOrden({ columna: c, asc: !orden.asc })
    else onOrden({ columna: c, asc: !DESC_PRIMERO.includes(c) })
  }

  const th: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 2, background: '#fff',
    padding: '9px 8px', fontSize: 10, fontWeight: 600, color: GRIS_SUAVE,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: `1px solid ${BORDE}`, whiteSpace: 'nowrap', cursor: 'pointer',
    userSelect: 'none', overflow: 'hidden',
  }
  // `overflow: hidden` porque con table-layout fixed lo que no cabe se
  // derrama sobre la celda de al lado en vez de ensanchar la columna.
  const td: React.CSSProperties = {
    padding: '6px 8px', fontSize: 12.5, borderBottom: `1px solid ${PISTA}`,
    color: TINTA_MEDIA, whiteSpace: 'nowrap', overflow: 'hidden',
  }

  if (filas.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
        Ningún pedido coincide con los filtros.
      </div>
    )
  }

  /**
   * El pie se arma columna por columna, no con colSpan a ojo: con columnas
   * que se esconden, un colSpan fijo deja los totales bajo la columna
   * equivocada. Solo se juntan las de la izquierda del primer numero, que es
   * donde va el conteo.
   */
  const iLitros = visibles.findIndex(c => c.key === 'litros')
  const corte = iLitros < 0 ? visibles.length : iLitros
  const pieNumero: Partial<Record<ColumnaOrden, { texto: string; color: string }>> = {
    litros: { texto: formatLitros(totales.litros), color: GRIS },
    total: { texto: moneda(totales.total), color: TINTA },
    cobrado: { texto: moneda(totales.cobrado), color: '#047857' },
    saldo: { texto: moneda(totales.saldo), color: totales.saldo > 0 ? ACENTO : GRIS_SUAVE },
  }
  const pie: React.CSSProperties = {
    ...td, position: 'sticky', bottom: 0, background: '#fff',
    borderTop: `1px solid ${BORDE}`, borderBottom: 'none',
  }

  const anchoMin =
    (canEdit ? ANCHO_CHECK : 0) + ANCHO_ACCIONES +
    visibles.reduce((a, c) => a + (c.ancho ?? ANCHO_CLIENTE), 0)

  return (
    <div style={{ overflowX: 'auto' }}>
      <style>{CSS}</style>
      {/*
        `table-layout: fixed` y no auto: es lo que le da ancho DEFINIDO a la
        celda de cliente, y sin ancho definido no hay ellipsis que funcione
        — el intento anterior lo resolvia con `max-width: 0`, que es justo lo
        que colapsaba la columna a ocho caracteres. De paso, las columnas
        quedan donde dice el header y los totales del pie caen exactos.
      */}
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, minWidth: anchoMin }}>
        <thead>
          <tr>
            {canEdit && (
              <th style={{ ...th, width: ANCHO_CHECK, cursor: 'default', paddingLeft: 2 }}>
                <input
                  type="checkbox"
                  checked={todasSel}
                  onChange={alternarTodas}
                  title="Seleccionar todo lo filtrado"
                  style={{ cursor: 'pointer' }}
                />
              </th>
            )}
            {visibles.map(c => {
              const activa = orden.columna === c.key
              return (
                <th
                  key={c.key}
                  onClick={() => clickHeader(c.key)}
                  title={`Ordenar por ${c.label.toLowerCase()}`}
                  style={{
                    ...th,
                    // El cliente se queda con todo el sobrante: es el dato
                    // que se lee, y truncarlo es lo que obliga a abrir la fila.
                    width: c.ancho ?? '100%',
                    minWidth: c.ancho ?? ANCHO_CLIENTE,
                    textAlign: c.num ? 'right' : 'left',
                    color: activa ? ACENTO : GRIS_SUAVE,
                  }}
                >
                  {c.label}
                  <span style={{ opacity: activa ? 1 : 0, marginLeft: 3 }}>{orden.asc ? '▲' : '▼'}</span>
                </th>
              )
            })}
            <th style={{ ...th, width: ANCHO_ACCIONES, cursor: 'default', textAlign: 'right' }} />
          </tr>
        </thead>

        <tbody>
          {filas.map((f, i) => {
            const es = estadoDe(f)
            const esta = abierta === f.id
            const sel = seleccion.has(f.id)
            const puedeCobrar = canEdit && f.saldo > 0 && f.status !== 'cancelado'
            const clases = [
              'tp-fila',
              i % 2 ? 'tp-par' : '',
              sel ? 'tp-sel' : '',
              esta ? 'tp-abierta' : '',
            ].filter(Boolean).join(' ')

            return (
              /* Toda la fila abre el panel de detalle: es lo que se quiere el
                 90% de las veces, y deja la columna de acciones para lo que
                 de verdad hace algo. */
              <tr
                key={f.id}
                className={clases}
                onClick={() => onAbrir(f.id)}
                style={{ height: 52, cursor: 'pointer' }}
              >
                {canEdit && (
                  <td style={{ ...td, paddingLeft: 2 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={sel} onChange={() => alternar(f.id)} style={{ cursor: 'pointer' }} />
                  </td>
                )}

                <td style={td}>
                  <span className="font-mono" style={{ color: TINTA, fontWeight: 600 }}>{f.folio}</span>
                </td>

                <td style={{ ...td, ...tabular }}>{etiquetaFecha(f.fecha_pedido)}</td>

                <td style={{ ...td, width: '100%', minWidth: ANCHO_CLIENTE, overflow: 'hidden' }}>
                  <span
                    style={{ display: 'block', color: TINTA, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={f.cliente}
                  >
                    {f.cliente}
                  </span>
                  {f.cliente_sub && (
                    <span
                      style={{ display: 'block', marginTop: 1, color: GRIS_SUAVE, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={f.cliente_sub}
                    >
                      {f.cliente_sub}
                    </span>
                  )}
                </td>

                {columnas.vendedor && (
                  <td style={{ ...td, color: f.vendedor ? TINTA_MEDIA : GRIS_SUAVE, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.vendedor || 'Sin vendedor'}>
                    {f.vendedor || '—'}
                  </td>
                )}

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

                {/* Un solo chip: gana el estado que pide accion, el otro
                    dato baja en gris. */}
                <td style={td}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: es.fondo, color: es.color, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {es.label}
                  </span>
                  {es.sub && (
                    <span style={{ display: 'block', marginTop: 2, color: GRIS_SUAVE, fontSize: 10 }}>
                      {es.sub}
                    </span>
                  )}
                </td>

                {columnas.entrega && (
                  <td style={{ ...td, ...tabular, color: f.fecha_entrega_real ? '#047857' : GRIS }}>
                    {f.fecha_entrega_real
                      ? etiquetaFecha(f.fecha_entrega_real)
                      : f.fecha_entrega
                        ? <span title="Programada">{etiquetaFecha(f.fecha_entrega)}</span>
                        : '—'}
                  </td>
                )}

                {columnas.orden_compra && (
                  <td style={{ ...td, color: f.orden_compra ? TINTA_MEDIA : GRIS_SUAVE, maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.orden_compra || ''}>
                    {f.orden_compra || '—'}
                  </td>
                )}

                {/* Una sola accion a la vista. El resto en el menu: tres
                    botones por fila convierten la columna en ruido. */}
                <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {puedeCobrar && (
                      <button
                        type="button"
                        onClick={() => onPago(f)}
                        style={{
                          padding: '5px 10px', background: '#fff', border: `1px solid ${ACENTO}`,
                          borderRadius: 6, color: ACENTO, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        Registrar pago
                      </button>
                    )}
                    <button
                      type="button"
                      className="tp-mas"
                      title="Más acciones"
                      aria-label={`Más acciones de ${f.folio}`}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenu(m => (m && m.fila.id === f.id ? null : { fila: f, x: r.right, y: r.bottom + 4 }))
                      }}
                      style={{
                        padding: '3px 7px', background: '#fff', border: `1px solid ${BORDE}`,
                        borderRadius: 6, color: GRIS, fontSize: 13, lineHeight: 1.1,
                        cursor: 'pointer',
                      }}
                    >
                      ⋯
                    </button>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>

        {/* Totales del filtro, pegados abajo y cada uno bajo su columna */}
        <tfoot>
          <tr>
            <td colSpan={corte + (canEdit ? 1 : 0)} style={{ ...pie, color: GRIS, fontSize: 11.5 }}>
              {totales.pedidos} {totales.pedidos === 1 ? 'pedido' : 'pedidos'} en el filtro
            </td>
            {visibles.slice(corte).map(c => {
              const v = pieNumero[c.key]
              return (
                <td
                  key={c.key}
                  style={{
                    ...pie,
                    ...(v ? tabular : {}),
                    textAlign: c.num ? 'right' : 'left',
                    color: v?.color,
                    fontWeight: v ? 700 : 400,
                  }}
                >
                  {v?.texto}
                </td>
              )
            })}
            <td style={pie} />
          </tr>
        </tfoot>
      </table>

      {menu && (
        <MenuFila
          fila={menu.fila}
          x={menu.x}
          y={menu.y}
          canEdit={canEdit}
          onStatus={onStatus}
          onEditarPartidas={onEditarPartidas}
          onCerrar={() => setMenu(null)}
        />
      )}
    </div>
  )
}

/**
 * El menu de la fila.
 *
 * Va en `position: fixed` con las coordenadas del boton y no absolute
 * dentro de la celda: la tabla vive en dos contenedores con scroll y un
 * menu absoluto se corta en el borde.
 */
function MenuFila({ fila, x, y, canEdit, onStatus, onEditarPartidas, onCerrar }: {
  fila: FilaPedido
  x: number
  y: number
  canEdit: boolean
  onStatus: (f: FilaPedido) => void
  onEditarPartidas: (f: FilaPedido) => void
  onCerrar: () => void
}) {
  const item: React.CSSProperties = {
    display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
    background: 'none', border: 'none', color: TINTA_MEDIA, fontSize: 12.5,
    textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', top: y, left: x, transform: 'translateX(-100%)', zIndex: 60,
        minWidth: 182, padding: '4px 0', background: '#fff',
        border: `1px solid ${BORDE}`, borderRadius: 9,
        boxShadow: '0 8px 24px rgba(17,24,39,0.12)',
      }}
    >
      <a href={`/admin/pedidos/${fila.id}/edit`} style={item}>Ver pedido</a>
      {/* Debajo de "Ver pedido" y nunca escondida: en un pedido que no se
          puede editar sale apagada con el motivo y con la salida real. */}
      {canEdit && (
        <AccionEditarProductos
          pedido={fila}
          estilo={item}
          onEditar={() => onEditarPartidas(fila)}
          onAntes={onCerrar}
        />
      )}
      {canEdit && fila.status !== 'cancelado' && (
        <button type="button" onClick={() => { onCerrar(); onStatus(fila) }} style={item}>
          Cambiar status
        </button>
      )}
      <a href={`/api/pedidos/${fila.id}/documento`} style={item}>Descargar Word</a>
    </div>
  )
}

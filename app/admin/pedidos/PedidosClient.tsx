'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { etiquetaFecha } from '../../../src/lib/fechas'
import { formatLitros } from '../../../src/lib/unidades'
import ImportarExcel from './ImportarExcel'
import FiltrosPedidos from './FiltrosPedidos'
import TablaPedidos from './TablaPedidos'
import DrawerPago from './DrawerPago'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type FilaPedido, type Filtros, type Orden,
  FILTROS_VACIOS, STATUS, armarFilas, card, cobroDe, filtrar, moneda,
  ordenar, statusDe, tabular, totalesDe,
} from './pedidos-ui'

/**
 * Pedidos.
 *
 * El orquestador: no carga nada, recibe las consultas de TodosSection y arma
 * las filas con `armarFilas`. La tabla, los filtros y el drawer de pago viven
 * en sus propios archivos.
 *
 * Las acciones reusan las rutas que ya existen — pagos, status y el documento
 * Word — en vez de tener su propia version.
 */

const CSS = `
  .pd-tabla { display: block; }
  .pd-movil { display: none; }
  @media (max-width: 860px) {
    .pd-tabla { display: none; }
    .pd-movil { display: block; }
  }
`

type Props = {
  pedidos: Record<string, unknown>[]
  saldos: Record<string, unknown>[]
  pagos: Record<string, unknown>[]
  vendedores: { id: string; nombre: string }[]
  canEdit: boolean
  canCreate: boolean
  puedeDescuento: boolean
}

export default function PedidosClient(props: Props) {
  const { pedidos, saldos, pagos, vendedores, canEdit, canCreate, puedeDescuento } = props
  const router = useRouter()

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<Orden>({ columna: 'fecha_pedido', asc: false })
  const [expandida, setExpandida] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [pagoDe, setPagoDe] = useState<FilaPedido | null>(null)
  const [statusPedido, setStatusPedido] = useState<FilaPedido | null>(null)
  const [envioDe, setEnvioDe] = useState<FilaPedido | null>(null)
  const [importar, setImportar] = useState(false)
  const [trabajando, setTrabajando] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const todas = useMemo(() => armarFilas(pedidos, saldos, pagos), [pedidos, saldos, pagos])
  const filtradas = useMemo(() => ordenar(filtrar(todas, filtros), orden), [todas, filtros, orden])
  const totales = useMemo(() => totalesDe(filtradas), [filtradas])
  const seleccionadas = useMemo(() => filtradas.filter(f => seleccion.has(f.id)), [filtradas, seleccion])

  const refrescar = () => { router.refresh(); setSeleccion(new Set()) }

  /**
   * Marca entregadas las seleccionadas, una por una.
   *
   * No hay ruta de lote: se reusa la de status, que es la que descuenta
   * inventario. Por eso se reporta pedido por pedido — entregar puede fallar
   * por falta de stock, y en ese caso el resto si debe pasar.
   */
  const marcarEntregadas = async () => {
    const pendientes = seleccionadas.filter(f => f.status !== 'entregado' && f.status !== 'cancelado')
    if (pendientes.length === 0) { setAviso('Las seleccionadas ya estan entregadas o canceladas.'); return }
    if (!confirm(`Marcar ${pendientes.length} como entregados? Esto descuenta inventario.`)) return

    setTrabajando('entregar'); setError(''); setAviso('')
    const ok: string[] = []
    const fallo: string[] = []

    for (const f of pendientes) {
      const res = await fetch(`/api/admin/pedidos/${f.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'entregado' }),
      })
      if (res.ok) ok.push(f.folio)
      else {
        const d = await res.json().catch(() => ({}))
        fallo.push(`${f.folio}: ${d.error || 'error'}`)
      }
    }

    setTrabajando('')
    setAviso(
      `${ok.length} ${ok.length === 1 ? 'entregado' : 'entregados'}.` +
      (fallo.length ? ` No se pudo con ${fallo.length}: ${fallo.join('; ')}` : '')
    )
    refrescar()
  }

  /** Exporta lo seleccionado, o lo filtrado si no hay seleccion. */
  const exportar = async () => {
    const fuente = seleccionadas.length ? seleccionadas : filtradas
    if (fuente.length === 0) return
    setTrabajando('exportar'); setError('')

    const filas = fuente.map(f => ({
      Folio: f.folio,
      'Fecha pedido': f.fecha_pedido,
      Cliente: f.cliente,
      Vendedor: f.vendedor || '',
      Litros: Math.round(f.litros * 100) / 100,
      Subtotal: f.subtotal,
      Descuento: f.descuento,
      Envio: f.costo_envio,
      Total: f.total,
      Cobrado: f.cobrado,
      Saldo: f.saldo,
      'Pct cobrado': Math.round(f.pctCobrado),
      Status: statusDe(f.status).label,
      Cobro: cobroDe(f.estado_cobro).label,
      'Dias vencido': f.dias_vencido,
      Condiciones: f.condiciones_pago || '',
      Vencimiento: f.fecha_vencimiento || '',
      'Entrega programada': f.fecha_entrega || '',
      'Entrega real': f.fecha_entrega_real || '',
      'Orden de compra': f.orden_compra || '',
      'Folio factura': f.folio_factura || '',
    }))

    const partidas = fuente.flatMap(f =>
      f.items.map(it => ({
        Folio: f.folio,
        'Fecha pedido': f.fecha_pedido,
        Cliente: f.cliente,
        Producto: it.nombre,
        Presentacion: it.unidad || '',
        Cantidad: it.cantidad,
        Litros: Math.round(it.litros * 100) / 100,
        'Precio unitario': it.precio,
        Importe: it.subtotal,
      }))
    )

    const t = totalesDe(fuente)
    const resumen = [
      { Concepto: 'Pedidos', Valor: t.pedidos },
      { Concepto: 'Litros', Valor: Math.round(t.litros * 100) / 100 },
      { Concepto: 'Total', Valor: t.total },
      { Concepto: 'Cobrado', Valor: t.cobrado },
      { Concepto: 'Saldo', Valor: t.saldo },
    ]

    const archivo = `Pedidos-Tarabana-${filtros.desde || 'todo'}${filtros.hasta ? '_' + filtros.hasta : ''}.xlsx`

    try {
      const res = await fetch('/api/admin/pedidos/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archivo,
          hojas: [
            { nombre: 'Pedidos', columnas: Object.keys(filas[0]), filas },
            ...(partidas.length ? [{ nombre: 'Partidas', columnas: Object.keys(partidas[0]), filas: partidas }] : []),
            { nombre: 'Resumen', columnas: ['Concepto', 'Valor'], filas: resumen, anchos: [20, 16] },
          ],
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'No se pudo generar el export.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = archivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Se cayo la conexion al generar el export.')
    } finally {
      setTrabajando('')
    }
  }

  const cambiarStatus = async (fila: FilaPedido, status: string) => {
    setTrabajando(fila.id); setError('')
    const res = await fetch(`/api/admin/pedidos/${fila.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setTrabajando('')
    setStatusPedido(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(`${fila.folio}: ${d.error || 'no se pudo cambiar el status'}`)
      return
    }
    refrescar()
  }

  /**
   * Cancela un pago. El motivo es obligatorio del lado del servidor, asi que
   * se pide aqui en vez de mandar vacio y comerse el 400.
   */
  const cancelarPago = async (fila: FilaPedido, pagoId: string) => {
    const motivo = prompt(`Motivo para cancelar el pago de ${fila.folio}:`)
    if (motivo === null) return
    if (!motivo.trim()) { setError('El motivo para cancelar un pago es obligatorio.'); return }

    setTrabajando(pagoId); setError('')
    const res = await fetch(`/api/admin/pagos/${pagoId}/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() }),
    })
    setTrabajando('')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'No se pudo cancelar el pago.')
      return
    }
    setAviso(`Pago cancelado en ${fila.folio}.`)
    refrescar()
  }

  /**
   * Borra el pedido. Irreversible y se lleva sus partidas, asi que se pide
   * confirmacion con el folio y el monto a la vista.
   */
  const eliminar = async (fila: FilaPedido) => {
    if (!confirm(`Eliminar ${fila.folio} de ${fila.cliente} por ${moneda(fila.total)}? No se puede deshacer.`)) return
    setTrabajando(fila.id); setError('')
    const res = await fetch(`/api/admin/pedidos/${fila.id}/eliminar`, { method: 'DELETE' })
    setTrabajando('')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'No se pudo eliminar el pedido.')
      return
    }
    setExpandida(null)
    setAviso(`${fila.folio} eliminado.`)
    refrescar()
  }

  const btn = (fondo: string, color: string, borde = 'transparent'): React.CSSProperties => ({
    padding: '8px 14px', background: fondo, border: `1px solid ${borde}`, borderRadius: 8,
    color, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{CSS}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 3px', color: TINTA, fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Pedidos
          </h1>
          <p style={{ margin: 0, color: GRIS, fontSize: 12.5 }}>
            {todas.length} en total · {moneda(totales.saldo)} por cobrar en el filtro
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={exportar} disabled={!!trabajando} style={btn('#fff', TINTA_MEDIA, BORDE)}>
            {trabajando === 'exportar' ? 'Generando...' : seleccionadas.length ? `Exportar ${seleccionadas.length}` : 'Exportar'}
          </button>
          {canCreate && (
            <button type="button" onClick={() => setImportar(true)} style={btn('#fff', TINTA_MEDIA, BORDE)}>
              Cargar Excel
            </button>
          )}
          {canCreate && (
            <a href="/admin/pedidos/nuevo" style={{ ...btn(ACENTO, '#fff'), textDecoration: 'none' }}>
              + Nuevo pedido
            </a>
          )}
        </div>
      </div>

      {aviso && (
        <p style={{ padding: '10px 13px', marginBottom: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 12.5 }}>
          {aviso}
        </p>
      )}
      {error && (
        <p style={{ padding: '10px 13px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5 }}>
          {error}
        </p>
      )}

      <FiltrosPedidos
        filtros={filtros}
        onFiltros={f => { setFiltros(f); setSeleccion(new Set()) }}
        filas={todas}
        vendedores={vendedores}
        visibles={filtradas.length}
      />

      {canEdit && seleccionadas.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 12, background: '#fff7f3', border: `1px solid ${ACENTO}`, borderRadius: 10, flexWrap: 'wrap' }}>
          <span style={{ color: TINTA, fontSize: 12.5, fontWeight: 600 }}>
            {seleccionadas.length} {seleccionadas.length === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <span style={{ ...tabular, color: GRIS, fontSize: 12 }}>
            {moneda(totalesDe(seleccionadas).total)} · {formatLitros(totalesDe(seleccionadas).litros)}
          </span>
          <button type="button" onClick={marcarEntregadas} disabled={!!trabajando} style={{ ...btn('#fff', '#047857', '#bbf7d0'), marginLeft: 'auto' }}>
            {trabajando === 'entregar' ? 'Marcando...' : 'Marcar entregado'}
          </button>
          <button type="button" onClick={exportar} disabled={!!trabajando} style={btn('#fff', TINTA_MEDIA, BORDE)}>
            Exportar
          </button>
          <button type="button" onClick={() => setSeleccion(new Set())} style={btn('#fff', GRIS, PISTA)}>
            Quitar seleccion
          </button>
        </div>
      )}

      <div className="pd-tabla" style={{ ...card, padding: '6px 14px 0', maxHeight: '72vh', overflowY: 'auto' }}>
        <TablaPedidos
          filas={filtradas}
          orden={orden}
          onOrden={setOrden}
          expandida={expandida}
          onExpandir={setExpandida}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          canEdit={canEdit}
          onPago={setPagoDe}
          onStatus={setStatusPedido}
          onEnvio={setEnvioDe}
          onCancelarPago={cancelarPago}
          onEliminar={eliminar}
        />
      </div>

      {/* Movil: una tarjeta por pedido. */}
      <div className="pd-movil" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtradas.length === 0 && (
          <p style={{ padding: '36px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
            Ningun pedido coincide con los filtros.
          </p>
        )}
        {filtradas.map(f => {
          const st = statusDe(f.status)
          const cb = cobroDe(f.estado_cobro)
          return (
            <div key={f.id} style={{ ...card, padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span className="font-mono" style={{ color: TINTA, fontSize: 13, fontWeight: 700 }}>{f.folio}</span>
                <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 11 }}>{etiquetaFecha(f.fecha_pedido)}</span>
                <span style={{ ...tabular, marginLeft: 'auto', color: TINTA, fontSize: 15, fontWeight: 700 }}>{moneda(f.total)}</span>
              </div>

              <p style={{ margin: '0 0 8px', color: TINTA_MEDIA, fontSize: 12.5 }}>{f.cliente}</p>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
                <span style={{ padding: '2px 8px', borderRadius: 99, background: st.fondo, color: st.color, fontSize: 10.5, fontWeight: 600 }}>{st.label}</span>
                <span style={{ padding: '2px 8px', borderRadius: 99, background: cb.fondo, color: cb.color, fontSize: 10.5, fontWeight: 600 }}>
                  {cb.label}{f.dias_vencido > 0 ? ` · ${f.dias_vencido} d` : ''}
                </span>
                {f.litros > 0 && (
                  <span style={{ ...tabular, padding: '2px 8px', borderRadius: 99, background: PISTA, color: GRIS, fontSize: 10.5 }}>
                    {formatLitros(f.litros)}
                  </span>
                )}
                {f.orden_compra && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: PISTA, color: GRIS, fontSize: 10.5 }}>
                    OC {f.orden_compra}
                  </span>
                )}
              </div>

              {f.saldo > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: GRIS }}>Cobrado {moneda(f.cobrado)}</span>
                    <span style={{ ...tabular, color: f.dias_vencido > 0 ? ROJO : TINTA_MEDIA, fontWeight: 600 }}>
                      Saldo {moneda(f.saldo)}
                    </span>
                  </div>
                  <div style={{ height: 4, background: PISTA, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${f.pctCobrado}%`, height: '100%', background: ACENTO, borderRadius: 2 }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <a href={`/admin/pedidos/${f.id}/edit`} style={{ ...btn('#fff', GRIS, BORDE), padding: '6px 11px', fontSize: 12, textDecoration: 'none' }}>Ver</a>
                {canEdit && f.saldo > 0 && f.status !== 'cancelado' && (
                  <button type="button" onClick={() => setPagoDe(f)} style={{ ...btn('#fff', ACENTO, ACENTO), padding: '6px 11px', fontSize: 12 }}>Registrar pago</button>
                )}
                {canEdit && f.status !== 'cancelado' && (
                  <button type="button" onClick={() => setStatusPedido(f)} style={{ ...btn('#fff', GRIS, BORDE), padding: '6px 11px', fontSize: 12 }}>Status</button>
                )}
                <a href={`/api/pedidos/${f.id}/documento`} style={{ ...btn('#fff', GRIS, BORDE), padding: '6px 11px', fontSize: 12, textDecoration: 'none' }}>Word</a>
              </div>
            </div>
          )
        })}
      </div>

      {pagoDe && (
        <DrawerPago
          pedido={pagoDe}
          onCerrar={() => setPagoDe(null)}
          onListo={() => { setPagoDe(null); setAviso('Pago registrado.'); refrescar() }}
        />
      )}

      {statusPedido && (
        <div
          onClick={() => setStatusPedido(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '22px 24px', width: 'min(360px, 100%)' }}>
            <h3 style={{ margin: '0 0 4px', color: TINTA, fontSize: 15, fontWeight: 700 }}>Cambiar status</h3>
            <p style={{ margin: '0 0 16px', color: GRIS, fontSize: 12 }}>
              <span className="font-mono">{statusPedido.folio}</span> · {statusPedido.cliente}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {STATUS.filter(s => s.key !== 'cancelado').map(s => {
                const actual = statusPedido.status === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={actual || !!trabajando}
                    onClick={() => cambiarStatus(statusPedido, s.key)}
                    style={{
                      padding: '10px 12px', textAlign: 'left', borderRadius: 8, cursor: actual ? 'default' : 'pointer',
                      background: actual ? '#fafafa' : '#fff',
                      border: `1.5px solid ${BORDE}`,
                      color: actual ? GRIS_SUAVE : TINTA, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {s.label}
                    {actual && <span style={{ color: GRIS_SUAVE, fontWeight: 400, fontSize: 11 }}> · actual</span>}
                    {s.key === 'entregado' && !actual && (
                      <span style={{ display: 'block', color: GRIS, fontWeight: 400, fontSize: 10.5, marginTop: 2 }}>
                        Descuenta inventario
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setStatusPedido(null)}
              style={{ width: '100%', marginTop: 14, padding: '9px', background: '#fff', border: `1px solid ${PISTA}`, borderRadius: 8, color: GRIS, fontSize: 12.5, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {envioDe && (
        <ModalEnvio
          pedido={envioDe}
          puedeDescuento={puedeDescuento}
          onCerrar={() => setEnvioDe(null)}
          onListo={msg => { setEnvioDe(null); setAviso(msg); refrescar() }}
          onError={setError}
        />
      )}

      {importar && <ImportarExcel onClose={() => setImportar(false)} puedeDescuento={puedeDescuento} />}
    </div>
  )
}

/**
 * Captura de datos de envio: paqueteria, guia y costo.
 *
 * Es la UNICA entrada para paqueteria y guia en todo el admin — el
 * formulario de edicion no las toca —, asi que no puede desaparecer aunque
 * sea poco frecuente.
 *
 * El costo solo lo edita admin, igual que en el resto: la ruta lo valida
 * tambien, esto es para no ofrecer un campo que va a ser rechazado.
 */
function ModalEnvio({ pedido, puedeDescuento, onCerrar, onListo, onError }: {
  pedido: FilaPedido
  puedeDescuento: boolean
  onCerrar: () => void
  onListo: (mensaje: string) => void
  onError: (mensaje: string) => void
}) {
  const [paqueteria, setPaqueteria] = useState(pedido.paqueteria || '')
  const [guia, setGuia] = useState(pedido.guia_envio || '')
  const [costo, setCosto] = useState(pedido.costo_envio ? String(Math.round(pedido.costo_envio)) : '')
  const [enviando, setEnviando] = useState(false)

  const guardar = async () => {
    setEnviando(true)
    const res = await fetch(`/api/admin/pedidos/${pedido.id}/envio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paqueteria: paqueteria.trim() || null,
        guia_envio: guia.trim() || null,
        ...(puedeDescuento ? { costo_envio: Number(costo.replace(/[^\d.]/g, '')) || 0 } : {}),
      }),
    })
    if (res.ok) { onListo(`Envio actualizado en ${pedido.folio}.`); return }
    const d = await res.json().catch(() => ({}))
    onError(d.error || 'No se pudo guardar el envio.')
    setEnviando(false)
  }

  const campo: React.CSSProperties = {
    width: '100%', padding: '9px 11px', background: '#fff',
    border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA,
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    display: 'block', color: GRIS, fontSize: 10.5, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '22px 24px', width: 'min(400px, 100%)' }}>
        <h3 style={{ margin: '0 0 4px', color: TINTA, fontSize: 15, fontWeight: 700 }}>Datos de envio</h3>
        <p style={{ margin: '0 0 16px', color: GRIS, fontSize: 12 }}>
          <span className="font-mono">{pedido.folio}</span> · {pedido.cliente}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Paqueteria</label>
            <input autoFocus value={paqueteria} onChange={e => setPaqueteria(e.target.value)} placeholder="DHL, Estafeta, propia..." style={campo} />
          </div>
          <div>
            <label style={lbl}>Guia</label>
            <input value={guia} onChange={e => setGuia(e.target.value)} placeholder="Numero de rastreo" style={campo} />
          </div>
          {puedeDescuento && (
            <div>
              <label style={lbl}>Costo de envio</label>
              <input value={costo} onChange={e => setCosto(e.target.value)} inputMode="decimal" placeholder="0" style={{ ...campo, ...tabular }} />
              <p style={{ margin: '5px 0 0', color: GRIS_SUAVE, fontSize: 11 }}>
                Se suma al total del pedido y cambia el saldo.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button type="button" onClick={onCerrar} style={{ flex: 1, padding: '10px', background: '#fff', border: `1px solid ${PISTA}`, borderRadius: 8, color: GRIS, fontSize: 12.5, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={enviando}
            style={{ flex: 1, padding: '10px', background: ACENTO, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}
          >
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

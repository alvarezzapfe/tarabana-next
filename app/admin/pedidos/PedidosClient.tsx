'use client'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { etiquetaFecha } from '../../../src/lib/fechas'
import { formatLitros } from '../../../src/lib/unidades'
import ImportarExcel from './ImportarExcel'
import FiltrosPedidos from './FiltrosPedidos'
import TablaPedidos from './TablaPedidos'
import DrawerPago from './DrawerPago'
import PanelPedido from './PanelPedido'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type ColumnaOpcional, type FilaPedido, type Filtros, type Orden,
  COLUMNAS_OPCIONALES, FILTROS_VACIOS, STATUS, armarFilas, card, cobroDe,
  columnasConDato, estadoDe, filtrar, moneda, ordenar, statusDe, tabular,
  totalesDe,
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

/**
 * Tabla o tarjetas, nunca las dos.
 *
 * El `display` de `.pd-movil` vive aqui y NO en un style inline: un
 * `display: flex` inline le gana siempre a la clase, y por eso las tarjetas
 * se pintaban tambien en desktop, debajo de la tabla, con cada pedido dos
 * veces. Si se vuelve a necesitar flex en esa lista, va en el CSS.
 */
const CSS = `
  .pd-tabla { display: block; }
  .pd-movil { display: none; }
  .pd-herramientas { display: flex; }
  @media (max-width: 767px) {
    .pd-tabla { display: none; }
    .pd-movil { display: flex; flex-direction: column; gap: 10px; }
    .pd-herramientas { display: none; }
  }
`

const ETIQUETA_COLUMNA: Record<ColumnaOpcional, string> = {
  vendedor: 'Vendedor',
  entrega: 'Entrega',
  orden_compra: 'OC',
}

/**
 * La preferencia de columnas, en localStorage y leida como store externo.
 *
 * Va con `useSyncExternalStore` y no con un `useState` que se llena en un
 * efecto: localStorage no existe en el render del servidor, y este hook es
 * el que sabe servir un snapshot distinto en servidor y en cliente sin
 * desacomodar la hidratacion.
 *
 * Solo guarda lo que se eligio A MANO. Lo que no esta aqui lo decide el
 * dato, en `columnas`.
 */
type PrefColumnas = Partial<Record<ColumnaOpcional, boolean>>

const CLAVE_COLUMNAS = 'tarabana.pedidos.columnas'
const SIN_PREFERENCIA: PrefColumnas = {}

const oyentesCols = new Set<() => void>()
let crudoCols: string | null = null
let prefCols: PrefColumnas = SIN_PREFERENCIA

/** Tiene que devolver la MISMA referencia si nada cambio, o React cicla. */
function snapshotColumnas(): PrefColumnas {
  let crudo: string | null = null
  try {
    crudo = localStorage.getItem(CLAVE_COLUMNAS)
  } catch {
    // Modo privado: se trabaja sin preferencia guardada.
  }
  if (crudo !== crudoCols) {
    crudoCols = crudo
    let dato: unknown = null
    try {
      dato = crudo ? JSON.parse(crudo) : null
    } catch {
      dato = null
    }
    prefCols = dato && typeof dato === 'object' ? (dato as PrefColumnas) : SIN_PREFERENCIA
  }
  return prefCols
}

function suscribirColumnas(cambio: () => void) {
  oyentesCols.add(cambio)
  // Otra pestana con la misma tabla: la preferencia se sigue ahi tambien.
  window.addEventListener('storage', cambio)
  return () => {
    oyentesCols.delete(cambio)
    window.removeEventListener('storage', cambio)
  }
}

function guardarColumnas(pref: PrefColumnas) {
  try {
    localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(pref))
  } catch {
    // Sin cuota para guardar: la sesion actual igual respeta la eleccion.
    crudoCols = JSON.stringify(pref)
    prefCols = pref
  }
  for (const cambio of oyentesCols) cambio()
}

type Props = {
  pedidos: Record<string, unknown>[]
  saldos: Record<string, unknown>[]
  pagos: Record<string, unknown>[]
  vendedores: { id: string; nombre: string }[]
  /** Para resolver `pagos.registrado_por` a un nombre en el panel. */
  staff: { id: string; nombre: string }[]
  canEdit: boolean
  canCreate: boolean
  puedeDescuento: boolean
  esVendedor: boolean
  /** Solo super admin puede entregar un pedido sin descontar inventario. */
  esSuperAdmin: boolean
}

/** El parametro de la URL que abre el panel. */
const PARAM_PANEL = 'pedido'

export default function PedidosClient(props: Props) {
  const { pedidos, saldos, pagos, vendedores, staff, canEdit, canCreate, puedeDescuento, esVendedor, esSuperAdmin } = props
  const router = useRouter()
  const searchParams = useSearchParams()

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<Orden>({ columna: 'fecha_pedido', asc: false })
  const [menuCols, setMenuCols] = useState(false)
  const colsPref = useSyncExternalStore(suscribirColumnas, snapshotColumnas, () => SIN_PREFERENCIA)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [pagoDe, setPagoDe] = useState<FilaPedido | null>(null)
  const [statusPedido, setStatusPedido] = useState<FilaPedido | null>(null)
  /** Pedido al que se le va a marcar entrega sin tocar inventario. */
  const [sinStock, setSinStock] = useState<FilaPedido | null>(null)
  const [motivoSinStock, setMotivoSinStock] = useState('')
  const [importar, setImportar] = useState(false)
  const [trabajando, setTrabajando] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const todas = useMemo(() => armarFilas(pedidos, saldos, pagos), [pedidos, saldos, pagos])
  const filtradas = useMemo(() => ordenar(filtrar(todas, filtros), orden), [todas, filtros, orden])
  const totales = useMemo(() => totalesDe(filtradas), [filtradas])
  const seleccionadas = useMemo(() => filtradas.filter(f => seleccion.has(f.id)), [filtradas, seleccion])

  /**
   * Las columnas opcionales.
   *
   * Por default se esconden las que no traen dato en NINGUNA fila del
   * filtro: una columna de guiones no informa y le quita ancho al cliente.
   * La eleccion a mano pesa mas que eso y se guarda, para no volver a
   * prenderla cada vez que se entra.
   */
  const conDato = useMemo(() => columnasConDato(filtradas), [filtradas])
  const columnas = useMemo(
    () => Object.fromEntries(
      COLUMNAS_OPCIONALES.map(k => [k, colsPref[k] ?? conDato[k]])
    ) as Record<ColumnaOpcional, boolean>,
    [colsPref, conDato]
  )

  const alternarColumna = (k: ColumnaOpcional) =>
    guardarColumnas({ ...colsPref, [k]: !columnas[k] })

  /**
   * El panel de detalle vive en `?pedido=<id>`.
   *
   * Se mueve con `history.pushState` y no con `router.push`: las dos cosas
   * las sigue `useSearchParams`, pero la del router vuelve al servidor y
   * recargaria las tres consultas de pedidos cada vez que se abre o cierra
   * el panel. Abrir es push — asi el boton Atras cierra, que en movil es lo
   * que uno intenta —, y cerrar es replace, para no dejar basura en el
   * historial.
   */
  const abierta = searchParams.get(PARAM_PANEL)

  const urlCon = (id: string | null) => {
    const q = new URLSearchParams(searchParams.toString())
    if (id) q.set(PARAM_PANEL, id)
    else q.delete(PARAM_PANEL)
    const texto = q.toString()
    return texto ? `?${texto}` : window.location.pathname
  }

  const abrirPanel = (id: string) => window.history.pushState(null, '', urlCon(id))
  const cerrarPanel = () => window.history.replaceState(null, '', urlCon(null))

  /**
   * El pedido del panel sale de TODAS las filas y no de las filtradas: un
   * link con `?pedido=` tiene que abrir aunque los filtros de quien lo
   * recibe dejen ese pedido fuera.
   */
  const pedidoPanel = useMemo(
    () => (abierta ? todas.find(f => f.id === abierta) ?? null : null),
    [abierta, todas]
  )

  /** `pagos.registrado_por` es un uuid de auth.users; aqui se vuelve nombre. */
  const nombrePor = useMemo(() => {
    const mapa = new Map(staff.map(s => [s.id, s.nombre]))
    return (id: string | null) => (id ? mapa.get(id) ?? null : null)
  }, [staff])

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
   * Marca el pedido como entregado SIN descontar inventario.
   *
   * Para los pedidos que ya se entregaron en la realidad y cuyo stock se
   * ajusto a mano: marcarlos por el camino normal lo descontaria por segunda
   * vez. Pide motivo porque es la unica forma de cerrar un pedido fuera de
   * cuadre, y queda en audit_log como `pedido.entregado_sin_stock`.
   */
  const entregarSinStock = async () => {
    if (!sinStock) return
    const motivo = motivoSinStock.trim()
    if (!motivo) { setError('El motivo es obligatorio.'); return }

    const fila = sinStock
    setTrabajando(fila.id); setError('')
    const res = await fetch(`/api/admin/pedidos/${fila.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregado', sinDescontar: true, motivo }),
    })
    setTrabajando('')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(`${fila.folio}: ${d.error || 'no se pudo marcar como entregado'}`)
      return
    }
    setSinStock(null)
    setMotivoSinStock('')
    setAviso(`${fila.folio} quedó entregado sin tocar el inventario.`)
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
    cerrarPanel()
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

      <div className="pd-herramientas" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuCols(v => !v)}
            style={{ padding: '6px 11px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA_MEDIA, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Columnas
          </button>
          {menuCols && (
            <>
              {/* Un fondo invisible cierra el menu al picar afuera, sin
                  listeners sueltos en document. */}
              <div onClick={() => setMenuCols(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 41,
                  minWidth: 190, padding: '7px 0', background: '#fff',
                  border: `1px solid ${BORDE}`, borderRadius: 9,
                  boxShadow: '0 8px 24px rgba(17,24,39,0.12)',
                }}
              >
                {COLUMNAS_OPCIONALES.map(k => (
                  <label
                    key={k}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', color: TINTA_MEDIA, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={columnas[k]}
                      onChange={() => alternarColumna(k)}
                      style={{ cursor: 'pointer' }}
                    />
                    {ETIQUETA_COLUMNA[k]}
                    {!conDato[k] && (
                      <span style={{ marginLeft: 'auto', color: GRIS_SUAVE, fontSize: 10.5 }}>vacía</span>
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pd-tabla" style={{ ...card, padding: '6px 14px 0', maxHeight: '72vh', overflowY: 'auto' }}>
        <TablaPedidos
          filas={filtradas}
          orden={orden}
          onOrden={setOrden}
          columnas={columnas}
          abierta={abierta}
          onAbrir={abrirPanel}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          canEdit={canEdit}
          onPago={setPagoDe}
          onStatus={setStatusPedido}
        />
      </div>

      {/* Movil: una tarjeta por pedido, y SOLO abajo de 768px. El display
          lo pone `.pd-movil` en el CSS; no va inline. */}
      <div className="pd-movil">
        {filtradas.length === 0 && (
          <p style={{ padding: '36px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
            Ningun pedido coincide con los filtros.
          </p>
        )}
        {filtradas.map(f => {
          const es = estadoDe(f)
          return (
            <div key={f.id} style={{ ...card, padding: '13px 15px' }}>
              {/* El cuerpo de la tarjeta abre el panel, igual que la fila en
                  desktop; los botones de abajo quedan aparte para que no se
                  disparen los dos. En movil el panel ocupa la pantalla. */}
              <div onClick={() => abrirPanel(f.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span className="font-mono" style={{ color: TINTA, fontSize: 13, fontWeight: 700 }}>{f.folio}</span>
                <span style={{ ...tabular, color: GRIS_SUAVE, fontSize: 11 }}>{etiquetaFecha(f.fecha_pedido)}</span>
                <span style={{ ...tabular, marginLeft: 'auto', color: TINTA, fontSize: 15, fontWeight: 700 }}>{moneda(f.total)}</span>
              </div>

              <p style={{ margin: 0, color: TINTA, fontSize: 12.5, fontWeight: 600 }}>{f.cliente}</p>
              {f.cliente_sub && (
                <p style={{ margin: '1px 0 0', color: GRIS_SUAVE, fontSize: 11 }}>{f.cliente_sub}</p>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 9px' }}>
                {/* Un solo chip de estado, igual que en la tabla. */}
                <span style={{ padding: '2px 8px', borderRadius: 99, background: es.fondo, color: es.color, fontSize: 10.5, fontWeight: 600 }}>
                  {es.label}
                </span>
                {es.sub && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, background: PISTA, color: GRIS, fontSize: 10.5 }}>
                    {es.sub}
                  </span>
                )}
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

              </div>

              {/* Registrar pago primero: en movil es la unica razon por la
                  que alguien abre esta pantalla de pie en una entrega. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {canEdit && f.saldo > 0 && f.status !== 'cancelado' && (
                  <button type="button" onClick={() => setPagoDe(f)} style={{ ...btn('#fff', ACENTO, ACENTO), padding: '6px 11px', fontSize: 12 }}>Registrar pago</button>
                )}
                <a href={`/admin/pedidos/${f.id}/edit`} style={{ ...btn('#fff', GRIS, BORDE), padding: '6px 11px', fontSize: 12, textDecoration: 'none' }}>Ver</a>
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

      {/* Entregar sin descontar inventario. Modal propio y no un prompt del
          navegador: hay que decir con claridad que SI y que NO va a pasar
          antes de cerrar un pedido fuera de cuadre. */}
      {sinStock && (
        <div
          onClick={() => setSinStock(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '22px 24px', width: 'min(420px, 100%)' }}>
            <h3 style={{ margin: '0 0 4px', color: TINTA, fontSize: 15, fontWeight: 700 }}>
              Marcar entregado sin descontar inventario
            </h3>
            <p style={{ margin: '0 0 14px', color: GRIS, fontSize: 12 }}>
              <span className="font-mono">{sinStock.folio}</span> · {sinStock.cliente}
            </p>

            <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: TINTA_MEDIA, fontSize: 12, lineHeight: 1.7 }}>
              <li>El pedido pasa a <strong>entregado</strong>, con la fecha de entrega real de hoy.</li>
              <li><strong>No</strong> se toca el stock de ningún producto.</li>
              <li>Deja de contar como comprometido, así que el disponible sube.</li>
              <li>Queda registrado en Actividad con el motivo.</li>
            </ul>
            <p style={{ margin: '0 0 12px', padding: '8px 11px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 11.5 }}>
              Úsalo solo si el inventario ya se ajustó a mano por esta entrega. Si no, márcalo como
              entregado por el camino normal.
            </p>

            <label style={{ display: 'block', color: GRIS, fontSize: 11.5, marginBottom: 4 }}>
              Motivo (obligatorio)
            </label>
            <input
              value={motivoSinStock}
              onChange={e => setMotivoSinStock(e.target.value)}
              placeholder="Entregado en agosto, inventario ya ajustado"
              autoFocus
              style={{ width: '100%', padding: '8px 11px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setSinStock(null)}
                style={{ flex: 1, padding: '9px', background: '#fff', border: `1px solid ${PISTA}`, borderRadius: 8, color: GRIS, fontSize: 12.5, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={entregarSinStock}
                disabled={!motivoSinStock.trim() || !!trabajando}
                style={{
                  flex: 1, padding: '9px', background: motivoSinStock.trim() ? ACENTO : '#e5e7eb',
                  border: 'none', borderRadius: 8, color: motivoSinStock.trim() ? '#fff' : GRIS_SUAVE,
                  fontSize: 12.5, fontWeight: 700, cursor: motivoSinStock.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {trabajando ? 'Marcando…' : 'Marcar entregado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pedidoPanel && (
        <PanelPedido
          /* `key` por pedido: el panel guarda estado propio — la pestana
             activa, el formulario de envio, la actividad cargada — y si el
             `?pedido=` cambia sin remontar, ese estado quedaria describiendo
             al pedido anterior. */
          key={pedidoPanel.id}
          pedido={pedidoPanel}
          canEdit={canEdit}
          puedeDescuento={puedeDescuento}
          esVendedor={esVendedor}
          nombrePor={nombrePor}
          tapado={!!pagoDe || !!statusPedido || !!sinStock || importar}
          onCerrar={cerrarPanel}
          onPago={setPagoDe}
          onStatus={setStatusPedido}
          esSuperAdmin={esSuperAdmin}
          onEntregarSinStock={f => { setMotivoSinStock(''); setSinStock(f) }}
          onCancelarPago={cancelarPago}
          onEliminar={eliminar}
          onGuardado={msg => { setAviso(msg); refrescar() }}
        />
      )}

      {importar && <ImportarExcel onClose={() => setImportar(false)} puedeDescuento={puedeDescuento} />}
    </div>
  )
}

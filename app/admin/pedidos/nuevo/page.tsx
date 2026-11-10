'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../src/lib/supabase'
import { canManageAsAdmin, isVendedor } from '../../../../src/lib/roles'
import { precioSufijo } from '../../../../src/lib/clientes'
import { nombreLegible } from '../../../../src/lib/metricas'
import { esFutura, etiquetaFecha, hoyMx } from '../../../../src/lib/fechas'
import MixBuilder, { type MixProduct, type MixResult } from '../../../../src/components/MixBuilder'
import MatrizProductos from './MatrizProductos'
import Carrito, { type Descuento } from './Carrito'
import ClienteCombobox, { type Cliente } from './ClienteCombobox'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA,
  type Partida, type Producto,
  card, claveCelda, etiquetaDe, moneda, precioDe, presentacionesVisibles,
  productoDeClave, stockDe, tabular,
} from './pos-ui'

/**
 * Captura de pedidos, estilo punto de venta.
 *
 * La matriz es la pantalla: filas de productos, columnas de presentacion y un
 * stepper en cada celda, con el precio del nivel del cliente y el stock. El
 * carrito vive fijo a la derecha y Confirmar siempre esta visible.
 *
 * La LOGICA no cambia: sigue siendo un POST a /api/admin/pedidos/crear con el
 * mismo body, que atiende `crearPedido`. Los precios y el stock salen de
 * `precioUnitario` y `columnaStockDe` (ver pos-ui.ts), las mismas primitivas
 * que usa el servidor, en vez de los helpers locales e incompletos que tenia
 * esta pagina y que no conocian ni las latas sueltas ni los barriles de 10 L.
 */

const CONDICIONES = [
  { key: 'contado', label: 'Contado' },
  { key: '15_dias', label: '15 dias' },
  { key: '30_dias', label: '30 dias' },
]

/** Sin acentos y en minusculas, para buscar. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const CSS = `
  .pos-grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) 342px; align-items: start; }
  .pos-carrito { position: sticky; top: 16px; }
  .pos-movil { display: none; }
  .pos-barra-movil { display: none; }

  @media (max-width: 1020px) {
    .pos-grid { grid-template-columns: minmax(0, 1fr); }
    .pos-carrito { position: static; }
  }
  /* En movil la matriz se cambia por tarjetas: siete columnas en 390 px no
     se leen ni se pican. */
  @media (max-width: 720px) {
    .pos-matriz { display: none; }
    .pos-movil { display: block; }
    .pos-carrito-panel { display: none; }
    .pos-carrito-panel.abierto { display: block; }
    .pos-barra-movil {
      display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
      align-items: center; gap: 10px; padding: 10px 14px;
      background: #fff; border-top: 1px solid #e5e7eb;
      box-shadow: 0 -4px 16px rgba(17,24,39,0.08);
    }
    .pos-con-barra { padding-bottom: 78px; }
  }
`

export default function NuevoPedidoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [recientes, setRecientes] = useState<string[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([])
  const [esVendedor, setEsVendedor] = useState(false)
  const [puedeDescuento, setPuedeDescuento] = useState(false)

  const [clienteId, setClienteId] = useState(searchParams.get('cliente') || '')
  const [vendedorId, setVendedorId] = useState('')
  const [condiciones, setCondiciones] = useState('contado')
  const [fechaPedido, setFechaPedido] = useState(hoyMx())
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [ordenCompra, setOrdenCompra] = useState('')
  const [folioFactura, setFolioFactura] = useState('')
  const [notas, setNotas] = useState('')
  const [busqueda, setBusqueda] = useState('')

  /** Cantidades de la matriz, por clave "<uuid>-<presentacion>". */
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  /** Las cajas mixtas van aparte: no son una celda de la matriz. */
  const [mixes, setMixes] = useState<Partida[]>([])

  const [descuento, setDescuento] = useState<Descuento>({ tipo: '', valor: '', motivo: '' })
  const [costoEnvio, setCostoEnvio] = useState('')

  const [drawerMix, setDrawerMix] = useState(false)
  const [carritoMovil, setCarritoMovil] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // ── Carga ─────────────────────────────────────────────────
  useEffect(() => {
    const cargar = async () => {
      const [{ data: perfiles }, { data: prods }, { data: vend }, config] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, email, razon_social, marca_negocio, nivel_precio')
          .eq('role', 'comprador').order('full_name'),
        supabase.from('productos').select('*').eq('activo', true).order('nombre'),
        supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
        fetch('/api/admin/config').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
      ])

      setClientes((perfiles || []).map(p => ({
        id: p.id,
        nombre: nombreLegible(p),
        email: p.email,
        nivel_precio: p.nivel_precio,
      })))
      setProductos((prods || []) as Producto[])
      setVendedores(vend || [])

      // Clientes mas recientes POR ULTIMO PEDIDO, no por fecha de alta: la
      // pregunta es "a quien le vendi hace poco". Con RLS, un vendedor ve
      // solo sus pedidos, que es justo lo que le sirve.
      const { data: ultimos } = await supabase
        .from('pedidos').select('cliente_id, fecha_pedido')
        .order('fecha_pedido', { ascending: false }).limit(120)
      const vistos: string[] = []
      for (const p of ultimos || []) {
        if (p.cliente_id && !vistos.includes(p.cliente_id)) vistos.push(p.cliente_id)
      }
      setRecientes(vistos)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: yo } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setEsVendedor(isVendedor(yo?.role))
        // Descuento y envio son de admin: `crearPedido` los rechaza para
        // cualquier otro rol, asi que la UI no los ofrece y nadie captura
        // algo que el servidor va a tirar.
        setPuedeDescuento(canManageAsAdmin(yo?.role))
      }

      const dias = (config as { negocio?: { dias_credito_default?: number } })?.negocio?.dias_credito_default
      setCondiciones(dias === 15 ? '15_dias' : dias === 30 ? '30_dias' : 'contado')
    }
    cargar()
  }, [supabase])

  // ── Derivados ─────────────────────────────────────────────
  const cliente = clientes.find(c => c.id === clienteId) || null
  const sufijo = precioSufijo(cliente?.nivel_precio)
  const presentaciones = useMemo(() => presentacionesVisibles(productos), [productos])
  const porId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])

  const productosFiltrados = useMemo(() => {
    const q = norm(busqueda.trim())
    if (!q) return productos
    return productos.filter(p => norm(`${p.nombre} ${p.estilo || ''}`).includes(q))
  }, [productos, busqueda])

  /** La presentacion de una clave de celda. */
  const presentacionDe = useCallback(
    (clave: string) => clave.slice(productoDeClave(clave).length + 1),
    []
  )

  /** Las partidas que van al servidor: matriz mas mixes. */
  const partidas = useMemo<Partida[]>(() => {
    const deMatriz: Partida[] = []
    for (const [clave, cantidad] of Object.entries(cantidades)) {
      if (cantidad <= 0) continue
      const producto = porId.get(productoDeClave(clave))
      if (!producto) continue
      const presentacion = presentacionDe(clave)
      const precio = precioDe(producto, presentacion, sufijo)
      if (precio <= 0) continue
      deMatriz.push({
        producto_id: clave,
        nombre: `${producto.nombre} — ${etiquetaDe(presentacion)}`,
        unidad: presentacion,
        cantidad,
        precio,
      })
    }
    // Un mix cuyo estilo perdio el precio en este nivel queda fuera, igual
    // que una celda sin precio: el servidor lo rechazaria de todos modos.
    const mixesValidos = mixes.filter(m => {
      const estilos = (m.metadata as { estilos?: { producto_id: string }[] } | undefined)?.estilos || []
      return estilos.length > 0 && estilos.every(e => {
        const p = porId.get(e.producto_id)
        return p ? precioDe(p, 'lata', sufijo) > 0 : false
      })
    })
    return [...deMatriz, ...mixesValidos]
  }, [cantidades, mixes, porId, sufijo, presentacionDe])

  const stockPorClave = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const clave of Object.keys(cantidades)) {
      const producto = porId.get(productoDeClave(clave))
      if (!producto) continue
      mapa[clave] = stockDe(producto, presentacionDe(clave))
    }
    return mapa
  }, [cantidades, porId, presentacionDe])

  // ── Reprecio al cambiar de cliente ────────────────────────
  //
  // No hay efecto que sincronice nada: lo que no tiene precio en el nivel del
  // cliente actual simplemente no entra al carrito, y se lista en un aviso.
  // Antes esto era un useEffect que borraba `cantidades`, lo que ademas de
  // violar la regla de no llamar setState dentro de un efecto era destructivo:
  // al volver al cliente anterior la captura ya se habia perdido. Derivarlo
  // en render hace que cambiar de cliente reprecie al instante y que volver
  // atras recupere lo capturado.
  const fueraDeNivel = useMemo(() => {
    const fuera: string[] = []
    for (const [clave, cantidad] of Object.entries(cantidades)) {
      if (cantidad <= 0) continue
      const producto = porId.get(productoDeClave(clave))
      if (!producto) continue
      const presentacion = presentacionDe(clave)
      if (precioDe(producto, presentacion, sufijo) <= 0) {
        fuera.push(`${producto.nombre} — ${etiquetaDe(presentacion)}`)
      }
    }
    for (const m of mixes) {
      const estilos = (m.metadata as { estilos?: { producto_id: string }[] } | undefined)?.estilos || []
      const vale = estilos.length > 0 && estilos.every(e => {
        const p = porId.get(e.producto_id)
        return p ? precioDe(p, 'lata', sufijo) > 0 : false
      })
      if (!vale) fuera.push(m.nombre)
    }
    return fuera
  }, [cantidades, mixes, porId, sufijo, presentacionDe])

  // ── Handlers ──────────────────────────────────────────────
  const setCantidad = useCallback((productoId: string, presentacion: string, cantidad: number) => {
    const clave = claveCelda(productoId, presentacion)
    setCantidades(prev => {
      if (cantidad <= 0) {
        const resto = { ...prev }
        delete resto[clave]
        return resto
      }
      return { ...prev, [clave]: cantidad }
    })
  }, [])

  const cambiarPartida = useCallback((partida: Partida, cantidad: number) => {
    if (partida.unidad === 'mix24') {
      setMixes(prev => cantidad <= 0
        ? prev.filter(m => m.producto_id !== partida.producto_id)
        : prev.map(m => (m.producto_id === partida.producto_id ? { ...m, cantidad } : m)))
      return
    }
    setCantidades(prev => {
      if (cantidad <= 0) {
        const resto = { ...prev }
        delete resto[partida.producto_id]
        return resto
      }
      return { ...prev, [partida.producto_id]: cantidad }
    })
  }, [])

  const quitarPartida = useCallback((partida: Partida) => cambiarPartida(partida, 0), [cambiarPartida])

  /** Precarga el carrito con el pedido anterior del cliente. */
  const repetirUltimo = async () => {
    if (!cliente) return
    setError(''); setAviso('')

    const { data: ultimo } = await supabase
      .from('pedidos')
      .select('id, fecha_pedido, pedido_items(producto_id, unidad, cantidad, metadata)')
      .eq('cliente_id', cliente.id)
      .neq('status', 'cancelado')
      .order('fecha_pedido', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!ultimo || !(ultimo.pedido_items || []).length) {
      setAviso('Este cliente no tiene un pedido anterior que repetir.')
      return
    }

    const nuevas: Record<string, number> = {}
    const nuevosMixes: Partida[] = []
    const ajustes: string[] = []

    for (const item of ultimo.pedido_items) {
      const cantidad = Number(item.cantidad) || 0
      if (cantidad <= 0) continue

      if (item.unidad === 'mix24') {
        const estilos = (item.metadata as { estilos?: { producto_id: string; nombre?: string; latas?: number }[] } | null)?.estilos
        if (!estilos?.length) { ajustes.push('se omitio una caja mixta sin desglose'); continue }
        let precio = 0
        let vale = true
        for (const e of estilos) {
          const p = porId.get(e.producto_id)
          const lata = p ? precioDe(p, 'lata', sufijo) : 0
          if (lata <= 0) { vale = false; break }
          precio += lata * (Number(e.latas) || 0)
        }
        if (!vale) { ajustes.push('se omitio una caja mixta con un estilo sin precio'); continue }
        nuevosMixes.push({
          producto_id: `${estilos[0].producto_id}-mix24`,
          nombre: `Mix: ${estilos.map(e => e.nombre || '').filter(Boolean).join(', ')}`,
          unidad: 'mix24', cantidad, precio,
          metadata: { tipo: 'mix24', estilos },
        })
        continue
      }

      const producto = porId.get(item.producto_id)
      if (!producto) { ajustes.push('se omitio un producto que ya no esta activo'); continue }
      const presentacion = item.unidad || ''
      const etiqueta = `${producto.nombre} — ${etiquetaDe(presentacion)}`

      if (precioDe(producto, presentacion, sufijo) <= 0) {
        ajustes.push(`${etiqueta}: sin precio para este cliente`)
        continue
      }
      const stock = stockDe(producto, presentacion)
      if (stock <= 0) {
        ajustes.push(`${etiqueta}: sin stock`)
        continue
      }
      // Se ajusta a lo que hay en vez de precargar un exceso, que bloquearia
      // Confirmar sin que se vea el motivo.
      const ajustada = Math.min(cantidad, stock)
      if (ajustada < cantidad) ajustes.push(`${etiqueta}: bajo de ${cantidad} a ${ajustada} por stock`)
      nuevas[claveCelda(producto.id, presentacion)] = ajustada
    }

    setCantidades(nuevas)
    setMixes(nuevosMixes)

    const fecha = etiquetaFecha(ultimo.fecha_pedido)
    const vacio = Object.keys(nuevas).length === 0 && nuevosMixes.length === 0
    setAviso(
      vacio
        ? `Del pedido del ${fecha} no se pudo cargar nada. ${ajustes.join('; ')}.`
        : `Se cargo el pedido del ${fecha}, con los precios y el stock de hoy.` +
          (ajustes.length ? ` Ajustes: ${ajustes.join('; ')}.` : '')
    )
  }

  // ── Mix ───────────────────────────────────────────────────
  const mixProducts = useMemo<MixProduct[]>(
    () => productos
      .filter(p => precioDe(p, 'lata', sufijo) > 0 && stockDe(p, 'lata') > 0)
      .map(p => ({
        id: p.id,
        nombre: p.nombre,
        imagen_url: typeof p.imagen_url === 'string' ? p.imagen_url : undefined,
        stock_latas: stockDe(p, 'lata'),
        precio_por_lata: precioDe(p, 'lata', sufijo),
      })),
    [productos, sufijo]
  )

  const agregarMix = (resultado: MixResult) => {
    const nombres = resultado.estilos.map(e => e.nombre).join(', ')
    setMixes(prev => [...prev, {
      producto_id: `${resultado.estilos[0].producto_id}-mix24`,
      nombre: `Mix: ${nombres}`,
      unidad: 'mix24',
      cantidad: 1,
      precio: resultado.precio,
      metadata: { tipo: 'mix24', estilos: resultado.estilos },
    }])
    setDrawerMix(false)
  }

  // ── Bloqueos de Confirmar ─────────────────────────────────
  const bloqueos = useMemo(() => {
    const lista: string[] = []
    if (!clienteId) lista.push('Falta elegir el cliente.')
    if (partidas.length === 0) lista.push('El carrito esta vacio.')

    if (!fechaPedido) lista.push('Falta la fecha del pedido.')
    else if (esFutura(fechaPedido)) lista.push('La fecha del pedido no puede ser futura.')
    // Un vendedor captura siempre con la fecha de hoy: mover un pedido a un
    // mes anterior le cambiaria el periodo de comision, que pudo quedar
    // cerrado. Lo valida tambien crearPedido y el trigger de la DB.
    else if (esVendedor && fechaPedido !== hoyMx()) {
      lista.push('Como vendedor solo puedes capturar con la fecha de hoy.')
    }
    if (fechaEntrega && fechaEntrega < fechaPedido) {
      lista.push('La entrega no puede ser antes de la fecha del pedido.')
    }

    for (const p of partidas) {
      if (p.unidad === 'mix24') continue
      const disponible = stockPorClave[p.producto_id]
      if (disponible !== undefined && p.cantidad > disponible) {
        lista.push(`${p.nombre}: pides ${p.cantidad} y quedan ${disponible}.`)
      }
    }

    if (puedeDescuento && descuento.tipo) {
      const val = Number(descuento.valor.replace(/[^\d.]/g, '')) || 0
      if (val <= 0) lista.push('El descuento necesita un valor mayor a 0.')
      if (descuento.tipo === 'porcentaje' && val > 100) lista.push('El descuento porcentual no puede pasar de 100.')
      if (!descuento.motivo.trim()) lista.push('El motivo del descuento es obligatorio.')
      const subtotal = partidas.reduce((s, p) => s + p.precio * p.cantidad, 0)
      if (descuento.tipo === 'monto' && val > subtotal) lista.push('El descuento no puede ser mayor al subtotal.')
    }
    return lista
  }, [clienteId, partidas, stockPorClave, puedeDescuento, descuento, fechaPedido, fechaEntrega, esVendedor])

  // ── Confirmar ─────────────────────────────────────────────
  const confirmar = async () => {
    if (bloqueos.length || enviando) return
    setEnviando(true); setError('')

    const descVal = Number(descuento.valor.replace(/[^\d.]/g, '')) || 0
    const envio = Number(costoEnvio.replace(/[^\d.]/g, '')) || 0

    const res = await fetch('/api/admin/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: clienteId,
        condiciones_pago: condiciones,
        fecha_pedido: fechaPedido,
        fecha_entrega: fechaEntrega || null,
        orden_compra: ordenCompra.trim() || null,
        folio_factura: folioFactura.trim() || null,
        items: partidas,
        notas,
        vendedor_id: esVendedor ? null : (vendedorId || null),
        costo_envio: puedeDescuento ? envio : null,
        descuento_tipo: puedeDescuento && descuento.tipo ? descuento.tipo : null,
        descuento_valor: puedeDescuento && descuento.tipo ? descVal : null,
        descuento_motivo: puedeDescuento && descuento.tipo ? descuento.motivo : null,
      }),
    })

    if (res.ok) {
      router.push('/admin/pedidos')
      router.refresh()
      return
    }
    const d = await res.json().catch(() => ({}))
    setError(d.error || 'No se pudo crear el pedido.')
    setEnviando(false)
  }

  const totalCarrito = partidas.reduce((s, p) => s + p.precio * p.cantidad, 0)

  const carrito = (
    <Carrito
      partidas={partidas}
      stockPorClave={stockPorClave}
      onCantidad={cambiarPartida}
      onQuitar={quitarPartida}
      puedeDescuento={puedeDescuento}
      descuento={descuento}
      onDescuento={setDescuento}
      costoEnvio={costoEnvio}
      onCostoEnvio={setCostoEnvio}
      bloqueos={bloqueos}
      enviando={enviando}
      onConfirmar={confirmar}
      error={error}
    />
  )

  return (
    <div className="pos-con-barra" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{CSS}</style>

      {/* ── Encabezado ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 3px', color: TINTA, fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Nuevo pedido
          </h1>
          <p style={{ margin: 0, color: GRIS, fontSize: 12.5 }}>
            Captura en la matriz: Enter suma uno, las flechas mueven entre celdas.
          </p>
        </div>
        <a
          href="/admin/pedidos"
          style={{ marginLeft: 'auto', padding: '8px 14px', border: `1px solid ${BORDE}`, borderRadius: 8, color: GRIS, fontSize: 12.5, textDecoration: 'none' }}
        >
          Cancelar
        </a>
      </div>

      {/* ── Cliente y condiciones ───────────────────────── */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div>
            <label style={lbl}>Cliente</label>
            <ClienteCombobox
              clientes={clientes}
              recientes={recientes}
              valor={clienteId}
              onElegir={setClienteId}
            />
            {cliente && (
              <button
                type="button"
                onClick={repetirUltimo}
                style={{ marginTop: 8, padding: '6px 12px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA_MEDIA, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Repetir ultimo pedido
              </button>
            )}
          </div>

          <div>
            <label style={lbl}>Condiciones de pago</label>
            {/* Botones claros, como las tarjetas de rol de Equipo: antes eran
                cajas casi negras sobre fondo claro y no se leia la elegida. */}
            <div style={{ display: 'flex', gap: 7 }}>
              {CONDICIONES.map(c => {
                const activo = condiciones === c.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCondiciones(c.key)}
                    style={{
                      flex: 1, padding: '9px 6px',
                      background: activo ? '#fff7f3' : '#fff',
                      border: `1.5px solid ${activo ? ACENTO : BORDE}`,
                      borderRadius: 8, cursor: 'pointer',
                      color: activo ? TINTA : GRIS,
                      fontSize: 12.5, fontWeight: activo ? 700 : 500,
                    }}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={lbl}>Fecha del pedido</label>
            <input
              type="date"
              value={fechaPedido}
              max={hoyMx()}
              // El vendedor no la mueve: su fecha es hoy y punto.
              disabled={esVendedor}
              onChange={e => setFechaPedido(e.target.value)}
              style={{
                width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                background: esVendedor ? '#f9fafb' : '#fff',
                border: `1px solid ${BORDE}`, borderRadius: 8,
                color: esVendedor ? GRIS : TINTA, fontSize: 12.5, outline: 'none',
                cursor: esVendedor ? 'not-allowed' : 'text',
              }}
            />
            <p style={{ margin: '5px 0 0', color: GRIS_SUAVE, fontSize: 11 }}>
              {esVendedor
                ? 'Siempre hoy. La oficina puede capturar con fecha retroactiva.'
                : fechaPedido !== hoyMx()
                  ? 'Retroactiva: el vencimiento se calcula desde esta fecha.'
                  : 'De aqui sale el vencimiento y el mes en los reportes.'}
            </p>
          </div>

          <div>
            <label style={lbl}>Entrega programada</label>
            <input
              type="date"
              value={fechaEntrega}
              min={fechaPedido}
              onChange={e => setFechaEntrega(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', boxSizing: 'border-box', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none' }}
            />
            <p style={{ margin: '5px 0 0', color: GRIS_SUAVE, fontSize: 11 }}>
              Opcional. El cliente la ve en su portal.
            </p>
          </div>

          <div>
            <label style={lbl}>Orden de compra</label>
            <input
              value={ordenCompra}
              onChange={e => setOrdenCompra(e.target.value)}
              placeholder="OC del cliente"
              style={{ width: '100%', padding: '9px 11px', boxSizing: 'border-box', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none' }}
            />
          </div>

          {puedeDescuento && (
            <div>
              <label style={lbl}>Folio de factura</label>
              <input
                value={folioFactura}
                onChange={e => setFolioFactura(e.target.value)}
                placeholder="Opcional"
                style={{ width: '100%', padding: '9px 11px', boxSizing: 'border-box', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none' }}
              />
            </div>
          )}

          {!esVendedor && vendedores.length > 0 && (
            <div>
              <label style={lbl}>Vendedor</label>
              <select
                value={vendedorId}
                onChange={e => setVendedorId(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                <option value="">Sin vendedor asignado</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {aviso && (
        <p style={{ padding: '10px 13px', marginBottom: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 12.5, lineHeight: 1.5 }}>
          {aviso}
        </p>
      )}

      {fueraDeNivel.length > 0 && (
        <p style={{ padding: '10px 13px', marginBottom: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 12.5, lineHeight: 1.5 }}>
          Fuera del pedido por no tener precio {sufijo === 'taproom' ? 'mayorista' : 'al publico'}:{' '}
          {fueraDeNivel.join(', ')}. Siguen capturados por si vuelves a un cliente que si los tenga.
        </p>
      )}

      {/* ── Matriz y carrito ────────────────────────────── */}
      <div className="pos-grid">
        <div style={{ ...card, padding: '14px 16px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto o estilo..."
              style={{ flex: 1, minWidth: 160, padding: '8px 11px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none' }}
            />
            {mixProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawerMix(true)}
                style={{ padding: '8px 13px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Armar caja mixta
              </button>
            )}
          </div>

          {!clienteId && (
            <p style={{ margin: '0 0 12px', padding: '9px 12px', background: '#f9fafb', border: `1px solid ${BORDE}`, borderRadius: 8, color: GRIS, fontSize: 12 }}>
              Elige un cliente: los precios dependen de su nivel.
            </p>
          )}

          <div className="pos-matriz">
            <MatrizProductos
              productos={productosFiltrados}
              presentaciones={presentaciones}
              sufijo={sufijo}
              cantidades={cantidades}
              onCantidad={setCantidad}
              habilitada={!!clienteId}
            />
          </div>

          {/* Movil: una tarjeta por producto con steppers grandes. */}
          <div className="pos-movil">
            {productosFiltrados.length === 0 && (
              <p style={{ padding: '30px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
                Ningun producto coincide con la busqueda.
              </p>
            )}
            {productosFiltrados.map(producto => (
              <div key={producto.id} style={{ borderTop: `1px solid ${PISTA}`, padding: '12px 0' }}>
                <p style={{ margin: '0 0 9px', color: TINTA, fontSize: 13.5, fontWeight: 600 }}>
                  {producto.nombre}
                  {producto.estilo && <span style={{ color: GRIS_SUAVE, fontSize: 11, fontWeight: 400 }}> · {producto.estilo}</span>}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {presentaciones.map(pres => {
                    const clave = claveCelda(producto.id, pres.key)
                    const cantidad = cantidades[clave] || 0
                    const precio = precioDe(producto, pres.key, sufijo)
                    const stock = stockDe(producto, pres.key)
                    // Lo que no tiene ni precio ni stock no se pinta: en movil
                    // el espacio es el recurso escaso.
                    if (precio <= 0 && stock <= 0) return null
                    const bloqueada = !clienteId || precio <= 0 || stock <= 0
                    const excede = cantidad > stock
                    return (
                      <div key={pres.key} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: bloqueada ? 0.45 : 1 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', color: TINTA_MEDIA, fontSize: 12.5 }}>{pres.largo}</span>
                          <span style={{ ...tabular, display: 'block', color: excede ? '#dc2626' : GRIS_SUAVE, fontSize: 10.5 }}>
                            {precio > 0 ? `${moneda(precio)} · ${stock} disp.` : 'sin precio'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button type="button" disabled={bloqueada || cantidad === 0} onClick={() => setCantidad(producto.id, pres.key, cantidad - 1)} style={btnMovil}>-</button>
                          <span style={{ ...tabular, minWidth: 28, textAlign: 'center', color: excede ? '#dc2626' : TINTA, fontSize: 15, fontWeight: 700 }}>{cantidad}</span>
                          <button type="button" disabled={bloqueada} onClick={() => setCantidad(producto.id, pres.key, cantidad + 1)} style={btnMovil}>+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDE}` }}>
            <label style={lbl}>Notas del pedido</label>
            <input
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Opcional"
              style={{ width: '100%', padding: '8px 11px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div className="pos-carrito">
          <div className={`pos-carrito-panel ${carritoMovil ? 'abierto' : ''}`} style={{ ...card, padding: '16px 18px' }}>
            {carrito}
          </div>
        </div>
      </div>

      {/* ── Barra fija de movil ─────────────────────────── */}
      <div className="pos-barra-movil">
        <div>
          <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
          <span style={{ ...tabular, color: TINTA, fontSize: 17, fontWeight: 700 }}>{moneda(totalCarrito)}</span>
        </div>
        <button
          type="button"
          onClick={() => setCarritoMovil(v => !v)}
          style={{ padding: '10px 13px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {carritoMovil ? 'Ocultar' : `Ver ${partidas.length}`}
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando || bloqueos.length > 0}
          style={{
            flex: 1, padding: '11px', borderRadius: 8, border: 'none',
            background: bloqueos.length > 0 ? '#e5e7eb' : ACENTO,
            color: bloqueos.length > 0 ? GRIS_SUAVE : '#fff',
            fontSize: 13.5, fontWeight: 700, cursor: bloqueos.length ? 'default' : 'pointer',
          }}
        >
          {enviando ? 'Creando...' : 'Confirmar'}
        </button>
      </div>

      {/* ── Drawer de caja mixta ────────────────────────── */}
      {drawerMix && (
        <>
          <div
            onClick={() => setDrawerMix(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)', zIndex: 90 }}
          />
          <aside
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100%)',
              background: '#fff', borderLeft: `1px solid ${BORDE}`, zIndex: 91,
              padding: '22px 24px', overflowY: 'auto',
              boxShadow: '-12px 0 36px rgba(17,24,39,0.14)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, color: TINTA, fontSize: 16, fontWeight: 700 }}>Armar caja mixta</h2>
                <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 12 }}>24 latas en total, de los estilos que quieras.</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerMix(false)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: GRIS_SUAVE, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <MixBuilder productos={mixProducts} onAdd={agregarMix} onCancel={() => setDrawerMix(false)} showCancel />
          </aside>
        </>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = {
  display: 'block', color: GRIS, fontSize: 10.5, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
}

const btnMovil: React.CSSProperties = {
  width: 36, height: 36, padding: 0, background: '#fff',
  border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA,
  fontSize: 18, cursor: 'pointer', lineHeight: 1,
}

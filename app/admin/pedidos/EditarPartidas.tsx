'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { precioSufijo } from '../../../src/lib/clientes'
import { comprometidoDeJSON } from '../../../src/lib/stock-disponible'
import { claveLinea } from '../../../src/lib/editar-partidas'
import MixBuilder, { type MixProduct, type MixResult } from '../../../src/components/MixBuilder'
import MatrizProductos from './nuevo/MatrizProductos'
import Carrito from './nuevo/Carrito'
import {
  BORDE, GRIS, GRIS_SUAVE, TINTA, TINTA_MEDIA,
  type Partida, type Producto,
  claveCelda, disponibleEn, etiquetaDe, moneda, precioDe, presentacionesVisibles, productoDeClave,
} from './nuevo/pos-ui'
/**
 * Lo minimo que el modal necesita del pedido. `FilaPedido` lo cumple, y
 * tambien la fila cruda de la pantalla /admin/pedidos/[id]/edit, que no pasa
 * por `armarFilas`.
 */
export type PedidoEditable = {
  id: string
  folio: string
  cliente: string
  cliente_id: string | null
  status: string
}

/**
 * Editar los productos de un pedido que ya existe.
 *
 * Reusa la matriz y el carrito del POS tal cual: es la misma captura, y tener
 * dos pantallas que capturan partidas con reglas ligeramente distintas es
 * como se llega a que una valide stock y la otra no.
 *
 * Dos cosas que NO son como en el POS, y que son la razon de esta pantalla:
 *
 *   - El PRECIO de una partida que ya estaba se conserva. El cliente ya
 *     acepto ese precio; si la lista subio entre tanto, corregir una cantidad
 *     no puede re-facturarle la diferencia. Las partidas nuevas toman el
 *     precio vigente de su nivel. La misma regla la reimpone el servidor en
 *     `recalcularPartidas`, que es quien manda: esto es para que lo que se ve
 *     mientras se captura sea lo que se va a guardar.
 *
 *   - El disponible se pide con `?excepto=<pedido>`, asi que lo que este
 *     mismo pedido tenia apartado vuelve a contar como libre. Si no, un
 *     pedido de 10 cajas no se podria editar a 11 aunque hubiera 40 sueltas.
 *
 * El descuento y el envio no se tocan aqui: se conservan y el servidor los
 * usa tal cual para recalcular el saldo.
 */

type Props = {
  pedido: PedidoEditable
  onCerrar: () => void
  onGuardado: (mensaje: string) => void
}

type PartidaGuardada = {
  id: string
  producto_id: string
  unidad: string | null
  cantidad: number
  precio_unitario: number
  metadata: { estilos?: { producto_id: string; nombre?: string | null; latas?: number | null }[] | null } | null
}

export default function EditarPartidas({ pedido, onCerrar, onGuardado }: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [cargando, setCargando] = useState(true)
  const [productos, setProductos] = useState<Producto[]>([])
  const [comprometido, setComprometido] = useState<Map<string, number>>(new Map())
  const [originales, setOriginales] = useState<PartidaGuardada[]>([])
  const [sufijo, setSufijo] = useState<'publico' | 'taproom'>('publico')

  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [mixes, setMixes] = useState<Partida[]>([])
  const [drawerMix, setDrawerMix] = useState(false)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [sobrepago, setSobrepago] = useState<{ aCobrar: number; pagado: number; sobra: number } | null>(null)

  // ── Carga ─────────────────────────────────────────────────
  useEffect(() => {
    const cargar = async () => {
      const [{ data: prods }, { data: partidas }, apartado, { data: cliente }] = await Promise.all([
        supabase.from('productos').select('*').eq('activo', true).order('nombre'),
        supabase.from('pedido_items')
          .select('id, producto_id, unidad, cantidad, precio_unitario, metadata')
          .eq('pedido_id', pedido.id),
        fetch(`/api/admin/pedidos/comprometido?excepto=${encodeURIComponent(pedido.id)}`)
          .then(r => (r.ok ? r.json() : null)).catch(() => null),
        pedido.cliente_id
          ? supabase.from('profiles').select('nivel_precio').eq('id', pedido.cliente_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const catalogo = (prods || []) as Producto[]
      setProductos(catalogo)
      setComprometido(comprometidoDeJSON((apartado as { comprometido?: Record<string, number> } | null)?.comprometido))
      setSufijo(precioSufijo((cliente as { nivel_precio?: string } | null)?.nivel_precio))

      const guardadas = (partidas || []) as PartidaGuardada[]
      setOriginales(guardadas)

      // Precarga: las presentaciones normales van a la matriz y los mixes al
      // carrito, que es donde viven en el POS.
      const celdas: Record<string, number> = {}
      const mixIniciales: Partida[] = []
      for (const p of guardadas) {
        if (p.unidad === 'mix24') {
          const nombre = catalogo.find(x => x.id === p.producto_id)?.nombre || 'Caja mixta'
          mixIniciales.push({
            producto_id: `${p.producto_id}-mix24`,
            nombre: `Caja mixta — ${nombre}`,
            unidad: 'mix24',
            cantidad: p.cantidad,
            precio: Number(p.precio_unitario) || 0,
            metadata: p.metadata,
          })
          continue
        }
        if (!p.unidad) continue
        const clave = claveCelda(p.producto_id, p.unidad)
        celdas[clave] = (celdas[clave] || 0) + p.cantidad
      }
      setCantidades(celdas)
      setMixes(mixIniciales)
      setCargando(false)
    }
    cargar()
  }, [supabase, pedido.id, pedido.cliente_id])

  // ── Precio de una linea: conservado o vigente ─────────────
  const precioOriginal = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const p of originales) {
      const clave = claveLinea(p.producto_id, p.unidad, p.metadata)
      if (!mapa.has(clave)) mapa.set(clave, Number(p.precio_unitario) || 0)
    }
    return mapa
  }, [originales])

  const porId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const presentaciones = useMemo(() => presentacionesVisibles(productos), [productos])
  const presentacionDe = (clave: string) => clave.slice(productoDeClave(clave).length + 1)

  const partidas = useMemo<Partida[]>(() => {
    const deMatriz: Partida[] = []
    for (const [clave, cantidad] of Object.entries(cantidades)) {
      if (cantidad <= 0) continue
      const producto = porId.get(productoDeClave(clave))
      if (!producto) continue
      const presentacion = presentacionDe(clave)
      const conservado = precioOriginal.get(claveLinea(producto.id, presentacion, null))
      const precio = conservado ?? precioDe(producto, presentacion, sufijo)
      // Una celda nueva sin precio en este nivel no se puede cotizar; el
      // servidor la rechazaria igual, y aqui se ve antes de picar Guardar.
      if (precio <= 0) continue
      deMatriz.push({
        producto_id: clave,
        nombre: `${producto.nombre} — ${etiquetaDe(presentacion)}`,
        unidad: presentacion,
        cantidad,
        precio,
      })
    }
    return [...deMatriz, ...mixes]
  }, [cantidades, mixes, porId, sufijo, precioOriginal])

  const stockPorClave = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const clave of Object.keys(cantidades)) {
      const producto = porId.get(productoDeClave(clave))
      if (!producto) continue
      mapa[clave] = disponibleEn(producto, presentacionDe(clave), comprometido)
    }
    return mapa
  }, [cantidades, porId, comprometido])

  const mixProducts = useMemo<MixProduct[]>(
    () => productos
      .filter(p => precioDe(p, 'lata', sufijo) > 0 && disponibleEn(p, 'lata', comprometido) > 0)
      .map(p => ({
        id: p.id,
        nombre: p.nombre,
        imagen_url: typeof p.imagen_url === 'string' ? p.imagen_url : undefined,
        stock_latas: disponibleEn(p, 'lata', comprometido),
        precio_por_lata: precioDe(p, 'lata', sufijo),
      })),
    [productos, sufijo, comprometido]
  )

  const setCantidad = (productoId: string, presentacion: string, cantidad: number) => {
    setError(''); setSobrepago(null)
    setCantidades(prev => {
      const clave = claveCelda(productoId, presentacion)
      if (cantidad <= 0) {
        const resto = { ...prev }
        delete resto[clave]
        return resto
      }
      return { ...prev, [clave]: cantidad }
    })
  }

  const cambiarPartida = (partida: Partida, cantidad: number) => {
    setError(''); setSobrepago(null)
    if (partida.unidad === 'mix24') {
      setMixes(prev => cantidad <= 0 ? prev.filter(m => m !== partida) : prev.map(m => (m === partida ? { ...m, cantidad } : m)))
      return
    }
    setCantidad(productoDeClave(partida.producto_id), partida.unidad, cantidad)
  }

  const quitarPartida = (partida: Partida) => cambiarPartida(partida, 0)

  const agregarMix = (resultado: MixResult) => {
    setDrawerMix(false)
    setError(''); setSobrepago(null)
    setMixes(prev => [...prev, {
      producto_id: `${resultado.estilos[0].producto_id}-mix24`,
      nombre: 'Caja mixta',
      unidad: 'mix24',
      cantidad: 1,
      precio: resultado.precio,
      metadata: { tipo: 'mix24', estilos: resultado.estilos },
    }])
  }

  // ── Bloqueos ──────────────────────────────────────────────
  const bloqueos = useMemo(() => {
    const lista: string[] = []
    if (partidas.length === 0) lista.push('El pedido no puede quedarse sin productos.')
    for (const p of partidas) {
      if (p.unidad === 'mix24') continue
      const disponible = stockPorClave[p.producto_id]
      if (disponible !== undefined && p.cantidad > disponible) {
        lista.push(`${p.nombre}: hay ${disponible} disponibles.`)
      }
    }
    return lista
  }, [partidas, stockPorClave])

  const guardar = async (confirmarSobrepago = false) => {
    setGuardando(true); setError('')
    try {
      const res = await fetch(`/api/admin/pedidos/${pedido.id}/partidas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: partidas.map(p => ({ producto_id: p.producto_id, cantidad: p.cantidad, metadata: p.metadata ?? null })),
          ...(confirmarSobrepago ? { confirmarSobrepago: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data.requiereConfirmacion) {
        setSobrepago(data.sobrepago)
        setError('')
        return
      }
      if (!res.ok) { setError(data.error || 'No se pudieron guardar los productos.'); return }

      onGuardado(
        `${pedido.folio}: ${data.nuevas} ${data.nuevas === 1 ? 'partida nueva' : 'partidas nuevas'}, ` +
        `${data.quitadas} ${data.quitadas === 1 ? 'quitada' : 'quitadas'}. Total ${moneda(data.total)}.`
      )
      onCerrar()
    } catch {
      setError('Se cayó la conexión al guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', zIndex: 95, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Editar productos de ${pedido.folio}`}
        style={{ background: '#fff', borderRadius: 12, width: 'min(1100px, 100%)', margin: '12px 0', padding: '20px 22px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: '0 0 3px', color: TINTA, fontSize: 16, fontWeight: 700 }}>Editar productos</h3>
            <p style={{ margin: 0, color: GRIS, fontSize: 12 }}>
              <span className="font-mono">{pedido.folio}</span> · {pedido.cliente} ·{' '}
              {sufijo === 'taproom' ? 'precios mayoristas' : 'precios al público'}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', color: GRIS, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {cargando ? (
          <p style={{ padding: '40px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>Cargando el catálogo…</p>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', padding: '8px 11px', background: '#f9fafb', border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA_MEDIA, fontSize: 11.5 }}>
              Las partidas que ya estaban conservan su precio; las nuevas toman el vigente. El descuento y
              el envío del pedido no se tocan. El disponible ya cuenta como libre lo que este pedido tenía
              apartado.
            </p>

            {sobrepago && (
              <div style={{ margin: '0 0 12px', padding: '11px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                <p style={{ margin: '0 0 6px', color: '#92400e', fontSize: 12.5, fontWeight: 600 }}>
                  Con estos productos el pedido queda sobrepagado
                </p>
                <p style={{ margin: '0 0 9px', color: '#92400e', fontSize: 11.5 }}>
                  El cliente ya pagó {moneda(sobrepago.pagado)} y el pedido quedaría en{' '}
                  {moneda(sobrepago.aCobrar)}: sobran <strong>{moneda(sobrepago.sobra)}</strong>. Habrá que
                  devolverlos o aplicarlos a otro pedido.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setSobrepago(null)} style={{ padding: '7px 12px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 7, color: GRIS, fontSize: 12, cursor: 'pointer' }}>
                    Seguir editando
                  </button>
                  <button type="button" onClick={() => guardar(true)} disabled={guardando} style={{ padding: '7px 12px', background: '#b45309', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Guardar de todos modos
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' }}>
              <div style={{ minWidth: 0, maxHeight: '58vh', overflowY: 'auto' }}>
                <MatrizProductos
                  productos={productos}
                  presentaciones={presentaciones}
                  sufijo={sufijo}
                  cantidades={cantidades}
                  onCantidad={setCantidad}
                  habilitada
                  comprometido={comprometido}
                />
                <button type="button" onClick={() => setDrawerMix(true)} style={{ marginTop: 10, padding: '7px 12px', background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA_MEDIA, fontSize: 12, cursor: 'pointer' }}>
                  Armar caja mixta
                </button>
              </div>

              <Carrito
                partidas={partidas}
                stockPorClave={stockPorClave}
                onCantidad={cambiarPartida}
                onQuitar={quitarPartida}
                puedeDescuento={false}
                descuento={{ tipo: '', valor: '', motivo: '' }}
                onDescuento={() => {}}
                costoEnvio=""
                onCostoEnvio={() => {}}
                bloqueos={bloqueos}
                enviando={guardando}
                onConfirmar={() => guardar(false)}
                error={error}
                etiquetaConfirmar="Guardar productos"
                etiquetaEnviando="Guardando…"
              />
            </div>

            {drawerMix && (
              <div onClick={() => setDrawerMix(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 'min(560px, 100%)', maxHeight: '80vh', overflowY: 'auto' }}>
                  <MixBuilder productos={mixProducts} onAdd={agregarMix} onCancel={() => setDrawerMix(false)} showCancel />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { canWrite, isVendedor } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { precioSufijo } from '../../../../../../src/lib/clientes'
import { cargarStockMap, parsearProductoId } from '../../../../../../src/lib/crear-pedido'
import { comprometidoDe } from '../../../../../../src/lib/stock-disponible'
import {
  puedeEditarPartidas, recalcularPartidas, sobrepagoDe,
  type LineaDeseada, type PartidaActual,
} from '../../../../../../src/lib/editar-partidas'

/**
 * Reemplaza las partidas de un pedido que ya existe.
 *
 * El body es el MISMO que el de `/crear`: `items` con `producto_id` en la
 * forma "<uuid>-<unidad>", para que la pantalla pueda mandar el carrito del
 * POS tal cual. La regla de negocio vive en `recalcularPartidas`, que es puro
 * y esta probado; aqui solo se junta lo que necesita y se escribe.
 *
 * La escritura va por el RPC `set_pedido_items`, no por dos llamadas: borrar
 * e insertar partidas sin transaccion deja el pedido sin productos si falla
 * lo segundo. El RPC ademas revalida el status y que el total cuadre con las
 * partidas, porque esta ruta es una puerta de varias.
 *
 * El VENDEDOR no entra, y no es un olvido: la migracion 20261103100000 decide
 * explicitamente que no edita pedidos, y no tiene policy de DELETE sobre
 * `pedido_items`. Abrirlo pide dos policies nuevas y es una decision de
 * superficie de ataque; mientras no exista, el guard de aqui da un error
 * legible en vez del 42501 del RPC.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (isVendedor(profile?.role)) {
    return NextResponse.json(
      { error: 'Un vendedor no puede editar las partidas de un pedido. Pídelo a alguien de oficina.' },
      { status: 403 }
    )
  }
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let body: { items?: unknown; confirmarSobrepago?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Faltan las partidas.' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── El pedido, su saldo y sus partidas de hoy ─────────────
  const [{ data: pedido }, { data: saldo }, { data: actualesRaw }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, status, cliente_id, descuento_tipo, descuento_valor, costo_envio, total, incluye_iva, iva_tasa')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('pedidos_saldo').select('pagado').eq('id', id).maybeSingle(),
    supabase.from('pedido_items').select('id, producto_id, unidad, cantidad, precio_unitario, metadata').eq('pedido_id', id),
  ])

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (!puedeEditarPartidas(pedido.status)) {
    return NextResponse.json(
      {
        error: `Este pedido está ${pedido.status} y sus productos ya no se editan.`,
        detalle: pedido.status === 'entregado'
          ? 'Un pedido entregado ya descontó inventario.'
          : 'Un pedido cancelado no va a salir.',
      },
      { status: 409 }
    )
  }

  const actuales: PartidaActual[] = (actualesRaw || []).map(p => ({
    id: p.id,
    producto_id: p.producto_id,
    unidad: p.unidad,
    cantidad: p.cantidad,
    precio_unitario: Number(p.precio_unitario) || 0,
    metadata: p.metadata,
  }))

  // ── El nivel del cliente, para las partidas NUEVAS ────────
  const { data: cliente } = await service
    .from('profiles').select('nivel_precio').eq('id', pedido.cliente_id).maybeSingle()
  if (!cliente) return NextResponse.json({ error: 'El cliente del pedido ya no existe.' }, { status: 400 })
  const sufijo = precioSufijo(cliente.nivel_precio)

  // ── Disponible SIN este pedido ────────────────────────────
  //
  // Lo que el pedido ya tenia apartado vuelve a estar libre para el: si no,
  // no se podria subir de 10 a 11 cajas aunque hubiera 40 sueltas. Con el
  // service client porque el comprometido tiene que ser global.
  const { data: abiertos } = await service
    .from('pedidos')
    .select('id, status, pedido_items(producto_id, unidad, cantidad, metadata, productos(nombre))')
    .not('status', 'in', '(entregado,cancelado)')

  // `createServiceClient` devuelve un cliente sin tipar, asi que las filas se
  // anotan aqui en vez de dejar `any` implicitos.
  type PedidoCrudo = {
    id: string
    status: string
    pedido_items?: {
      producto_id: string
      unidad: string | null
      cantidad: number | null
      metadata?: { estilos?: { producto_id: string; nombre?: string | null; latas?: number | null }[] | null } | null
      productos?: { nombre?: string | null } | { nombre?: string | null }[] | null
    }[] | null
  }

  const { por: comprometido } = comprometidoDe(
    ((abiertos || []) as PedidoCrudo[]).map(p => ({
      id: p.id,
      status: p.status,
      pedido_items: (p.pedido_items || []).map(it => ({
        producto_id: it.producto_id,
        unidad: it.unidad,
        cantidad: it.cantidad,
        metadata: it.metadata,
        nombre: Array.isArray(it.productos) ? it.productos[0]?.nombre : it.productos?.nombre,
      })),
    })),
    { excepto: id }
  )

  // ── Recalculo ─────────────────────────────────────────────
  const deseadas: LineaDeseada[] = []
  for (const crudo of body.items) {
    if (!crudo || typeof crudo !== 'object') {
      return NextResponse.json({ error: 'Hay una partida con forma invalida.' }, { status: 400 })
    }
    const item = crudo as { producto_id?: unknown; cantidad?: unknown; metadata?: unknown }
    if (typeof item.producto_id !== 'string' || !item.producto_id) {
      return NextResponse.json({ error: 'Hay una partida sin producto.' }, { status: 400 })
    }
    const cantidad = Number(item.cantidad)
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: 'Hay una partida con cantidad invalida.' }, { status: 400 })
    }
    const { productoId, unidad } = parsearProductoId({ producto_id: item.producto_id })
    deseadas.push({
      producto_id: productoId,
      unidad,
      cantidad,
      metadata: (item.metadata as LineaDeseada['metadata']) ?? null,
    })
  }

  const calculo = recalcularPartidas({
    actuales,
    deseadas,
    catalogo: await cargarStockMap(service),
    sufijo,
    comprometido,
  })
  if (!calculo.ok) return NextResponse.json({ error: calculo.error }, { status: 400 })

  // ── Sobrepago: se avisa, no se decide solo ────────────────
  const sobra = sobrepagoDe({
    total: calculo.total,
    descuento_tipo: pedido.descuento_tipo,
    descuento_valor: pedido.descuento_valor,
    costo_envio: pedido.costo_envio,
    // El IVA del pedido no cambia aqui, pero si entra en lo que debe: sin el,
    // el aviso mentiria por el 16% en los pedidos facturados.
    incluye_iva: pedido.incluye_iva,
    iva_tasa: pedido.iva_tasa,
    pagado: Number(saldo?.pagado) || 0,
  })
  if (sobra && body.confirmarSobrepago !== true) {
    return NextResponse.json(
      {
        error: 'Con estos productos el pedido queda sobrepagado.',
        sobrepago: sobra,
        requiereConfirmacion: true,
      },
      { status: 409 }
    )
  }

  // ── Escritura atomica ─────────────────────────────────────
  const { error } = await supabase.rpc('set_pedido_items', {
    p_pedido_id: id,
    p_items: calculo.partidas.map(p => ({
      producto_id: p.producto_id,
      unidad: p.unidad,
      cantidad: p.cantidad,
      precio_unitario: p.precio_unitario,
      metadata: p.metadata,
    })),
    p_total: calculo.total,
  })
  if (error) {
    return NextResponse.json({ error: `No se pudieron guardar las partidas: ${error.message}` }, { status: 400 })
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.partidas', entidad: 'pedidos', entidadId: id,
    detalle: {
      antes: {
        total: Number(pedido.total) || 0,
        partidas: actuales.map(p => ({ producto_id: p.producto_id, unidad: p.unidad, cantidad: p.cantidad, precio_unitario: p.precio_unitario })),
      },
      despues: {
        total: calculo.total,
        partidas: calculo.partidas.map(p => ({ producto_id: p.producto_id, unidad: p.unidad, cantidad: p.cantidad, precio_unitario: p.precio_unitario })),
      },
      conservadas: calculo.conservadas,
      nuevas: calculo.nuevas,
      quitadas: calculo.quitadas,
      ...(sobra ? { sobrepago_confirmado: sobra } : {}),
    },
    request,
  })

  return NextResponse.json({
    ok: true,
    total: calculo.total,
    conservadas: calculo.conservadas,
    nuevas: calculo.nuevas,
    quitadas: calculo.quitadas,
  })
}

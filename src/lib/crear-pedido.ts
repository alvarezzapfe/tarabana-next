/**
 * Creacion de un pedido. Fuente unica de la regla de negocio.
 *
 * Estaba dentro de `app/api/admin/pedidos/crear/route.ts`, que ahora es un
 * wrapper. La importacion masiva llama a esto mismo en bucle, para que no
 * existan dos definiciones de "como se crea un pedido" que puedan divergir.
 *
 * Lo que impone, en este orden:
 *
 *   1. Quien puede crear: staff con escritura, o un vendedor.
 *   2. Descuento y costo de envio: SOLO admin y super admin.
 *   3. Forma del descuento (tipo, valor, motivo, tope sobre el subtotal).
 *   4. Si es vendedor: su ficha manda, y el cliente tiene que ser de su
 *      cartera. El vendedor_id del body se ignora.
 *   5. El precio sale del `nivel_precio` DEL CLIENTE, nunca del body.
 *   6. Stock suficiente, via calcularPedido.
 *   7. Pedido y partidas, o ninguno de los dos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { canManageAsAdmin, canWrite, isVendedor } from './roles'
import { precioSufijo } from './clientes'
import { calcularPedido } from './calcular-pedido'
import { logAction } from './audit'
import { enviarInvitacionCliente } from './invitar-cliente'

/** Item tal como lo arma el admin: producto_id = "<uuid>-<unidad>". */
export type ItemCrudo = {
  producto_id: string
  cantidad: number
  metadata?: unknown
}

export type DatosPedido = {
  cliente_id: string
  items: ItemCrudo[]
  condiciones_pago?: string | null
  notas?: string | null
  vendedor_id?: string | null
  costo_envio?: number | null
  descuento_tipo?: string | null
  descuento_valor?: number | null
  descuento_motivo?: string | null
}

export type ContextoPedido = {
  userId: string
  userEmail: string
  role: string
  /** Cliente del usuario: el insert pasa por RLS. */
  db: SupabaseClient
  /** Service client: para las lecturas que RLS acotaria de mas. */
  service: SupabaseClient
  request?: Request
  /**
   * Catalogo precargado. La importacion masiva pasa UNO solo para todo el
   * archivo y le va descontando lo que cada pedido consume, para que dos
   * pedidos del mismo lote no se repartan el mismo stock. Si no viene, se
   * carga aqui.
   */
  stockMap?: Map<string, Record<string, unknown>>
  /**
   * Saltarse el correo de invitacion al primer pedido. La importacion masiva
   * lo usa cuando quiere evitar una tanda de correos de golpe.
   */
  sinInvitacion?: boolean
}

export type ResultadoPedido =
  | { ok: true; pedido_id: string; total: number; sufijo: 'publico' | 'taproom' }
  | { ok: false; error: string; status: number }

const malo = (error: string, status = 400): ResultadoPedido => ({ ok: false, error, status })

/** El catalogo activo, indexado por id. */
export async function cargarStockMap(service: SupabaseClient) {
  const { data: productos } = await service.from('productos').select('*').eq('activo', true)
  return new Map<string, Record<string, unknown>>(
    (productos || []).map((p: Record<string, unknown>) => [String(p.id), p])
  )
}

/** "<uuid>-<unidad>" -> partes. El uuid trae guiones, la unidad no. */
export function parsearProductoId(item: { producto_id: string }) {
  const parts = String(item.producto_id).split('-')
  const unidad = parts[parts.length - 1]
  return { productoId: parts.slice(0, -1).join('-'), unidad }
}

export async function crearPedido(datos: DatosPedido, ctx: ContextoPedido): Promise<ResultadoPedido> {
  const { db, service, role } = ctx
  const esVendedor = isVendedor(role)

  if (!canWrite(role) && !esVendedor) return malo('Sin permiso', 403)
  if (!datos.cliente_id) return malo('cliente_id requerido')
  if (!Array.isArray(datos.items) || datos.items.length === 0) return malo('Sin productos')

  // ── Descuento y envio: solo admin ─────────────────────────
  //
  // Antes el unico excluido era el vendedor, asi que `ventas` y `produccion`
  // podian descontar. Se rechaza en vez de ignorarlo en silencio: si el
  // descuento no se va a aplicar, quien captura tiene que enterarse.
  const quiereDescuento = !!datos.descuento_tipo || !!datos.descuento_valor
  const quiereEnvio = (datos.costo_envio ?? 0) > 0
  if ((quiereDescuento || quiereEnvio) && !canManageAsAdmin(role)) {
    return malo(
      esVendedor
        ? 'Un vendedor no puede aplicar descuentos ni cobrar envio'
        : 'Solo admin y super admin pueden aplicar descuentos o costo de envio',
      403
    )
  }

  if (datos.descuento_tipo) {
    if (!['porcentaje', 'monto'].includes(datos.descuento_tipo)) return malo('Tipo de descuento invalido')
    const valor = Number(datos.descuento_valor)
    if (!valor || valor <= 0) return malo('Valor de descuento invalido')
    if (datos.descuento_tipo === 'porcentaje' && valor > 100) return malo('El porcentaje no puede ser mayor a 100')
    if (!datos.descuento_motivo?.trim()) return malo('El motivo del descuento es obligatorio')
  } else if (datos.descuento_valor) {
    return malo('Hay un valor de descuento sin tipo de descuento')
  }

  const costoEnvio = Number(datos.costo_envio ?? 0)
  if (!Number.isFinite(costoEnvio) || costoEnvio < 0) return malo('Costo de envio invalido')

  // ── Vendedor: su ficha y su cartera ───────────────────────
  let vendedorFinal: string | null = datos.vendedor_id || null
  if (esVendedor) {
    const { data: ficha } = await service
      .from('vendedores').select('id').eq('profile_id', ctx.userId).eq('activo', true).maybeSingle()
    if (!ficha) {
      return malo(
        'Tu usuario no esta ligado a una ficha de vendedor activa. Pide a un super admin que la asigne.',
        403
      )
    }
    vendedorFinal = ficha.id

    const { data: cli } = await service
      .from('profiles').select('vendedor_id').eq('id', datos.cliente_id).maybeSingle()
    if (!cli || cli.vendedor_id !== ficha.id) return malo('Ese cliente no esta en tu cartera', 403)
  }

  // ── Precio segun el nivel DEL CLIENTE ─────────────────────
  const { data: clienteProfile } = await service
    .from('profiles').select('nivel_precio').eq('id', datos.cliente_id).maybeSingle()
  if (!clienteProfile) return malo('Cliente no encontrado')
  const sufijo = precioSufijo(clienteProfile.nivel_precio)
  const esMayorista = sufijo === 'taproom'

  const stockMap = ctx.stockMap ?? (await cargarStockMap(service))

  const calculo = calcularPedido(datos.items, stockMap, sufijo, esMayorista, parsearProductoId)
  if ('error' in calculo) return malo(calculo.error, calculo.status)

  if (datos.descuento_tipo === 'monto' && Number(datos.descuento_valor) > calculo.total) {
    return malo('El descuento no puede ser mayor al subtotal')
  }

  // ── Pedido y partidas: o los dos, o ninguno ───────────────
  const { data: pedido, error } = await db.from('pedidos').insert({
    cliente_id: datos.cliente_id,
    vendedor_id: vendedorFinal,
    tipo_precio: calculo.sufijo,
    condiciones_pago: datos.condiciones_pago || 'contado',
    notas: datos.notas || null,
    total: calculo.total,
    status: 'confirmado',
    costo_envio: costoEnvio || 0,
    descuento_tipo: datos.descuento_tipo || null,
    descuento_valor: datos.descuento_tipo ? datos.descuento_valor : null,
    descuento_motivo: datos.descuento_tipo ? datos.descuento_motivo : null,
  }).select('id').single()

  if (error || !pedido) return malo(error?.message || 'No se pudo crear el pedido')

  const { error: errorItems } = await db.from('pedido_items').insert(
    calculo.items.map(i => ({ ...i, pedido_id: pedido.id }))
  )

  // Antes este error se ignoraba y quedaba un pedido con total y sin
  // partidas. No hay transaccion desde el cliente de Supabase, asi que se
  // compensa borrando la cabecera.
  if (errorItems) {
    await db.from('pedidos').delete().eq('id', pedido.id)
    return malo(`No se pudieron guardar las partidas (${errorItems.message}). El pedido no se creo.`)
  }

  // La comision NO se genera aqui: en Fase 3 son tramos marginales sobre lo
  // COBRADO y se calculan al leer, no al crear.

  logAction({
    actorId: ctx.userId, actorEmail: ctx.userEmail, actorRole: role,
    accion: 'pedido.crear', entidad: 'pedidos', entidadId: pedido.id,
    detalle: { cliente_id: datos.cliente_id, total: calculo.total, vendedor_id: vendedorFinal },
    request: ctx.request,
  })

  // Invitacion al primer pedido, fire-and-forget. Con el service client a
  // proposito: con el del usuario, RLS le muestra al vendedor solo sus
  // pedidos, asi que un cliente que ya tenia pedidos de otro vendedor
  // contaria 1 y se le reenviaria la invitacion.
  if (!ctx.sinInvitacion) {
    const { count } = await service
      .from('pedidos').select('id', { count: 'exact', head: true }).eq('cliente_id', datos.cliente_id)
    if (count === 1) {
      enviarInvitacionCliente(datos.cliente_id, { pedidoId: pedido.id, pedidoTotal: calculo.total }).then(r => {
        if (r.sent) {
          logAction({
            actorId: ctx.userId, actorEmail: ctx.userEmail, actorRole: role,
            accion: 'cliente.invitacion', entidad: 'profiles', entidadId: datos.cliente_id,
            detalle: { pedido_id: pedido.id, trigger: 'primer_pedido' },
            request: ctx.request,
          })
        }
      })
    }
  }

  return { ok: true, pedido_id: pedido.id, total: calculo.total, sufijo: calculo.sufijo }
}

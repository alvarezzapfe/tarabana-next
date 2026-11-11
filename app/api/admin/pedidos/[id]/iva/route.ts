import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { canManageAsAdmin, canWrite, isVendedor } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { puedeEditarPartidas, sobrepagoDe } from '../../../../../../src/lib/editar-partidas'
import { cargarTasaIva } from '../../../../../../src/lib/iva'

/**
 * Prende o apaga el IVA de un pedido COMPLETO: todas sus partidas y/o su
 * envio.
 *
 * El IVA fino —partida por partida— se edita con la matriz, por
 * `/[id]/partidas`. Esta ruta es el mazo: "este pedido lleva IVA" o "no lo
 * lleva", que es la pregunta que se contesta desde el panel lateral.
 *
 * El body acepta las dos banderas, y cada una es opcional:
 *
 *   { incluye_iva: true }         -> marca TODAS las partidas
 *   { envio_incluye_iva: false }  -> solo el flete
 *
 * ── Quien puede ───────────────────────────────────────────
 *
 * La misma regla que al crear (ver `crearPedido`): quedarse en el
 * `requiere_factura` del cliente es de oficina; SALIRSE de ese default es de
 * admin. La pregunta no es "quien toca el IVA" sino "quien factura distinto a
 * como el cliente pidio".
 *
 * El vendedor no entra, igual que en `/partidas`: no tiene policy de UPDATE
 * sobre `pedidos` ni sobre `pedido_items` (20261103100000), asi que sin este
 * guard recibiria un update que afecta cero filas sin error.
 *
 * ── Sin RPC, a proposito ──────────────────────────────────
 *
 * Son dos UPDATE y no una transaccion. `set_pedido_items` si necesito un RPC
 * porque su estado intermedio era "pedido sin partidas", que es corrupcion;
 * aqui el intermedio —partidas gravadas y envio todavia no— es un estado que
 * el modelo permite y que alguien pudo haber pedido a mano. El resumen
 * `pedidos.incluye_iva` lo mantiene el trigger en los dos casos.
 *
 * ── Sobrepago ─────────────────────────────────────────────
 *
 * Desgravar un pedido ya cobrado baja el total y deja al cliente con mas
 * pagado de lo que debe. No se bloquea —puede haber una devolucion de por
 * medio— pero no se guarda sin que alguien lo confirme, con el mismo 409 y la
 * misma forma de respuesta que `/partidas`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (isVendedor(profile?.role)) {
    return NextResponse.json(
      { error: 'Un vendedor no puede cambiar el IVA de un pedido. Pídelo a alguien de oficina.' },
      { status: 403 }
    )
  }
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let body: { incluye_iva?: unknown; envio_incluye_iva?: unknown; confirmarSobrepago?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
  }

  const pedirBool = (v: unknown, nombre: string) => {
    if (v === undefined) return undefined
    if (typeof v !== 'boolean') throw new Error(`${nombre} tiene que ser true o false.`)
    return v
  }

  let quiereItems: boolean | undefined
  let quiereEnvio: boolean | undefined
  try {
    quiereItems = pedirBool(body.incluye_iva, 'incluye_iva')
    quiereEnvio = pedirBool(body.envio_incluye_iva, 'envio_incluye_iva')
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  if (quiereItems === undefined && quiereEnvio === undefined) {
    return NextResponse.json(
      { error: 'Manda incluye_iva (para las partidas), envio_incluye_iva, o las dos.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const [{ data: pedido }, { data: saldo }, { data: partidas }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, status, cliente_id, total, descuento_tipo, descuento_valor, costo_envio, incluye_iva, envio_incluye_iva, iva_tasa')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('pedidos_saldo').select('pagado').eq('id', id).maybeSingle(),
    supabase.from('pedido_items').select('id, cantidad, precio_unitario, incluye_iva').eq('pedido_id', id),
  ])

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Mismo criterio que las partidas: un entregado ya desconto inventario y se
  // facturo, un cancelado no va a salir. Cambiarles el IVA reescribe un
  // documento que ya existe afuera.
  if (!puedeEditarPartidas(pedido.status)) {
    return NextResponse.json(
      {
        error: `Este pedido está ${pedido.status} y su IVA ya no se cambia.`,
        detalle: pedido.status === 'entregado'
          ? 'Un pedido entregado ya se facturó.'
          : 'Un pedido cancelado no va a salir.',
      },
      { status: 409 }
    )
  }

  const items = partidas || []
  const envioActual = !!pedido.envio_incluye_iva
  const envioFinal = quiereEnvio ?? envioActual

  // Las partidas que de verdad hay que mover. Si ya estan como se piden, no
  // se escribe: un UPDATE que no cambia nada ensucia el audit_log con
  // entradas que no dicen nada.
  const porMover = quiereItems === undefined ? [] : items.filter(i => !!i.incluye_iva !== quiereItems)

  if (porMover.length === 0 && envioFinal === envioActual) {
    return NextResponse.json({
      ok: true,
      sinCambio: true,
      incluye_iva: pedido.incluye_iva,
      envio_incluye_iva: envioActual,
    })
  }

  // ── Salirse del default del cliente pide admin ────────────
  const { data: cliente } = await service
    .from('profiles').select('requiere_factura').eq('id', pedido.cliente_id).maybeSingle()
  const ivaPorCliente = !!cliente?.requiere_factura

  const seSale =
    (quiereItems !== undefined && quiereItems !== ivaPorCliente) ||
    (quiereEnvio !== undefined && quiereEnvio !== ivaPorCliente)

  if (seSale && !canManageAsAdmin(profile!.role)) {
    return NextResponse.json(
      {
        error: ivaPorCliente
          ? 'Este cliente factura con IVA; solo admin puede quitárselo a un pedido.'
          : 'Este cliente no factura con IVA; solo admin puede agregárselo a un pedido.',
      },
      { status: 403 }
    )
  }

  // ── La tasa ───────────────────────────────────────────────
  //
  // Al GRAVAR se copia la vigente, porque es la que aplica a la factura que
  // se va a emitir ahora. Al desgravar no se toca: la columna guarda la
  // ultima tasa usada. `app_config` pide is_staff(), de ahi el service client.
  const grava = quiereItems === true || quiereEnvio === true
  const tasa = grava ? await cargarTasaIva(service) : Number(pedido.iva_tasa) || 0
  if (grava && tasa <= 0) {
    return NextResponse.json(
      { error: 'La tasa de IVA configurada es 0: revisa app_config.impuestos antes de facturar con IVA.' },
      { status: 400 }
    )
  }

  // ── Sobrepago con el estado NUEVO ─────────────────────────
  const importe = (i: { cantidad: number | null; precio_unitario: number | null }) =>
    (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0)

  const gravableFinal = items.reduce((t, i) => {
    const marcada = quiereItems === undefined ? !!i.incluye_iva : quiereItems
    return t + (marcada ? importe(i) : 0)
  }, 0)

  const sobra = sobrepagoDe({
    total: Number(pedido.total) || 0,
    descuento_tipo: pedido.descuento_tipo,
    descuento_valor: pedido.descuento_valor,
    costo_envio: pedido.costo_envio,
    gravable: gravableFinal,
    envio_incluye_iva: envioFinal,
    iva_tasa: tasa,
    pagado: Number(saldo?.pagado) || 0,
  })
  if (sobra && body.confirmarSobrepago !== true) {
    return NextResponse.json(
      {
        error: grava ? 'Con IVA el pedido queda sobrepagado.' : 'Sin IVA el pedido queda sobrepagado.',
        sobrepago: sobra,
        requiereConfirmacion: true,
      },
      { status: 409 }
    )
  }

  // ── Escritura ─────────────────────────────────────────────
  //
  // Pasa por RLS a proposito (el cliente de sesion, no el service): quien
  // puede escribir lo decide la policy. Y por eso se cuentan las filas
  // devueltas: con RLS, un UPDATE sin policy afecta CERO filas en silencio, y
  // sin este check la pantalla diria "guardado" sin haber guardado nada.
  if (porMover.length > 0) {
    const { data: tocadas, error } = await supabase
      .from('pedido_items')
      .update({ incluye_iva: quiereItems })
      .in('id', porMover.map(i => i.id))
      .select('id')

    if (error) {
      return NextResponse.json({ error: `No se pudo cambiar el IVA de las partidas: ${error.message}` }, { status: 400 })
    }
    if ((tocadas || []).length !== porMover.length) {
      return NextResponse.json(
        { error: 'No tienes permiso para modificar las partidas de este pedido.' },
        { status: 403 }
      )
    }
  }

  // La tasa se escribe junto con el envio. Si solo cambiaron las partidas,
  // igual hay que subir la tasa vigente, asi que el update va de todos modos
  // cuando se esta gravando.
  if (envioFinal !== envioActual || grava) {
    const { data: tocado, error } = await supabase
      .from('pedidos')
      .update({ envio_incluye_iva: envioFinal, iva_tasa: tasa })
      .eq('id', id)
      .select('id')

    if (error) {
      return NextResponse.json({ error: `No se pudo cambiar el IVA del envío: ${error.message}` }, { status: 400 })
    }
    if (!tocado || tocado.length === 0) {
      return NextResponse.json({ error: 'No tienes permiso para modificar este pedido.' }, { status: 403 })
    }
  }

  // El resumen lo recalculo el trigger; se vuelve a leer para contestar con
  // la verdad y no con lo que esta ruta cree que quedo.
  const { data: despues } = await supabase
    .from('pedidos_saldo')
    .select('incluye_iva, base_gravable, iva_monto, total_con_envio, saldo')
    .eq('id', id)
    .maybeSingle()

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.iva', entidad: 'pedidos', entidadId: id,
    detalle: {
      antes: {
        incluye_iva: !!pedido.incluye_iva,
        envio_incluye_iva: envioActual,
        partidas_gravadas: items.filter(i => i.incluye_iva).length,
        iva_tasa: Number(pedido.iva_tasa) || 0,
      },
      despues: {
        incluye_iva: despues?.incluye_iva ?? null,
        envio_incluye_iva: envioFinal,
        partidas_gravadas: quiereItems === undefined
          ? items.filter(i => i.incluye_iva).length
          : (quiereItems ? items.length : 0),
        iva_tasa: tasa,
        base_gravable: despues?.base_gravable ?? null,
        iva_monto: despues?.iva_monto ?? null,
      },
      partidas_de: items.length,
      requiere_factura_cliente: ivaPorCliente,
      ...(sobra ? { sobrepago_confirmado: sobra } : {}),
    },
    request,
  })

  return NextResponse.json({
    ok: true,
    incluye_iva: despues?.incluye_iva ?? null,
    envio_incluye_iva: envioFinal,
    iva_tasa: tasa,
    base_gravable: despues?.base_gravable ?? null,
    iva_monto: despues?.iva_monto ?? null,
  })
}

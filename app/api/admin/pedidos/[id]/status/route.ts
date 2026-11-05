import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { movimientosDeEntrega, porProducto } from '../../../../../../src/lib/stock-entrega'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { status } = await request.json()

  // When marking as 'entregado', deduct stock
  if (status === 'entregado') {
    // Check current status to avoid double-deducting
    const { data: pedido } = await supabase.from('pedidos').select('status').eq('id', id).single()
    if (pedido?.status === 'entregado') {
      return NextResponse.json({ error: 'Este pedido ya fue marcado como entregado' }, { status: 400 })
    }

    const { data: items } = await supabase
      .from('pedido_items')
      // Todas las columnas de stock: antes traia solo cuatro, asi que para un
      // barril de acero o de 10 L el valor actual llegaba undefined.
      .select('*, productos(id, nombre, stock_latas, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero, stock_barril10_pet, stock_barril10_acero)')
      .eq('pedido_id', id)

    // Que descontar: lo calcula movimientosDeEntrega, que es puro y esta
    // probado. Antes esto era un bucle que escribia una vez por partida y
    // tenia dos fallas:
    //
    //   - Descontaba `stock_latas` al entregar cajas. Las latas sueltas son
    //     un contador independiente (docs/SCHEMA_NOTES.md), asi que eso
    //     restaba inventario que nadie envio.
    //   - Cada partida calculaba el nuevo stock desde el mismo snapshot
    //     previo al bucle, asi que dos partidas del mismo producto se
    //     pisaban y solo se descontaba la ultima.
    const movimientos = movimientosDeEntrega(
      (items || []).map(it => ({
        producto_id: it.producto_id,
        unidad: it.unidad,
        cantidad: it.cantidad,
        metadata: it.metadata,
        nombre: it.productos?.nombre,
      }))
    )
    if ('error' in movimientos) {
      return NextResponse.json({ error: movimientos.error }, { status: 400 })
    }

    // El stock actual de cada producto que se va a tocar. Se lee aqui y no
    // del join de las partidas porque un mix descuenta de productos que no
    // son el de su propia partida.
    const productoIds = [...new Set(movimientos.map(m => m.producto_id))]
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, stock_latas, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero, stock_barril10_pet, stock_barril10_acero')
      .in('id', productoIds)

    const porId = new Map((productos || []).map(p => [p.id, p as Record<string, unknown>]))

    // Primero se valida TODO y despues se escribe: si una partida no alcanza,
    // el pedido no queda a medio descontar.
    const updates: { id: string; cambios: Record<string, number> }[] = []

    for (const [producto_id, movs] of porProducto(movimientos)) {
      const prod = porId.get(producto_id)
      if (!prod) {
        return NextResponse.json(
          { error: `Un producto del pedido ya no existe en el catalogo (${producto_id}).` },
          { status: 400 }
        )
      }
      const cambios: Record<string, number> = {}
      for (const m of movs) {
        const actual = Number(prod[m.columna] ?? 0) || 0
        if (actual < m.cantidad) {
          return NextResponse.json(
            { error: `Stock insuficiente de ${prod.nombre}: necesitas ${m.cantidad} ${m.etiqueta} y hay ${actual}.` },
            { status: 400 }
          )
        }
        cambios[m.columna] = actual - m.cantidad
      }
      updates.push({ id: producto_id, cambios })
    }

    for (const u of updates) {
      const { error } = await supabase.from('productos').update(u.cambios).eq('id', u.id)
      if (error) {
        return NextResponse.json(
          { error: `No se pudo actualizar el inventario: ${error.message}` },
          { status: 400 }
        )
      }
    }
  }

  const prevStatus = (await supabase.from('pedidos').select('status').eq('id', id).single()).data?.status
  await supabase.from('pedidos').update({ status }).eq('id', id)
  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'pedido.status', entidad: 'pedidos', entidadId: id, detalle: { from: prevStatus, to: status }, request })
  return NextResponse.json({ ok: true })
}

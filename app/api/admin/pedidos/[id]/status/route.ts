import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { columnaStockDe } from '../../../../../../src/lib/unidades'

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

    if (items) {
      for (const item of items) {
        if (item.unidad === 'mix24' && item.metadata?.estilos) {
          // Mix flexible: deduct from stock_latas ONLY, never touch stock_caja24.
          // The mix is assembled from latas sueltas.
          for (const estilo of item.metadata.estilos) {
            const { data: prod } = await supabase
              .from('productos')
              .select('stock_latas')
              .eq('id', estilo.producto_id)
              .single()
            if (!prod) continue
            const latasToDeduct = item.cantidad * (estilo.latas || estilo.cantidad_latas || 6)
            if ((prod.stock_latas || 0) < latasToDeduct) {
              return NextResponse.json({ error: `Stock de latas insuficiente de ${estilo.nombre || 'producto'} para el mix. Disponible: ${prod.stock_latas || 0} latas.` }, { status: 400 })
            }
            await supabase.from('productos').update({
              stock_latas: (prod.stock_latas || 0) - latasToDeduct,
            }).eq('id', estilo.producto_id)
          }
        } else {
          // La columna sale de unidades.ts y no de un ternario.
          //
          // El ternario que estaba aqui mandaba a `stock_caja24` todo lo que
          // no fuera caja12 ni barril_pet, asi que entregar un barril_acero o
          // uno de 10 L descontaba CAJAS DE 24 y dejaba intacta la columna del
          // barril. Nunca corrompio produccion de milagro: no hay ningun
          // pedido en estado 'entregado' todavia, pero el pedido CB63CF trae
          // un barril_acero esperando.
          const stockCol = columnaStockDe(item.unidad)
          if (!stockCol) {
            return NextResponse.json(
              { error: `No se puede descontar stock: presentacion no reconocida (${item.unidad}) en ${item.productos?.nombre || 'un producto'}.` },
              { status: 400 }
            )
          }
          const currentStock = item.productos?.[stockCol] || 0
          const newStock = currentStock - item.cantidad
          if (newStock < 0) {
            return NextResponse.json({ error: `Stock insuficiente de ${item.productos?.nombre || 'producto'} para entregar. Stock actual: ${currentStock}.` }, { status: 400 })
          }
          const update: Record<string, any> = { [stockCol]: newStock }
          // Also deduct from stock_latas for caja items
          if (item.unidad === 'caja24' || item.unidad === 'caja12') {
            const latasPerUnit = item.unidad === 'caja24' ? 24 : 12
            update.stock_latas = Math.max(0, (item.productos?.stock_latas || 0) - (item.cantidad * latasPerUnit))
          }
          await supabase.from('productos').update(update).eq('id', item.producto_id)
        }
      }
    }
  }

  const prevStatus = (await supabase.from('pedidos').select('status').eq('id', id).single()).data?.status
  await supabase.from('pedidos').update({ status }).eq('id', id)
  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'pedido.status', entidad: 'pedidos', entidadId: id, detalle: { from: prevStatus, to: status }, request })
  return NextResponse.json({ ok: true })
}

import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin', 'ventas'].includes(profile?.role || ''))
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
      .select('*, productos(id, stock_caja24, stock_latas)')
      .eq('pedido_id', id)

    if (items) {
      for (const item of items) {
        if (item.unidad === 'caja24') {
          // Sencilla: deduct full cajas
          const newStock24 = (item.productos?.stock_caja24 || 0) - item.cantidad
          const newStockLatas = (item.productos?.stock_latas || 0) - (item.cantidad * 24)
          if (newStock24 < 0) {
            return NextResponse.json({ error: `Stock insuficiente de ${item.productos?.nombre || 'producto'} para entregar. Stock actual: ${item.productos?.stock_caja24} cajas.` }, { status: 400 })
          }
          await supabase.from('productos').update({
            stock_caja24: newStock24,
            stock_latas: Math.max(0, newStockLatas),
          }).eq('id', item.producto_id)
        } else if (item.unidad === 'mix24' && item.metadata?.estilos) {
          // Mix: deduct 6 latas per estilo per mix caja
          for (const estilo of item.metadata.estilos) {
            const { data: prod } = await supabase
              .from('productos')
              .select('stock_caja24, stock_latas')
              .eq('id', estilo.producto_id)
              .single()
            if (!prod) continue
            const latasToDeduct = item.cantidad * (estilo.cantidad_latas || 6)
            await supabase.from('productos').update({
              stock_latas: Math.max(0, (prod.stock_latas || 0) - latasToDeduct),
            }).eq('id', estilo.producto_id)
          }
        }
      }
    }
  }

  await supabase.from('pedidos').update({ status }).eq('id', id)
  return NextResponse.json({ ok: true })
}

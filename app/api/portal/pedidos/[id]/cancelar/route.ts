import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: pedido } = await supabase.from('pedidos').select('cliente_id, status').eq('id', id).single()
  if (!pedido || pedido.cliente_id !== user.id) return NextResponse.json({ error: 'No permitido' }, { status: 403 })
  if (pedido.status !== 'pendiente') return NextResponse.json({ error: 'Solo se pueden cancelar pedidos pendientes' }, { status: 400 })

  await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', id)
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { createServiceClient } from '../../../../../../src/lib/supabase-server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { error: itemsError } = await supabase.from('pedido_items').delete().eq('pedido_id', id)
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

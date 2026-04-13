import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import PedidosClient from './PedidosClient'

export default async function PedidosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = ['super_admin', 'admin', 'ventas'].includes(myProfile?.role || '')

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(full_name, email), pedido_items(cantidad, precio_unitario, productos(nombre))')
    .order('created_at', { ascending: false })

  return <PedidosClient pedidos={pedidos || []} canEdit={canEdit} />
}

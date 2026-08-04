import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import PedidosClient from './PedidosClient'
import { canWrite } from '../../../src/lib/roles'

export default async function PedidosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canWrite(myProfile?.role)

  const [{ data: pedidos }, { data: saldos }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, profiles!pedidos_cliente_id_fkey(full_name, email), pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre, estilo, imagen_url))')
      .order('created_at', { ascending: false }),
    supabase.from('pedidos_saldo').select('*'),
  ])

  return <PedidosClient pedidos={pedidos || []} saldos={saldos || []} canEdit={canEdit} />
}

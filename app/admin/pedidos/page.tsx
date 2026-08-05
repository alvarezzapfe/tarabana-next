import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import PedidosClient from './PedidosClient'
import { canWrite } from '../../../src/lib/roles'

export default async function PedidosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canWrite(myProfile?.role)

  const [{ data: pedidos }, { data: saldos }, { data: pagos }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, profiles!pedidos_cliente_id_fkey(id, full_name, email, phone, tipo_consumidor, nivel_precio, calle, num_ext, num_int, colonia, municipio, estado, cp, referencias, direccion_entrega), pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre, estilo, imagen_url))')
      .order('created_at', { ascending: false }),
    supabase.from('pedidos_saldo').select('*'),
    supabase.from('pagos').select('*').order('fecha_pago', { ascending: false }),
  ])

  return <PedidosClient pedidos={pedidos || []} saldos={saldos || []} pagos={pagos || []} canEdit={canEdit} />
}

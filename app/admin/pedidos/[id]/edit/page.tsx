import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { redirect } from 'next/navigation'
import EditPedidoClient from './EditPedidoClient'

export default async function EditPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!['super_admin', 'admin', 'ventas'].includes(profile?.role || '')) redirect('/admin/pedidos')

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(full_name, email), pedido_items(*, productos(nombre, estilo))')
    .eq('id', id)
    .single()

  const { data: vendedores } = await supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre')

  if (!pedido) redirect('/admin/pedidos')

  return <EditPedidoClient pedido={pedido} vendedores={vendedores || []} isSuperAdmin={profile?.role === 'super_admin'} />
}

import { createServerSupabaseClient } from '../../src/lib/supabase-server'
import DashboardClient from './DashboardClient'

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient()

  const [
    { count: totalUsuarios },
    { count: totalProductos },
    { data: pedidos },
    { data: productos },
    { data: clientes },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'comprador'),
    supabase.from('productos').select('*', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('pedidos').select('*, profiles!pedidos_cliente_id_fkey(full_name, email), pedido_items(cantidad, precio_unitario, productos(nombre))').order('created_at', { ascending: false }),
    supabase.from('productos').select('id, nombre, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero').eq('activo', true),
    supabase.from('profiles').select('id, full_name, email').eq('role', 'comprador'),
  ])

  return <DashboardClient
    pedidos={pedidos || []}
    totalUsuarios={totalUsuarios || 0}
    totalProductos={totalProductos || 0}
    productos={productos || []}
    clientes={clientes || []}
  />
}

import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import ReportesClient from './ReportesClient'

export default async function ReportesPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: pedidos }, { data: saldos }, { data: clientes }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, profiles!pedidos_cliente_id_fkey(id, full_name, email), pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre, estilo))')
      .neq('status', 'cancelado')
      .order('created_at', { ascending: true }),
    supabase.from('pedidos_saldo').select('*'),
    supabase.from('profiles').select('id, full_name, email, created_at').eq('role', 'comprador'),
  ])

  return <ReportesClient pedidos={pedidos || []} saldos={saldos || []} clientes={clientes || []} />
}

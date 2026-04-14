import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import ReportesClient from './ReportesClient'

export default async function ReportesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(full_name, email), pedido_items(cantidad, precio_unitario, productos(nombre, estilo))')
    .order('created_at', { ascending: true })

  return <ReportesClient pedidos={pedidos || []} />
}

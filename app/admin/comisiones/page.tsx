import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import ComisionesClient from './ComisionesClient'

export default async function ComisionesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const isSuperAdmin = profile?.role === 'super_admin'

  const { data: comisiones } = await supabase
    .from('comisiones')
    .select('*, vendedores(nombre, comision_pct, tipo), pedidos(id, total, created_at, status, profiles!pedidos_cliente_id_fkey(full_name, email))')
    .order('created_at', { ascending: false })

  const { data: vendedores } = await supabase.from('vendedores').select('*').eq('activo', true).order('nombre')

  return <ComisionesClient comisiones={comisiones || []} vendedores={vendedores || []} isSuperAdmin={isSuperAdmin} />
}

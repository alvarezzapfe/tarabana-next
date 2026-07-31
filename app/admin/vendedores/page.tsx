import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import VendedoresClient from './VendedoresClient'
import { canManageAsAdmin } from '../../../src/lib/roles'

export default async function VendedoresPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canManageAsAdmin(profile?.role)

  const { data: vendedores } = await supabase.from('vendedores').select('*').order('nombre')
  const { data: comisiones } = await supabase.from('comisiones').select('vendedor_id, monto_comision, pagada')

  return <VendedoresClient vendedores={vendedores || []} comisiones={comisiones || []} canEdit={canEdit} />
}

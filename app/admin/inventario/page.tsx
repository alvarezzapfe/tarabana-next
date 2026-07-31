import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import InventarioClient from './InventarioClient'
import { canManageInventory } from '../../../src/lib/roles'

export default async function InventarioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const { data: productos } = await supabase.from('productos').select('*').order('nombre')
  const canEdit = canManageInventory(profile?.role)
  return <InventarioClient productos={productos || []} canEdit={canEdit} />
}

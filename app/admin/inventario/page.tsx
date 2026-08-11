import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import InventarioClient from './InventarioClient'
import { canManageInventory } from '../../../src/lib/roles'

export default async function InventarioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const [{ data: productos }, { data: countRows }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre'),
    supabase.rpc('pedido_items_count_by_producto'),
  ])
  const canEdit = canManageInventory(profile?.role)

  const pedidoCounts: Record<string, number> = {}
  for (const row of countRows || []) {
    pedidoCounts[row.producto_id] = row.count
  }

  return <InventarioClient productos={productos || []} canEdit={canEdit} pedidoCounts={pedidoCounts} />
}

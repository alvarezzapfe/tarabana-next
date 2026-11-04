import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import InventarioClient from './InventarioClient'
import { canManageInventory } from '../../../src/lib/roles'

export default async function InventarioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  // Guard propio, no solo canEdit. Antes la pagina renderizaba para cualquier
  // rol con acceso al panel y solo desactivaba la edicion, asi que un vendedor
  // que escribiera la URL veia toda la tabla de stock en modo lectura.
  if (!canManageInventory(profile?.role)) {
    return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>
  }

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

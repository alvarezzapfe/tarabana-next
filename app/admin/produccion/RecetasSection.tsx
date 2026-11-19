import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { canManageInventory } from '../../../src/lib/roles'
import RecetasClient from './RecetasClient'
import type { ProductoFila, RecetaFila } from './produccion-ui'

/**
 * Recetas: los objetivos de proceso por producto.
 *
 * Trae TODOS los productos activos, no solo los que ya tienen receta: la
 * pantalla es "que objetivos tiene cada cerveza", y un producto sin receta es
 * justamente el que hay que capturar. Esconderlo haria que la pantalla se
 * vea completa cuando no lo esta.
 */
export default async function RecetasSection({ role }: { role?: string }) {
  const supabase = await createServerSupabaseClient()

  const [{ data: productos }, { data: recetas }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, estilo, folio_prefijo')
      .is('descontinuado_at', null)
      .order('nombre'),
    supabase.from('recetas').select('*'),
  ])

  return (
    <RecetasClient
      productos={(productos || []) as ProductoFila[]}
      recetas={(recetas || []) as RecetaFila[]}
      canEdit={canManageInventory(role)}
    />
  )
}

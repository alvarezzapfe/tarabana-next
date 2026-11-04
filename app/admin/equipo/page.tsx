import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { isSuperAdmin } from '../../../src/lib/roles'
import EquipoClient from './EquipoClient'

/**
 * Guard server-side, igual que el resto de las secciones.
 *
 * EquipoClient ya valida super_admin por su cuenta, pero lo hacia solo en el
 * navegador: el HTML del servidor salia con "Cargando..." y el rechazo
 * aparecia despues de hidratar. Los datos nunca estuvieron expuestos porque
 * RLS solo le devuelve su propia fila a quien no es staff, pero el guard vive
 * mejor aqui, antes de renderizar.
 */
export default async function EquipoPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!isSuperAdmin(profile?.role)) {
    return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>
  }

  return <EquipoClient />
}

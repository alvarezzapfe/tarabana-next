import { createServerSupabaseClient } from './supabase-server'
import { contrastaConChrome, esHex6 } from './contraste'

/** Mismo default que el layout del admin. */
export const ACENTO_DEFAULT = '#D95F2E'

/**
 * Rol y acento para las paginas host de cada seccion.
 *
 * El layout ya valido sesion, isStaff y AAL2 antes de que cualquier page se
 * renderice, asi que aqui no se repite el gate: solo se necesita el rol para
 * filtrar pestanas y el acento para pintarlas.
 */
export async function contextoAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: profile }, { data: brandingRow }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user!.id).single(),
    supabase.from('app_config').select('value').eq('key', 'branding').single(),
  ])
  const colorPrimary = brandingRow?.value?.color_primary
  const acento = esHex6(colorPrimary) && contrastaConChrome(colorPrimary) ? colorPrimary : ACENTO_DEFAULT
  return { supabase, user, role: profile?.role as string | undefined, acento }
}

/** searchParams de una page de Next 16: siempre una promesa. */
export type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

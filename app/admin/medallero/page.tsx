import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { canManageAsAdmin } from '../../../src/lib/roles'
import MedalleroClient from './MedalleroClient'

export default async function MedalleroPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canManageAsAdmin(profile?.role)

  const { data: medallas } = await supabase.from('medallero').select('*').order('año', { ascending: false })

  return <MedalleroClient medallas={medallas || []} canEdit={canEdit} />
}

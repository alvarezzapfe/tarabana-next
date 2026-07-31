import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { canManageAsAdmin } from '../../../src/lib/roles'
import TaproomConfigClient from './TaproomConfigClient'

export default async function AdminTaproomPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canManageAsAdmin(profile?.role)

  const { data: config } = await supabase.from('taproom_config').select('*').single()
  return <TaproomConfigClient config={config} canEdit={canEdit} />
}

import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { isSuperAdmin } from '../../../src/lib/roles'
import TaproomConfigClient from './TaproomConfigClient'

export default async function AdminTaproomPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!isSuperAdmin(profile?.role)) {
    return <div style={{ padding: 60, color: '#ef4444', fontFamily: 'system-ui', textAlign: 'center' }}>Acceso restringido — solo Super Admin</div>
  }

  const { data: config } = await supabase.from('taproom_config').select('*').single()
  return <TaproomConfigClient config={config} />
}

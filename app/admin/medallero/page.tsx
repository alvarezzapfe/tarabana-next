import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import MedalleroClient from './MedalleroClient'

export default async function MedalleroPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (profile?.role !== 'super_admin') {
    return <div style={{ padding: 60, color: '#ef4444', fontFamily: 'system-ui', textAlign: 'center' }}>Acceso restringido — solo Super Admin</div>
  }

  const { data: medallas } = await supabase.from('medallero').select('*').order('año', { ascending: false })

  return <MedalleroClient medallas={medallas || []} />
}

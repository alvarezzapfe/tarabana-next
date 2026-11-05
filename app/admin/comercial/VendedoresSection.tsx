import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import VendedoresClient from './VendedoresClient'
import { canManageAsAdmin } from '../../../src/lib/roles'

export default async function VendedoresSection() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canManageAsAdmin(profile?.role)

  const [{ data: vendedores }, { data: cortes }, { data: tramos }] = await Promise.all([
    supabase.from('vendedores').select('*').order('nombre'),
    // Los acumulados de cada ficha salen de los cortes mensuales. La tabla
    // vieja `comisiones` ya no se lee: quedo obsoleta con los tramos
    // marginales (ver 20261104100000_comisiones_tramos.sql).
    supabase.from('comision_cortes').select('vendedor_id, comision, estado'),
    // Solo para decir si tiene escalera propia o usa la global.
    supabase.from('comision_tramos').select('vendedor_id').not('vendedor_id', 'is', null),
  ])

  const conEscaleraPropia = [...new Set((tramos || []).map(t => t.vendedor_id))]

  return (
    <VendedoresClient
      vendedores={vendedores || []}
      cortes={cortes || []}
      conEscaleraPropia={conEscaleraPropia}
      canEdit={canEdit}
    />
  )
}

import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { redirect } from 'next/navigation'
import EditPedidoClient from './EditPedidoClient'
import { canManageAsAdmin, canWrite, isSuperAdmin } from '../../../../../src/lib/roles'

export default async function EditPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!canWrite(profile?.role)) redirect('/admin/pedidos')

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(full_name, email), pedido_items(*, productos(nombre, estilo))')
    .eq('id', id)
    .single()

  const { data: vendedores } = await supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre')

  // El saldo sale de la VISTA y no se recalcula aqui: es quien sabe el
  // descuento redondeado, el IVA prorrateado y el ajuste. El campo de ajuste
  // necesita "lo que se cobraria sin ajuste", que es total_con_envio - ajuste.
  const { data: saldo } = await supabase
    .from('pedidos_saldo')
    .select('total_con_envio, ajuste')
    .eq('id', id)
    .maybeSingle()

  if (!pedido) redirect('/admin/pedidos')

  return (
    <EditPedidoClient
      pedido={pedido}
      vendedores={vendedores || []}
      isSuperAdmin={isSuperAdmin(profile?.role)}
      puedeAjustar={canManageAsAdmin(profile?.role)}
      totalAntesDeAjuste={saldo ? Number(saldo.total_con_envio) - Number(saldo.ajuste) : null}
    />
  )
}

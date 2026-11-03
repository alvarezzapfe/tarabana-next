import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const esVendedor = isVendedor(profile?.role)
  if (!canWrite(profile?.role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const serviceClient = createServiceClient()

  // El cliente que da de alta un vendedor queda en su cartera. Se resuelve
  // desde su ficha y no del body: es lo que luego lo habilita a verlo via RLS.
  let vendedorId: string | null = null
  if (esVendedor) {
    const { data: ficha } = await serviceClient
      .from('vendedores')
      .select('id')
      .eq('profile_id', user.id)
      .eq('activo', true)
      .maybeSingle()
    if (!ficha) {
      return NextResponse.json(
        { error: 'Tu usuario no esta ligado a una ficha de vendedor activa. Pide a un super admin que la asigne.' },
        { status: 403 }
      )
    }
    vendedorId = ficha.id
  }

  const { data: newUser, error: authError } = await serviceClient.auth.admin.createUser({
    email: body.email,
    email_confirm: true,
    password: Math.random().toString(36).slice(-12) + 'Aa1!',
    user_metadata: { full_name: body.full_name, role: 'comprador' }
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  await serviceClient.from('profiles').update({
    full_name: body.full_name,
    marca_negocio: body.marca_negocio || null,
    phone: body.phone ? `+52${body.phone}` : null,
    tipo_consumidor: body.tipo,
    razon_social: body.requiere_factura ? body.razon_social || null : null,
    rfc: body.requiere_factura ? body.rfc || null : null,
    uso_cfdi: body.requiere_factura ? body.uso_cfdi || null : null,
    requiere_factura: body.requiere_factura,
    direccion_entrega: body.direccion_entrega || null,
    ciudad: body.ciudad || null,
    cp: body.cp || null,
    onboarding_completo: true,
    role: 'comprador',
    vendedor_id: vendedorId,
  }).eq('id', newUser.user.id)

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'cliente.crear', entidad: 'profiles', entidadId: newUser.user.id, detalle: { email: body.email, full_name: body.full_name, tipo: body.tipo, vendedor_id: vendedorId }, request })
  return NextResponse.json({ ok: true, id: newUser.user.id })
}

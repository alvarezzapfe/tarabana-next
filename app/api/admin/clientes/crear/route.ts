import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin', 'ventas'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const serviceClient = createServiceClient()

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
  }).eq('id', newUser.user.id)

  return NextResponse.json({ ok: true, id: newUser.user.id })
}

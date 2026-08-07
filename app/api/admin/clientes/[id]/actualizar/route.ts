import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(actor?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const service = createServiceClient()

  // Get current profile for audit diff and email comparison
  const { data: prev } = await service.from('profiles').select('email, full_name').eq('id', id).single()
  if (!prev) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Handle email change
  const newEmail = body.email?.trim()?.toLowerCase()
  const emailChanged = newEmail && newEmail !== prev.email?.toLowerCase()

  if (emailChanged) {
    // Validate format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'Formato de correo invalido' }, { status: 400 })
    }
    // Check for duplicates
    const { data: existing } = await service.from('profiles').select('id').eq('email', newEmail).neq('id', id).single()
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo.' }, { status: 409 })
    }
    // Update auth.users
    const { error: authError } = await service.auth.admin.updateUserById(id, { email: newEmail, email_confirm: true })
    if (authError) {
      return NextResponse.json({ error: `Error al actualizar correo: ${authError.message}` }, { status: 400 })
    }
  }

  // Build profile update
  const profileUpdate: Record<string, any> = {
    full_name: body.full_name || prev.full_name,
    tipo_persona_registro: body.tipo_persona_registro || null,
    nombre_pila: body.nombre_pila || null,
    apellido_paterno: body.apellido_paterno || null,
    apellido_materno: body.apellido_materno || null,
    razon_social: body.razon_social || null,
    marca_negocio: body.marca_negocio || null,
    contacto_nombre: body.contacto_nombre || null,
    phone: body.phone || null,
    tipo_consumidor: body.tipo_consumidor || null,
    // Address
    calle: body.calle || null, num_ext: body.num_ext || null, num_int: body.num_int || null,
    colonia: body.colonia || null, municipio: body.municipio || null, estado: body.estado || null,
    cp: body.cp || null, referencias: body.referencias || null,
    direccion_entrega: body.direccion_entrega || null, ciudad: body.ciudad || null,
    // Fiscal
    requiere_factura: body.requiere_factura ?? false,
    rfc: body.requiere_factura ? body.rfc || null : null,
    regimen_fiscal: body.requiere_factura ? body.regimen_fiscal || null : null,
    uso_cfdi: body.requiere_factura ? body.uso_cfdi || null : null,
    cp_fiscal: body.requiere_factura ? body.cp_fiscal || null : null,
  }
  if (emailChanged) profileUpdate.email = newEmail

  const { error } = await service.from('profiles').update(profileUpdate).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Audit
  const changes: Record<string, any> = {}
  if (emailChanged) changes.email = { from: prev.email, to: newEmail }
  if (body.full_name && body.full_name !== prev.full_name) changes.full_name = { from: prev.full_name, to: body.full_name }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: actor!.role,
    accion: emailChanged ? 'cliente.email' : 'cliente.editar',
    entidad: 'profiles', entidadId: id, detalle: changes, request,
  })

  return NextResponse.json({ ok: true })
}

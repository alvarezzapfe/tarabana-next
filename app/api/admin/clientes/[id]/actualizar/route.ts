import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { camposCliente, validarCliente } from '../../../../../../src/lib/cliente-campos'
import { logAction } from '../../../../../../src/lib/audit'

/**
 * Un throw inesperado tiene que salir como JSON.
 *
 * Sin esto, Next responde la pagina de error en HTML, el cliente no encuentra
 * `json.error` y en pantalla queda un mensaje genérico mientras el error real
 * vive solo en los logs. El stack se sigue imprimiendo completo.
 */
function fallaInesperada(e: unknown, donde: string) {
  console.error(`[${donde}]`, e)
  const detalle = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: `Error inesperado del servidor: ${detalle}` }, { status: 500 })
}

/**
 * Edita un cliente.
 *
 * Las columnas salen de `camposCliente`, el mismo mapeo que usa la ruta de
 * crear, para que las dos escriban lo mismo.
 *
 * `canWrite` y no `canWrite || isVendedor`: un vendedor levanta clientes pero
 * no los edita. Eso tambien es lo que impide que se pase un cliente a su
 * propia cartera cambiandole el `vendedor_id`.
 */
async function manejar(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(actor?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()

  const fallo = validarCliente(body, { alCrear: false })
  if (fallo) return NextResponse.json({ error: fallo.error }, { status: fallo.status })

  const service = createServiceClient()

  const { data: prev } = await service
    .from('profiles')
    .select('email, full_name, marca_negocio, giro, nivel_precio, vendedor_id')
    .eq('id', id)
    .single()
  if (!prev) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // ── Correo ────────────────────────────────────────────────
  //
  // Vive en auth.users y en profiles, asi que se cambia en los dos o en
  // ninguno. El formato ya lo valido `validarCliente`.
  const nuevoEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const cambioEmail = !!nuevoEmail && nuevoEmail !== prev.email?.toLowerCase()

  if (cambioEmail) {
    const { data: existente } = await service
      .from('profiles').select('id').eq('email', nuevoEmail).neq('id', id).maybeSingle()
    if (existente) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo.' }, { status: 409 })
    }
    const { error: authError } = await service.auth.admin.updateUserById(id, {
      email: nuevoEmail,
      email_confirm: true,
    })
    if (authError) {
      return NextResponse.json({ error: `Error al actualizar correo: ${authError.message}` }, { status: 400 })
    }
  }

  const campos = camposCliente(body, { comercial: true })
  if (cambioEmail) campos.email = nuevoEmail

  const { error } = await service.from('profiles').update(campos).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // ── Auditoria ─────────────────────────────────────────────
  //
  // Lo que cambio, no el cuerpo completo: un diff se lee, un volcado no.
  const cambios: Record<string, { from: unknown; to: unknown }> = {}
  if (cambioEmail) cambios.email = { from: prev.email, to: nuevoEmail }
  for (const campo of ['full_name', 'marca_negocio', 'giro', 'nivel_precio', 'vendedor_id'] as const) {
    const antes = prev[campo] ?? null
    const despues = campos[campo] ?? null
    if (campo in campos && antes !== despues) cambios[campo] = { from: antes, to: despues }
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: actor!.role,
    accion: cambioEmail ? 'cliente.email' : 'cliente.editar',
    entidad: 'profiles', entidadId: id, detalle: cambios, request,
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await manejar(request, ctx)
  } catch (e) {
    return fallaInesperada(e, 'clientes/actualizar')
  }
}

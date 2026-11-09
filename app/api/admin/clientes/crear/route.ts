import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { camposCliente, nombreCompletoDe, validarCliente } from '../../../../../src/lib/cliente-campos'
import { logAction } from '../../../../../src/lib/audit'

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
 * Da de alta un cliente.
 *
 * Las columnas que se escriben salen de `camposCliente`, el mismo mapeo que
 * usa la ruta de actualizar. Antes esta ruta tenia su propia lista de 14
 * columnas mientras la pagina posteaba 25, y la diferencia se perdia en
 * silencio: la direccion estructurada, el nivel de precio y las notas de un
 * cliente nuevo no llegaban a la base.
 */
async function manejar(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const esVendedor = isVendedor(profile?.role)
  if (!canWrite(profile?.role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()

  const fallo = validarCliente(body, { alCrear: true })
  if (fallo) return NextResponse.json({ error: fallo.error }, { status: fallo.status })

  const serviceClient = createServiceClient()
  const email = String(body.email).trim().toLowerCase()

  // Se avisa antes de intentar crear el usuario: el error de
  // `auth.admin.createUser` no distingue un correo repetido de otra falla, y
  // "ya existe un cliente con ese correo" es lo que hay que poder leer.
  const { data: repetido } = await serviceClient
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (repetido) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese correo.' }, { status: 409 })
  }

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

  const fullName = nombreCompletoDe(body)

  const { data: newUser, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password: Math.random().toString(36).slice(-12) + 'Aa1!',
    user_metadata: { full_name: fullName, role: 'comprador' },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const campos: Record<string, unknown> = {
    ...camposCliente(body, { comercial: !esVendedor }),
    onboarding_completo: true,
    role: 'comprador',
    // Un vendedor hereda su propia cartera; un admin puede elegir, y por eso
    // el valor del body solo se respeta cuando NO lo da de alta un vendedor.
    ...(esVendedor ? { vendedor_id: vendedorId } : {}),
  }

  const { error } = await serviceClient.from('profiles').update(campos).eq('id', newUser.user.id)
  if (error) {
    // El usuario de auth ya quedo creado; sin esto, el perfil se queda a
    // medias y el cliente aparece vacio en la lista.
    return NextResponse.json({ error: `Cliente creado sin datos: ${error.message}` }, { status: 400 })
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'cliente.crear', entidad: 'profiles', entidadId: newUser.user.id,
    detalle: {
      email,
      marca_negocio: campos.marca_negocio,
      giro: campos.giro,
      nivel_precio: campos.nivel_precio ?? null,
      vendedor_id: campos.vendedor_id ?? null,
    },
    request,
  })

  return NextResponse.json({ ok: true, id: newUser.user.id })
}

export async function POST(request: Request) {
  try {
    return await manejar(request)
  } catch (e) {
    return fallaInesperada(e, 'clientes/crear')
  }
}

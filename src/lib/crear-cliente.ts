/**
 * Alta de un cliente. Fuente unica de la regla de negocio.
 *
 * Estaba dentro de `app/api/admin/clientes/crear/route.ts`, que ahora es un
 * wrapper. La carga masiva llama a esto mismo en bucle, igual que la de
 * pedidos llama a `crearPedido`, para que no existan dos definiciones de
 * "como se da de alta un cliente" que puedan divergir.
 *
 * Lo que impone, en este orden:
 *
 *   1. Que el correo no exista ya, y decirlo con ese error y no con el de
 *      `auth.admin.createUser`, que no distingue un correo repetido de otra
 *      falla.
 *   2. Si quien crea es vendedor: su ficha manda y el cliente queda en su
 *      cartera. El `vendedor_id` del cuerpo se ignora, y las columnas
 *      comerciales (nivel de precio, credito, notas) no se escriben.
 *   3. Usuario de auth y perfil, o ninguno de los dos: si el perfil falla
 *      despues de crear el usuario, el usuario se borra. Sin eso queda un
 *      login sin ficha, que no aparece en la lista de clientes y ademas
 *      bloquea el correo para siempre.
 *
 * No manda correo de invitacion: eso es un paso aparte
 * (`/api/admin/clientes/[id]/invitar`), y la carga masiva no lo dispara.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { camposCliente, nombreCompletoDe, validarCliente, type CuerpoCliente } from './cliente-campos.ts'
import { logAction } from './audit.ts'

export type ContextoCliente = {
  userId: string
  userEmail: string
  role: string
  /** Quien crea es vendedor: hereda su cartera y no toca lo comercial. */
  esVendedor: boolean
  /**
   * La ficha de vendedor de quien crea. Obligatoria si `esVendedor`.
   *
   * Se resuelve una vez fuera y se pasa, para que un lote de 200 clientes no
   * la vuelva a consultar 200 veces.
   */
  vendedorId?: string | null
  /** Service client: `auth.admin.createUser` y el update del perfil. */
  service: SupabaseClient
  request?: Request
  /**
   * Escribe en `audit_log`. La carga masiva lo pone en false y registra UNA
   * entrada por archivo: 200 entradas identicas no son un rastro, son ruido.
   */
  auditar?: boolean
}

export type ResultadoCliente =
  | { ok: true; id: string; email: string }
  | { ok: false; error: string; status: number }

/** El correo como se guarda y como se compara: recortado y en minusculas. */
export const normalizarEmail = (v: unknown): string =>
  typeof v === 'string' ? v.trim().toLowerCase() : ''

export async function crearCliente(
  body: CuerpoCliente,
  ctx: ContextoCliente
): Promise<ResultadoCliente> {
  const fallo = validarCliente(body, { alCrear: true })
  if (fallo) return { ok: false, error: fallo.error, status: fallo.status }

  const email = normalizarEmail(body.email)
  const { service } = ctx

  const { data: repetido } = await service
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (repetido) {
    return { ok: false, error: 'Ya existe un usuario con ese correo.', status: 409 }
  }

  if (ctx.esVendedor && !ctx.vendedorId) {
    return {
      ok: false,
      error: 'Tu usuario no esta ligado a una ficha de vendedor activa. Pide a un super admin que la asigne.',
      status: 403,
    }
  }

  const fullName = nombreCompletoDe(body)

  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: Math.random().toString(36).slice(-12) + 'Aa1!',
    user_metadata: { full_name: fullName, role: 'comprador' },
  })
  if (authError || !newUser?.user) {
    return { ok: false, error: authError?.message || 'No se pudo crear el usuario.', status: 400 }
  }

  const campos: Record<string, unknown> = {
    ...camposCliente(body, { comercial: !ctx.esVendedor }),
    onboarding_completo: true,
    role: 'comprador',
    // Un vendedor hereda su propia cartera; un admin puede elegir, y por eso
    // el valor del body solo se respeta cuando NO lo da de alta un vendedor.
    ...(ctx.esVendedor ? { vendedor_id: ctx.vendedorId } : {}),
  }

  const { error } = await service.from('profiles').update(campos).eq('id', newUser.user.id)
  if (error) {
    // Todo o nada: el usuario de auth ya quedo creado, asi que se borra. Si
    // se dejara, el correo queda ocupado por una cuenta que no aparece en
    // ninguna pantalla y volver a intentar el alta falla con "ya existe".
    const { error: errorBorrado } = await service.auth.admin.deleteUser(newUser.user.id)
    const nota = errorBorrado
      ? ` Ademas no se pudo deshacer el usuario de auth (${errorBorrado.message}): avisa a un super admin.`
      : ''
    return { ok: false, error: `No se pudo guardar la ficha: ${error.message}.${nota}`, status: 400 }
  }

  if (ctx.auditar !== false) {
    logAction({
      actorId: ctx.userId, actorEmail: ctx.userEmail, actorRole: ctx.role,
      accion: 'cliente.crear', entidad: 'profiles', entidadId: newUser.user.id,
      detalle: {
        email,
        marca_negocio: campos.marca_negocio,
        giro: campos.giro,
        nivel_precio: campos.nivel_precio ?? null,
        vendedor_id: campos.vendedor_id ?? null,
      },
      request: ctx.request,
    })
  }

  return { ok: true, id: newUser.user.id, email }
}

/**
 * La ficha de vendedor activa de un usuario, o null.
 *
 * Es lo que despues lo habilita a ver a sus clientes via RLS, asi que se
 * resuelve de su propio perfil y nunca de lo que mande el cuerpo.
 */
export async function fichaVendedorDe(
  service: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await service
    .from('vendedores')
    .select('id')
    .eq('profile_id', userId)
    .eq('activo', true)
    .maybeSingle()
  return data?.id ?? null
}

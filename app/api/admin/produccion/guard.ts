import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canManageInventory, isStaffSinVentas } from '../../../../src/lib/roles'

/**
 * Guard comun de las rutas de Produccion.
 *
 * Las siete rutas del modulo repetian las mismas 6 lineas (getUser, leer el
 * rol, comparar, 401/403). Una sola funcion evita que una de ellas se quede
 * sin el chequeo cuando se agregue la octava.
 *
 * Devuelve `{ error }` listo para retornar, o el actor cuando pasa. El
 * service client se crea aqui para que ninguna ruta tenga que recordar que
 * los writes del modulo van con service_role: las policies dejan escribir a
 * can_manage_inventory(), pero el rol ya se valido aqui y asi los triggers y
 * las funciones reciben el actor explicito que auth.uid() no les daria.
 */

export type Actor = {
  id: string
  email: string
  role: string
  service: ReturnType<typeof createServiceClient>
}

type Resultado =
  | { ok: true; actor: Actor }
  | { ok: false; respuesta: NextResponse }

async function base(escritura: boolean): Promise<Resultado> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const permitido = escritura ? canManageInventory(profile?.role) : isStaffSinVentas(profile?.role)

  if (!permitido) {
    return { ok: false, respuesta: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) }
  }

  return {
    ok: true,
    actor: {
      id: user.id,
      email: user.email!,
      role: profile!.role,
      service: createServiceClient(),
    },
  }
}

/** Lectura: staff sin ventas. Contabilidad entra. */
export const guardLectura = () => base(false)

/** Escritura: super_admin, admin, produccion. Contabilidad NO. */
export const guardEscritura = () => base(true)

/**
 * Traduce un error de Postgres a algo que una persona pueda leer.
 *
 * Las funciones SQL del modulo levantan sus mensajes con `check_violation`,
 * que es intencional: son reglas de negocio, no fallas. Pasarlos tal cual es
 * mejor que un "Error 400" genérico — el mensaje ya dice que falta.
 */
export function mensajeDeError(error: { message: string; code?: string }): string {
  // Un unique violado en el modulo solo puede ser uno de dos, y los dos
  // merecen una explicacion y no el texto crudo del constraint.
  if (error.code === '23505') {
    if (error.message.includes('inventario_mov_lote_unico')) {
      return 'Este lote ya subió a inventario. No se puede liberar dos veces.'
    }
    if (error.message.includes('lotes_folio')) {
      return 'El folio ya existe. Vuelve a intentar.'
    }
    if (error.message.includes('tanques_nombre_key')) {
      return 'Ya existe un tanque con ese nombre.'
    }
  }
  return error.message
}

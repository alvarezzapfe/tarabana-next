import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canManageAsAdmin } from '../../../../src/lib/roles'

/**
 * Guard y validacion de tanques.
 *
 * Vive fuera de `route.ts` a proposito: un route file solo puede exportar
 * handlers HTTP y la config de segmento, asi que compartir helpers entre
 * `tanques/route.ts` y `tanques/[id]/route.ts` desde uno de los dos haria
 * fallar el type-check de Next.
 *
 * El predicado es `canManageAsAdmin`, NO el `canManageInventory` del resto
 * del modulo. Un tanque es una vasija fisica y darla de alta o de baja
 * cambia la capacidad instalada; produccion la ocupa con sus lotes, pero no
 * define el inventario de equipo.
 *
 * Es el mismo predicado que el item de Configuracion en el sidebar —para que
 * el link y la autorizacion digan lo mismo— y el mismo que la policy
 * `tanques_write` (can_manage_as_admin()).
 */

export const TIPOS = ['fermentador', 'madurador', 'brite'] as const

export type GuardTanques =
  | {
      ok: true
      id: string
      email: string
      role: string
      service: ReturnType<typeof createServiceClient>
    }
  | { ok: false; respuesta: NextResponse }

export async function guardTanques(): Promise<GuardTanques> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canManageAsAdmin(profile?.role)) {
    return { ok: false, respuesta: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) }
  }

  return {
    ok: true,
    id: user.id,
    email: user.email!,
    role: profile!.role,
    service: createServiceClient(),
  }
}

type Leido = { error: string } | { valores: Record<string, unknown> }

/**
 * Valida el cuerpo de un tanque.
 *
 * `parcial` es para PATCH: ahi solo se valida lo que viene, porque mandar
 * solo `activo: false` es legitimo. En POST los tres campos son
 * obligatorios.
 */
export function leerTanque(body: Record<string, unknown>, parcial = false): Leido {
  const out: Record<string, unknown> = {}

  if (body.nombre !== undefined || !parcial) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    if (!nombre) return { error: 'El nombre es obligatorio' }
    if (nombre.length > 40) return { error: 'El nombre no puede pasar de 40 caracteres' }
    out.nombre = nombre
  }

  if (body.tipo !== undefined || !parcial) {
    if (!(TIPOS as readonly unknown[]).includes(body.tipo)) {
      return { error: 'Tipo inválido' }
    }
    out.tipo = body.tipo
  }

  if (body.capacidad_litros !== undefined || !parcial) {
    const cap = typeof body.capacidad_litros === 'number'
      ? body.capacidad_litros
      : parseFloat(String(body.capacidad_litros))
    if (!Number.isFinite(cap) || cap <= 0) {
      return { error: 'La capacidad debe ser mayor que 0' }
    }
    out.capacidad_litros = cap
  }

  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return { error: 'activo debe ser booleano' }
    out.activo = body.activo
  }

  if (body.notas !== undefined) {
    out.notas = typeof body.notas === 'string' && body.notas.trim() ? body.notas.trim() : null
  }

  return { valores: out }
}

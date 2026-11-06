import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canEnterPanel, isSuperAdmin } from '../../../../../../src/lib/roles'

/**
 * Los eventos de `audit_log` de un pedido, para la pestana de Actividad.
 *
 * Va con el cliente DEL USUARIO y no con el service client a proposito: la
 * policy de `audit_log` deja leer solo a super_admin (ver
 * supabase/migrations/20260803000000_audit_log.sql), y saltarla con el
 * service client ampliaria quien puede ver el rastro de quien hizo que —
 * eso es una decision del dueno del proyecto, no de esta ruta. Asi, RLS
 * sigue siendo la autoridad: a quien no le toca le llegan cero filas.
 *
 * `puede` viaja aparte para que la UI sepa distinguir "no hay eventos" de
 * "no te toca verlos", que en pantalla no es lo mismo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canEnterPanel(profile?.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const columnas = 'id, accion, entidad, actor_email, actor_role, detalle, created_at'

  // Dos consultas y no un `or` con `detalle->>pedido_id`: lo de los pagos
  // queda dentro del jsonb, y un filtro compuesto sobre jsonb en PostgREST
  // es facil de escribir mal y dificil de notar. Esto son dos indices.
  const [propios, dePagos] = await Promise.all([
    supabase
      .from('audit_log')
      .select(columnas)
      .eq('entidad', 'pedidos')
      .eq('entidad_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('audit_log')
      .select(columnas)
      .eq('entidad', 'pagos')
      .eq('detalle->>pedido_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const eventos = [...(propios.data || []), ...(dePagos.data || [])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  return NextResponse.json({ puede: isSuperAdmin(profile?.role), eventos })
}

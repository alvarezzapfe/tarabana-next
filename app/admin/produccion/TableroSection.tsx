import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { canManageInventory } from '../../../src/lib/roles'
import TableroClient from './TableroClient'
import type { LoteFila, ProductoFila, TanqueFila } from './produccion-ui'

/**
 * Datos del Tablero.
 *
 * Trae TODOS los lotes vivos, no solo los no terminales: el KPI de merma
 * mira los liberados de los ultimos 90 dias, y calcularlo sobre una consulta
 * distinta de la que pinta el kanban dejaria que las dos se contradigan. El
 * cliente los parte.
 *
 * `lotes_vista` tiene security_invoker = on, asi que lo que llega ya viene
 * acotado por las policies de `lotes`: a ventas y al vendedor les llega
 * vacio aunque esta pantalla no se les ofrezca.
 *
 * Si esto crece a miles de lotes, el corte de 90 dias se mueve al servidor.
 * Con el volumen de una fabrica chica, una consulta es mas simple que dos y
 * no se pueden desincronizar.
 */
export default async function TableroSection({ role }: { role?: string }) {
  const supabase = await createServerSupabaseClient()

  const [{ data: lotes }, { data: tanques }, { data: productos }] = await Promise.all([
    supabase.from('lotes_vista').select('*').order('fecha_coccion', { ascending: false, nullsFirst: false }),
    supabase.from('tanques').select('id, nombre, tipo, capacidad_litros, activo, notas').order('nombre'),
    // Solo productos que se pueden cocinar: sin prefijo de folio el trigger
    // rechaza el insert, asi que ofrecerlos en el alta seria ofrecer un error.
    supabase
      .from('productos')
      .select('id, nombre, estilo, folio_prefijo')
      .not('folio_prefijo', 'is', null)
      .is('descontinuado_at', null)
      .order('nombre'),
  ])

  return (
    <TableroClient
      lotes={(lotes || []) as LoteFila[]}
      tanques={(tanques || []) as TanqueFila[]}
      productos={(productos || []) as ProductoFila[]}
      canEdit={canManageInventory(role)}
      // La fecha viene del servidor: llamar new Date() en render seria impuro
      // y daria un KPI distinto en el HTML del servidor y en la hidratacion.
      ahoraISO={new Date().toISOString()}
    />
  )
}

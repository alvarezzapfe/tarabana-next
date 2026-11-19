import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import HistoricoClient from './HistoricoClient'
import type { LoteFila } from './produccion-ui'

/**
 * Datos del Historico: todos los lotes vivos de la vista, de la coccion mas
 * reciente a la mas vieja.
 *
 * El filtrado es en el cliente a proposito: son filas pocas y ya cargadas, y
 * filtrar en el servidor obligaria a un viaje por cada cambio de filtro para
 * una tabla que cabe en memoria. Si esto crece a miles de lotes, los filtros
 * se mueven a `searchParams` y a la consulta.
 */
export default async function HistoricoSection() {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('lotes_vista')
    .select('*')
    .order('fecha_coccion', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  return <HistoricoClient lotes={(data || []) as LoteFila[]} />
}

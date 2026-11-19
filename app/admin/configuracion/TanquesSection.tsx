import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import TanquesClient from './TanquesClient'
import type { TanqueFila } from '../produccion/produccion-ui'

/**
 * Carga de la pestana Tanques de Configuracion.
 *
 * Trae tambien el conteo de lotes por tanque: el cliente necesita saber si
 * un tanque tiene historial para explicar por que no se puede borrar (hay
 * que desactivarlo) antes de que el usuario lo intente y reciba un 409.
 */
export default async function TanquesSection() {
  const supabase = await createServerSupabaseClient()

  const [{ data: tanques }, { data: lotes }] = await Promise.all([
    supabase.from('tanques').select('id, nombre, tipo, capacidad_litros, activo, notas').order('nombre'),
    // Solo el tanque y la etapa: alcanza para contar y para saber si hay un
    // lote vivo adentro.
    supabase.from('lotes_vista').select('tanque_id, etapa'),
  ])

  const usos: Record<string, { total: number; vivos: number }> = {}
  for (const l of lotes || []) {
    const id = (l as { tanque_id: string | null }).tanque_id
    if (!id) continue
    const etapa = (l as { etapa: string }).etapa
    usos[id] ||= { total: 0, vivos: 0 }
    usos[id].total += 1
    if (etapa !== 'liberado' && etapa !== 'descartado') usos[id].vivos += 1
  }

  return (
    <TanquesClient
      tanques={(tanques || []) as TanqueFila[]}
      usos={usos}
    />
  )
}

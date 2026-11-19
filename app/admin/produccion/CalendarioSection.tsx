import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { canManageInventory } from '../../../src/lib/roles'
import { hoyMx } from '../../../src/lib/fechas'
import { ventana } from '../../../src/lib/calendario-tanques'
import CalendarioClient from './CalendarioClient'
import type { LoteFila, OcupacionFila, TanqueFila } from './produccion-ui'

/**
 * Datos del calendario de ocupacion.
 *
 * ── La consulta filtra por TRASLAPE, no por fecha de coccion ──
 *
 * Un lager encubado hace 45 dias sigue ocupando su tanque hoy. Filtrar por
 * `desde >= ventana.desde` lo dejaria fuera justo del renglon que explica por
 * que ese tanque no esta libre. Lo que se pide es: tramos que toquen la
 * ventana, o sea los que empezaron antes y no han cerrado, mas los que
 * cerraron dentro.
 *
 * `hoy` viaja desde el servidor, como `ahoraISO` en TableroSection: llamar
 * `hoyMx()` en el cliente daria la fecha de la maquina de quien mira, y el
 * eje tiene que ser el mismo para todos.
 */
export default async function CalendarioSection({ role }: { role?: string }) {
  const supabase = await createServerSupabaseClient()
  const hoy = hoyMx()
  const v = ventana(hoy)

  const [{ data: tanques }, { data: ocupacion }, { data: lotes }] = await Promise.all([
    supabase.from('tanques').select('id, nombre, tipo, capacidad_litros, activo, notas').order('nombre'),
    supabase
      .from('tanque_ocupacion')
      .select('*')
      // Tramos abiertos (sigue ahi) O que cerraron dentro de la ventana.
      .or(`hasta.is.null,hasta.gte.${v.desde}`)
      .lte('desde', v.hasta)
      .order('desde'),
    // Los lotes completos, para que la ficha que se abre desde una barra
    // muestre OG/FG/merma de verdad y no un objeto a medias armado desde la
    // fila de ocupacion.
    supabase.from('lotes_vista').select('*'),
  ])

  return (
    <CalendarioClient
      tanques={(tanques || []) as TanqueFila[]}
      ocupacion={(ocupacion || []) as OcupacionFila[]}
      lotes={(lotes || []) as LoteFila[]}
      hoy={hoy}
      canEdit={canManageInventory(role)}
    />
  )
}

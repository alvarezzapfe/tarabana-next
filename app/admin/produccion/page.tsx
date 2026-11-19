import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import Tabs, { resolverTab } from '../Tabs'
import TableroSection from './TableroSection'
import TanquesSection from './TanquesSection'
import HistoricoSection from './HistoricoSection'

/**
 * Host de pestanas de Produccion.
 *
 * Mismo patron que Pedidos y Configuracion: `tabsParaRol` filtra por rol,
 * `resolverTab` elige la activa y cada Section carga SOLO lo suyo. El layout
 * del admin ya valido sesion, panel y AAL2, asi que aqui el gate es el de la
 * seccion: si el rol no tiene ninguna pestana, no entra.
 *
 * Antes esta pagina era una tabla suelta de `lotes` con su propio guard
 * `isStaffSinVentas`, y su boton "+ Nuevo lote" apuntaba a
 * /admin/produccion/nuevo, que no existia: un 404 en produccion.
 */

const DESCRIPCIONES: Record<string, string> = {
  tablero: 'Lotes en proceso por etapa',
  tanques: 'Ocupación de fermentadores y maduradores',
  historico: 'Lotes cerrados, merma y export',
}

export default async function ProduccionPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ role, acento }, params] = await Promise.all([contextoAdmin(), searchParams])
  const tabs = tabsParaRol('produccion', role)
  const activa = resolverTab(tabs, params.tab)

  if (!activa) return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>

  return (
    <>
      <Tabs
        titulo="Producción"
        descripcion={DESCRIPCIONES[activa]}
        tabs={tabs}
        activa={activa}
        basePath="/admin/produccion"
        acento={acento}
      />
      {activa === 'tablero' && <TableroSection acento={acento} role={role} />}
      {activa === 'tanques' && <TanquesSection acento={acento} />}
      {activa === 'historico' && <HistoricoSection acento={acento} />}
    </>
  )
}

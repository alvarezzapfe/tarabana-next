import Link from 'next/link'
import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import { canManageInventory } from '../../../src/lib/roles'
import Tabs, { resolverTab } from '../Tabs'
import Icono from './Icono'
import { ICONOS, botonPrimario } from './produccion-ui'
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
 *
 * El alta vive en el encabezado, alineada con el titulo, igual que el
 * "+ Nuevo pedido" de Pedidos. Es un Link y no un boton para que el modal
 * se abra desde la URL (`?nuevo=1`): asi la cabecera no necesita JS ni
 * conocer el estado del tablero, y el boton Atras cierra el modal — el mismo
 * criterio que `?lote=` para la ficha.
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
        // El acento TEMATICO, que sale de app_config.branding.color_primary.
        // Es el mismo que usan Pedidos, Clientes y las demas secciones; el
        // naranja fijo de `botonPrimario` es aparte, a proposito.
        acento={acento}
        acciones={
          activa === 'tablero' && canManageInventory(role) ? (
            <Link
              href="/admin/produccion?tab=tablero&nuevo=1"
              style={{
                ...botonPrimario(),
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icono d={ICONOS.mas} size={15} strokeWidth={2.2} />
              Nuevo lote
            </Link>
          ) : undefined
        }
      />
      {activa === 'tablero' && <TableroSection role={role} />}
      {activa === 'tanques' && <TanquesSection />}
      {activa === 'historico' && <HistoricoSection />}
    </>
  )
}

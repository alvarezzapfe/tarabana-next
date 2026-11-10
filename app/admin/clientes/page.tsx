import Link from 'next/link'
import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import { canManageAsAdmin } from '../../../src/lib/roles'
import Tabs, { resolverTab } from '../Tabs'
import ClientesClient from './ClientesClient'
import PuntosVentaSection from './PuntosVentaSection'

export default async function ClientesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ role, acento }, params] = await Promise.all([contextoAdmin(), searchParams])
  const tabs = tabsParaRol('clientes', role)
  const activa = resolverTab(tabs, params.tab)

  if (!activa) return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>

  const esPuntos = activa === 'puntos-venta'

  return (
    <>
      <Tabs
        titulo="Clientes"
        tabs={tabs}
        activa={activa}
        basePath="/admin/clientes"
        acento={acento}
        // El alta de un punto de venta es de admin: las rutas que escriben
        // puntos de venta piden `canManageAsAdmin`, asi que sin este candado
        // ventas y produccion veian un boton que lleva a una pantalla donde
        // no pueden guardar.
        acciones={esPuntos && canManageAsAdmin(role) ? (
          <Link
            href="/admin/puntos-venta/nuevo"
            style={{ background: acento, color: '#fff', padding: '9px 18px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
          >
            + Nuevo punto de venta
          </Link>
        ) : undefined}
      />
      {esPuntos ? <PuntosVentaSection /> : <ClientesClient />}
    </>
  )
}

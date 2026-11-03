import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import Tabs, { resolverTab } from '../Tabs'
import VendedoresSection from './VendedoresSection'
import ComisionesSection from './ComisionesSection'

export default async function ComercialPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ role, acento }, params] = await Promise.all([contextoAdmin(), searchParams])
  const tabs = tabsParaRol('comercial', role)
  const activa = resolverTab(tabs, params.tab)

  if (!activa) return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>

  return (
    <>
      <Tabs
        titulo="Comercial"
        tabs={tabs}
        activa={activa}
        basePath="/admin/comercial"
        acento={acento}
      />
      {activa === 'comisiones' ? <ComisionesSection /> : <VendedoresSection />}
    </>
  )
}

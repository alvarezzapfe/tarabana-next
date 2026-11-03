import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import Tabs, { resolverTab } from '../Tabs'
import ReportesSection from './ReportesSection'
import ContabilidadSection from './ContabilidadSection'

export default async function FinanzasPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ role, acento }, params] = await Promise.all([contextoAdmin(), searchParams])
  const tabs = tabsParaRol('finanzas', role)
  const activa = resolverTab(tabs, params.tab)

  if (!activa) return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>

  const esContabilidad = activa === 'contabilidad'

  return (
    <>
      <Tabs
        titulo="Finanzas"
        descripcion={esContabilidad ? 'Vista de solo lectura' : undefined}
        tabs={tabs}
        activa={activa}
        basePath="/admin/finanzas"
        acento={acento}
      />
      {esContabilidad ? <ContabilidadSection /> : <ReportesSection />}
    </>
  )
}

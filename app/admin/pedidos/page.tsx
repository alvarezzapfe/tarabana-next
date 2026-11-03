import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import Tabs, { resolverTab } from '../Tabs'
import TodosSection from './TodosSection'
import CobranzaClient from './CobranzaClient'

export default async function PedidosPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ role, acento }, params] = await Promise.all([contextoAdmin(), searchParams])
  const tabs = tabsParaRol('pedidos', role)
  const activa = resolverTab(tabs, params.tab)

  if (!activa) return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>

  return (
    <>
      <Tabs
        titulo="Pedidos"
        tabs={tabs}
        activa={activa}
        basePath="/admin/pedidos"
        acento={acento}
      />
      {activa === 'por-cobrar' ? <CobranzaClient /> : <TodosSection />}
    </>
  )
}

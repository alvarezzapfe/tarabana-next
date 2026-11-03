import { contextoAdmin, type SearchParams } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import Tabs, { resolverTab } from '../Tabs'
import MarcaClient from './MarcaClient'
import NegocioClient from './NegocioClient'
import TaproomSection from './TaproomSection'
import MedalleroSection from './MedalleroSection'
import ActividadClient from './ActividadClient'

const DESCRIPCIONES: Record<string, string> = {
  marca: 'Acento del panel',
  negocio: 'Condiciones de pago, alertas y moneda',
  taproom: 'Horarios y datos del taproom',
  medallero: 'Reconocimientos y competencias',
  actividad: 'Bitácora de acciones del equipo',
}

export default async function ConfiguracionPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ role, acento }, params] = await Promise.all([contextoAdmin(), searchParams])
  const tabs = tabsParaRol('configuracion', role)
  const activa = resolverTab(tabs, params.tab)

  if (!activa) return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>

  return (
    <>
      <Tabs
        titulo="Configuración"
        descripcion={DESCRIPCIONES[activa]}
        tabs={tabs}
        activa={activa}
        basePath="/admin/configuracion"
        acento={acento}
      />
      {activa === 'marca' && <MarcaClient />}
      {activa === 'negocio' && <NegocioClient />}
      {activa === 'taproom' && <TaproomSection />}
      {activa === 'medallero' && <MedalleroSection />}
      {activa === 'actividad' && <ActividadClient />}
    </>
  )
}

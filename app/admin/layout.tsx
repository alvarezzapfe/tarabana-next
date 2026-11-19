import { createServerSupabaseClient, createServiceClient } from '../../src/lib/supabase-server'
import { redirect } from 'next/navigation'
import { canEnterPanel } from '../../src/lib/roles'
import { navParaRol } from '../../src/lib/admin-nav'
import { contrastaConChrome, esHex6 } from '../../src/lib/contraste'
import Sidebar from './Sidebar'
import { ALTO_BARRA_MOVIL, MOVIL_MAX } from './dash-ui'
import CommandPalette from './CommandPalette'

/**
 * Acento por defecto del chrome. app_config.branding.color_primary lo puede
 * sobrescribir, pero solo si contrasta contra el fondo oscuro: un acento que
 * no se lee deja el item activo sin senal visible.
 */
const ACENTO_DEFAULT = '#D95F2E'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name, last_seen_at').eq('id', user.id).single()

  // El vendedor tambien entra, pero RLS lo acota a sus pedidos y sus clientes.
  if (!profile || !canEnterPanel(profile.role))
    redirect('/portal')

  // Fire-and-forget: update last_seen_at if >5 min since last
  const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0
  if (Date.now() - lastSeen > 5 * 60 * 1000) {
    const svc = createServiceClient()
    svc.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id).then(() => {})
  }

  // Gate AAL2: roles internos requieren 2FA verificado
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    redirect('/tierra-mojada/verificar')
  }

  // Las dos cuentas de produccion son `head: true` contra `lotes_vista`, que
  // ya trae `alerta_nivel` calculado. Por eso las reglas viven en la vista:
  // asi esto es un count y no cargar todos los lotes en CADA pagina del
  // panel. La vista es security_invoker, asi que a ventas y al vendedor les
  // da 0 sin necesidad de un guard aqui.
  const [
    { data: brandingRow }, { count: pendientes }, { count: vencidos },
    { count: alertas }, { count: alertasRojas },
  ] = await Promise.all([
    supabase.from('app_config').select('value').eq('key', 'branding').single(),
    supabase.from('pedidos_saldo').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
    supabase.from('pedidos_saldo').select('id', { count: 'exact', head: true }).eq('estado_cobro', 'vencido'),
    supabase.from('lotes_vista').select('id', { count: 'exact', head: true }).neq('alerta_nivel', 'ninguna'),
    supabase.from('lotes_vista').select('id', { count: 'exact', head: true }).eq('alerta_nivel', 'rojo'),
  ])

  const colorPrimary = brandingRow?.value?.color_primary
  const acento = esHex6(colorPrimary) && contrastaConChrome(colorPrimary) ? colorPrimary : ACENTO_DEFAULT

  const items = navParaRol(profile.role)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0 }}>
      <style>{`
        :root {
          --brand-primary: ${acento};
          --admin-sidebar-w: 240px;
          /*
           * El padding de <main>, como variables y no como literales.
           *
           * /admin/reporte las necesita para sangrar su "hoja" a todo lo
           * ancho: antes cancelaba el padding con un \`margin: -36px -44px\`
           * que repetia los numeros a mano, asi que cambiar el padding aqui
           * descuadraba ese fondo en silencio. Con variables, los dos lados
           * se mueven juntos.
           */
          --admin-pad-x: 44px;
          --admin-pad-y: 36px;
          --admin-barra-h: 0px;
        }
        body { background: #fafafa !important; }
        .btn-primary { background: var(--brand-primary); }

        /*
         * "screen and" es obligatorio, no cosmetico: el viewport de impresion
         * de una carta con margenes de 12 mm mide ~725 px, asi que un
         * max-width suelto tambien aplicaria AL IMPRIMIR, y una clase
         * !important le ganaria al "main { padding: 0 !important }" del
         * @media print de reporte-ui.ts. Cada reporte impreso saldria con
         * padding de mas.
         */
        @media screen and (max-width: ${MOVIL_MAX}px) {
          :root {
            --admin-pad-x: 16px;
            --admin-pad-y: 16px;
            --admin-barra-h: ${ALTO_BARRA_MOVIL}px;
          }

          /*
           * El margen y el padding de <main> son estilos INLINE, y solo un
           * !important los pisa. Es el mismo mecanismo que ya usa el
           * @media print de reporte-ui.ts para sacarle el margen al main.
           */
          .admin-main {
            margin-left: 0 !important;
            padding-top: calc(var(--admin-barra-h) + var(--admin-pad-y)) !important;
          }
        }
      `}</style>

      <Sidebar
        items={items}
        usuario={{ nombre: profile.full_name || user.email || '', role: profile.role }}
        badges={{
          pedidosPendientes: pendientes || 0,
          saldosVencidos: (vencidos || 0) > 0,
          alertasProduccion: alertas || 0,
          alertasProduccionRojas: (alertasRojas || 0) > 0,
        }}
        acento={acento}
      />
      <CommandPalette items={items} acento={acento} />

      <main
        className="admin-main"
        style={{
          flex: 1,
          marginLeft: 'var(--admin-sidebar-w, 240px)',
          padding: 'var(--admin-pad-y) var(--admin-pad-x)',
          background: '#fafafa',
          minHeight: '100vh',
          transition: 'margin-left 160ms ease',
        }}
      >
        {children}
      </main>
    </div>
  )
}

import { createServerSupabaseClient, createServiceClient } from '../../src/lib/supabase-server'
import { redirect } from 'next/navigation'
import { isStaff } from '../../src/lib/roles'
import { navParaRol } from '../../src/lib/admin-nav'
import { contrastaConChrome, esHex6 } from '../../src/lib/contraste'
import Sidebar from './Sidebar'
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

  if (!profile || !isStaff(profile.role))
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

  const [{ data: brandingRow }, { count: pendientes }, { count: vencidos }] = await Promise.all([
    supabase.from('app_config').select('value').eq('key', 'branding').single(),
    supabase.from('pedidos_saldo').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
    supabase.from('pedidos_saldo').select('id', { count: 'exact', head: true }).eq('estado_cobro', 'vencido'),
  ])

  const colorPrimary = brandingRow?.value?.color_primary
  const acento = esHex6(colorPrimary) && contrastaConChrome(colorPrimary) ? colorPrimary : ACENTO_DEFAULT

  const items = navParaRol(profile.role)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0 }}>
      <style>{`
        :root { --brand-primary: ${acento}; --admin-sidebar-w: 240px; }
        body { background: #fafafa !important; }
        .btn-primary { background: var(--brand-primary); }
      `}</style>

      <Sidebar
        items={items}
        usuario={{ nombre: profile.full_name || user.email || '', role: profile.role }}
        badges={{ pedidosPendientes: pendientes || 0, saldosVencidos: (vencidos || 0) > 0 }}
        acento={acento}
      />
      <CommandPalette items={items} acento={acento} />

      <main
        style={{
          flex: 1,
          marginLeft: 'var(--admin-sidebar-w, 240px)',
          padding: '36px 44px',
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

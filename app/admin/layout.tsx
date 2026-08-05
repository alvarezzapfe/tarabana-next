import { createServerSupabaseClient, createServiceClient } from '../../src/lib/supabase-server'
import { redirect } from 'next/navigation'
import { isStaff, isSuperAdmin } from '../../src/lib/roles'

type NavItem = { href: string; label: string; icon: string; superOnly?: boolean }
type NavGroup = { heading: string; items: NavItem[]; superOnly?: boolean }

const navGroups: NavGroup[] = [
  { heading: 'Operacion', items: [
    { href: '/admin', label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
    { href: '/admin/pedidos', label: 'Pedidos', icon: 'M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
    { href: '/admin/cobranza', label: 'Cobranza', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: '/admin/clientes', label: 'Clientes', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
  ]},
  { heading: 'Producto', items: [
    { href: '/admin/inventario', label: 'Inventario', icon: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01' },
    { href: '/admin/produccion', label: 'Produccion', icon: 'M3 3h18v18H3z M3 9h18 M9 21V9' },
    { href: '/admin/taproom', label: 'Taproom', icon: 'M17 11h1a3 3 0 010 6h-1 M9 12v6 M13 12v6 M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5 M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L19 8' },
    { href: '/admin/medallero', label: 'Medallero', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2' },
  ]},
  { heading: 'Comercial', items: [
    { href: '/admin/vendedores', label: 'Vendedores', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { href: '/admin/comisiones', label: 'Comisiones', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: '/admin/puntos-venta', label: 'Puntos de venta', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 7a3 3 0 100 6 3 3 0 000-6z' },
  ]},
  { heading: 'Analisis', items: [
    { href: '/admin/reportes', label: 'Reportes', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { href: '/admin/contabilidad', label: 'Contabilidad', icon: 'M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5' },
  ]},
  { heading: 'Sistema', superOnly: true, items: [
    { href: '/admin/usuarios', label: 'Usuarios', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8' },
    { href: '/admin/actividad', label: 'Actividad', icon: 'M12 20V10M18 20V4M6 20v-4', superOnly: true },
    { href: '/admin/configuracion', label: 'Configuracion', icon: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 15a3 3 0 100-6 3 3 0 000 6z', superOnly: true },
  ]},
]

const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Administrador',
  ventas: 'Ventas', produccion: 'Producción', contabilidad: 'Contabilidad',
}

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

  // Read branding config
  const { data: brandingRow } = await supabase.from('app_config').select('value').eq('key', 'branding').single()
  const branding = brandingRow?.value || {}
  const brandPrimary = branding.color_primary || '#E8531D'
  const sidebarBg = branding.sidebar_bg || '#EAF3DE'
  const sidebarText = branding.sidebar_text || '#27500A'

  const superAdmin = isSuperAdmin(profile.role)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0 }}>
      <style>{`
        :root { --brand-primary: ${brandPrimary}; --sidebar-bg: ${sidebarBg}; --sidebar-text: ${sidebarText}; }
        .nav-link { display:flex; align-items:center; gap:10px; color:var(--sidebar-text); text-decoration:none; padding:9px 12px; border-radius:8px; font-size:14px; font-weight:450; transition:all 0.15s; }
        .nav-link:hover { background:rgba(0,0,0,0.06) !important; }
        body { background: #fafafa !important; }
        .btn-primary { background: var(--brand-primary); }
      `}</style>
      <aside style={{
        width: 240, background: 'var(--sidebar-bg)', borderRight: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column', padding: '20px 12px',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50
      }}>
        <div style={{ padding: '0 10px', marginBottom: 26, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <img src="/logo-negro.png" alt="Tarabaña" style={{ height: 40, objectFit: 'contain' }} />
            <span style={{ color: 'var(--sidebar-text)', fontSize: 15, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>Tarabaña</span>
          </div>
          <p style={{ margin: 0, color: 'var(--sidebar-text)', fontSize: 11, opacity: 0.45, letterSpacing: '0.04em' }}>Panel interno</p>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
          {navGroups.map(group => {
            if (group.superOnly && !superAdmin) return null
            return (
              <div key={group.heading} style={{ marginBottom: 6 }}>
                <p style={{ color: 'var(--sidebar-text)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 12px 4px', margin: 0, opacity: 0.4 }}>
                  {group.heading}
                </p>
                {group.items.map(item => {
                  if (item.superOnly && !superAdmin) return null
                  return (
                    <a key={item.href} href={item.href} className="nav-link">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.icon} />
                      </svg>
                      {item.label}
                    </a>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
          <p style={{ color: 'var(--sidebar-text)', fontSize: 13, fontWeight: 500, marginBottom: 2, padding: '0 12px' }}>{profile.full_name || user.email}</p>
          <p style={{ color: 'var(--sidebar-text)', fontSize: 11, marginBottom: 14, padding: '0 12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, opacity: 0.7 }}>
            {roleLabel[profile.role] || profile.role}
          </p>
          <a href="/api/auth/logout" className="nav-link" style={{ opacity: 0.6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Cerrar sesion
          </a>
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: 240, padding: '36px 44px', background: '#fafafa', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}

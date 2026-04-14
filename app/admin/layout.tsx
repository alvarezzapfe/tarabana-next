import { createServerSupabaseClient } from '../../src/lib/supabase-server'
import { redirect } from 'next/navigation'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/admin/clientes', label: 'Clientes', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
  { href: '/admin/pedidos', label: 'Pedidos', icon: 'M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { href: '/admin/inventario', label: 'Inventario', icon: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01' },
  { href: '/admin/produccion', label: 'Producción', icon: 'M3 3h18v18H3z M3 9h18 M9 21V9' },
  { href: '/admin/contabilidad', label: 'Contabilidad', icon: 'M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5' },
  { href: '/admin/reportes', label: 'Reportes', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/admin/taproom', label: 'Taproom', icon: 'M17 11h1a3 3 0 010 6h-1 M9 12v6 M13 12v6 M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5 M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L19 8' },
  { href: '/admin/medallero', label: 'Medallero', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2' },
  { href: '/admin/usuarios', label: 'Usuarios internos', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8' },
]

const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Administrador',
  ventas: 'Ventas', produccion: 'Producción', contabilidad: 'Contabilidad',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()

  if (!profile || !['super_admin','admin','ventas','produccion','contabilidad'].includes(profile.role))
    redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
      <style>{`
        .nav-link { display:flex; align-items:center; gap:10px; color:#666; text-decoration:none; padding:8px 10px; border-radius:7px; font-size:13.5px; font-weight:450; transition:all 0.15s; }
        .nav-link:hover { background:#1a1a1a !important; color:#e0e0e0 !important; }
        body { background: #0a0a0a !important; }
      `}</style>
      <aside style={{
        width: 230, background: '#0f0f0f', borderRight: '1px solid #1a1a1a',
        display: 'flex', flexDirection: 'column', padding: '20px 12px',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50
      }}>
        <div style={{ padding: '0 8px', marginBottom: 28 }}>
          <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 32, objectFit: 'contain', objectPosition: 'left' }} />
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {navItems.map(item => (
            <a key={item.href} href={item.href} className="nav-link">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
          <p style={{ color: '#444', fontSize: 11.5, marginBottom: 2, padding: '0 10px' }}>{profile.full_name || user.email}</p>
          <p style={{ color: '#E8531D', fontSize: 10.5, marginBottom: 14, padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            {roleLabel[profile.role] || profile.role}
          </p>
          <a href="/api/auth/logout" className="nav-link" style={{ color: '#444' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Cerrar sesión
          </a>
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: 230, padding: '36px 40px', background: '#0a0a0a', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}

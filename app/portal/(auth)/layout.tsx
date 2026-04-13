import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { redirect } from 'next/navigation'

const navItems = [
  { href: '/portal/catalogo', label: 'Compra', icon: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0' },
  { href: '/portal/pedidos', label: 'Mis pedidos', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/portal/puntos', label: 'Mis puntos', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { href: '/portal/cuenta', label: 'Mi cuenta', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8' },
]

export default async function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/portal')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        .portal-nav { display:flex; align-items:center; gap:8px; color:#888; text-decoration:none; padding:9px 12px; border-radius:8px; font-size:13.5px; transition:all 0.15s; }
        .portal-nav:hover { background:#f5f5f5; color:#111; }
      `}</style>
      <aside style={{
        width: 240, background: '#fff', borderRight: '1px solid #ebebeb',
        display: 'flex', flexDirection: 'column', padding: '24px 14px',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50
      }}>
        <a href="/portal/catalogo" style={{ display: 'block', marginBottom: 32, padding: '0 8px' }}>
          <img src="/tarabana_logo_negro.jpg" alt="Tarabana" style={{ height: 44, objectFit: 'contain' }} />
        </a>
        <div style={{ padding: '12px 12px', background: '#fdf8f5', borderRadius: 10, marginBottom: 24, border: '1px solid #f0e8e0' }}>
          <p style={{ margin: 0, color: '#888', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hola,</p>
          <p style={{ margin: '2px 0 0', color: '#111', fontSize: 14, fontWeight: 600 }}>{profile.full_name?.split(' ')[0] || user.email?.split('@')[0]}</p>
          <p style={{ margin: '4px 0 0', color: '#E8531D', fontSize: 11, fontWeight: 600 }}>{profile.puntos || 0} pts</p>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => (
            <a key={item.href} href={item.href} className="portal-nav">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #ebebeb', paddingTop: 16 }}>
          <a href="/api/auth/logout" className="portal-nav" style={{ color: '#ccc' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Cerrar sesion
          </a>
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: 240, background: '#fafafa', minHeight: '100vh' }}>{children}</main>
    </div>
  )
}

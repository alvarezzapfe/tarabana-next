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
        .portal-nav { display:flex; align-items:center; gap:10px; color:#8899B0; text-decoration:none; padding:11px 14px; border-radius:8px; font-size:15px; transition:all 0.15s; position:relative; }
        .portal-nav:hover { background:rgba(77,163,255,0.08); color:#CBD5E1; }
        .portal-nav-active { background:rgba(77,163,255,0.10); color:#fff !important; }
        .portal-nav-active::before { content:''; position:absolute; left:0; top:6px; bottom:6px; width:3px; border-radius:0 3px 3px 0; background:#4DA3FF; }
      `}</style>
      <aside style={{
        width: 250, background: '#0A1628',
        display: 'flex', flexDirection: 'column', padding: '28px 16px',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50
      }}>
        <a href="/portal/catalogo" style={{ display: 'block', marginBottom: 36, padding: '0 10px' }}>
          <img src="/logo-blanco.png" alt="Tarabaña" style={{ height: 60, objectFit: 'contain' }} />
        </a>
        <div style={{ padding: '14px 16px', background: 'rgba(77,163,255,0.08)', borderRadius: 10, marginBottom: 28, border: '1px solid rgba(77,163,255,0.12)' }}>
          <p style={{ margin: 0, color: '#6B7F99', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hola,</p>
          <p style={{ margin: '3px 0 0', color: '#E2E8F0', fontSize: 15, fontWeight: 600 }}>{profile.full_name?.split(' ')[0] || user.email?.split('@')[0]}</p>
          <p style={{ margin: '5px 0 0', color: '#4DA3FF', fontSize: 12, fontWeight: 600 }}>{profile.puntos || 0} pts</p>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {navItems.map(item => (
            <a key={item.href} href={item.href} className="portal-nav">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
          <a href="/api/auth/logout" className="portal-nav" style={{ color: '#4B5C73', fontSize: 13.5 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Cerrar sesión
          </a>
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: 250, background: '#fafafa', minHeight: '100vh' }}>{children}</main>
    </div>
  )
}

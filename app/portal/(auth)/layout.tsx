import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { redirect } from 'next/navigation'

const navItems = [
  { href: '/portal/catalogo', label: 'Compra', shortLabel: 'Compra', icon: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0' },
  { href: '/portal/pedidos', label: 'Mis pedidos', shortLabel: 'Pedidos', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/portal/puntos', label: 'Mis puntos', shortLabel: 'Puntos', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { href: '/portal/cuenta', label: 'Mi cuenta', shortLabel: 'Cuenta', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8' },
]

export default async function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/portal')

  const firstName = profile.full_name?.split(' ')[0] || user.email?.split('@')[0]
  const puntos = profile.puntos || 0

  return (
    <div className="portal-root">
      <style>{`
        /* ── Focus states ── */
        *:focus-visible { outline: 2px solid #4DA3FF; outline-offset: 2px; }
        button:disabled, a[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed !important; }

        /* ── Toast ── */
        .toast { position:fixed; top:20px; right:20px; background:#10b981; color:#fff; padding:12px 20px; border-radius:10px; font-size:14px; font-weight:600; z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,0.12); animation:toastIn 0.3s ease; }
        @keyframes toastIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }

        /* ── Desktop sidebar ── */
        .portal-sidebar { width:250px; background:#0A1628; display:flex; flex-direction:column; padding:28px 16px; position:fixed; top:0; left:0; height:100vh; z-index:50; }
        .portal-nav { display:flex; align-items:center; gap:10px; color:#8899B0; text-decoration:none; padding:11px 14px; border-radius:8px; font-size:15px; transition:all 0.15s; position:relative; }
        .portal-nav:hover { background:rgba(77,163,255,0.08); color:#CBD5E1; }
        .portal-main { flex:1; margin-left:250px; background:#fafafa; min-height:100vh; }

        /* ── Mobile header ── */
        .portal-mobile-header { display:none; }

        /* ── Mobile bottom nav ── */
        .portal-bottom-nav { display:none; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .portal-sidebar { display:none; }
          .portal-main { margin-left:0 !important; padding-bottom:80px; }

          .portal-mobile-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:12px 20px; background:#0A1628; position:sticky; top:0; z-index:40;
          }

          .portal-bottom-nav {
            display:flex; position:fixed; bottom:0; left:0; right:0; height:64px;
            background:#0A1628; border-top:1px solid rgba(255,255,255,0.06);
            z-index:50; align-items:center; justify-content:space-around;
          }
          .portal-bottom-nav a {
            display:flex; flex-direction:column; align-items:center; gap:3px;
            color:#6B7F99; text-decoration:none; font-size:10px; font-weight:500;
            padding:6px 12px; border-radius:8px; transition:all 0.15s;
          }
          .portal-bottom-nav a:hover, .portal-bottom-nav a.active { color:#4DA3FF; }

          /* Portal page padding */
          .portal-page { padding-left:20px !important; padding-right:20px !important; }

          /* Grids */
          .portal-products-grid { grid-template-columns:1fr !important; }
          .portal-kpi-grid { grid-template-columns:1fr !important; }
          .portal-profile-grid { grid-template-columns:1fr !important; }

          /* Cart as bottom sheet */
          .portal-cart { width:100% !important; border-left:none !important; border-top:1px solid #e5e7eb; top:auto !important; bottom:0; max-height:80vh; border-radius:16px 16px 0 0; }

          /* Timeline vertical on mobile */
          .portal-timeline { flex-direction:column !important; gap:8px !important; }
          .portal-timeline-bar { display:none; }
          .portal-timeline-labels { flex-direction:column !important; gap:4px !important; }
        }

        @media (min-width: 481px) and (max-width: 768px) {
          .portal-products-grid { grid-template-columns:repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* Mobile header */}
      <div className="portal-mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo-blanco.png" alt="Tarabaña" style={{ height: 32, objectFit: 'contain' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 600 }}>{firstName}</span>
          <span style={{ color: '#4DA3FF', fontSize: 11, fontWeight: 600 }}>{puntos} pts</span>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="portal-sidebar">
        <a href="/portal/catalogo" style={{ display: 'block', marginBottom: 36, padding: '0 10px' }}>
          <img src="/logo-blanco.png" alt="Tarabaña" style={{ height: 60, objectFit: 'contain' }} />
        </a>
        <div style={{ padding: '14px 16px', background: 'rgba(77,163,255,0.08)', borderRadius: 10, marginBottom: 28, border: '1px solid rgba(77,163,255,0.12)' }}>
          <p style={{ margin: 0, color: '#6B7F99', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hola,</p>
          <p style={{ margin: '3px 0 0', color: '#E2E8F0', fontSize: 15, fontWeight: 600 }}>{firstName}</p>
          <p style={{ margin: '5px 0 0', color: '#4DA3FF', fontSize: 12, fontWeight: 600 }}>{puntos} pts</p>
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

      {/* Main content */}
      <main className="portal-main">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="portal-bottom-nav">
        {navItems.map(item => (
          <a key={item.href} href={item.href}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            {item.shortLabel}
          </a>
        ))}
      </nav>
    </div>
  )
}

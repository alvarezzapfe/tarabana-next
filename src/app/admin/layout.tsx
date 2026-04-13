import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const allowedRoles = ['super_admin', 'ventas', 'produccion', 'taproom']
  if (!profile || !allowedRoles.includes(profile.role)) redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: '#111', borderRight: '1px solid #1e1e1e',
        display: 'flex', flexDirection: 'column', padding: '24px 16px'
      }}>
        <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 36, marginBottom: 32, objectFit: 'contain', objectPosition: 'left' }} />
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { href: '/admin', label: '📊 Dashboard' },
            { href: '/admin/usuarios', label: '👥 Usuarios' },
            { href: '/admin/productos', label: '🍺 Productos' },
            { href: '/admin/produccion', label: '🏭 Producción' },
            { href: '/admin/pedidos', label: '📦 Pedidos' },
          ].map(item => (
            <a key={item.href} href={item.href} style={{
              color: '#aaa', textDecoration: 'none', padding: '9px 12px',
              borderRadius: 8, fontSize: 14, transition: 'all 0.15s'
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#1e1e1e')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >{item.label}</a>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 16 }}>
          <p style={{ color: '#555', fontSize: 12, marginBottom: 4 }}>{profile.full_name || user.email}</p>
          <p style={{ color: '#E8531D', fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{profile.role.replace('_', ' ')}</p>
          <a href="/api/auth/logout" style={{
            color: '#555', fontSize: 13, textDecoration: 'none'
          }}>Cerrar sesión →</a>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, overflowY: 'auto' }}>{children}</main>
    </div>
  )
}

import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient()
  const [{ count: usuarios }, { count: productos }, { count: pedidos }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('productos').select('*', { count: 'exact', head: true }),
    supabase.from('pedidos').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'Usuarios', value: usuarios || 0, color: '#E8531D' },
    { label: 'Productos', value: productos || 0, color: '#f59e0b' },
    { label: 'Pedidos', value: pedidos || 0, color: '#10b981' },
  ]

  return (
    <div>
      <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
      <p style={{ color: '#555', marginBottom: 32 }}>Bienvenido al panel de Tarabaña</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: '#141414', border: '1px solid #1e1e1e',
            borderRadius: 12, padding: '24px 20px'
          }}>
            <p style={{ color: '#555', fontSize: 13, marginBottom: 8 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 36, fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

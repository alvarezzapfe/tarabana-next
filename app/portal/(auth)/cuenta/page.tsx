import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'

const tipoLabel: Record<string, string> = {
  ocasional: '🏠 Consumidor ocasional',
  tiene_tap: '🍺 Tap Room',
  tiene_bar: '🍻 Bar',
  restaurante: '🍽️ Restaurante',
}

export default async function CuentaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  return (
    <div style={{ padding: '40px 48px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', marginBottom: 6 }}>Mi cuenta</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 32 }}>Tus datos y preferencias</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { label: 'Nombre', value: profile?.full_name || '—' },
          { label: 'Email', value: user?.email || '—' },
          { label: 'Teléfono', value: profile?.phone || '—' },
          { label: 'Tipo de cliente', value: tipoLabel[profile?.tipo_consumidor] || '—' },
          { label: 'RFC', value: profile?.rfc || 'No registrado' },
          { label: 'Requiere factura', value: profile?.requiere_factura ? 'Sí' : 'No' },
          { label: 'Dirección de entrega', value: profile?.direccion_entrega || '—' },
          { label: 'Ciudad / CP', value: [profile?.ciudad, profile?.cp].filter(Boolean).join(' · ') || '—' },
        ].map(f => (
          <div key={f.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', padding: '18px 20px' }}>
            <p style={{ margin: '0 0 4px', color: '#aaa', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{f.label}</p>
            <p style={{ margin: 0, color: '#111', fontSize: 14, fontWeight: 500 }}>{f.value}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <a href="/portal/cuenta/editar" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 20px', background: '#0a0a0a', color: '#fff',
          borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar datos
        </a>
      </div>
    </div>
  )
}

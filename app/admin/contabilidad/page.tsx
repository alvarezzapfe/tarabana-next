import { createServerSupabaseClient } from '../../../src/lib/supabase-server'

export default async function ContabilidadPage() {
  const supabase = await createServerSupabaseClient()
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(email, full_name)')
    .order('created_at', { ascending: false })

  const totalVentas = pedidos?.filter(p => p.status === 'entregado').reduce((s, p) => s + (p.total || 0), 0) || 0
  const totalPendiente = pedidos?.filter(p => ['pendiente','confirmado','enviado'].includes(p.status)).reduce((s, p) => s + (p.total || 0), 0) || 0

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Contabilidad</h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Vista de solo lectura</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Total pedidos', value: pedidos?.length || 0, format: 'num', color: '#1a1a1a' },
          { label: 'Ventas cerradas', value: totalVentas, format: 'currency', color: '#10b981' },
          { label: 'Por cobrar', value: totalPendiente, format: 'currency', color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px' }}>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 26, fontWeight: 700 }}>
              {s.format === 'currency' ? `$${s.value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : s.value}
            </p>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            {['Fecha', 'Cliente', 'Tipo precio', 'Total', 'Status'].map(h => (
              <th key={h} style={{ color: '#9ca3af', fontSize: 13, textAlign: 'left', padding: '8px 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pedidos?.length ? pedidos.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ color: '#6b7280', padding: '12px 14px', fontSize: 14 }}>{new Date(p.created_at).toLocaleDateString('es-MX')}</td>
              <td style={{ color: '#374151', padding: '12px 14px', fontSize: 13 }}>{(p.profiles as any)?.email || '—'}</td>
              <td style={{ color: '#6b7280', padding: '12px 14px', fontSize: 13 }}>{p.tipo_precio}</td>
              <td style={{ color: '#E8531D', padding: '12px 14px', fontSize: 13.5, fontWeight: 600 }}>${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
              <td style={{ padding: '12px 14px' }}>
                <span style={{
                  background: p.status === 'entregado' ? '#d1fae5' : '#fef3c7',
                  color: p.status === 'entregado' ? '#10b981' : '#f59e0b',
                  padding: '3px 10px', borderRadius: 99, fontSize: 13
                }}>{p.status}</span>
              </td>
            </tr>
          )) : (
            <tr><td colSpan={5} style={{ color: '#9ca3af', textAlign: 'center', padding: 60, fontSize: 14 }}>Sin movimientos</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

import { createServerSupabaseClient } from '../../../src/lib/supabase-server'

const roleConfig: Record<string, { label: string, color: string, bg: string }> = {
  super_admin: { label: 'Super Admin', color: '#E8531D', bg: '#E8531D18' },
  admin: { label: 'Admin', color: '#3b82f6', bg: '#3b82f618' },
  produccion: { label: 'Producción', color: '#f59e0b', bg: '#f59e0b18' },
  ventas: { label: 'Ventas', color: '#10b981', bg: '#10b98118' },
  contabilidad: { label: 'Contabilidad', color: '#8b5cf6', bg: '#8b5cf618' },
}

const permisos: Record<string, string> = {
  super_admin: 'Acceso total',
  admin: 'Todo excepto usuarios',
  produccion: 'Inventario y stock',
  ventas: 'Pedidos y pagos',
  contabilidad: 'Solo lectura',
}

export default async function UsuariosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const isSuperAdmin = myProfile?.role === 'super_admin'

  const { data: usuarios } = await supabase
    .from('profiles')
    .select('*')
    .not('role', 'eq', 'comprador')
    .order('created_at', { ascending: false })

  const { data: invitaciones } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('used', false)
    .order('created_at', { ascending: false })

  const activos = usuarios?.filter(u => u.active) || []
  const inactivos = usuarios?.filter(u => !u.active) || []

  return (
    <div style={{ padding: '36px 40px' }}>
      <style>{`
        .usr-action { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:6px; font-size:11.5px; font-weight:500; text-decoration:none; border:none; cursor:pointer; transition:all 0.15s; }
        .usr-action:hover { opacity:0.8; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Usuarios internos</h1>
          <p style={{ color: '#555', fontSize: 13 }}>{activos.length} activos · {inactivos.length} inactivos · {invitaciones?.length || 0} invitaciones pendientes</p>
        </div>
        {isSuperAdmin && (
          <a href="/admin/usuarios/nuevo" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#E8531D', color: '#fff', padding: '10px 20px',
            borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 600
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Invitar usuario
          </a>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
        {Object.entries(roleConfig).filter(([k]) => k !== 'super_admin').map(([role, cfg]) => {
          const count = usuarios?.filter(u => u.role === role).length || 0
          return (
            <div key={role} style={{ background: '#111', border: `1px solid ${cfg.color}22`, borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ color: '#555', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>{cfg.label}</p>
              <p style={{ color: cfg.color, fontSize: 24, fontWeight: 700, margin: 0 }}>{count}</p>
            </div>
          )
        })}
      </div>

      {/* Tabla usuarios */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Equipo</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #161616' }}>
              {['Usuario', 'Contacto', 'Rol', 'Permisos', 'Status', isSuperAdmin ? 'Acciones' : ''].filter(Boolean).map(h => (
                <th key={h} style={{ color: '#3a3a3a', fontSize: 10.5, textAlign: 'left', padding: '10px 18px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios?.map(u => {
              const rc = roleConfig[u.role] || { label: u.role, color: '#555', bg: '#55555518' }
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #141414', opacity: u.active ? 1 : 0.5 }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', background: rc.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: rc.color, fontSize: 13, fontWeight: 700, flexShrink: 0
                      }}>
                        {(u.full_name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ color: '#ddd', margin: 0, fontSize: 13.5, fontWeight: 600 }}>{u.full_name || '—'}</p>
                        <p style={{ color: '#444', margin: '1px 0 0', fontSize: 11.5 }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <p style={{ color: '#555', margin: 0, fontSize: 12.5 }}>{u.phone || '—'}</p>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ background: rc.bg, color: rc.color, padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 600 }}>{rc.label}</span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <p style={{ color: '#555', margin: 0, fontSize: 12 }}>{permisos[u.role] || '—'}</p>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      background: u.active ? '#10b98118' : '#33333318',
                      color: u.active ? '#10b981' : '#555',
                      padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 500
                    }}>{u.active ? 'Activo' : 'Pausado'}</span>
                  </td>
                  {isSuperAdmin && (
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.role !== 'super_admin' && (
                          <form action={`/api/admin/usuarios/${u.id}/toggle`} method="POST">
                            <button type="submit" className="usr-action"
                              style={{ background: u.active ? '#2a1010' : '#102a10', color: u.active ? '#ef4444' : '#10b981' }}>
                              {u.active ? 'Pausar' : 'Activar'}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Invitaciones pendientes */}
      {isSuperAdmin && invitaciones && invitaciones.length > 0 && (
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a' }}>
            <p style={{ color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Invitaciones pendientes · {invitaciones.length}
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #161616' }}>
                {['Nombre', 'Email', 'Rol', 'Enviada', 'Expira', 'Acciones'].map(h => (
                  <th key={h} style={{ color: '#3a3a3a', fontSize: 10.5, textAlign: 'left', padding: '10px 18px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invitaciones.map(inv => {
                const rc = roleConfig[inv.role] || { label: inv.role, color: '#555', bg: '#55555518' }
                const expira = new Date(inv.expires_at)
                const expirada = expira < new Date()
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '12px 18px', color: '#ccc', fontSize: 13 }}>{inv.full_name}</td>
                    <td style={{ padding: '12px 18px', color: '#666', fontSize: 12.5 }}>{inv.email}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ background: rc.bg, color: rc.color, padding: '3px 10px', borderRadius: 99, fontSize: 11 }}>{rc.label}</span>
                    </td>
                    <td style={{ padding: '12px 18px', color: '#555', fontSize: 12 }}>
                      {new Date(inv.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ color: expirada ? '#ef4444' : '#f59e0b', fontSize: 12 }}>
                        {expirada ? 'Expirada' : expira.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <a href={`/api/admin/invitaciones/${inv.id}/reenviar`} className="usr-action"
                        style={{ background: '#1a1a1a', color: '#888' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13 M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                        Reenviar
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

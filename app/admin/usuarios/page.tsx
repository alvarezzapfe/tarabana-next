import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { isSuperAdmin as checkSuperAdmin } from '../../../src/lib/roles'

const roleConfig: Record<string, { label: string, color: string, bg: string }> = {
  super_admin: { label: 'Super Admin', color: '#E8531D', bg: '#fed7aa' },
  admin: { label: 'Admin', color: '#3b82f6', bg: '#dbeafe' },
  produccion: { label: 'Producción', color: '#f59e0b', bg: '#fef3c7' },
  ventas: { label: 'Ventas', color: '#10b981', bg: '#d1fae5' },
  contabilidad: { label: 'Contabilidad', color: '#8b5cf6', bg: '#ede9fe' },
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
  const isSuperAdmin = checkSuperAdmin(myProfile?.role)

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
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Usuarios internos</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>{activos.length} activos · {inactivos.length} inactivos · {invitaciones?.length || 0} invitaciones pendientes</p>
        </div>
        {isSuperAdmin && (
          <a href="/admin/usuarios/nuevo" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#E8531D', color: '#1a1a1a', padding: '10px 20px',
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
            <div key={role} style={{ background: '#fff', border: `1px solid ${cfg.color}22`, borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>{cfg.label}</p>
              <p style={{ color: cfg.color, fontSize: 24, fontWeight: 700, margin: 0 }}>{count}</p>
            </div>
          )
        })}
      </div>

      {/* Tabla usuarios */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: '#6b7280', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Equipo</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['Usuario', 'Contacto', 'Rol', 'Permisos', 'Status', isSuperAdmin ? 'Acciones' : ''].filter(Boolean).map(h => (
                <th key={h} style={{ color: '#9ca3af', fontSize: 13, textAlign: 'left', padding: '10px 18px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios?.map(u => {
              const rc = roleConfig[u.role] || { label: u.role, color: '#6b7280', bg: '#f3f4f6' }
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: u.active ? 1 : 0.5 }}>
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
                        <p style={{ color: '#1a1a1a', margin: 0, fontSize: 13.5, fontWeight: 600 }}>{u.full_name || '—'}</p>
                        <p style={{ color: '#9ca3af', margin: '1px 0 0', fontSize: 13 }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>{u.phone || '—'}</p>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ background: rc.bg, color: rc.color, padding: '4px 12px', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>{rc.label}</span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: 12 }}>{permisos[u.role] || '—'}</p>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      background: u.active ? '#d1fae5' : '#f3f4f6',
                      color: u.active ? '#10b981' : '#555',
                      padding: '4px 12px', borderRadius: 99, fontSize: 13, fontWeight: 500
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
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <p style={{ color: '#6b7280', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Invitaciones pendientes · {invitaciones.length}
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Nombre', 'Email', 'Rol', 'Enviada', 'Expira', 'Acciones'].map(h => (
                  <th key={h} style={{ color: '#9ca3af', fontSize: 13, textAlign: 'left', padding: '10px 18px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invitaciones.map(inv => {
                const rc = roleConfig[inv.role] || { label: inv.role, color: '#6b7280', bg: '#f3f4f6' }
                const expira = new Date(inv.expires_at)
                const expirada = expira < new Date()
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 18px', color: '#374151', fontSize: 13 }}>{inv.full_name}</td>
                    <td style={{ padding: '12px 18px', color: '#6b7280', fontSize: 14 }}>{inv.email}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ background: rc.bg, color: rc.color, padding: '3px 10px', borderRadius: 99, fontSize: 11 }}>{rc.label}</span>
                    </td>
                    <td style={{ padding: '12px 18px', color: '#6b7280', fontSize: 12 }}>
                      {new Date(inv.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ color: expirada ? '#ef4444' : '#f59e0b', fontSize: 12 }}>
                        {expirada ? 'Expirada' : expira.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <a href={`/api/admin/invitaciones/${inv.id}/reenviar`} className="usr-action"
                        style={{ background: '#f3f4f6', color: '#6b7280' }}>
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

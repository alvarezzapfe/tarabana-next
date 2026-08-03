'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../../src/lib/supabase'

const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:  { label: 'Super Admin',   color: '#E8531D', bg: '#fed7aa' },
  admin:        { label: 'Admin',          color: '#3b82f6', bg: '#dbeafe' },
  produccion:   { label: 'Produccion',     color: '#f59e0b', bg: '#fef3c7' },
  ventas:       { label: 'Ventas',         color: '#10b981', bg: '#d1fae5' },
  contabilidad: { label: 'Contabilidad',   color: '#8b5cf6', bg: '#ede9fe' },
}

const actionLabels: Record<string, string> = {
  'pedido.status':     'Cambio estado de pedido',
  'pedido.pago':       'Actualizo pago de pedido',
  'pedido.eliminar':   'Elimino pedido',
  'pedido.crear':      'Creo pedido',
  'cliente.crear':     'Creo cliente',
  'usuario.invitar':   'Envio invitacion',
  'usuario.toggle':    'Cambio estado de usuario',
  'usuario.reset_mfa': 'Reseteo 2FA',
  'pdv.crear':         'Creo punto de venta',
  'pdv.editar':        'Edito punto de venta',
  'pdv.eliminar':      'Elimino punto de venta',
  'invitacion.eliminar': 'Elimino invitacion',
}

function timeAgo(dateStr: string | null): { text: string; stale: boolean } {
  if (!dateStr) return { text: 'Nunca', stale: true }
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return { text: 'hace un momento', stale: false }
  if (mins < 60) return { text: `hace ${mins} min`, stale: false }
  const hours = Math.floor(mins / 60)
  if (hours < 24) return { text: `hace ${hours} h`, stale: false }
  const days = Math.floor(hours / 24)
  return { text: `hace ${days} dias`, stale: days > 30 }
}

function timeUntil(dateStr: string): string {
  const now = Date.now()
  const target = new Date(dateStr).getTime()
  const diffMs = target - now
  if (diffMs <= 0) return 'Expirada'
  const days = Math.floor(diffMs / 86400000)
  if (days > 0) return `${days} dia${days > 1 ? 's' : ''}`
  const hours = Math.floor(diffMs / 3600000)
  return `${hours} h`
}

export default function UsuariosPage() {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [invitaciones, setInvitaciones] = useState<any[]>([])
  const [mfaStatus, setMfaStatus] = useState<Record<string, boolean>>({})
  const [activityPanel, setActivityPanel] = useState<{ user: any; logs: any[] } | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (myProfile?.role !== 'super_admin') {
      setAuthorized(false)
      setLoading(false)
      return
    }
    setAuthorized(true)

    const [usuariosRes, invRes, mfaRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .not('role', 'eq', 'comprador')
        .order('created_at', { ascending: false }),
      supabase
        .from('invitaciones')
        .select('*')
        .eq('used', false)
        .order('created_at', { ascending: false }),
      fetch('/api/admin/usuarios/mfa-status').then(r => r.ok ? r.json() : {}),
    ])

    setUsuarios(usuariosRes.data || [])
    setInvitaciones(invRes.data || [])
    setMfaStatus(mfaRes)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  const handleToggle = async (id: string) => {
    setToggleLoading(id)
    await fetch(`/api/admin/usuarios/${id}/toggle`, { method: 'POST' })
    await loadData()
    setToggleLoading(null)
  }

  const handleViewActivity = async (user: any) => {
    setActivityLoading(true)
    setActivityPanel({ user, logs: [] })
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('actor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setActivityPanel({ user, logs: data || [] })
    setActivityLoading(false)
  }

  const handleResetMfa = async (id: string) => {
    setResetLoading(true)
    const res = await fetch(`/api/admin/usuarios/${id}/reset-mfa`, { method: 'POST' })
    if (res.ok) {
      setMfaStatus(prev => ({ ...prev, [id]: false }))
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Error al resetear 2FA')
    }
    setResetConfirmId(null)
    setResetLoading(false)
  }

  const handleDeleteInvitation = async (id: string) => {
    setDeleteLoading(true)
    const res = await fetch(`/api/admin/invitaciones/${id}/eliminar`, { method: 'DELETE' })
    if (res.ok) {
      setInvitaciones(prev => prev.filter(i => i.id !== id))
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Error al eliminar invitacion')
    }
    setDeleteConfirmId(null)
    setDeleteLoading(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Cargando...</p>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Acceso restringido</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Solo los super administradores pueden acceder a esta seccion.</p>
      </div>
    )
  }

  const activos = usuarios.filter(u => u.active)
  const inactivos = usuarios.filter(u => !u.active)

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Usuarios internos</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            {activos.length} activos · {inactivos.length} inactivos · {invitaciones.length} invitaciones pendientes
          </p>
        </div>
        <a href="/admin/usuarios/nuevo" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#E8531D', color: '#1a1a1a', padding: '10px 20px',
          borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 600,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Invitar usuario
        </a>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
        {Object.entries(roleConfig).map(([role, cfg]) => {
          const count = usuarios.filter(u => u.role === role).length
          return (
            <div key={role} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontWeight: 600 }}>{cfg.label}</p>
              <p style={{ color: cfg.color, fontSize: 24, fontWeight: 700, margin: 0 }}>{count}</p>
            </div>
          )
        })}
      </div>

      {/* SECTION A: Equipo */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <p style={{ color: '#6b7280', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Equipo</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['Usuario', 'Rol', '2FA', 'Ultimo acceso', 'Status', 'Acciones'].map(h => (
                <th key={h} style={{ color: '#9ca3af', fontSize: 11, textAlign: 'left', padding: '10px 18px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => {
              const rc = roleConfig[u.role] || { label: u.role, color: '#6b7280', bg: '#f3f4f6' }
              const hasMfa = mfaStatus[u.id] || false
              const lastSeen = timeAgo(u.last_seen_at)
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: u.active ? 1 : 0.5 }}>
                  {/* Avatar + Name + Email */}
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', background: rc.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: rc.color, fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>
                        {(u.full_name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ color: '#1a1a1a', margin: 0, fontSize: 13.5, fontWeight: 600 }}>{u.full_name || '--'}</p>
                        <p style={{ color: '#9ca3af', margin: '1px 0 0', fontSize: 12 }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* Role badge */}
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ background: rc.bg, color: rc.color, padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>{rc.label}</span>
                  </td>
                  {/* 2FA */}
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      background: hasMfa ? '#d1fae5' : '#f3f4f6',
                      color: hasMfa ? '#10b981' : '#9ca3af',
                      padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    }}>
                      {hasMfa ? 'Activo' : 'Sin 2FA'}
                    </span>
                  </td>
                  {/* Last seen */}
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ color: lastSeen.stale ? '#f59e0b' : '#6b7280', fontSize: 12 }}>
                      {lastSeen.text}
                    </span>
                  </td>
                  {/* Status */}
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      background: u.active ? '#d1fae5' : '#f3f4f6',
                      color: u.active ? '#10b981' : '#6b7280',
                      padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                    }}>
                      {u.active ? 'Activo' : 'Pausado'}
                    </span>
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* Toggle active */}
                      {u.role !== 'super_admin' && (
                        <button
                          onClick={() => handleToggle(u.id)}
                          disabled={toggleLoading === u.id}
                          title="Los usuarios con historial se desactivan, no se borran."
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                            border: 'none', cursor: 'pointer',
                            background: u.active ? '#fef2f2' : '#f0fdf4',
                            color: u.active ? '#ef4444' : '#10b981',
                            opacity: toggleLoading === u.id ? 0.5 : 1,
                          }}
                        >
                          {toggleLoading === u.id ? '...' : u.active ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                      {/* View activity */}
                      <button
                        onClick={() => handleViewActivity(u)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                          border: 'none', cursor: 'pointer',
                          background: '#f3f4f6', color: '#6b7280',
                        }}
                      >
                        Ver actividad
                      </button>
                      {/* Reset 2FA */}
                      {u.role !== 'super_admin' && hasMfa && (
                        resetConfirmId === u.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              onClick={() => handleResetMfa(u.id)}
                              disabled={resetLoading}
                              style={{
                                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: '#fef2f2', color: '#ef4444',
                                opacity: resetLoading ? 0.5 : 1,
                              }}
                            >
                              {resetLoading ? '...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setResetConfirmId(null)}
                              style={{
                                padding: '5px 8px', borderRadius: 6, fontSize: 11,
                                border: 'none', cursor: 'pointer',
                                background: '#f3f4f6', color: '#6b7280',
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setResetConfirmId(u.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                              border: 'none', cursor: 'pointer',
                              background: '#fef3c7', color: '#f59e0b',
                            }}
                          >
                            Resetear 2FA
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Reset 2FA confirmation dialog */}
      {resetConfirmId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setResetConfirmId(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 32px', maxWidth: 420, width: '100%',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Resetear 2FA</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
              Resetear 2FA de {usuarios.find(u => u.id === resetConfirmId)?.full_name || 'este usuario'}? Tendra que reinscribir su autenticador.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setResetConfirmId(null)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleResetMfa(resetConfirmId)}
                disabled={resetLoading}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer',
                  opacity: resetLoading ? 0.5 : 1,
                }}
              >
                {resetLoading ? 'Reseteando...' : 'Confirmar reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION B: Invitaciones pendientes */}
      {invitaciones.length > 0 && (
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
                  <th key={h} style={{ color: '#9ca3af', fontSize: 11, textAlign: 'left', padding: '10px 18px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invitaciones.map(inv => {
                const rc = roleConfig[inv.role] || { label: inv.role, color: '#6b7280', bg: '#f3f4f6' }
                const sentAgo = timeAgo(inv.created_at)
                const expiresIn = timeUntil(inv.expires_at)
                const isExpired = expiresIn === 'Expirada'
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 18px', color: '#374151', fontSize: 13 }}>{inv.full_name}</td>
                    <td style={{ padding: '12px 18px', color: '#6b7280', fontSize: 13 }}>{inv.email}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ background: rc.bg, color: rc.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{rc.label}</span>
                    </td>
                    <td style={{ padding: '12px 18px', color: '#6b7280', fontSize: 12 }}>
                      {sentAgo.text}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ color: isExpired ? '#ef4444' : '#f59e0b', fontSize: 12, fontWeight: isExpired ? 600 : 400 }}>
                        {isExpired ? 'Expirada' : `en ${expiresIn}`}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={`/api/admin/invitaciones/${inv.id}/reenviar`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                            textDecoration: 'none', background: '#f3f4f6', color: '#6b7280',
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13 M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                          Reenviar
                        </a>
                        {deleteConfirmId === inv.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              onClick={() => handleDeleteInvitation(inv.id)}
                              disabled={deleteLoading}
                              style={{
                                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: '#fef2f2', color: '#ef4444',
                                opacity: deleteLoading ? 0.5 : 1,
                              }}
                            >
                              {deleteLoading ? '...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              style={{
                                padding: '5px 8px', borderRadius: 6, fontSize: 11,
                                border: 'none', cursor: 'pointer',
                                background: '#f3f4f6', color: '#6b7280',
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(inv.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                              border: 'none', cursor: 'pointer',
                              background: '#fef2f2', color: '#ef4444',
                            }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity slide-over panel */}
      {activityPanel && (
        <>
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.2)', zIndex: 999,
            }}
            onClick={() => setActivityPanel(null)}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
            background: '#fff', borderLeft: '1px solid #e5e7eb',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0,
            }}>
              <div>
                <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {activityPanel.user.full_name || activityPanel.user.email}
                </h3>
                <span style={{
                  display: 'inline-block', marginTop: 6,
                  background: (roleConfig[activityPanel.user.role] || { bg: '#f3f4f6' }).bg,
                  color: (roleConfig[activityPanel.user.role] || { color: '#6b7280' }).color,
                  padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                }}>
                  {(roleConfig[activityPanel.user.role] || { label: activityPanel.user.role }).label}
                </span>
              </div>
              <button
                onClick={() => setActivityPanel(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid #e5e7eb', background: '#fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#6b7280', fontSize: 16,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Panel content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {activityLoading ? (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>Cargando actividad...</p>
              ) : activityPanel.logs.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin actividad registrada.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {activityPanel.logs.map((log, i) => {
                    const logTime = timeAgo(log.created_at)
                    const label = actionLabels[log.accion] || log.accion
                    const detail = log.detalle
                      ? (typeof log.detalle === 'string' ? log.detalle : JSON.stringify(log.detalle))
                      : null
                    return (
                      <div key={log.id || i} style={{
                        padding: '12px 0',
                        borderBottom: i < activityPanel.logs.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                          <p style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 600, margin: 0 }}>{label}</p>
                          <span style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0, marginLeft: 12 }}>{logTime.text}</span>
                        </div>
                        {detail && (
                          <p style={{ color: '#9ca3af', fontSize: 12, margin: '2px 0 0', lineHeight: 1.4, wordBreak: 'break-all' }}>
                            {detail.length > 120 ? detail.slice(0, 120) + '...' : detail}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

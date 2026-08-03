'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../../src/lib/supabase'

const PAGE_SIZE = 50

const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: 'Super Admin', color: '#E8531D', bg: '#fed7aa' },
  admin: { label: 'Admin', color: '#3b82f6', bg: '#dbeafe' },
  produccion: { label: 'Produccion', color: '#f59e0b', bg: '#fef3c7' },
  ventas: { label: 'Ventas', color: '#10b981', bg: '#d1fae5' },
  contabilidad: { label: 'Contabilidad', color: '#8b5cf6', bg: '#ede9fe' },
}

const actionTranslations: Record<string, string> = {
  'pedido.status': 'Cambio estado de pedido',
  'pedido.pago': 'Actualizo pago',
  'pedido.eliminar': 'Elimino pedido',
  'pedido.crear': 'Creo pedido',
  'cliente.crear': 'Creo cliente',
  'usuario.invitar': 'Envio invitacion',
  'usuario.toggle': 'Cambio estado de usuario',
  'usuario.reset_mfa': 'Reseteo 2FA de usuario',
  'pdv.crear': 'Creo punto de venta',
  'pdv.editar': 'Edito punto de venta',
  'pdv.eliminar': 'Elimino punto de venta',
  'invitacion.eliminar': 'Elimino invitacion',
}

const actionCategories: Record<string, string[]> = {
  'Pedidos': ['pedido.'],
  'Clientes': ['cliente.'],
  'Usuarios': ['usuario.'],
  'Puntos de venta': ['pdv.'],
  'Invitaciones': ['invitacion.'],
}

function tiempoRelativo(fecha: string): string {
  const ahora = Date.now()
  const entonces = new Date(fecha).getTime()
  const diffMs = ahora - entonces
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `hace ${dias} dias`
}

function formatAbsolute(fecha: string): string {
  return new Date(fecha).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function entityLink(entidad: string | null, entidad_id: string | null) {
  if (!entidad) return '—'
  const shortId = entidad_id ? entidad_id.slice(0, 8) : ''
  let href: string | null = null
  if (entidad === 'pedidos') href = '/admin/pedidos'
  else if (entidad === 'profiles') href = '/admin/clientes'
  else if (entidad === 'puntos_venta') href = '/admin/puntos-venta'

  const label = `${entidad}${shortId ? ` #${shortId}` : ''}`
  if (href) {
    return (
      <a href={href} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 13 }}>
        {label}
      </a>
    )
  }
  return <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
}

function renderDetalle(detalle: unknown) {
  if (!detalle || typeof detalle !== 'object') return '—'
  const obj = detalle as Record<string, unknown>
  const entries = Object.entries(obj)
  if (entries.length === 0) return '—'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{ fontSize: 12, color: '#6b7280' }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>{k}:</span>{' '}
          {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
        </span>
      ))}
    </div>
  )
}

interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: string
  active: boolean
  last_seen_at: string | null
}

interface AuditEntry {
  id: string
  created_at: string
  actor_id: string | null
  accion: string
  entidad: string | null
  entidad_id: string | null
  detalle: unknown
}

export default function ActividadPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, Profile>>({})

  // Filters
  const [filterUser, setFilterUser] = useState('')
  const [filterCategory, setFilterCategory] = useState('Todos')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Stats
  const [accionesHoy, setAccionesHoy] = useState(0)
  const [usuariosActivos, setUsuariosActivos] = useState(0)
  const [pedidosSemana, setPedidosSemana] = useState(0)
  const [sin2FA, setSin2FA] = useState(0)

  const supabase = createClient()

  // Check authorization
  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAuthorized(false); return }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      setAuthorized(profile?.role === 'super_admin')
    })()
  }, [])

  // Fetch profiles (internal users)
  useEffect(() => {
    if (authorized !== true) return
    ;(async () => {
      const { data } = await supabase
        .from('profiles').select('*')
        .not('role', 'eq', 'comprador')
        .order('full_name', { ascending: true })
      const profs = (data || []) as Profile[]
      setProfiles(profs)
      const map: Record<string, Profile> = {}
      for (const p of profs) map[p.id] = p
      setProfileMap(map)
    })()
  }, [authorized])

  // Fetch stats
  useEffect(() => {
    if (authorized !== true) return
    ;(async () => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Acciones hoy
      const { count: hoyCount } = await supabase
        .from('audit_log').select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString())
      setAccionesHoy(hoyCount || 0)

      // Pedidos semana
      const { count: pedCount } = await supabase
        .from('audit_log').select('*', { count: 'exact', head: true })
        .like('accion', 'pedido.%')
        .gte('created_at', weekAgo)
      setPedidosSemana(pedCount || 0)

      // Usuarios activos semana
      const { data: activeUsers } = await supabase
        .from('profiles').select('id')
        .not('role', 'eq', 'comprador')
        .gte('last_seen_at', weekAgo)
      setUsuariosActivos(activeUsers?.length || 0)

      // Sin 2FA
      try {
        const res = await fetch('/api/admin/usuarios/mfa-status')
        if (res.ok) {
          const mfaData = await res.json()
          const noMfa = Object.values(mfaData).filter((v) => v === false).length
          setSin2FA(noMfa)
        }
      } catch { /* ignore */ }
    })()
  }, [authorized])

  // Fetch audit logs
  const fetchLogs = useCallback(async (pageNum: number) => {
    const offset = pageNum * PAGE_SIZE
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (filterUser) query = query.eq('actor_id', filterUser)
    if (filterCategory !== 'Todos') {
      const prefixes = actionCategories[filterCategory]
      if (prefixes && prefixes.length > 0) {
        query = query.like('accion', `${prefixes[0]}%`)
      }
    }
    if (filterFrom) query = query.gte('created_at', new Date(filterFrom).toISOString())
    if (filterTo) {
      const toEnd = new Date(filterTo)
      toEnd.setHours(23, 59, 59, 999)
      query = query.lte('created_at', toEnd.toISOString())
    }

    query = query.range(offset, offset + PAGE_SIZE - 1)

    const { data, count } = await query
    setLogs((data || []) as AuditEntry[])
    setTotalCount(count || 0)
  }, [filterUser, filterCategory, filterFrom, filterTo])

  useEffect(() => {
    if (authorized !== true) return
    fetchLogs(page)
  }, [authorized, page, fetchLogs])

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0)
  }, [filterUser, filterCategory, filterFrom, filterTo])

  if (authorized === null) {
    return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#6b7280' }}>Cargando...</div>
  }

  if (authorized === false) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui' }}>
        <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600 }}>
          Acceso restringido — solo Super Admin
        </p>
      </div>
    )
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Registro de actividad
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Historial completo de acciones del equipo interno
        </p>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Acciones hoy', value: accionesHoy, color: '#3b82f6' },
          { label: 'Usuarios activos (semana)', value: usuariosActivos, color: '#10b981' },
          { label: 'Pedidos procesados (semana)', value: pedidosSemana, color: '#f59e0b' },
          { label: 'Sin 2FA', value: sin2FA, color: '#ef4444' },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            padding: '18px 20px',
          }}>
            <p style={{ color: '#6b7280', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              {stat.label}
            </p>
            <p style={{ color: stat.color, fontSize: 28, fontWeight: 700, margin: 0 }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Usuario</label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              fontSize: 13, color: '#374151', background: '#fff', minWidth: 180,
            }}
          >
            <option value="">Todos</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Tipo de accion</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              fontSize: 13, color: '#374151', background: '#fff', minWidth: 160,
            }}
          >
            {['Todos', 'Pedidos', 'Clientes', 'Usuarios', 'Puntos de venta', 'Invitaciones'].map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Desde</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              fontSize: 13, color: '#374151', background: '#fff',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Hasta</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              fontSize: 13, color: '#374151', background: '#fff',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Registro
          </p>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
            {totalCount} entradas
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['Timestamp', 'Actor', 'Accion', 'Entidad', 'Detalle'].map((h) => (
                <th key={h} style={{
                  color: '#9ca3af', fontSize: 12, textAlign: 'left', padding: '10px 16px',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Sin registros
                </td>
              </tr>
            )}
            {logs.map((entry) => {
              const actor = entry.actor_id ? profileMap[entry.actor_id] : null
              const rc = actor ? (roleConfig[actor.role] || { label: actor.role, color: '#6b7280', bg: '#f3f4f6' }) : null
              return (
                <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span
                      title={formatAbsolute(entry.created_at)}
                      style={{ color: '#374151', fontSize: 13 }}
                    >
                      {tiempoRelativo(entry.created_at)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {actor ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 500 }}>
                          {actor.full_name || actor.email || '—'}
                        </span>
                        {rc && (
                          <span style={{
                            background: rc.bg, color: rc.color,
                            padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                          }}>{rc.label}</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>
                        {entry.actor_id ? entry.actor_id.slice(0, 8) : 'Sistema'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: '#374151', fontSize: 13 }}>
                      {actionTranslations[entry.accion] || entry.accion}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {entityLink(entry.entidad, entry.entidad_id)}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                    {renderDetalle(entry.detalle)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
          marginTop: 20,
        }}>
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: page === 0 ? '#f9fafb' : '#fff',
              color: page === 0 ? '#d1d5db' : '#374151',
              fontSize: 13, fontWeight: 500, cursor: page === 0 ? 'default' : 'pointer',
            }}
          >
            Anterior
          </button>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            Pagina {page + 1} de {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: page >= totalPages - 1 ? '#f9fafb' : '#fff',
              color: page >= totalPages - 1 ? '#d1d5db' : '#374151',
              fontSize: 13, fontWeight: 500, cursor: page >= totalPages - 1 ? 'default' : 'pointer',
            }}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { TIPOS_CLIENTE, NIVELES_PRECIO, tipoLabel, nivelLabel, tipoIcon } from '../../../src/lib/clientes'
import { canWrite } from '../../../src/lib/roles'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef3c7' },
  confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#dbeafe' },
  enviado:    { label: 'En camino',  color: '#8b5cf6', bg: '#ede9fe' },
  entregado:  { label: 'Entregado',  color: '#10b981', bg: '#d1fae5' },
  cancelado:  { label: 'Cancelado',  color: '#ef4444', bg: '#fee2e2' },
}

const nivelBadgeStyle: Record<string, { bg: string; color: string }> = {
  publico:      { bg: '#f3f4f6', color: '#6b7280' },
  taproom:      { bg: '#dbeafe', color: '#3b82f6' },
  distribuidor: { bg: '#ede9fe', color: '#8b5cf6' },
}

interface Cliente {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  tipo_consumidor: string | null
  nivel_precio: string | null
  requiere_factura: boolean | null
  tipo_persona: string | null
  rfc: string | null
  razon_social: string | null
  regimen_fiscal: string | null
  uso_cfdi: string | null
  cp_fiscal: string | null
  direccion_entrega: string | null
  ciudad: string | null
  cp: string | null
  calle: string | null
  num_ext: string | null
  num_int: string | null
  colonia: string | null
  municipio: string | null
  estado: string | null
  referencias: string | null
  invitacion_enviada_at: string | null
  cuenta_activada_at: string | null
  created_at: string
}

interface Pedido {
  id: string
  created_at: string
  total: number | null
  status: string
  cliente_id: string
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pedidosCounts, setPedidosCounts] = useState<Record<string, number>>({})
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterNivel, setFilterNivel] = useState('')

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelPedidos, setPanelPedidos] = useState<Pedido[]>([])
  const [loadingPanel, setLoadingPanel] = useState(false)

  // Nivel precio edit
  const [savingNivel, setSavingNivel] = useState(false)
  const [nivelSaved, setNivelSaved] = useState(false)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: myProfile }, { data: clientesData }, { data: pedidosData }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('profiles').select('*').eq('role', 'comprador').order('created_at', { ascending: false }),
        supabase.from('pedidos').select('cliente_id'),
      ])

      setCanEdit(canWrite(myProfile?.role))
      setClientes(clientesData || [])

      const counts: Record<string, number> = {}
      for (const p of pedidosData || []) {
        counts[p.cliente_id] = (counts[p.cliente_id] || 0) + 1
      }
      setPedidosCounts(counts)
      setLoading(false)
    }
    load()
  }, [])

  // Open detail panel
  const openPanel = async (id: string) => {
    setSelectedId(id)
    setLoadingPanel(true)
    setNivelSaved(false)
    const supabase = createClient()
    const { data } = await supabase
      .from('pedidos')
      .select('id, created_at, total, status, cliente_id')
      .eq('cliente_id', id)
      .order('created_at', { ascending: false })
      .limit(5)
    setPanelPedidos(data || [])
    setLoadingPanel(false)
  }

  const closePanel = () => {
    setSelectedId(null)
    setPanelPedidos([])
  }

  const updateNivel = async (clienteId: string, nivel: string) => {
    setSavingNivel(true)
    setNivelSaved(false)
    await fetch(`/api/admin/clientes/${clienteId}/nivel-precio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nivel_precio: nivel }),
    })
    setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, nivel_precio: nivel } : c))
    setSavingNivel(false)
    setNivelSaved(true)
    setTimeout(() => setNivelSaved(false), 2000)
  }

  // Filtered data
  const filtered = useMemo(() => {
    let result = clientes
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.rfc || '').toLowerCase().includes(q)
      )
    }
    if (filterTipo) {
      result = result.filter(c => c.tipo_consumidor === filterTipo)
    }
    if (filterNivel) {
      result = result.filter(c => (c.nivel_precio || 'publico') === filterNivel)
    }
    return result
  }, [clientes, search, filterTipo, filterNivel])

  // Summary counts
  const total = clientes.length
  const countByNivel = (nivel: string) =>
    clientes.filter(c => (c.nivel_precio || 'publico') === nivel).length
  const countFactura = clientes.filter(c => c.requiere_factura).length

  const selectedCliente = clientes.find(c => c.id === selectedId) || null

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

  const formatCurrency = (n: number | null) =>
    n != null ? `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '$0.00'

  if (loading) {
    return (
      <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Cargando clientes...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Clientes</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>{total} registrados</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 10 }}>
            <a href="/admin/pedidos/nuevo" style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
              background: '#f3f4f6', border: '1px solid #d1d5db', color: '#6b7280',
              borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 500
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6"/></svg>
              Nuevo pedido
            </a>
            <a href="/admin/clientes/nuevo" style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
              background: '#E8531D', color: '#1a1a1a', borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 600
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo cliente
            </a>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total clientes', value: total, color: '#1a1a1a' },
          { label: 'Publico / Mayorista / Distribuidor', value: `${countByNivel('publico')} / ${countByNivel('taproom')} / ${countByNivel('distribuidor')}`, color: '#3b82f6' },
          { label: 'Requieren factura', value: countFactura, color: '#f59e0b' },
        ].map((card, i) => (
          <div key={i} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            padding: '18px 20px',
          }}>
            <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{card.label}</p>
            <p style={{ color: card.color, fontSize: typeof card.value === 'number' ? 26 : 20, fontWeight: 700, margin: 0 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar por nombre, email o RFC..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 220, padding: '9px 14px', fontSize: 13,
            border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none',
            background: '#fff', color: '#1a1a1a',
          }}
        />
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value)}
          style={{
            padding: '9px 14px', fontSize: 13, border: '1px solid #e5e7eb',
            borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer',
          }}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_CLIENTE.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={filterNivel}
          onChange={e => setFilterNivel(e.target.value)}
          style={{
            padding: '9px 14px', fontSize: 13, border: '1px solid #e5e7eb',
            borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer',
          }}
        >
          <option value="">Todos los niveles</option>
          {NIVELES_PRECIO.map(n => (
            <option key={n.value} value={n.value}>{n.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['Cliente', 'Tipo', 'Nivel de precio', 'Portal', 'Pedidos', 'Registrado', ...(canEdit ? [''] : [])].map((h, i) => (
                <th key={i} style={{
                  color: '#9ca3af', fontSize: 11, textAlign: 'left', padding: '10px 14px',
                  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map(c => {
              const nivel = c.nivel_precio || 'publico'
              const badge = nivelBadgeStyle[nivel] || nivelBadgeStyle.publico
              return (
                <tr
                  key={c.id}
                  onClick={() => openPanel(c.id)}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background: selectedId === c.id ? '#f9fafb' : 'transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selectedId === c.id ? '#f9fafb' : 'transparent' }}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: '#f3f4f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#E8531D', fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>
                        {(c.full_name || c.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ color: '#1a1a1a', margin: 0, fontSize: 13, fontWeight: 600 }}>{c.full_name || '--'}</p>
                        <p style={{ color: '#9ca3af', margin: '1px 0 0', fontSize: 11 }}>{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>{tipoLabel(c.tipo_consumidor)}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      background: badge.bg, color: badge.color,
                      padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                    }}>
                      {nivelLabel(nivel)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {c.cuenta_activada_at ? (
                      <span style={{ background: '#d1fae5', color: '#10b981', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>Activo</span>
                    ) : c.invitacion_enviada_at ? (
                      <span style={{ background: '#fef3c7', color: '#f59e0b', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>Invitado</span>
                    ) : (
                      <span style={{ background: '#f3f4f6', color: '#9ca3af', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>Sin invitar</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#1a1a1a', fontSize: 13, fontWeight: 500 }}>
                    {pedidosCounts[c.id] || 0}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#9ca3af', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {formatDate(c.created_at)}
                  </td>
                  {canEdit && (
                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={`/admin/pedidos/nuevo?cliente=${c.id}`} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                          background: '#f3f4f6', color: '#6b7280', borderRadius: 6,
                          textDecoration: 'none', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          Pedido
                        </a>
                        <a href={`/admin/clientes/edit/${c.id}`} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                          background: '#f3f4f6', color: '#6b7280', borderRadius: 6,
                          textDecoration: 'none', fontSize: 12, fontWeight: 500,
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Editar
                        </a>
                      </div>
                    </td>
                  )}
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={canEdit ? 6 : 5} style={{ color: '#9ca3af', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>
                  {clientes.length === 0 ? 'No hay clientes aun -- agrega el primero' : 'Sin resultados para estos filtros'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail panel overlay */}
      {selectedCliente && (
        <>
          {/* Backdrop */}
          <div
            onClick={closePanel}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)',
              zIndex: 40,
            }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
            background: '#fff', borderLeft: '1px solid #e5e7eb',
            zIndex: 50, overflowY: 'auto', padding: '28px 32px',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          }}>
            {/* Close button */}
            <button
              onClick={closePanel}
              style={{
                position: 'absolute', top: 20, right: 20, background: '#f3f4f6',
                border: 'none', borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6b7280',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>

            {/* Client header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#f3f4f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#E8531D', fontSize: 20, fontWeight: 700, flexShrink: 0,
              }}>
                {(selectedCliente.full_name || selectedCliente.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <h2 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>
                  {selectedCliente.full_name || '--'}
                </h2>
                <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0 0' }}>{selectedCliente.email}</p>
              </div>
            </div>

            {/* Contact info */}
            <div style={{ marginBottom: 24 }}>
              <SectionTitle>Contacto</SectionTitle>
              <InfoRow label="Telefono" value={selectedCliente.phone} />
              <InfoRow label="Tipo" value={tipoLabel(selectedCliente.tipo_consumidor)} />
            </div>

            {/* Address */}
            <div style={{ marginBottom: 24 }}>
              <SectionTitle>Direccion de entrega</SectionTitle>
              {selectedCliente.calle ? (
                <>
                  <p style={{ margin: '0 0 4px', color: '#1a1a1a', fontSize: 14, lineHeight: 1.5 }}>
                    {[selectedCliente.calle, selectedCliente.num_ext, selectedCliente.num_int ? `Int. ${selectedCliente.num_int}` : ''].filter(Boolean).join(' ')}
                  </p>
                  {selectedCliente.colonia && <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: 13 }}>{selectedCliente.colonia}</p>}
                  <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: 13 }}>{[selectedCliente.municipio, selectedCliente.estado].filter(Boolean).join(', ')} {selectedCliente.cp}</p>
                  {selectedCliente.referencias && <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>{selectedCliente.referencias}</p>}
                  <button
                    onClick={() => {
                      const parts = [
                        [selectedCliente.calle, selectedCliente.num_ext, selectedCliente.num_int ? `Int. ${selectedCliente.num_int}` : ''].filter(Boolean).join(' '),
                        selectedCliente.colonia, selectedCliente.municipio,
                        [selectedCliente.estado, selectedCliente.cp].filter(Boolean).join(' '),
                      ].filter(Boolean)
                      navigator.clipboard.writeText(parts.join(', '))
                    }}
                    style={{ marginTop: 8, padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, color: '#6b7280', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copiar direccion
                  </button>
                </>
              ) : selectedCliente.direccion_entrega ? (
                <>
                  <p style={{ margin: '0 0 2px', color: '#1a1a1a', fontSize: 14 }}>{selectedCliente.direccion_entrega}</p>
                  {selectedCliente.ciudad && <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{selectedCliente.ciudad} {selectedCliente.cp}</p>}
                </>
              ) : (
                <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>Sin direccion registrada</p>
              )}
            </div>

            {/* Portal access */}
            <div style={{ marginBottom: 24 }}>
              <SectionTitle>Acceso al portal</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {selectedCliente.cuenta_activada_at ? (
                  <span style={{ background: '#d1fae5', color: '#10b981', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>Activo</span>
                ) : selectedCliente.invitacion_enviada_at ? (
                  <span style={{ background: '#fef3c7', color: '#f59e0b', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>Invitado</span>
                ) : (
                  <span style={{ background: '#f3f4f6', color: '#9ca3af', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>Sin invitar</span>
                )}
              </div>
              {selectedCliente.invitacion_enviada_at && (
                <p style={{ margin: '0 0 4px', color: '#9ca3af', fontSize: 12 }}>Invitacion enviada: {formatDate(selectedCliente.invitacion_enviada_at)}</p>
              )}
              {selectedCliente.cuenta_activada_at && (
                <p style={{ margin: '0 0 4px', color: '#9ca3af', fontSize: 12 }}>Cuenta activada: {formatDate(selectedCliente.cuenta_activada_at)}</p>
              )}
              {canEdit && !selectedCliente.cuenta_activada_at && (
                <button
                  onClick={async () => {
                    setInvitingId(selectedCliente.id); setInviteResult(null)
                    const res = await fetch(`/api/admin/clientes/${selectedCliente.id}/invitar`, { method: 'POST' })
                    const d = await res.json().catch(() => ({}))
                    setInvitingId(null)
                    if (res.ok) {
                      setInviteResult('Invitacion enviada')
                      setClientes(prev => prev.map(c => c.id === selectedCliente.id ? { ...c, invitacion_enviada_at: new Date().toISOString() } : c))
                    } else { setInviteResult(d.error || 'Error') }
                    setTimeout(() => setInviteResult(null), 3000)
                  }}
                  disabled={invitingId === selectedCliente.id}
                  style={{ marginTop: 8, padding: '6px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, color: '#6b7280', fontSize: 12, cursor: 'pointer', opacity: invitingId === selectedCliente.id ? 0.5 : 1 }}
                >
                  {invitingId === selectedCliente.id ? 'Enviando...' : selectedCliente.invitacion_enviada_at ? 'Reenviar invitacion' : 'Enviar invitacion'}
                </button>
              )}
              {inviteResult && <p style={{ margin: '6px 0 0', color: inviteResult.includes('Error') ? '#ef4444' : '#10b981', fontSize: 12 }}>{inviteResult}</p>}
            </div>

            {/* Fiscal data */}
            <div style={{ marginBottom: 24 }}>
              <SectionTitle>Datos fiscales</SectionTitle>
              <InfoRow label="Requiere factura" value={selectedCliente.requiere_factura ? 'Si' : 'No'} />
              {selectedCliente.requiere_factura && (
                <>
                  <InfoRow label="Tipo persona" value={selectedCliente.tipo_persona} />
                  <InfoRow label="RFC" value={selectedCliente.rfc} mono />
                  <InfoRow label="Razon social" value={selectedCliente.razon_social} />
                  <InfoRow label="Regimen fiscal" value={selectedCliente.regimen_fiscal} />
                  <InfoRow label="Uso CFDI" value={selectedCliente.uso_cfdi} />
                  <InfoRow label="C.P. fiscal" value={selectedCliente.cp_fiscal} mono />
                </>
              )}
            </div>

            {/* Nivel de precio */}
            <div style={{ marginBottom: 28 }}>
              <SectionTitle>Nivel de precio</SectionTitle>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {NIVELES_PRECIO.map(n => {
                  const current = selectedCliente.nivel_precio || 'publico'
                  const isActive = current === n.value
                  const badge = nivelBadgeStyle[n.value] || nivelBadgeStyle.publico
                  return (
                    <button
                      key={n.value}
                      disabled={!canEdit || savingNivel}
                      onClick={() => {
                        if (canEdit && n.value !== current) updateNivel(selectedCliente.id, n.value)
                      }}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: 10, cursor: canEdit ? 'pointer' : 'default',
                        background: isActive ? badge.bg : '#fafafa',
                        border: isActive ? `2px solid ${badge.color}` : '1px solid #e5e7eb',
                        opacity: savingNivel ? 0.6 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isActive ? badge.color : '#9ca3af' }}>
                        {n.label}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>{n.desc}</p>
                    </button>
                  )
                })}
              </div>
              {nivelSaved && (
                <p style={{ color: '#10b981', fontSize: 12, marginTop: 6, fontWeight: 500 }}>Guardado</p>
              )}
            </div>

            {/* Mini historial */}
            <div>
              <SectionTitle>Ultimos pedidos</SectionTitle>
              {loadingPanel ? (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>Cargando...</p>
              ) : panelPedidos.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin pedidos</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {panelPedidos.map(p => {
                    const sc = statusConfig[p.status] || statusConfig.pendiente
                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', background: '#fafafa', borderRadius: 8,
                        border: '1px solid #f3f4f6',
                      }}>
                        <div>
                          <span style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 600 }}>
                            #{p.id.slice(0, 8)}
                          </span>
                          <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 10 }}>
                            {formatDate(p.created_at)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 500 }}>
                            {formatCurrency(p.total)}
                          </span>
                          <span style={{
                            background: sc.bg, color: sc.color,
                            padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                          }}>
                            {sc.label}
                          </span>
                        </div>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      color: '#9ca3af', fontSize: 11, textTransform: 'uppercase',
      letterSpacing: '0.07em', margin: '0 0 8px', fontWeight: 600,
    }}>
      {children}
    </p>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ color: '#6b7280', fontSize: 13 }}>{label}</span>
      <span style={{
        color: '#1a1a1a', fontSize: 13, fontWeight: 500,
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value || '--'}
      </span>
    </div>
  )
}

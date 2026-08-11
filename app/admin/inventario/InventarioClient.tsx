'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import WhatsAppModal from './WhatsAppModal'
import type { TipoPrecio } from '../../../src/lib/whatsappPrompt'

interface Props { productos: any[]; canEdit: boolean; pedidoCounts: Record<string, number> }

const stockColor = (n: number) => n === 0 ? '#9ca3af' : n <= 10 ? '#d97706' : '#10b981'
const NS: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', padding: '10px 10px', fontSize: 13, fontWeight: 600 }
const STOCK_FIELDS = [
  { key: 'stock_latas', label: 'Sueltas', group: 'latas' },
  { key: 'stock_caja12', label: 'Caja 12', group: 'latas' },
  { key: 'stock_caja24', label: 'Caja 24', group: 'latas' },
  { key: 'stock_barril_pet', label: '20L PET', group: 'barriles' },
  { key: 'stock_barril_acero', label: '20L Acero', group: 'barriles' },
  { key: 'stock_barril10_pet', label: '10L PET', group: 'barriles' },
  { key: 'stock_barril10_acero', label: '10L Acero', group: 'barriles' },
]

export default function InventarioClient({ productos, canEdit, pedidoCounts }: Props) {
  const [data, setData] = useState(productos)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [soloConStock, setSoloConStock] = useState(false)
  const [estiloFilter, setEstiloFilter] = useState('todos')
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>('mayorista')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalProductos, setModalProductos] = useState<any[]>([])
  const [menuId, setMenuId] = useState<string | null>(null)
  const [stockModalId, setStockModalId] = useState<string | null>(null)
  const [stockForm, setStockForm] = useState<Record<string, number>>({})
  const [stockMotivo, setStockMotivo] = useState('')
  const [stockSaving, setStockSaving] = useState(false)
  const [stockError, setStockError] = useState('')
  const [filterEstado, setFilterEstado] = useState<'activos' | 'desc' | 'todos'>('activos')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)

  const estilos = useMemo(() => [...new Set(data.map(p => p.estilo).filter(Boolean))].sort(), [data])

  const filtered = useMemo(() => data.filter(p => {
    if (filterEstado === 'activos' && !p.activo) return false
    if (filterEstado === 'desc' && p.activo) return false
    if (search) { const q = search.toLowerCase(); if (!p.nombre?.toLowerCase().includes(q) && !p.estilo?.toLowerCase().includes(q)) return false }
    if (soloConStock && totalStock(p) === 0) return false
    if (estiloFilter !== 'todos' && p.estilo !== estiloFilter) return false
    return true
  }), [data, search, soloConStock, estiloFilter, filterEstado])

  const kpis = useMemo(() => {
    let totalLatas = 0, totalSueltas = 0, totalBbl = 0, bp20 = 0, ba20 = 0, bp10 = 0, ba10 = 0, valorTotal = 0
    const pk = tipoPrecio === 'mayorista' ? 'publico' : 'taproom'
    data.forEach(p => {
      const c12 = p.stock_caja12 || 0, c24 = p.stock_caja24 || 0, s = p.stock_latas || 0
      const bbp = p.stock_barril_pet || 0, bba = p.stock_barril_acero || 0, bbp10 = p.stock_barril10_pet || 0, bba10 = p.stock_barril10_acero || 0
      totalSueltas += s; totalLatas += s + c12 * 12 + c24 * 24
      bp20 += bbp; ba20 += bba; bp10 += bbp10; ba10 += bba10; totalBbl += bbp + bba + bbp10 + bba10
      const pl = p[`precio_lata_${pk}`] || 0
      valorTotal += c12 * Math.round(pl * 12) + c24 * Math.round(pl * 24)
      valorTotal += bbp * (p[`precio_barril_pet_${pk}`] || 0) + bba * (p[`precio_barril_acero_${pk}`] || 0)
      valorTotal += bbp10 * (p[`precio_barril10_pet_${pk}`] || 0) + bba10 * (p[`precio_barril10_acero_${pk}`] || 0)
    })
    return { totalLatas, totalSueltas, totalBbl, bp20, ba20, bp10, ba10, valorTotal }
  }, [data, tipoPrecio])

  const allSel = filtered.length > 0 && filtered.every(p => selected.has(p.id))
  const someSel = filtered.some(p => selected.has(p.id))
  useEffect(() => { if (headerCheckRef.current) headerCheckRef.current.indeterminate = someSel && !allSel }, [someSel, allSel])
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(filtered.map(p => p.id)))
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const openModal = (ps: any[]) => { setModalProductos(ps); setModalOpen(true) }

  // ── Actions ──
  const openStockModal = (p: any) => {
    setStockForm(Object.fromEntries(STOCK_FIELDS.map(f => [f.key, p[f.key] || 0])))
    setStockMotivo(''); setStockError(''); setStockModalId(p.id); setMenuId(null)
  }
  const saveStock = async () => {
    if (!stockModalId) return; setStockSaving(true); setStockError('')
    const res = await fetch(`/api/admin/inventario/${stockModalId}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...stockForm, motivo: stockMotivo }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setStockError(d.error || 'Error'); setStockSaving(false); return }
    setData(prev => prev.map(p => p.id === stockModalId ? { ...p, ...stockForm } : p))
    setStockModalId(null); setStockSaving(false)
  }
  const handleBaja = async (id: string) => {
    setActionLoading(id); setMenuId(null)
    await fetch(`/api/admin/inventario/${id}/baja`, { method: 'POST' })
    setData(prev => prev.map(p => p.id === id ? { ...p, activo: false, descontinuado_at: new Date().toISOString() } : p))
    setActionLoading(null)
  }
  const handleReactivar = async (id: string) => {
    setActionLoading(id); setMenuId(null)
    await fetch(`/api/admin/inventario/${id}/reactivar`, { method: 'POST' })
    setData(prev => prev.map(p => p.id === id ? { ...p, activo: true, descontinuado_at: null } : p))
    setActionLoading(null)
  }
  const handleEliminar = async (id: string) => {
    if (!confirm('Eliminar este producto permanentemente?')) return
    setActionLoading(id); setMenuId(null)
    const res = await fetch(`/api/admin/inventario/${id}/eliminar`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Error'); setActionLoading(null); return }
    setData(prev => prev.filter(p => p.id !== id))
    setActionLoading(null)
  }

  const priceStatus = (p: any): 'none' | 'mayorista' | 'ok' => {
    let mp = false, mt = false
    if ((p.stock_caja24 || 0) > 0 || (p.stock_caja12 || 0) > 0 || (p.stock_latas || 0) > 0) { if (!p.precio_lata_publico) mp = true; if (!p.precio_lata_taproom) mt = true }
    if ((p.stock_barril_pet || 0) > 0) { if (!p.precio_barril_pet_publico) mp = true; if (!p.precio_barril_pet_taproom) mt = true }
    if ((p.stock_barril_acero || 0) > 0) { if (!p.precio_barril_acero_publico) mp = true; if (!p.precio_barril_acero_taproom) mt = true }
    return mp ? 'none' : mt ? 'mayorista' : 'ok'
  }
  const missingAll = useMemo(() => data.filter(p => p.activo && priceStatus(p) === 'none'), [data])
  const missingMayo = useMemo(() => data.filter(p => p.activo && priceStatus(p) === 'mayorista'), [data])
  const hasAlert = missingAll.length > 0 || missingMayo.length > 0

  const priceTooltip = (p: any): string => {
    const lp = p.precio_lata_publico || 0, lt = p.precio_lata_taproom || 0
    return [`Lata: $${lp || '—'} / $${lt || '—'}`, `Caja 12: $${lp ? Math.round(lp * 12) : '—'} / $${lt ? Math.round(lt * 12) : '—'}`,
      `Caja 24: $${lp ? Math.round(lp * 24) : '—'} / $${lt ? Math.round(lt * 24) : '—'}`,
      `Bbl 20L PET: $${p.precio_barril_pet_publico || '—'} / $${p.precio_barril_pet_taproom || '—'}`,
      `Bbl 20L Acero: $${p.precio_barril_acero_publico || '—'} / $${p.precio_barril_acero_taproom || '—'}`].join('\n')
  }

  const pillAct = { background: 'var(--brand-primary, #E8531D)', color: '#fff', border: '1px solid var(--brand-primary, #E8531D)' }
  const pillIn = { background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db' }

  const bblStr = (pet: number, acero: number) => {
    if (pet === 0 && acero === 0) return '—'
    const parts = []
    if (pet > 0) parts.push(`${pet}P`)
    if (acero > 0) parts.push(`${acero}A`)
    return parts.join(' · ')
  }

  return (
    <div>
      <style>{`
        @media (max-width: 768px) { .inv-table { display: none; } .inv-cards { display: flex !important; } .inv-kpi { grid-template-columns: 1fr !important; } }
        @media (min-width: 769px) { .inv-cards { display: none !important; } }
      `}</style>

      {/* TOPBAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Inventario</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>{data.filter(p => p.activo).length} productos activos</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex' }}>
            {(['mayorista', 'minorista'] as TipoPrecio[]).map(t => (
              <button key={t} onClick={() => setTipoPrecio(t)} style={{ ...(tipoPrecio === t ? pillAct : pillIn), padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: t === 'mayorista' ? '7px 0 0 7px' : '0 7px 7px 0', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          <button onClick={() => { const ws = data.filter(p => p.activo && totalStock(p) > 0); if (ws.length) openModal(ws); }} style={{ padding: '8px 16px', background: 'var(--brand-primary, #E8531D)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Prompt WhatsApp
          </button>
          {canEdit && <a href="/admin/inventario/nuevo" style={{ padding: '8px 16px', background: 'var(--brand-primary, #E8531D)', color: '#fff', borderRadius: 7, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Nuevo producto</a>}
        </div>
      </div>

      {/* KPIs — 3 cards */}
      <div className="inv-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
          <p style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Latas totales</p>
          <p style={{ color: 'var(--brand-primary, #E8531D)', fontSize: 28, fontWeight: 700, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>{kpis.totalLatas.toLocaleString()}</p>
          <p style={{ color: '#9ca3af', fontSize: 11, margin: '2px 0 0' }}>de las cuales {kpis.totalSueltas.toLocaleString()} sueltas</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
          <p style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Barriles</p>
          <p style={{ color: '#f59e0b', fontSize: 28, fontWeight: 700, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>{kpis.totalBbl}</p>
          <p style={{ color: '#9ca3af', fontSize: 11, margin: '2px 0 0' }}>20L: {kpis.bp20} PET · {kpis.ba20} acero  |  10L: {kpis.bp10} PET · {kpis.ba10} acero</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
          <p style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Valor total</p>
          <p style={{ color: '#3b82f6', fontSize: 28, fontWeight: 700, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>${Math.round(kpis.valorTotal).toLocaleString('es-MX')}</p>
          <p style={{ color: '#9ca3af', fontSize: 11, margin: '2px 0 0' }}>MXN</p>
        </div>
      </div>

      {/* ALERT */}
      {hasAlert && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 18px', marginBottom: 16 }}>
          {missingAll.length > 0 && <p style={{ margin: '0 0 4px', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>{missingAll.length} sin precio — {missingAll.map((p, i) => <a key={p.id} href={`/admin/inventario/edit/${p.id}`} style={{ color: 'var(--brand-primary, #E8531D)', textDecoration: 'none' }}>{p.nombre}{i < missingAll.length - 1 ? ', ' : ''}</a>)}</p>}
          {missingMayo.length > 0 && <p style={{ margin: 0, color: '#d97706', fontSize: 12, fontWeight: 600 }}>{missingMayo.length} sin mayorista — {missingMayo.map((p, i) => <a key={p.id} href={`/admin/inventario/edit/${p.id}`} style={{ color: 'var(--brand-primary, #E8531D)', textDecoration: 'none' }}>{p.nombre}{i < missingMayo.length - 1 ? ', ' : ''}</a>)}</p>}
        </div>
      )}

      {/* FILTERS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {([['activos', 'Activos'], ['desc', 'Descontinuados'], ['todos', 'Todos']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilterEstado(k)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filterEstado === k ? '#1a1a1a' : '#f9fafb', color: filterEstado === k ? '#fff' : '#6b7280', border: '1px solid #e5e7eb', borderRadius: k === 'activos' ? '7px 0 0 7px' : k === 'todos' ? '0 7px 7px 0' : '0' }}>{l}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ flex: 1, minWidth: 160, background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 7, padding: '8px 12px', fontSize: 13, color: '#1a1a1a', outline: 'none' }} />
        <select value={estiloFilter} onChange={e => setEstiloFilter(e.target.value)} style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 7, padding: '8px 12px', fontSize: 13, color: '#1a1a1a', cursor: 'pointer', outline: 'none' }}>
          <option value="todos">Todos los estilos</option>
          {estilos.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#9ca3af', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} /> Solo con stock
        </label>
      </div>

      {/* SELECTION BAR */}
      {selected.size > 0 && (
        <div style={{ background: 'rgba(232,83,29,0.06)', border: '1px solid rgba(232,83,29,0.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--brand-primary, #E8531D)', fontWeight: 600, fontSize: 13 }}>{selected.size} seleccionado{selected.size > 1 ? 's' : ''} <span onClick={() => setSelected(new Set())} style={{ color: '#6b7280', textDecoration: 'underline', cursor: 'pointer', fontWeight: 400, marginLeft: 8 }}>Limpiar</span></span>
          <button onClick={() => openModal(filtered.filter(p => selected.has(p.id)))} style={{ background: 'var(--brand-primary, #E8531D)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>WhatsApp</button>
        </div>
      )}

      {/* TABLE — desktop */}
      <div className="inv-table" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            {/* Level 1 */}
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb', position: 'sticky', top: 0, zIndex: 2 }}>
              <th rowSpan={2} style={{ padding: '8px 10px', width: 36, position: 'sticky', left: 0, background: '#f9fafb', zIndex: 3 }}>
                <input ref={headerCheckRef} type="checkbox" checked={allSel} onChange={toggleAll} />
              </th>
              <th rowSpan={2} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 36, background: '#f9fafb', zIndex: 3, minWidth: 180 }}>Producto</th>
              <th colSpan={4} style={{ padding: '6px 10px', textAlign: 'center', color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #e5e7eb' }}>Latas</th>
              <th colSpan={2} style={{ padding: '6px 10px', textAlign: 'center', color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #e5e7eb', borderLeft: '1px solid #e5e7eb' }}>Barriles</th>
              <th rowSpan={2} style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Precio</th>
              <th rowSpan={2} style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado</th>
              <th rowSpan={2} style={{ padding: '8px 10px', width: 60 }}></th>
            </tr>
            {/* Level 2 */}
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb', position: 'sticky', top: 28, zIndex: 2 }}>
              {['Sueltas', 'Caja 12', 'Caja 24', 'Total'].map(h => <th key={h} style={{ padding: '4px 10px', textAlign: 'right', color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>)}
              <th style={{ padding: '4px 10px', textAlign: 'right', color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', fontWeight: 500, borderLeft: '1px solid #e5e7eb' }}>20L</th>
              <th style={{ padding: '4px 10px', textAlign: 'right', color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', fontWeight: 500 }}>10L</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((p: any) => {
              const sl = p.stock_latas || 0, c12 = p.stock_caja12 || 0, c24 = p.stock_caja24 || 0
              const tl = sl + c12 * 12 + c24 * 24
              const bp20 = p.stock_barril_pet || 0, ba20 = p.stock_barril_acero || 0
              const bp10 = p.stock_barril10_pet || 0, ba10 = p.stock_barril10_acero || 0
              const ps = priceStatus(p)
              const isZeroActive = p.activo && totalStock(p) === 0
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: !p.activo ? 0.5 : 1 }}>
                  <td style={{ padding: '10px 10px', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                  </td>
                  <td style={{ padding: '10px 12px', position: 'sticky', left: 36, background: '#fff', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                        : <div style={{ width: 40, height: 40, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8"><path d="M17 11h1a3 3 0 010 6h-1M9 12v6M13 12v6M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L18 8z"/></svg></div>}
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{p.nombre}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{p.estilo}{p.abv ? ` · ${p.abv}%` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...NS, color: stockColor(sl) }}>{sl}</td>
                  <td style={{ ...NS, color: stockColor(c12) }}>{c12}</td>
                  <td style={{ ...NS, color: stockColor(c24) }}>{c24}</td>
                  <td style={{ ...NS, color: tl > 0 ? '#1a1a1a' : '#9ca3af', fontWeight: 700 }} title={`${sl} sueltas + ${c12 * 12} en C12 + ${c24 * 24} en C24`}>{tl}</td>
                  <td style={{ ...NS, borderLeft: '1px solid #f3f4f6' }} title={`PET: ${bp20}, Acero: ${ba20}`}>
                    <span style={{ color: stockColor(bp20 + ba20) }}>{bblStr(bp20, ba20)}</span>
                  </td>
                  <td style={NS} title={`PET: ${bp10}, Acero: ${ba10}`}>
                    <span style={{ color: stockColor(bp10 + ba10) }}>{bblStr(bp10, ba10)}</span>
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', whiteSpace: 'nowrap' }} title={priceTooltip(p)}>
                    {ps === 'none' ? <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600 }}>Sin precio</span>
                      : ps === 'mayorista' ? <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600 }}>Falta may.</span>
                      : p.precio_lata_publico ? <span style={{ color: 'var(--brand-primary, #E8531D)', fontSize: 13, cursor: 'help', fontVariantNumeric: 'tabular-nums' }}>${Math.round(p.precio_lata_publico).toLocaleString('es-MX')}/lata</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                    {isZeroActive ? <span style={{ background: '#fee2e2', color: '#ef4444', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600 }}>Sin stock</span>
                      : !p.activo ? <span style={{ background: '#f3f4f6', color: '#9ca3af', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 500 }}>Descontinuado</span>
                      : <span style={{ background: '#d1fae5', color: '#10b981', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 500 }}>Activo</span>}
                  </td>
                  <td style={{ padding: '10px 10px', position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                      <button onClick={() => openModal([p])} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,211,102,0.1)', color: '#25D366', border: 'none', borderRadius: 5, cursor: 'pointer', padding: 0 }} title="WhatsApp">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.574-1.2A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                      </button>
                      {canEdit && (
                        <button onClick={e => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id) }} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                      )}
                    </div>
                    {menuId === p.id && canEdit && (
                      <div style={{ position: 'absolute', right: 10, top: 36, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 50, minWidth: 160 }}>
                        <a href={`/admin/inventario/edit/${p.id}`} style={{ display: 'block', padding: '9px 14px', fontSize: 13, color: '#374151', textDecoration: 'none' }}>Editar ficha</a>
                        <button onClick={() => openStockModal(p)} style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#374151', cursor: 'pointer' }}>Ajustar stock</button>
                        {p.activo ? (
                          <button onClick={() => handleBaja(p.id)} disabled={actionLoading === p.id} style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#d97706', cursor: 'pointer', borderTop: '1px solid #f3f4f6' }}>Dar de baja</button>
                        ) : (
                          <button onClick={() => handleReactivar(p.id)} disabled={actionLoading === p.id} style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#10b981', cursor: 'pointer', borderTop: '1px solid #f3f4f6' }}>Reactivar</button>
                        )}
                        {(() => { const cnt = pedidoCounts[p.id] || 0; return (
                          <button onClick={() => cnt === 0 && handleEliminar(p.id)} disabled={cnt > 0 || actionLoading === p.id}
                            title={cnt > 0 ? `Tiene ${cnt} pedidos, solo puede darse de baja` : 'Eliminar permanentemente'}
                            style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: cnt > 0 ? '#d1d5db' : '#ef4444', cursor: cnt > 0 ? 'not-allowed' : 'pointer', borderTop: '1px solid #f3f4f6' }}>
                            Eliminar{cnt > 0 ? ` (${cnt} pedidos)` : ''}
                          </button>
                        )})()}
                      </div>
                    )}
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={11} style={{ color: '#9ca3af', textAlign: 'center', padding: 60, fontSize: 14 }}>Sin productos</td></tr>}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="inv-cards" style={{ display: 'none', flexDirection: 'column', gap: 10 }}>
        {filtered.map((p: any) => {
          const sl = p.stock_latas || 0, c12 = p.stock_caja12 || 0, c24 = p.stock_caja24 || 0
          const bp = p.stock_barril_pet || 0, ba = p.stock_barril_acero || 0
          return (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', opacity: p.activo ? 1 : 0.5 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {p.imagen_url && <img src={p.imagen_url} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>{p.nombre}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{p.estilo}{p.abv ? ` · ${p.abv}%` : ''}</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[{ l: 'Sueltas', v: sl }, { l: 'C12', v: c12 }, { l: 'C24', v: c24 }, { l: 'Bbl', v: bp + ba }].map(s => (
                  <span key={s.l} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: s.v === 0 ? '#f3f4f6' : s.v <= 10 ? '#fef3c7' : '#d1fae5', color: stockColor(s.v) }}>{s.l}: {s.v}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Click outside to close menu */}
      {menuId && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setMenuId(null)} />}

      {/* Stock adjustment modal */}
      {stockModalId && (() => {
        const prod = data.find(p => p.id === stockModalId)
        if (!prod) return null
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setStockModalId(null)}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ color: '#1a1a1a', fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>Ajustar stock</h3>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 20px' }}>{prod.nombre}</p>

              {['latas', 'barriles'].map(group => (
                <div key={group} style={{ marginBottom: 16 }}>
                  <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{group === 'latas' ? 'Latas' : 'Barriles'}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: group === 'latas' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 10 }}>
                    {STOCK_FIELDS.filter(f => f.group === group).map(f => (
                      <div key={f.key}>
                        <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 4 }}>{f.label}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setStockForm(prev => ({ ...prev, [f.key]: Math.max(0, (prev[f.key] || 0) - 1) }))}
                            style={{ width: 28, height: 28, borderRadius: 6, background: '#f3f4f6', border: 'none', cursor: 'pointer', fontSize: 16, color: '#374151' }}>-</button>
                          <input type="number" value={stockForm[f.key] ?? 0} onChange={e => setStockForm(prev => ({ ...prev, [f.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                            style={{ flex: 1, padding: '6px 8px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 14, fontWeight: 600, textAlign: 'center', color: '#1a1a1a', outline: 'none', minHeight: 36 }} />
                          <button onClick={() => setStockForm(prev => ({ ...prev, [f.key]: (prev[f.key] || 0) + 1 }))}
                            style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--brand-primary, #E8531D)', border: 'none', cursor: 'pointer', fontSize: 16, color: '#fff' }}>+</button>
                        </div>
                        <p style={{ margin: '2px 0 0', color: '#d1d5db', fontSize: 10, textAlign: 'center' }}>antes: {prod[f.key] || 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ marginBottom: 16 }}>
                <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 4 }}>Motivo (opcional)</label>
                <input value={stockMotivo} onChange={e => setStockMotivo(e.target.value)} placeholder="Produccion, correccion, merma..."
                  style={{ width: '100%', padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#1a1a1a', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              {stockError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{stockError}</p>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setStockModalId(null)} style={{ padding: '9px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={saveStock} disabled={stockSaving} style={{ padding: '9px 20px', background: 'var(--brand-primary, #E8531D)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: stockSaving ? 0.6 : 1 }}>
                  {stockSaving ? 'Guardando...' : 'Guardar stock'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <WhatsAppModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setModalProductos([]) }} productos={modalProductos} tipoPrecio={tipoPrecio} />
    </div>
  )
}

function totalStock(p: any) { return (p.stock_caja12 || 0) + (p.stock_caja24 || 0) + (p.stock_barril_pet || 0) + (p.stock_barril_acero || 0) + (p.stock_barril10_pet || 0) + (p.stock_barril10_acero || 0) }

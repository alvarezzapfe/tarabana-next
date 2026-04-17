'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import WhatsAppModal from './WhatsAppModal'
import type { TipoPrecio } from '../../../src/lib/whatsappPrompt'

interface Props {
  productos: any[]
  isSuperAdmin: boolean
}

export default function InventarioClient({ productos, isSuperAdmin }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [soloConStock, setSoloConStock] = useState(false)
  const [estiloFilter, setEstiloFilter] = useState('todos')
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>('mayorista')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalProductos, setModalProductos] = useState<any[]>([])
  const headerCheckRef = useRef<HTMLInputElement>(null)

  const estilos = useMemo(() => {
    const set = new Set<string>()
    productos.forEach(p => { if (p.estilo) set.add(p.estilo) })
    return Array.from(set).sort()
  }, [productos])

  const filtered = useMemo(() => {
    return productos.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.nombre?.toLowerCase().includes(q) && !p.estilo?.toLowerCase().includes(q)) return false
      }
      if (soloConStock) {
        const total = (p.stock_caja12 || 0) + (p.stock_caja24 || 0) + (p.stock_barril_pet || 0) + (p.stock_barril_acero || 0)
        if (total === 0) return false
      }
      if (estiloFilter !== 'todos' && p.estilo !== estiloFilter) return false
      return true
    })
  }, [productos, search, soloConStock, estiloFilter])

  const kpis = useMemo(() => {
    let totalLatas = 0, totalBblPet = 0, totalBblAcero = 0, valorTotal = 0
    const pk = tipoPrecio === 'mayorista' ? 'publico' : 'taproom'
    productos.forEach(p => {
      const c12 = p.stock_caja12 || 0
      const c24 = p.stock_caja24 || 0
      const bp = p.stock_barril_pet || 0
      const ba = p.stock_barril_acero || 0
      totalLatas += c12 * 12 + c24 * 24
      totalBblPet += bp
      totalBblAcero += ba
      valorTotal += c12 * (p[`precio_caja12_${pk}`] || p[`precio_${pk === 'publico' ? 'publico' : 'taproom'}`] || 0)
      valorTotal += c24 * (p[`precio_caja24_${pk}`] || 0)
      valorTotal += bp * (p[`precio_barril_pet_${pk}`] || 0)
      valorTotal += ba * (p[`precio_barril_acero_${pk}`] || 0)
    })
    return { totalLatas, totalBblPet, totalBblAcero, valorTotal }
  }, [productos, tipoPrecio])

  // Sync header checkbox indeterminate state
  const filteredIds = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered])
  const allFilteredSelected = filtered.length > 0 && filtered.every((p: any) => selected.has(p.id))
  const someFilteredSelected = filtered.some((p: any) => selected.has(p.id))

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someFilteredSelected && !allFilteredSelected
    }
  }, [someFilteredSelected, allFilteredSelected])

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((p: any) => p.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openModalForSelection = () => {
    setModalProductos(filtered.filter((p: any) => selected.has(p.id)))
    setModalOpen(true)
  }

  const openModalForOne = (p: any) => {
    setModalProductos([p])
    setModalOpen(true)
  }

  const getPrice = (p: any) => {
    const pk = tipoPrecio === 'mayorista' ? 'publico' : 'taproom'
    const price = p[`precio_caja12_${pk}`] || p[`precio_${pk === 'publico' ? 'publico' : 'taproom'}`]
    return price ? '$' + Math.round(price).toLocaleString('es-MX') : '—'
  }

  const totalStock = (p: any) => (p.stock_caja12 || 0) + (p.stock_caja24 || 0) + (p.stock_barril_pet || 0) + (p.stock_barril_acero || 0)

  const pillActive = { background: '#E8531D', color: '#fff', border: '1px solid #E8531D' }
  const pillInactive = { background: 'transparent', color: '#777', border: '1px solid #2a2a2a' }

  return (
    <div>
      {/* TOPBAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Inventario</h1>
          <p style={{ color: '#555', fontSize: 13, margin: 0 }}>Stock listo para venta</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Precio toggle */}
          <div style={{ display: 'flex', gap: 0 }}>
            {(['mayorista', 'minorista'] as TipoPrecio[]).map(t => (
              <button key={t} onClick={() => setTipoPrecio(t)} style={{
                ...(tipoPrecio === t ? pillActive : pillInactive),
                padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                borderRadius: t === 'mayorista' ? '7px 0 0 7px' : '0 7px 7px 0',
                textTransform: 'capitalize',
              }}>{t}</button>
            ))}
          </div>
          <button onClick={() => {
            const withStock = productos.filter((p: any) => p.activo !== false && totalStock(p) > 0)
            if (withStock.length === 0) { alert('No hay productos con stock disponible'); return }
            setModalProductos(withStock)
            setModalOpen(true)
          }} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#E8531D', color: '#fff', padding: '10px 20px',
            borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            Generar prompt de inventario →
          </button>
          {isSuperAdmin && (
            <a href="/admin/inventario/nuevo" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#E8531D', color: '#fff', padding: '9px 18px',
              borderRadius: 7, textDecoration: 'none', fontSize: 13.5, fontWeight: 600
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              Nuevo producto
            </a>
          )}
        </div>
      </div>

      {/* KPI GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Latas en stock', value: kpis.totalLatas.toLocaleString(), unit: 'latas', color: '#E8531D' },
          { label: 'Barriles PET', value: kpis.totalBblPet.toString(), unit: 'uds', color: '#f59e0b' },
          { label: 'Barriles Acero', value: kpis.totalBblAcero.toString(), unit: 'uds', color: '#10b981' },
          { label: 'Valor total', value: '$' + Math.round(kpis.valorTotal).toLocaleString('es-MX'), unit: 'MXN', color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '18px 22px' }}>
            <p style={{ color: '#555', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 26, fontWeight: 700, margin: '6px 0 0' }}>{s.value} <span style={{ fontSize: 11, color: '#555', fontWeight: 400 }}>{s.unit}</span></p>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o estilo..."
          style={{ flex: 1, background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: '#ddd', outline: 'none' }}
        />
        <select
          value={estiloFilter}
          onChange={e => setEstiloFilter(e.target.value)}
          style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: '#ddd', cursor: 'pointer', minWidth: 160, outline: 'none' }}
        >
          <option value="todos">Todos los estilos</option>
          {estilos.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#999', cursor: 'pointer', padding: '9px 14px', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />
          Solo con stock
        </label>
      </div>

      {/* SELECTION BAR */}
      {selected.size > 0 && (
        <div style={{ background: 'rgba(232,83,29,0.08)', border: '1px solid rgba(232,83,29,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ color: '#E8531D', fontWeight: 600, fontSize: 14 }}>{selected.size} seleccionado{selected.size > 1 ? 's' : ''}</span>
            <span onClick={() => setSelected(new Set())} style={{ color: '#777', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Deseleccionar todos</span>
          </div>
          <button onClick={openModalForSelection} style={{ background: '#E8531D', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Generar WhatsApp →
          </button>
        </div>
      )}

      {/* TABLE */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', width: 36 }}>
                <input ref={headerCheckRef} type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
              </th>
              {['Producto', 'ABV', 'Caja 12', 'Caja 24', 'BblPET', 'BblAcero', 'Precio', 'Estado', ''].map(h => (
                <th key={h} style={{ color: '#444', fontSize: 10.5, textAlign: 'left', padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((p: any) => {
              const stock0 = totalStock(p) === 0
              return (
                <tr key={p.id} style={{
                  borderBottom: '1px solid #161616',
                  borderLeft: !p.activo ? '2px solid rgba(232,83,29,0.5)' : 'none',
                  opacity: stock0 ? 0.5 : 1,
                  transition: 'background 0.15s',
                }}>
                  <td style={{ padding: '12px 14px' }}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                        : <div style={{ width: 36, height: 36, background: '#1a1a1a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 16 }}>🍺</div>
                      }
                      <div>
                        <p style={{ color: '#ddd', margin: 0, fontSize: 13.5, fontWeight: 600 }}>{p.nombre}</p>
                        <p style={{ color: '#555', margin: 0, fontSize: 11.5 }}>{p.estilo}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#777', padding: '12px 14px', fontSize: 13 }}>{p.abv ? `${p.abv}%` : '—'}</td>
                  <td style={{ color: (p.stock_caja12 || 0) > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_caja12 || 0}</td>
                  <td style={{ color: (p.stock_caja24 || 0) > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_caja24 || 0}</td>
                  <td style={{ color: (p.stock_barril_pet || 0) > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_barril_pet || 0}</td>
                  <td style={{ color: (p.stock_barril_acero || 0) > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_barril_acero || 0}</td>
                  <td style={{ color: '#E8531D', padding: '12px 14px', fontSize: 13 }}>{getPrice(p)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      background: p.activo ? '#10b98118' : '#55555518',
                      color: p.activo ? '#10b981' : '#555',
                      padding: '3px 10px', borderRadius: 99, fontSize: 11
                    }}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => openModalForOne(p)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,211,102,0.1)', color: '#25D366', border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }} title="WhatsApp">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.574-1.2A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" /></svg>
                      </button>
                      {isSuperAdmin && (
                        <a href={`/admin/inventario/edit/${p.id}`} style={{ color: '#555', display: 'flex', alignItems: 'center' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan={10} style={{ color: '#444', textAlign: 'center', padding: 60, fontSize: 14 }}>No hay productos que coincidan con los filtros</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <WhatsAppModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setModalProductos([]) }}
        productos={modalProductos}
        tipoPrecio={tipoPrecio}
      />
    </div>
  )
}

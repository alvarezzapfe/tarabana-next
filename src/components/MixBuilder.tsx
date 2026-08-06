'use client'
import { useState } from 'react'

export interface MixProduct {
  id: string
  nombre: string
  imagen_url?: string
  stock_latas: number
  precio_por_lata: number // from precio_lata_* column
}

export interface MixResult {
  estilos: { producto_id: string; nombre: string; latas: number }[]
  precio: number // total price of the mix
}

interface Props {
  productos: MixProduct[]
  onAdd: (result: MixResult) => void
  onCancel?: () => void
  showCancel?: boolean
}

export default function MixBuilder({ productos, onAdd, onCancel, showCancel }: Props) {
  const [latas, setLatas] = useState<Record<string, number>>({})
  const total = Object.values(latas).reduce((s, n) => s + n, 0)

  const reset = () => setLatas({})

  const handleAdd = () => {
    if (total !== 24) return
    const estilos = Object.entries(latas).filter(([_, n]) => n > 0).map(([id, n]) => {
      const p = productos.find(pr => pr.id === id)!
      return { producto_id: id, nombre: p.nombre, latas: n }
    })
    const precio = Math.round(estilos.reduce((s, e) => {
      const p = productos.find(pr => pr.id === e.producto_id)!
      return s + p.precio_por_lata * e.latas
    }, 0))
    onAdd({ estilos, precio })
    reset()
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ margin: 0, color: '#374151', fontSize: 14, fontWeight: 600 }}>{total} de 24 latas</p>
          {total === 24 && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>Listo</span>}
        </div>
        <div style={{ height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min((total / 24) * 100, 100)}%`, background: '#E8531D', borderRadius: 99, transition: 'width 0.2s' }} />
        </div>
      </div>

      {/* Product rows */}
      <div className="portal-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 20 }}>
        {productos.map(p => {
          const count = latas[p.id] || 0
          const canAdd = total < 24 && count < p.stock_latas
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', borderRadius: 10, padding: '10px 14px' }}>
              {p.imagen_url && <img src={p.imagen_url} alt={p.nombre} style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>${p.precio_por_lata.toLocaleString('es-MX')}/lata · {p.stock_latas} disp.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setLatas(prev => { const next = { ...prev }; if ((next[p.id] || 0) <= 1) delete next[p.id]; else next[p.id]--; return next })}
                  disabled={count === 0}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: count > 0 ? '#f3f4f6' : '#fafafa', border: 'none', cursor: count > 0 ? 'pointer' : 'default', fontSize: 16, color: count > 0 ? '#374151' : '#d1d5db' }}>-</button>
                <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: 'center', color: count > 0 ? '#111' : '#d1d5db' }}>{count}</span>
                <button onClick={() => { if (canAdd) setLatas(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 })) }}
                  disabled={!canAdd}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: !canAdd ? '#fafafa' : '#E8531D', border: 'none', cursor: !canAdd ? 'not-allowed' : 'pointer', fontSize: 16, color: !canAdd ? '#d1d5db' : '#fff' }}>+</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Price breakdown */}
      {total > 0 && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>Precio estimado:</span>
            <span style={{ color: '#E8531D', fontSize: 20, fontWeight: 700 }}>
              ${Math.round(Object.entries(latas).reduce((s, [id, n]) => {
                const p = productos.find(pr => pr.id === id)
                return s + (p ? p.precio_por_lata * n : 0)
              }, 0)).toLocaleString('es-MX')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(latas).filter(([_, n]) => n > 0).map(([id, n]) => {
              const p = productos.find(pr => pr.id === id)
              if (!p) return null
              return <p key={id} style={{ margin: 0, color: '#9ca3af', fontSize: 12 }}>{p.nombre}: {n} x ${p.precio_por_lata.toLocaleString('es-MX')} = ${(p.precio_por_lata * n).toLocaleString('es-MX')}</p>
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        {showCancel && onCancel && (
          <button onClick={onCancel} style={{ padding: '10px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
        )}
        <button onClick={handleAdd} disabled={total !== 24}
          style={{ padding: '12px 28px', background: total === 24 ? '#E8531D' : '#e5e7eb', border: 'none', borderRadius: 8, color: total === 24 ? '#fff' : '#9ca3af', fontSize: 14, fontWeight: 600, cursor: total === 24 ? 'pointer' : 'not-allowed' }}>
          Agregar al pedido
        </button>
      </div>
    </div>
  )
}

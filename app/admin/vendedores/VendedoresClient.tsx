'use client'
import { useState } from 'react'
import { createClient } from '../../../src/lib/supabase'

const tipos = ['interno', 'externo', 'distribuidor']
const emptyForm = { nombre: '', email: '', telefono: '', tipo: 'externo', comision_pct: 10, notas: '' }

export default function VendedoresClient({ vendedores: init, comisiones, isSuperAdmin }: any) {
  const [vendedores, setVendedores] = useState(init)
  const [form, setForm] = useState<any>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const supabase = createClient()
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const getStats = (vendedorId: string) => {
    const vComisiones = comisiones.filter((c: any) => c.vendedor_id === vendedorId)
    const total = vComisiones.reduce((s: number, c: any) => s + (c.monto_comision || 0), 0)
    const pagado = vComisiones.filter((c: any) => c.pagada).reduce((s: number, c: any) => s + (c.monto_comision || 0), 0)
    return { total, pagado, pendiente: total - pagado, count: vComisiones.length }
  }

  const handleSave = async () => {
    if (!form.nombre) return
    setSaving(true)
    const payload = { nombre: form.nombre, email: form.email || null, telefono: form.telefono || null, tipo: form.tipo, comision_pct: parseFloat(form.comision_pct), notas: form.notas || null }
    if (editId) {
      const { data } = await supabase.from('vendedores').update(payload).eq('id', editId).select().single()
      if (data) setVendedores((prev: any) => prev.map((v: any) => v.id === editId ? data : v))
      setEditId(null)
    } else {
      const { data } = await supabase.from('vendedores').insert(payload).select().single()
      if (data) setVendedores((prev: any) => [data, ...prev])
    }
    setForm(emptyForm)
    setSaving(false)
  }

  const handleToggle = async (id: string, activo: boolean) => {
    await supabase.from('vendedores').update({ activo: !activo }).eq('id', id)
    setVendedores((prev: any) => prev.map((v: any) => v.id === id ? { ...v, activo: !activo } : v))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar vendedor?')) return
    setDeletingId(id)
    await supabase.from('vendedores').delete().eq('id', id)
    setVendedores((prev: any) => prev.filter((v: any) => v.id !== id))
    setDeletingId(null)
  }

  const handleEdit = (v: any) => {
    setEditId(v.id)
    setForm({ nombre: v.nombre, email: v.email || '', telefono: v.telefono || '', tipo: v.tipo, comision_pct: v.comision_pct, notas: v.notas || '' })
  }

  const inp = (label: string, key: string, placeholder = '', type = 'text') => (
    <div>
      <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' }} />
    </div>
  )

  const tipoColor: Record<string, string> = { interno: '#3b82f6', externo: '#f59e0b', distribuidor: '#10b981' }

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Vendedores</h1>
      <p style={{ color: '#555', fontSize: 13, marginBottom: 28 }}>Gestión de fuerza de ventas y distribuidores</p>

      {isSuperAdmin && (
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24, marginBottom: 28 }}>
          <p style={{ color: '#E8531D', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>{editId ? 'Editar vendedor' : 'Nuevo vendedor'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {inp('Nombre *', 'nombre', 'Juan Pérez')}
            {inp('Email', 'email', 'juan@ejemplo.com', 'email')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            {inp('Teléfono', 'telefono', '+52 55 0000 0000')}
            <div>
              <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {tipos.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Comisión %</label>
              <input type="number" step="0.5" min="0" max="100" value={form.comision_pct} onChange={e => set('comision_pct', e.target.value)}
                style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#E8531D', fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notas</label>
            <input value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Zona, condiciones especiales..."
              style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {editId && <button onClick={() => { setEditId(null); setForm(emptyForm) }} style={{ padding: '11px 20px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#555', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>}
            <button onClick={handleSave} disabled={saving || !form.nombre} style={{ flex: 1, padding: '11px', background: form.nombre ? '#E8531D' : '#1a1a1a', border: 'none', borderRadius: 8, color: form.nombre ? '#fff' : '#444', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : editId ? 'Guardar cambios' : '+ Agregar vendedor'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {vendedores.length === 0 && <p style={{ color: '#444', fontSize: 14 }}>Sin vendedores — agrega el primero</p>}
        {vendedores.map((v: any) => {
          const stats = getStats(v.id)
          return (
            <div key={v.id} style={{ background: '#111', border: `1px solid ${v.activo ? '#1e1e1e' : '#0f0f0f'}`, borderRadius: 12, padding: 20, opacity: v.activo ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{v.nombre}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${tipoColor[v.tipo]}20`, color: tipoColor[v.tipo], textTransform: 'capitalize' }}>{v.tipo}</span>
                  </div>
                  {v.email && <div style={{ color: '#555', fontSize: 12 }}>{v.email}</div>}
                  {v.telefono && <div style={{ color: '#555', fontSize: 12 }}>{v.telefono}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#E8531D', fontSize: 20, fontWeight: 700 }}>{v.comision_pct}%</div>
                  <div style={{ color: '#333', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>comisión</div>
                </div>
              </div>

              {/* Stats comisiones */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14, padding: '12px', background: '#0f0f0f', borderRadius: 8 }}>
                {[
                  { label: 'Pedidos', value: stats.count, color: '#3b82f6' },
                  { label: 'Total comisión', value: `$${stats.total.toLocaleString('es-MX')}`, color: '#E8531D' },
                  { label: 'Por pagar', value: `$${stats.pendiente.toLocaleString('es-MX')}`, color: '#f59e0b' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.value}</div>
                    <div style={{ color: '#333', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {v.notas && <div style={{ color: '#444', fontSize: 11, marginBottom: 12, fontStyle: 'italic' }}>{v.notas}</div>}

              {isSuperAdmin && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleEdit(v)} style={{ flex: 1, padding: '7px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#888', fontSize: 12, cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => handleToggle(v.id, v.activo)} style={{ flex: 1, padding: '7px', background: v.activo ? '#2a1010' : '#102a10', border: `1px solid ${v.activo ? '#ef444430' : '#10b98130'}`, borderRadius: 6, color: v.activo ? '#ef4444' : '#10b981', fontSize: 12, cursor: 'pointer' }}>
                    {v.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => handleDelete(v.id)} disabled={deletingId === v.id} style={{ padding: '7px 10px', background: '#1a0a0a', border: '1px solid #ef444430', borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
                    🗑
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

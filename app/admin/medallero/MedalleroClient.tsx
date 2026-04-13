'use client'
import { useState } from 'react'
import { createClient } from '../../../src/lib/supabase'

const competencias = ['Copa Cervecera del Pacífico', 'Copa Cerveza MX', 'Aro Rojo']
const medallaOpts = ['oro', 'plata', 'bronce']
const medallaColors: Record<string, string> = { oro: '#F0A030', plata: '#C0C8D0', bronce: '#C87040' }

const emptyForm = { competencia: '', cerveza: '', estilo: '', abv: '', ibu: '', medalla: 'oro', año: new Date().getFullYear() }

export default function MedalleroClient({ medallas: init }: { medallas: any[] }) {
  const [data, setData] = useState(init)
  const [form, setForm] = useState<any>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const supabase = createClient()

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.competencia || !form.cerveza || !form.medalla || !form.año) return
    setSaving(true)
    const payload = {
      competencia: form.competencia,
      cerveza: form.cerveza,
      estilo: form.estilo || null,
      abv: form.abv ? parseFloat(form.abv) : null,
      ibu: form.ibu ? parseInt(form.ibu) : null,
      medalla: form.medalla,
      año: parseInt(form.año),
    }
    if (editId) {
      const { data: updated } = await supabase.from('medallero').update(payload).eq('id', editId).select().single()
      if (updated) setData(prev => prev.map(m => m.id === editId ? updated : m))
      setEditId(null)
    } else {
      const { data: created } = await supabase.from('medallero').insert(payload).select().single()
      if (created) setData(prev => [created, ...prev])
    }
    setForm(emptyForm)
    setSaving(false)
  }

  const handleEdit = (m: any) => {
    setEditId(m.id)
    setForm({ competencia: m.competencia, cerveza: m.cerveza, estilo: m.estilo || '', abv: m.abv || '', ibu: m.ibu || '', medalla: m.medalla, año: m.año })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta medalla?')) return
    setDeletingId(id)
    await supabase.from('medallero').delete().eq('id', id)
    setData(prev => prev.filter(m => m.id !== id))
    setDeletingId(null)
  }

  const inp = (label: string, key: string, placeholder = '', type = 'text') => (
    <div>
      <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' }} />
    </div>
  )

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Medallero</h1>
      <p style={{ color: '#555', fontSize: 13, marginBottom: 28 }}>Gestión de reconocimientos en competencias</p>

      {/* Formulario */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24, marginBottom: 32 }}>
        <p style={{ color: '#E8531D', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>{editId ? 'Editar medalla' : 'Nueva medalla'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Competencia *</label>
            <select value={form.competencia} onChange={e => set('competencia', e.target.value)}
              style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: form.competencia ? '#fff' : '#555', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
              <option value="">— Selecciona —</option>
              {competencias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Medalla *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {medallaOpts.map(m => (
                <button key={m} onClick={() => set('medalla', m)} style={{ flex: 1, padding: '10px', background: form.medalla === m ? '#1e1e1e' : '#0f0f0f', border: `1.5px solid ${form.medalla === m ? medallaColors[m] : '#1e1e1e'}`, borderRadius: 8, cursor: 'pointer', color: form.medalla === m ? medallaColors[m] : '#555', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                  {m === 'oro' ? '🥇' : m === 'plata' ? '🥈' : '🥉'} {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {inp('Cerveza *', 'cerveza', 'Chula Vista')}
          {inp('Estilo', 'estilo', 'West Coast IPA')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
          {inp('ABV', 'abv', '6.8', 'number')}
          {inp('IBU', 'ibu', '62', 'number')}
          {inp('Año *', 'año', '2024', 'number')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {editId && (
            <button onClick={() => { setEditId(null); setForm(emptyForm) }} style={{ padding: '11px 20px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#555', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          )}
          <button onClick={handleSave} disabled={saving || !form.competencia || !form.cerveza || !form.año}
            style={{ flex: 1, padding: '11px', background: form.competencia && form.cerveza ? '#E8531D' : '#1a1a1a', border: 'none', borderRadius: 8, color: form.competencia && form.cerveza ? '#fff' : '#444', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : editId ? 'Guardar cambios' : '+ Agregar medalla'}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #161616' }}>
              {['Medalla', 'Cerveza', 'Estilo', 'ABV / IBU', 'Competencia', 'Año', 'Acciones'].map((h, i) => (
                <th key={i} style={{ color: '#3a3a3a', fontSize: 10.5, textAlign: 'left', padding: '10px 16px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={7} style={{ color: '#444', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>Sin medallas aún — agrega la primera</td></tr>
            ) : data.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #141414' }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, padding: '3px 10px', background: `${medallaColors[m.medalla]}20`, color: medallaColors[m.medalla], border: `1px solid ${medallaColors[m.medalla]}40`, borderRadius: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                    {m.medalla === 'oro' ? '🥇' : m.medalla === 'plata' ? '🥈' : '🥉'} {m.medalla}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#ddd', fontSize: 13, fontWeight: 600 }}>{m.cerveza}</td>
                <td style={{ padding: '12px 16px', color: '#555', fontSize: 12 }}>{m.estilo || '—'}</td>
                <td style={{ padding: '12px 16px', color: '#555', fontSize: 11, fontFamily: 'monospace' }}>{m.abv ? `${m.abv}%` : '—'} / {m.ibu ? `${m.ibu} IBU` : '—'}</td>
                <td style={{ padding: '12px 16px', color: '#555', fontSize: 12 }}>{m.competencia}</td>
                <td style={{ padding: '12px 16px', color: '#555', fontSize: 12, fontFamily: 'monospace' }}>{m.año}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleEdit(m)} style={{ padding: '5px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#888', fontSize: 11.5, cursor: 'pointer' }}>Editar</button>
                    <button onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} style={{ padding: '5px 12px', background: '#1a0a0a', border: '1px solid #ef444430', borderRadius: 6, color: '#ef4444', fontSize: 11.5, cursor: 'pointer', opacity: deletingId === m.id ? 0.5 : 1 }}>
                      {deletingId === m.id ? '...' : '🗑'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

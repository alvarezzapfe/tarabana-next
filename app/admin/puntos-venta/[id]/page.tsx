'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '../../../../src/lib/supabase'
import { TIPO_LABELS } from '../../../../src/lib/types/puntoVenta'
import type { TipoPuntoVenta } from '../../../../src/lib/types/puntoVenta'

export default function EditPuntoVentaPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: '', tipo: 'bar' as TipoPuntoVenta, direccion: '', ciudad: 'CDMX',
    zona: '', estado: 'CDMX', telefono: '', instagram: '', horario: '',
    notas: '', fecha_inicio: '', fecha_fin: '', orden: 0, imagen_url: '' as string | null,
  })
  const [imagen, setImagen] = useState<File | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('puntos_venta').select('*').eq('id', id).single()
      if (data) {
        setForm({
          nombre: data.nombre || '', tipo: data.tipo || 'bar',
          direccion: data.direccion || '', ciudad: data.ciudad || 'CDMX',
          zona: data.zona || '', estado: data.estado || 'CDMX',
          telefono: data.telefono || '', instagram: data.instagram || '',
          horario: data.horario || '', notas: data.notas || '',
          fecha_inicio: data.fecha_inicio || '', fecha_fin: data.fecha_fin || '',
          orden: data.orden || 0, imagen_url: data.imagen_url,
        })
      }
      setLoading(false)
    }
    load()
  }, [id])

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }))

  const inp = (label: string, key: string, opts?: { type?: string; placeholder?: string; required?: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: '#888', fontSize: 12, fontWeight: 500 }}>{label}{opts?.required && ' *'}</label>
      <input
        type={opts?.type || 'text'}
        value={(form as any)[key]}
        onChange={e => set(key, opts?.type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={opts?.placeholder}
        required={opts?.required}
        style={{
          background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
          padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none',
        }}
      />
    </div>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    let imagen_url = form.imagen_url

    if (imagen) {
      const supabase = createClient()
      const ext = imagen.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('puntos-venta-imgs')
        .upload(fileName, imagen)
      if (uploadErr) { setError('Error subiendo imagen: ' + uploadErr.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('puntos-venta-imgs').getPublicUrl(fileName)
      imagen_url = urlData.publicUrl
    }

    const res = await fetch(`/api/admin/puntos-venta/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, imagen_url }),
    })
    const json = await res.json()

    if (!res.ok) { setError(json.error || 'Error al guardar'); setSaving(false); return }
    router.push('/admin/puntos-venta')
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este punto de venta? Esta acción no se puede deshacer.')) return
    const res = await fetch(`/api/admin/puntos-venta/${id}`, { method: 'DELETE' })
    if (res.ok) { router.push('/admin/puntos-venta'); router.refresh() }
    else { const json = await res.json(); setError(json.error || 'Error al eliminar') }
  }

  if (loading) return <div style={{ color: '#555', padding: 40 }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Editar punto de venta</h1>

      {error && <div style={{ background: '#3a1515', border: '1px solid #E8531D', borderRadius: 8, padding: '12px 16px', color: '#ff6b6b', fontSize: 13, marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {inp('Nombre', 'nombre', { required: true })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#888', fontSize: 12, fontWeight: 500 }}>Tipo *</label>
          <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
            padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none',
          }}>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {inp('Dirección', 'direccion', { required: true })}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inp('Ciudad', 'ciudad', { required: true })}
          {inp('Zona', 'zona', { placeholder: 'Ej: Condesa, Roma Norte' })}
        </div>

        {inp('Estado', 'estado', { required: true })}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inp('Teléfono', 'telefono')}
          {inp('Instagram', 'instagram', { placeholder: '@handle' })}
        </div>

        {inp('Horario', 'horario', { placeholder: 'Lun–Sáb 13:00–23:00' })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#888', fontSize: 12, fontWeight: 500 }}>Notas</label>
          <textarea
            value={form.notas}
            onChange={e => set('notas', e.target.value)}
            rows={3}
            style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
              padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical',
            }}
          />
        </div>

        {form.tipo === 'evento' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {inp('Fecha inicio', 'fecha_inicio', { type: 'date' })}
            {inp('Fecha fin', 'fecha_fin', { type: 'date' })}
          </div>
        )}

        {inp('Orden', 'orden', { type: 'number' })}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#888', fontSize: 12, fontWeight: 500 }}>Imagen</label>
          {form.imagen_url && (
            <img src={form.imagen_url} alt="Imagen actual" style={{
              width: 120, height: 80, objectFit: 'cover', borderRadius: 8,
              border: '1px solid #2a2a2a', marginBottom: 8,
            }} />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={e => setImagen(e.target.files?.[0] || null)}
            style={{ color: '#888', fontSize: 13 }}
          />
          {form.imagen_url && <p style={{ color: '#555', fontSize: 11, margin: 0 }}>Sube una nueva imagen para reemplazar la actual</p>}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={saving} style={{
              background: '#E8531D', color: '#fff', border: 'none', padding: '12px 28px',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            <a href="/admin/puntos-venta" style={{
              color: '#666', padding: '12px 20px', fontSize: 14, textDecoration: 'none',
              display: 'flex', alignItems: 'center',
            }}>Cancelar</a>
          </div>
          <button type="button" onClick={handleDelete} style={{
            background: 'transparent', color: '#ef4444', border: '1px solid #ef444440',
            padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            cursor: 'pointer',
          }}>Eliminar</button>
        </div>
      </form>
    </div>
  )
}

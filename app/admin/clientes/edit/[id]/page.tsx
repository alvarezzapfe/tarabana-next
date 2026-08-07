'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../../src/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import ClienteForm, { type ClienteData } from '../../../../../src/components/ClienteForm'
import { NIVELES_PRECIO } from '../../../../../src/lib/clientes'
import { type DireccionData } from '../../../../../src/components/DireccionForm'

export default function EditClientePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [initial, setInitial] = useState<Partial<ClienteData>>({})
  const [legacyAddr, setLegacyAddr] = useState<string | null>(null)
  const [nivelPrecio, setNivelPrecio] = useState('publico')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
      if (!data) { router.push('/admin/clientes'); return }
      setInitial({
        tipo_persona_registro: data.tipo_persona_registro || '',
        nombre_pila: data.nombre_pila || (data.full_name?.split(' ')[0]) || '',
        apellido_paterno: data.apellido_paterno || (data.full_name?.split(' ')[1]) || '',
        apellido_materno: data.apellido_materno || (data.full_name?.split(' ')[2]) || '',
        razon_social: data.razon_social || '', marca_negocio: data.marca_negocio || '', contacto_nombre: data.contacto_nombre || '',
        email: data.email || '', phone: data.phone?.replace(/^\+52/, '') || '', tipo_consumidor: data.tipo_consumidor || '',
        direccion: { cp: data.cp || '', colonia: data.colonia || '', municipio: data.municipio || '', estado: data.estado || '', calle: data.calle || '', num_ext: data.num_ext || '', num_int: data.num_int || '', referencias: data.referencias || '' },
        requiere_factura: data.requiere_factura || false, rfc: data.rfc || '', regimen_fiscal: data.regimen_fiscal || '', uso_cfdi: data.uso_cfdi || '', cp_fiscal: data.cp_fiscal || '',
      })
      if (data.direccion_entrega && !data.calle) setLegacyAddr(data.direccion_entrega)
      setNivelPrecio(data.nivel_precio || 'publico')
      setNotas(data.notas || '')
      setLoading(false)
    }
    load()
  }, [id])

  const handleSave = async (data: ClienteData & { full_name: string }) => {
    setSaving(true)
    const res = await fetch(`/api/admin/clientes/${id}/actualizar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: data.full_name,
        email: data.email,
        tipo_persona_registro: data.tipo_persona_registro || null,
        nombre_pila: data.nombre_pila || null, apellido_paterno: data.apellido_paterno || null, apellido_materno: data.apellido_materno || null,
        razon_social: data.razon_social || null, marca_negocio: data.marca_negocio || null, contacto_nombre: data.contacto_nombre || null,
        phone: data.phone ? data.phone.replace(/\D/g, '') : null,
        tipo_consumidor: data.tipo_consumidor,
        ...data.direccion,
        direccion_entrega: [data.direccion.calle, data.direccion.num_ext].filter(Boolean).join(' ') || null,
        ciudad: data.direccion.municipio || null,
        requiere_factura: data.requiere_factura,
        rfc: data.requiere_factura ? data.rfc : null,
        regimen_fiscal: data.requiere_factura ? data.regimen_fiscal : null,
        uso_cfdi: data.requiere_factura ? data.uso_cfdi : null,
        cp_fiscal: data.requiere_factura ? data.cp_fiscal : null,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) return { error: d.error || 'Error al guardar' }
    router.push('/admin/clientes'); router.refresh()
    return {}
  }

  if (loading) return <div style={{ padding: '36px 40px' }}><p style={{ color: '#9ca3af' }}>Cargando...</p></div>

  return (
    <div style={{ padding: '36px 40px', maxWidth: 720, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <a href="/admin/clientes" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Clientes
        </a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <h1 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>Editar cliente</h1>
      </div>

      <ClienteForm
        initial={initial}
        legacyAddress={legacyAddr}
        onSave={handleSave}
        saving={saving}
        submitLabel="Guardar cambios"
        adminExtras={
          <div>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Notas internas</p>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Horarios, contacto en sitio..."
              style={{ width: '100%', padding: '12px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 9, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, resize: 'none', outline: 'none' }} />
          </div>
        }
      />
    </div>
  )
}

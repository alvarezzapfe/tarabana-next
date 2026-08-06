'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ClienteForm, { type ClienteData } from '../../../../src/components/ClienteForm'
import { NIVELES_PRECIO } from '../../../../src/lib/clientes'

export default function NuevoClientePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [nivelPrecio, setNivelPrecio] = useState('publico')
  const [notas, setNotas] = useState('')

  const handleSave = async (data: ClienteData & { full_name: string }) => {
    setSaving(true)
    const res = await fetch('/api/admin/clientes/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: data.full_name,
        nombre_pila: data.nombre_pila, apellido_paterno: data.apellido_paterno, apellido_materno: data.apellido_materno,
        razon_social: data.razon_social, marca_negocio: data.marca_negocio, contacto_nombre: data.contacto_nombre,
        tipo_persona_registro: data.tipo_persona_registro,
        email: data.email, phone: data.phone ? data.phone.replace(/\D/g, '') : null,
        tipo: data.tipo_consumidor, nivel_precio: nivelPrecio,
        requiere_factura: data.requiere_factura, rfc: data.rfc || null,
        razon_social_fiscal: data.requiere_factura ? data.razon_social : null,
        uso_cfdi: data.uso_cfdi || null, regimen_fiscal: data.regimen_fiscal || null, cp_fiscal: data.cp_fiscal || null,
        ...data.direccion,
        direccion_entrega: [data.direccion.calle, data.direccion.num_ext].filter(Boolean).join(' ') || null,
        ciudad: data.direccion.municipio || null,
        notas,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) return { error: d.error || 'Error al crear cliente' }
    router.push('/admin/clientes'); router.refresh()
    return {}
  }

  return (
    <div style={{ padding: '36px 40px', maxWidth: 720, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <a href="/admin/clientes" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Clientes
        </a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <h1 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>Nuevo cliente</h1>
      </div>

      <ClienteForm
        onSave={handleSave}
        saving={saving}
        submitLabel="Crear cliente"
        adminExtras={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Nivel de precio</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {NIVELES_PRECIO.map(n => (
                  <button key={n.value} onClick={() => setNivelPrecio(n.value)} style={{
                    flex: 1, padding: '10px', background: nivelPrecio === n.value ? '#1e1e1e' : '#f9fafb',
                    border: `1.5px solid ${nivelPrecio === n.value ? '#E8531D' : '#e5e7eb'}`,
                    borderRadius: 8, cursor: 'pointer', color: nivelPrecio === n.value ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 500,
                  }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{n.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.7 }}>{n.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notas internas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Horarios, contacto en sitio, observaciones..."
                style={{ width: '100%', padding: '12px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 9, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, resize: 'none', outline: 'none' }} />
            </div>
          </div>
        }
      />
    </div>
  )
}

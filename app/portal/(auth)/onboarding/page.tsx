'use client'
import { useState } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'
import ClienteForm, { type ClienteData } from '../../../../src/components/ClienteForm'

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  const handleSave = async (data: ClienteData & { full_name: string }) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return { error: 'No autorizado' } }

    const { error } = await supabase.from('profiles').update({
      full_name: data.full_name,
      nombre_pila: data.nombre_pila || null,
      apellido_paterno: data.apellido_paterno || null,
      apellido_materno: data.apellido_materno || null,
      razon_social: data.razon_social || null,
      marca_negocio: data.marca_negocio || null,
      contacto_nombre: data.contacto_nombre || null,
      tipo_persona_registro: data.tipo_persona_registro || null,
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
      onboarding_completo: true,
    }).eq('id', user.id)

    setSaving(false)
    if (error) return { error: error.message }
    router.push('/portal/catalogo')
    router.refresh()
    return {}
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        width: 340, background: '#0a0a0a', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 36px', position: 'fixed', height: '100vh'
      }}>
        <div>
          <img src="/logo-blanco.png" alt="Tarabana" style={{ height: 52, marginBottom: 40 }} />
          <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Bienvenido</h2>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.7 }}>Cuentanos un poco sobre ti para personalizar tu experiencia.</p>
        </div>
        <p style={{ color: '#333', fontSize: 12 }}>Solo toma un minuto</p>
      </div>

      <div style={{ marginLeft: 340, flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <ClienteForm onSave={handleSave} saving={saving} submitLabel="Entrar al portal" />
        </div>
      </div>

      <style>{`@media (max-width: 768px) {
        .onb-sidebar { display: none !important; }
        .onb-main { margin-left: 0 !important; padding: 24px 20px !important; }
      }`}</style>
    </div>
  )
}

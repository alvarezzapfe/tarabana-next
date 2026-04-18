'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../../src/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

const estilos = ['IPA', 'Double IPA', 'Session IPA', 'Lager', 'Stout', 'Porter', 'Wheat', 'Sour', 'Pale Ale', 'Amber Ale', 'Otro']

export default function EditProductoPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [form, setForm] = useState({
    nombre: '', estilo: '', abv: '', ibu: '', descripcion: '', descripcion_larga: '',
    precio_caja12_publico: '', precio_caja12_taproom: '',
    precio_caja24_publico: '', precio_caja24_taproom: '',
    precio_barril_pet_publico: '', precio_barril_pet_taproom: '',
    precio_barril_acero_publico: '', precio_barril_acero_taproom: '',
    precio_barril10_pet_publico: '', precio_barril10_pet_taproom: '',
    precio_barril10_acero_publico: '', precio_barril10_acero_taproom: '',
    stock_caja12: '0', stock_caja24: '0', stock_barril_pet: '0', stock_barril_acero: '0',
    stock_barril10_pet: '0', stock_barril10_acero: '0',
    activo: true, imagen_url: '',
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setUserRole(profile?.role || '')
      if (!['super_admin', 'produccion'].includes(profile?.role || '')) { router.push('/admin/inventario'); return }

      const { data: p } = await supabase.from('productos').select('*').eq('id', id).single()
      if (!p) { router.push('/admin/inventario'); return }

      setImgPreview(p.imagen_url || null)
      setForm({
        nombre: p.nombre || '', estilo: p.estilo || '',
        abv: p.abv?.toString() || '', ibu: p.ibu?.toString() || '',
        descripcion: p.descripcion || '', descripcion_larga: p.descripcion_larga || '',
        precio_caja12_publico: p.precio_caja12_publico?.toString() || '',
        precio_caja12_taproom: p.precio_caja12_taproom?.toString() || '',
        precio_caja24_publico: p.precio_caja24_publico?.toString() || '',
        precio_caja24_taproom: p.precio_caja24_taproom?.toString() || '',
        precio_barril_pet_publico: p.precio_barril_pet_publico?.toString() || '',
        precio_barril_pet_taproom: p.precio_barril_pet_taproom?.toString() || '',
        precio_barril_acero_publico: p.precio_barril_acero_publico?.toString() || '',
        precio_barril_acero_taproom: p.precio_barril_acero_taproom?.toString() || '',
        precio_barril10_pet_publico: p.precio_barril10_pet_publico?.toString() || '',
        precio_barril10_pet_taproom: p.precio_barril10_pet_taproom?.toString() || '',
        precio_barril10_acero_publico: p.precio_barril10_acero_publico?.toString() || '',
        precio_barril10_acero_taproom: p.precio_barril10_acero_taproom?.toString() || '',
        stock_caja12: p.stock_caja12?.toString() || '0',
        stock_caja24: p.stock_caja24?.toString() || '0',
        stock_barril_pet: p.stock_barril_pet?.toString() || '0',
        stock_barril_acero: p.stock_barril_acero?.toString() || '0',
        stock_barril10_pet: p.stock_barril10_pet?.toString() || '0',
        stock_barril10_acero: p.stock_barril10_acero?.toString() || '0',
        activo: p.activo ?? true, imagen_url: p.imagen_url || '',
      })
      setLoading(false)
    }
    load()
  }, [id])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    setSaving(true)
    let imagen_url = form.imagen_url

    if (imgFile) {
      const ext = imgFile.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('productos').upload(path, imgFile, { contentType: imgFile.type })
      if (uploadError) { alert('Error subiendo imagen: ' + uploadError.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
      imagen_url = publicUrl
    }

    const isSuperAdmin = userRole === 'super_admin'

    const updateData: any = {
      stock_caja12: parseInt(form.stock_caja12) || 0,
      stock_caja24: parseInt(form.stock_caja24) || 0,
      stock_barril_pet: parseInt(form.stock_barril_pet) || 0,
      stock_barril_acero: parseInt(form.stock_barril_acero) || 0,
      stock_barril10_pet: parseInt(form.stock_barril10_pet) || 0,
      stock_barril10_acero: parseInt(form.stock_barril10_acero) || 0,
      stock_latas: (parseInt(form.stock_caja12) || 0) * 12 + (parseInt(form.stock_caja24) || 0) * 24,
      stock_barriles: (parseInt(form.stock_barril_pet) || 0) + (parseInt(form.stock_barril_acero) || 0),
    }

    if (isSuperAdmin) {
      Object.assign(updateData, {
        nombre: form.nombre, estilo: form.estilo,
        abv: form.abv ? parseFloat(form.abv) : null,
        ibu: form.ibu ? parseInt(form.ibu) : null,
        descripcion: form.descripcion, descripcion_larga: form.descripcion_larga,
        imagen_url,
        precio_publico: parseFloat(form.precio_caja12_publico) || 0,
        precio_taproom: parseFloat(form.precio_caja12_taproom) || 0,
        precio_caja12_publico: parseFloat(form.precio_caja12_publico) || null,
        precio_caja12_taproom: parseFloat(form.precio_caja12_taproom) || null,
        precio_caja24_publico: parseFloat(form.precio_caja24_publico) || null,
        precio_caja24_taproom: parseFloat(form.precio_caja24_taproom) || null,
        precio_barril_pet_publico: parseFloat(form.precio_barril_pet_publico) || null,
        precio_barril_pet_taproom: parseFloat(form.precio_barril_pet_taproom) || null,
        precio_barril_acero_publico: parseFloat(form.precio_barril_acero_publico) || null,
        precio_barril_acero_taproom: parseFloat(form.precio_barril_acero_taproom) || null,
        precio_barril10_pet_publico: parseFloat(form.precio_barril10_pet_publico) || null,
        precio_barril10_pet_taproom: parseFloat(form.precio_barril10_pet_taproom) || null,
        precio_barril10_acero_publico: parseFloat(form.precio_barril10_acero_publico) || null,
        precio_barril10_acero_taproom: parseFloat(form.precio_barril10_acero_taproom) || null,
        activo: form.activo,
      })
    }

    const { error } = await supabase.from('productos').update(updateData).eq('id', id)
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    router.push('/admin/inventario')
    router.refresh()
  }

  const inp = (label: string, key: string, placeholder = '', type = 'text', disabled = false) => (
    <div>
      <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <input type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)}
        placeholder={placeholder} disabled={disabled}
        style={{ width: '100%', padding: '10px 12px', background: disabled ? '#141414' : '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: disabled ? '#444' : '#fff', fontSize: 13.5, boxSizing: 'border-box' as const }}
      />
    </div>
  )

  const priceRow = (label: string, pubKey: string, tapKey: string, disabled = false) => (
    <div>
      <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 4 }}>Precio público</label>
          <input type="number" value={(form as any)[pubKey]} onChange={e => set(pubKey, e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '9px 12px', background: disabled ? '#141414' : '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: disabled ? '#444' : '#fff', fontSize: 13.5, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 4 }}>Precio taproom</label>
          <input type="number" value={(form as any)[tapKey]} onChange={e => set(tapKey, e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '9px 12px', background: disabled ? '#141414' : '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: disabled ? '#444' : '#f59e0b', fontSize: 13.5, boxSizing: 'border-box' as const }} />
        </div>
      </div>
    </div>
  )

  const isSuperAdmin = userRole === 'super_admin'
  const isProduccion = userRole === 'produccion'

  if (loading) return <div style={{ padding: 60, color: '#555', textAlign: 'center' }}>Cargando...</div>

  return (
    <div style={{ padding: '36px 40px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <a href="/admin/inventario" style={{ color: '#555', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Inventario
        </a>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Editar producto</h1>
        {isProduccion && (
          <span style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: 11, padding: '3px 10px', borderRadius: 99 }}>Solo puedes editar stock</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Columna izq */}
        <div>
          <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Foto</label>
          <div onClick={() => isSuperAdmin && document.getElementById('img-upload')?.click()}
            style={{
              width: '100%', aspectRatio: '1', background: '#111', border: '2px dashed #2a2a2a',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isSuperAdmin ? 'pointer' : 'default', overflow: 'hidden'
            }}>
            {imgPreview
              ? <img src={imgPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <p style={{ color: '#444', fontSize: 12 }}>Sin foto</p>
            }
          </div>
          {isSuperAdmin && <input id="img-upload" type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />}

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inp('ABV %', 'abv', '5.5', 'number', !isSuperAdmin)}
            {inp('IBU', 'ibu', '45', 'number', !isSuperAdmin)}
          </div>

          {isSuperAdmin && (
            <div style={{ marginTop: 12 }}>
              <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => set('activo', !form.activo)} style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: form.activo ? '#10b981' : '#333', position: 'relative', transition: 'all 0.2s'
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.activo ? 23 : 3, transition: 'all 0.2s' }} />
                </button>
                <span style={{ color: form.activo ? '#10b981' : '#555', fontSize: 13 }}>{form.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Columna der */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {inp('Nombre', 'nombre', '', 'text', !isSuperAdmin)}

          <div>
            <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Estilo</label>
            <select value={form.estilo} onChange={e => set('estilo', e.target.value)} disabled={!isSuperAdmin}
              style={{ width: '100%', padding: '10px 12px', background: !isSuperAdmin ? '#141414' : '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: form.estilo ? '#fff' : '#555', fontSize: 13.5, boxSizing: 'border-box' as const }}>
              {estilos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {inp('Descripción corta', 'descripcion', '', 'text', !isSuperAdmin)}
          
          {isSuperAdmin && (
            <div>
              <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Descripción larga</label>
              <textarea value={form.descripcion_larga} onChange={e => set('descripcion_larga', e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#fff', fontSize: 13.5, boxSizing: 'border-box' as const, resize: 'vertical' }} />
            </div>
          )}

          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
            <p style={{ color: '#E8531D', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Precios</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {priceRow('Caja 12 latas', 'precio_caja12_publico', 'precio_caja12_taproom', !isSuperAdmin)}
              {priceRow('Caja 24 latas', 'precio_caja24_publico', 'precio_caja24_taproom', !isSuperAdmin)}
              {priceRow('Barril 20L PET', 'precio_barril_pet_publico', 'precio_barril_pet_taproom', !isSuperAdmin)}
              {priceRow('Barril 20L Acero', 'precio_barril_acero_publico', 'precio_barril_acero_taproom', !isSuperAdmin)}
              {priceRow('Barril 10L PET', 'precio_barril10_pet_publico', 'precio_barril10_pet_taproom', !isSuperAdmin)}
              {priceRow('Barril 10L Acero', 'precio_barril10_acero_publico', 'precio_barril10_acero_taproom', !isSuperAdmin)}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
            <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              Stock {isProduccion && <span style={{ color: '#f59e0b', fontWeight: 400 }}>— editable</span>}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {[
                { label: 'Cajas 12', key: 'stock_caja12' },
                { label: 'Cajas 24', key: 'stock_caja24' },
                { label: 'Bbl 20L PET', key: 'stock_barril_pet' },
                { label: 'Bbl 20L Acero', key: 'stock_barril_acero' },
                { label: 'Bbl 10L PET', key: 'stock_barril10_pet' },
                { label: 'Bbl 10L Acero', key: 'stock_barril10_acero' },
              ].map(s => (
                <div key={s.key}>
                  <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 4 }}>{s.label}</label>
                  <input type="number" value={(form as any)[s.key]} onChange={e => set(s.key, e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#10b981', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' as const }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid #1a1a1a' }}>
        <a href="/admin/inventario" style={{ padding: '11px 20px', background: '#1a1a1a', color: '#666', borderRadius: 7, textDecoration: 'none', fontSize: 14 }}>Cancelar</a>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '11px 28px', background: '#E8531D', border: 'none', borderRadius: 7,
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1
        }}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>
    </div>
  )
}

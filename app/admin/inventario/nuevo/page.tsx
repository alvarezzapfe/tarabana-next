'use client'
import { useState } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'

const estilos = ['IPA', 'Double IPA', 'Session IPA', 'Lager', 'Stout', 'Porter', 'Wheat', 'Sour', 'Pale Ale', 'Amber Ale', 'Otro']

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre: '', estilo: '', abv: '', ibu: '', descripcion: '', descripcion_larga: '',
    precio_caja12_publico: '', precio_caja12_taproom: '',
    precio_caja24_publico: '', precio_caja24_taproom: '',
    precio_barril_pet_publico: '', precio_barril_pet_taproom: '',
    precio_barril_acero_publico: '', precio_barril_acero_taproom: '',
    precio_barril10_pet_publico: '', precio_barril10_pet_taproom: '',
    precio_barril10_acero_publico: '', precio_barril10_acero_taproom: '',
    stock_caja12: '0', stock_caja24: '0', stock_barril_pet: '0', stock_barril_acero: '0', stock_barril10_pet: '0', stock_barril10_acero: '0',
    activo: true,
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    setLoading(true)
    let imagen_url = null

    if (imgFile) {
      const ext = imgFile.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('productos')
        .upload(path, imgFile, { contentType: imgFile.type })
      if (uploadError) { alert('Error subiendo imagen: ' + uploadError.message); setLoading(false); return }
      const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
      imagen_url = publicUrl
    }

    const { error } = await supabase.from('productos').insert({
      nombre: form.nombre,
      estilo: form.estilo,
      abv: form.abv ? parseFloat(form.abv) : null,
      ibu: form.ibu ? parseInt(form.ibu) : null,
      descripcion: form.descripcion,
      descripcion_larga: form.descripcion_larga,
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
      stock_barril10_pet: parseInt(form.stock_barril10_pet) || 0,
      stock_barril10_acero: parseInt(form.stock_barril10_acero) || 0,
      stock_caja12: parseInt(form.stock_caja12) || 0,
      stock_caja24: parseInt(form.stock_caja24) || 0,
      stock_barril_pet: parseInt(form.stock_barril_pet) || 0,
      stock_barril_acero: parseInt(form.stock_barril_acero) || 0,
      stock_latas: (parseInt(form.stock_caja12) || 0) * 12 + (parseInt(form.stock_caja24) || 0) * 24,
      stock_barriles: (parseInt(form.stock_barril_pet) || 0) + (parseInt(form.stock_barril_acero) || 0),
      activo: form.activo,
    })

    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    router.push('/admin/inventario')
    router.refresh()
  }

  const inp = (label: string, key: string, placeholder = '', type = 'text') => (
    <div>
      <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <input
        type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#fff', fontSize: 13.5, boxSizing: 'border-box' as const }}
      />
    </div>
  )

  const priceRow = (label: string, pubKey: string, tapKey: string) => (
    <div>
      <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 4 }}>Precio público</label>
          <input type="number" value={(form as any)[pubKey]} onChange={e => set(pubKey, e.target.value)} placeholder="0.00"
            style={{ width: '100%', padding: '9px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#fff', fontSize: 13.5, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 4 }}>Precio taproom</label>
          <input type="number" value={(form as any)[tapKey]} onChange={e => set(tapKey, e.target.value)} placeholder="0.00"
            style={{ width: '100%', padding: '9px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#f59e0b', fontSize: 13.5, boxSizing: 'border-box' as const }} />
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '36px 40px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <a href="/admin/inventario" style={{ color: '#555', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Inventario
        </a>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Nuevo producto</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Columna izq — foto */}
        <div>
          <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Foto del producto</label>
          <div
            onClick={() => document.getElementById('img-upload')?.click()}
            style={{
              width: '100%', aspectRatio: '1', background: '#111', border: '2px dashed #2a2a2a',
              borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', position: 'relative'
            }}
          >
            {imgPreview
              ? <img src={imgPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12"/></svg>
                  <p style={{ color: '#444', fontSize: 12, marginTop: 8 }}>JPG o PNG</p>
                </>
            }
          </div>
          <input id="img-upload" type="file" accept="image/jpg,image/jpeg,image/png" onChange={handleImage} style={{ display: 'none' }} />

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inp('ABV %', 'abv', '5.5', 'number')}
            {inp('IBU', 'ibu', '45', 'number')}
          </div>

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
        </div>

        {/* Columna der — datos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {inp('Nombre *', 'nombre', 'Brisa IPA')}

          <div>
            <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Estilo *</label>
            <select value={form.estilo} onChange={e => set('estilo', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: form.estilo ? '#fff' : '#555', fontSize: 13.5, boxSizing: 'border-box' as const }}>
              <option value="">Selecciona estilo</option>
              {estilos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {inp('Descripción corta', 'descripcion', 'Una IPA lupulada y refrescante...')}
          
          <div>
            <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Descripción larga</label>
            <textarea value={form.descripcion_larga} onChange={e => set('descripcion_larga', e.target.value)} rows={3} placeholder="Notas de cata, maridajes, historia..."
              style={{ width: '100%', padding: '10px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#fff', fontSize: 13.5, boxSizing: 'border-box' as const, resize: 'vertical' }} />
          </div>

          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
            <p style={{ color: '#E8531D', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Precios y stock</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {priceRow('Caja 12 latas (355ml)', 'precio_caja12_publico', 'precio_caja12_taproom')}
              {priceRow('Caja 24 latas (355ml)', 'precio_caja24_publico', 'precio_caja24_taproom')}
              {priceRow('Barril 20L PET', 'precio_barril_pet_publico', 'precio_barril_pet_taproom')}
{priceRow('Barril 20L Acero (solo CDMX tap)', 'precio_barril_acero_publico', 'precio_barril_acero_taproom')}
              {priceRow('Barril 10L PET', 'precio_barril10_pet_publico', 'precio_barril10_pet_taproom')}
              {priceRow('Barril 10L Acero', 'precio_barril10_acero_publico', 'precio_barril10_acero_taproom')}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
            <p style={{ color: '#555', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Stock inicial</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {[
                { label: 'Cajas 12', key: 'stock_caja12' },
                { label: 'Cajas 24', key: 'stock_caja24' },
                { label: 'Bbl PET', key: 'stock_barril_pet' },
                { label: 'Bbl Acero', key: 'stock_barril_acero' },
                { label: 'Bbl 10L PET', key: 'stock_barril10_pet' },
                { label: 'Bbl 10L Acero', key: 'stock_barril10_acero' },
              ].map(s => (
                <div key={s.key}>
                  <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 4 }}>{s.label}</label>
                  <input type="number" value={(form as any)[s.key]} onChange={e => set(s.key, e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, color: '#fff', fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid #1a1a1a' }}>
        <a href="/admin/inventario" style={{ padding: '11px 20px', background: '#1a1a1a', color: '#666', borderRadius: 7, textDecoration: 'none', fontSize: 14 }}>Cancelar</a>
        <button onClick={handleSubmit} disabled={loading || !form.nombre || !form.estilo} style={{
          padding: '11px 28px', background: form.nombre && form.estilo ? '#E8531D' : '#333',
          border: 'none', borderRadius: 7, color: form.nombre && form.estilo ? '#fff' : '#555',
          fontSize: 14, fontWeight: 600, cursor: form.nombre && form.estilo ? 'pointer' : 'not-allowed'
        }}>{loading ? 'Guardando...' : 'Guardar producto'}</button>
      </div>
    </div>
  )
}

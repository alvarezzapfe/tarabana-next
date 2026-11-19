'use client'
import { useEffect, useState } from 'react'
import Icono from './Icono'
import { hoyMx } from '../../../src/lib/fechas'
import { BORDE, GRIS, GRIS_SUAVE, TINTA } from '../dash-ui'
import {
  ICONOS, TANQUE_TIPO_LABEL, botonNeutro, botonPrimario, inputBase, labelBase,
  soloDecimal, soloEntero,
  type ProductoFila, type RecetaFila, type TanqueFila,
} from './produccion-ui'

/**
 * Alta de lote.
 *
 * El folio NO se captura: lo asigna el trigger `lote_folio_trg` a partir del
 * `folio_prefijo` del producto y del año de la cocción. Mostrar un campo de
 * folio invitaria a inventar uno y a chocar con el consecutivo.
 *
 * La lista de productos ya llega filtrada a los que tienen prefijo, y la de
 * tanques a los que estan libres: un tanque con lote vivo adentro no puede
 * recibir otro.
 */

const CSS = `
  .nl-overlay { position: fixed; inset: 0; background: rgba(17,24,39,.32); z-index: 70; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .nl-modal { background: #fff; border-radius: 12px; width: 460px; max-width: 100%; max-height: 100%; overflow-y: auto; box-shadow: 0 12px 32px rgba(0,0,0,.14); }
  .nl-cerrar:hover { background: #f3f4f6; color: #111827; }
`

type Props = {
  productos: ProductoFila[]
  recetas: RecetaFila[]
  tanquesLibres: TanqueFila[]
  onCerrar: () => void
  onCreado: () => void
}

export default function NuevoLote({ productos, recetas, tanquesLibres, onCerrar, onCreado }: Props) {
  const [form, setForm] = useState({
    producto_id: '',
    tanque_id: '',
    litros_objetivo: '',
    fecha_coccion: hoyMx(),
    levadura_cepa: '',
    levadura_proveedor: '',
    levadura_generacion: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const producto = productos.find(p => p.id === form.producto_id)
  const receta = recetas.find(r => r.producto_id === form.producto_id)

  /**
   * Al elegir producto se precarga la levadura de su receta, pero SOLO en los
   * campos que estan vacios: si alguien ya escribio una cepa distinta —porque
   * este lote usa otra— pisarsela al cambiar de producto seria perder lo que
   * acaba de capturar.
   */
  const elegirProducto = (id: string) => {
    const r = recetas.find(x => x.producto_id === id)
    setForm(f => ({
      ...f,
      producto_id: id,
      levadura_cepa: f.levadura_cepa || r?.levadura_cepa || '',
      levadura_proveedor: f.levadura_proveedor || r?.levadura_proveedor || '',
    }))
  }
  const litros = parseFloat(form.litros_objetivo)
  const valido = !!form.producto_id && !!form.fecha_coccion && Number.isFinite(litros) && litros > 0

  const crear = async () => {
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/admin/produccion/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo crear el lote'); return }
      onCreado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="nl-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <style>{CSS}</style>
      <div className="nl-modal" role="dialog" aria-modal="true" aria-label="Nuevo lote">
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${BORDE}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, color: TINTA, fontSize: 17, fontWeight: 700 }}>Nuevo lote</h2>
            <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 12.5 }}>
              El folio se asigna solo
              {producto?.folio_prefijo && `, con prefijo ${producto.folio_prefijo}`}
            </p>
          </div>
          <button
            className="nl-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', borderRadius: 7, padding: 6, color: GRIS, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
          >
            <Icono d={ICONOS.cerrar} size={18} />
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 13px', fontSize: 13 }}>
              {error}
            </div>
          )}

          {productos.length === 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 13px', fontSize: 12.5, lineHeight: 1.5 }}>
              Ningún producto tiene prefijo de folio. Captúralo en Inventario
              (3 letras, por ejemplo BRA) para poder crear lotes.
            </div>
          )}

          <label>
            <span style={labelBase}>Estilo</span>
            <select
              style={{ ...inputBase, color: form.producto_id ? '#1a1a1a' : GRIS_SUAVE }}
              value={form.producto_id}
              onChange={e => elegirProducto(e.target.value)}
            >
              <option value="">Selecciona el producto</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — {p.estilo} ({p.folio_prefijo})
                </option>
              ))}
            </select>
          </label>

          {form.producto_id && !receta && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '9px 12px', fontSize: 12, lineHeight: 1.5 }}>
              Este producto no tiene receta. El lote se crea igual, pero no se
              va a proyectar en el calendario ni va a alertar por días de etapa
              o por FG.
            </div>
          )}

          <label>
            <span style={labelBase}>Tanque</span>
            <select
              style={{ ...inputBase, color: form.tanque_id ? '#1a1a1a' : GRIS_SUAVE }}
              value={form.tanque_id}
              onChange={e => set('tanque_id', e.target.value)}
            >
              <option value="">Sin asignar</option>
              {tanquesLibres.map(t => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — {TANQUE_TIPO_LABEL[t.tipo]} · {t.capacidad_litros} L
                </option>
              ))}
            </select>
            {tanquesLibres.length === 0 && (
              <span style={{ display: 'block', marginTop: 5, color: GRIS_SUAVE, fontSize: 11.5 }}>
                No hay tanques libres. El lote se puede crear sin tanque y asignarlo después.
              </span>
            )}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <span style={labelBase}>Litros objetivo</span>
              <input
                style={inputBase}
                type="text"
                inputMode="decimal"
                value={form.litros_objetivo}
                onChange={e => set('litros_objetivo', soloDecimal(e.target.value))}
                placeholder="1000"
              />
            </label>
            <label>
              <span style={labelBase}>Fecha de cocción</span>
              <input
                style={inputBase}
                type="date"
                value={form.fecha_coccion}
                onChange={e => set('fecha_coccion', e.target.value)}
              />
            </label>
          </div>

          <div>
            <span style={labelBase}>Levadura</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 0.7fr', gap: 10 }}>
              <input style={inputBase} placeholder="Cepa" value={form.levadura_cepa} onChange={e => set('levadura_cepa', e.target.value)} />
              <input style={inputBase} placeholder="Proveedor" value={form.levadura_proveedor} onChange={e => set('levadura_proveedor', e.target.value)} />
              <input style={inputBase} type="text" inputMode="numeric" min="0" placeholder="Gen." value={form.levadura_generacion} onChange={e => set('levadura_generacion', soloEntero(e.target.value))} />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px 18px', borderTop: `1px solid ${BORDE}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={botonNeutro}>Cancelar</button>
          <button
            onClick={crear}
            disabled={guardando || !valido}
            style={{ ...botonPrimario(), opacity: guardando || !valido ? 0.5 : 1, cursor: valido ? 'pointer' : 'not-allowed' }}
          >
            {guardando ? 'Creando…' : 'Crear lote'}
          </button>
        </div>
      </div>
    </div>
  )
}

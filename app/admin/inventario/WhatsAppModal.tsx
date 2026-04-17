'use client'
import { useState, useEffect } from 'react'
import { generateWhatsAppPrompt } from '../../../src/lib/whatsappPrompt'
import type { ProductoPrompt, TipoPrecio } from '../../../src/lib/whatsappPrompt'

interface Props {
  isOpen: boolean
  onClose: () => void
  productos: ProductoPrompt[]
  tipoPrecio: TipoPrecio
}

export default function WhatsAppModal({ isOpen, onClose, productos, tipoPrecio }: Props) {
  const [nombreCliente, setNombreCliente] = useState('')
  const [notas, setNotas] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setMensaje(generateWhatsAppPrompt({ productos, tipoPrecio, nombreCliente, notas }))
  }, [isOpen, productos, tipoPrecio, nombreCliente, notas])

  if (!isOpen) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mensaje)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: 32, margin: '80px 16px', height: 'fit-content' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 18, color: '#fff', fontWeight: 600 }}>Mensaje para WhatsApp</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Badge */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ background: 'rgba(232,83,29,0.15)', color: '#E8531D', padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
            Precios {tipoPrecio}
          </span>
        </div>

        {/* Inputs */}
        <input
          value={nombreCliente}
          onChange={e => setNombreCliente(e.target.value)}
          placeholder="Nombre del cliente (opcional)"
          style={{ width: '100%', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 6, padding: '10px 14px', color: '#ddd', fontSize: 13, marginBottom: 12, outline: 'none', boxSizing: 'border-box' }}
        />
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Notas adicionales (opcional)"
          rows={2}
          style={{ width: '100%', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 6, padding: '10px 14px', color: '#ddd', fontSize: 13, marginBottom: 16, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
        />

        {/* Message textarea */}
        <textarea
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          rows={14}
          style={{ width: '100%', fontFamily: "'SF Mono', 'Menlo', monospace", background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 6, padding: 16, color: '#ddd', fontSize: 13, lineHeight: 1.5, resize: 'vertical', whiteSpace: 'pre-wrap', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
        />

        {/* Footer buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleCopy} style={{ background: '#E8531D', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            {copiado ? '✓ Copiado' : 'Copiar mensaje'}
          </button>
          <button onClick={onClose} style={{ background: 'transparent', color: '#777', border: '1px solid #1e1e1e', padding: '12px 24px', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ToggleActivo({ id, activo }: { id: string; activo: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    await fetch(`/api/admin/puntos-venta/${id}/toggle`, { method: 'PATCH' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button onClick={toggle} disabled={loading} style={{
      background: activo ? '#10b981' : '#555',
      color: '#1a1a1a', border: 'none', padding: '4px 12px',
      borderRadius: 6, fontSize: 13, fontWeight: 600,
      cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
      transition: 'all 0.15s',
    }}>
      {activo ? 'Activo' : 'Inactivo'}
    </button>
  )
}

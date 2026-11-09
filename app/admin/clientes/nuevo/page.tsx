'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../src/lib/supabase'
import ClienteProForm, { cuerpoCliente, type ClienteProData } from '../../../../src/components/ClienteProForm'
import { isVendedor } from '../../../../src/lib/roles'
import Encabezado from '../Encabezado'

/**
 * Alta de cliente.
 *
 * La pagina solo carga contexto (que rol da de alta, que vendedores hay) y
 * manda el cuerpo; los campos y la validacion viven en `ClienteProForm`, y el
 * mapeo a columnas en `src/lib/cliente-campos.ts`, que comparte con la ruta
 * de editar.
 */
export default function NuevoClientePage() {
  const router = useRouter()
  const supabase = createClient()

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [esVendedor, setEsVendedor] = useState(false)
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([])

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const vendedor = isVendedor(perfil?.role)

      // `vendedores` pide is_staff() por RLS, asi que a un vendedor le llega
      // vacio. No importa: no ve la seccion donde se usa.
      const { data: lista } = vendedor
        ? { data: [] }
        : await supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre')

      if (!vigente) return
      setEsVendedor(vendedor)
      setVendedores(lista || [])
      setCargando(false)
    }

    cargar()
    return () => { vigente = false }
  }, [])

  const guardar = async (d: ClienteProData, irAPedido: boolean) => {
    setGuardando(true)
    const res = await fetch('/api/admin/clientes/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoCliente(d)),
    })
    const json = await res.json().catch(() => ({}))
    setGuardando(false)

    if (!res.ok) return { error: json.error || 'No se pudo crear el cliente.' }

    // El POS ya acepta `?cliente=`, asi que no hace falta tocarlo.
    router.push(irAPedido && json.id ? `/admin/pedidos/nuevo?cliente=${json.id}` : '/admin/clientes')
    router.refresh()
    return {}
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Encabezado titulo="Nuevo cliente" />
      {cargando
        ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</p>
        : (
          <ClienteProForm
            esVendedor={esVendedor}
            vendedores={vendedores}
            guardando={guardando}
            submitLabel="Crear cliente"
            onGuardar={guardar}
          />
        )}
    </div>
  )
}

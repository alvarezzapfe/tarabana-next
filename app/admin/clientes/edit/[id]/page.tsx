'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../../../../src/lib/supabase'
import ClienteProForm, {
  cuerpoCliente, formatearTelefono,
  type ClienteProData,
} from '../../../../../src/components/ClienteProForm'
import { isVendedor } from '../../../../../src/lib/roles'
import { mensajeDeError } from '../../../../../src/lib/respuesta'
import Encabezado from '../../Encabezado'

/**
 * Edicion de cliente.
 *
 * Mismo formulario que el alta, precargado. Lo que el formulario ya no
 * captura — nombre de pila, apellidos, `tipo_consumidor` — no se manda, y el
 * mapeo compartido lo deja intacto en vez de nulificarlo: son datos que el
 * cliente puso en el portal.
 */
export default function EditarClientePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [esVendedor, setEsVendedor] = useState(false)
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([])
  const [inicial, setInicial] = useState<Partial<ClienteProData> | null>(null)
  const [direccionVieja, setDireccionVieja] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: perfil }, { data: cliente }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('profiles').select('*').eq('id', id).single(),
      ])

      if (!cliente) { router.push('/admin/clientes'); return }

      const vendedor = isVendedor(perfil?.role)
      const { data: lista } = vendedor
        ? { data: [] }
        : await supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre')

      if (!vigente) return

      setEsVendedor(vendedor)
      setVendedores(lista || [])
      setInicial({
        marca_negocio: cliente.marca_negocio || '',
        giro: cliente.giro || '',
        instagram: cliente.instagram || '',
        sitio_web: cliente.sitio_web || '',
        contacto_nombre: cliente.contacto_nombre || '',
        contacto_whatsapp: formatearTelefono((cliente.contacto_whatsapp || '').replace(/^\+52/, '')),
        email: cliente.email || '',
        phone: formatearTelefono((cliente.phone || '').replace(/^\+52/, '')),
        requiere_factura: !!cliente.requiere_factura,
        rfc: cliente.rfc || '',
        razon_social: cliente.razon_social || '',
        regimen_fiscal: cliente.regimen_fiscal || '',
        cp_fiscal: cliente.cp_fiscal || '',
        uso_cfdi: cliente.uso_cfdi || '',
        direccion: {
          cp: cliente.cp || '',
          colonia: cliente.colonia || '',
          municipio: cliente.municipio || '',
          estado: cliente.estado || '',
          calle: cliente.calle || '',
          num_ext: cliente.num_ext || '',
          num_int: cliente.num_int || '',
          referencias: cliente.referencias || '',
        },
        horario_recepcion: cliente.horario_recepcion || '',
        nivel_precio: cliente.nivel_precio || 'publico',
        dias_credito: cliente.dias_credito != null ? String(cliente.dias_credito) : '',
        limite_credito: cliente.limite_credito != null ? String(Math.round(Number(cliente.limite_credito))) : '',
        vendedor_id: cliente.vendedor_id || '',
        notas: cliente.notas || '',
      })

      // Los clientes viejos traen la direccion como texto libre y sin
      // desglosar; DireccionForm la muestra para recapturarla.
      if (cliente.direccion_entrega && !cliente.calle) setDireccionVieja(cliente.direccion_entrega)
      setCargando(false)
    }

    cargar()
    return () => { vigente = false }
  }, [id])

  const guardar = async (d: ClienteProData, irAPedido: boolean) => {
    setGuardando(true)
    const res = await fetch(`/api/admin/clientes/${id}/actualizar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoCliente(d)),
    })
    setGuardando(false)

    if (!res.ok) {
      return { error: await mensajeDeError(res, 'No se pudo guardar el cliente') }
    }

    router.push(irAPedido ? `/admin/pedidos/nuevo?cliente=${id}` : '/admin/clientes')
    router.refresh()
    return {}
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Encabezado titulo="Editar cliente" />
      {cargando || !inicial
        ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</p>
        : (
          <ClienteProForm
            initial={inicial}
            legacyAddress={direccionVieja}
            esVendedor={esVendedor}
            vendedores={vendedores}
            excluirId={id}
            guardando={guardando}
            submitLabel="Guardar cambios"
            onGuardar={guardar}
          />
        )}
    </div>
  )
}

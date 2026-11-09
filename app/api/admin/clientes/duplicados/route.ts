import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { normalizarRFC } from '../../../../../src/lib/clientes'

/**
 * Busca clientes que choquen con lo que se esta capturando.
 *
 * Existe para avisar MIENTRAS se teclea, no al guardar: el duplicado solo se
 * detectaba al enviar el formulario, y para entonces ya se habian capturado
 * los veinte campos del cliente que ya existia.
 *
 * Solo de lectura, y con el service client a proposito: un vendedor no puede
 * leer por RLS los clientes que no son de su cartera, y justamente lo que hay
 * que avisarle es que el cliente ya existe aunque sea de otro. Se devuelve el
 * minimo para pintar la alerta — nombre, el campo que choca y el id para el
 * link —, no el perfil completo.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role) && !isVendedor(profile?.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const url = new URL(request.url)
  const rfc = normalizarRFC(url.searchParams.get('rfc'))
  const email = (url.searchParams.get('email') || '').trim().toLowerCase()
  const telefono = (url.searchParams.get('telefono') || '').replace(/\D/g, '').slice(-10)
  const excluir = url.searchParams.get('excluir') || ''

  const service = createServiceClient()
  const columnas = 'id, marca_negocio, razon_social, full_name, email, rfc, phone'

  type Fila = {
    id: string
    marca_negocio: string | null
    razon_social: string | null
    full_name: string | null
    email: string | null
    rfc: string | null
    phone: string | null
  }

  const buscar = async (columna: string, valor: string) => {
    let q = service.from('profiles').select(columnas).eq(columna, valor).limit(3)
    if (excluir) q = q.neq('id', excluir)
    const { data } = await q
    return (data || []) as Fila[]
  }

  const [porRfc, porEmail, porTel] = await Promise.all([
    rfc.length >= 12 ? buscar('rfc', rfc) : Promise.resolve([] as Fila[]),
    email ? buscar('email', email) : Promise.resolve([] as Fila[]),
    // El telefono se guarda con prefijo; se compara como se guarda.
    telefono.length === 10 ? buscar('phone', `+52${telefono}`) : Promise.resolve([] as Fila[]),
  ])

  const nombreDe = (f: Fila) =>
    f.marca_negocio || f.razon_social || f.full_name || f.email || 'Cliente sin nombre'

  const duplicados = [
    ...porRfc.map(f => ({ id: f.id, nombre: nombreDe(f), detalle: f.rfc || '', campo: 'rfc' as const })),
    ...porEmail.map(f => ({ id: f.id, nombre: nombreDe(f), detalle: f.email || '', campo: 'email' as const })),
    ...porTel.map(f => ({ id: f.id, nombre: nombreDe(f), detalle: f.phone || '', campo: 'telefono' as const })),
  ]

  // Un mismo cliente puede chocar por correo Y por telefono; se reporta una
  // vez, por el campo mas fuerte (el orden de arriba: RFC, correo, telefono).
  const vistos = new Set<string>()
  const unicos = duplicados.filter(d => {
    if (vistos.has(d.id)) return false
    vistos.add(d.id)
    return true
  })

  return NextResponse.json({ duplicados: unicos })
}

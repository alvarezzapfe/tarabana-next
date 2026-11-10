import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { crearCliente, fichaVendedorDe } from '../../../../../src/lib/crear-cliente'

/**
 * Un throw inesperado tiene que salir como JSON.
 *
 * Sin esto, Next responde la pagina de error en HTML, el cliente no encuentra
 * `json.error` y en pantalla queda un mensaje genérico mientras el error real
 * vive solo en los logs. El stack se sigue imprimiendo completo.
 */
function fallaInesperada(e: unknown, donde: string) {
  console.error(`[${donde}]`, e)
  const detalle = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: `Error inesperado del servidor: ${detalle}` }, { status: 500 })
}

/**
 * Da de alta un cliente.
 *
 * La regla de negocio vive en `src/lib/crear-cliente.ts`: esta ruta es el
 * wrapper HTTP. La carga masiva llama a la misma funcion en bucle, para que
 * no existan dos definiciones de "como se da de alta un cliente".
 */
async function manejar(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const esVendedor = isVendedor(profile?.role)
  if (!canWrite(profile?.role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const service = createServiceClient()

  const resultado = await crearCliente(body, {
    userId: user.id,
    userEmail: user.email!,
    role: profile!.role,
    esVendedor,
    vendedorId: esVendedor ? await fichaVendedorDe(service, user.id) : null,
    service,
    request,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  }
  return NextResponse.json({ ok: true, id: resultado.id })
}

export async function POST(request: Request) {
  try {
    return await manejar(request)
  } catch (e) {
    return fallaInesperada(e, 'clientes/crear')
  }
}

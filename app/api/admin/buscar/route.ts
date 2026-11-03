import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isStaff } from '../../../../src/lib/roles'

/**
 * Busqueda del command palette: clientes por nombre/correo y pedidos por
 * folio o por nombre de cliente.
 *
 * No existe columna `folio`: la UI identifica un pedido con los ultimos 6
 * caracteres del uuid en mayusculas (ver PedidosClient). PostgREST no deja
 * hacer ilike sobre un uuid, asi que el match de folio se hace en memoria
 * sobre una ventana de los pedidos mas recientes.
 */

/** Tope de pedidos traidos para el match de folio en memoria. */
const VENTANA_PEDIDOS = 500
const MAX_RESULTADOS = 6

export const folioDe = (id: string) => id.slice(-6).toUpperCase()

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isStaff(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const q = (new URL(request.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ clientes: [], pedidos: [] })

  const term = q.toLowerCase()
  // Escapa los comodines de LIKE para que el usuario no los inyecte.
  const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`

  const [{ data: clientesRaw }, { data: pedidosRaw }, { data: todosClientes }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'comprador')
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .limit(MAX_RESULTADOS),
    supabase
      .from('pedidos_saldo')
      .select('id, cliente_id, total, saldo, status, estado_cobro, created_at')
      .order('created_at', { ascending: false })
      .limit(VENTANA_PEDIDOS),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'comprador'),
  ])

  const nombrePorId = new Map((todosClientes || []).map(c => [c.id, c.full_name || '']))

  const pedidos = (pedidosRaw || [])
    .filter(p => {
      const folio = folioDe(p.id)
      if (folio.toLowerCase().includes(term)) return true
      return (nombrePorId.get(p.cliente_id) || '').toLowerCase().includes(term)
    })
    .slice(0, MAX_RESULTADOS)
    .map(p => ({
      id: p.id,
      folio: folioDe(p.id),
      cliente: nombrePorId.get(p.cliente_id) || 'Sin cliente',
      total: p.total,
      saldo: p.saldo,
      status: p.status,
      estado_cobro: p.estado_cobro,
    }))

  const clientes = (clientesRaw || []).map(c => ({
    id: c.id,
    nombre: c.full_name || c.email || 'Sin nombre',
    email: c.email || '',
  }))

  return NextResponse.json({ clientes, pedidos })
}

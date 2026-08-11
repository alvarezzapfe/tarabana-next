import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

const STOCK_FIELDS = ['stock_latas', 'stock_caja12', 'stock_caja24', 'stock_barril_pet', 'stock_barril_acero', 'stock_barril10_pet', 'stock_barril10_acero'] as const

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const update: Record<string, number> = {}

  for (const field of STOCK_FIELDS) {
    const val = body[field]
    if (val === undefined || val === null) continue
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      return NextResponse.json({ error: `${field} debe ser un entero >= 0, recibido: ${val}` }, { status: 400 })
    }
    update[field] = val
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Sin campos de stock para actualizar' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: prev } = await service.from('productos').select(STOCK_FIELDS.join(', ')).eq('id', id).single()
  if (!prev) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const { error } = await service.from('productos').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const changes: Record<string, { from: number; to: number }> = {}
  for (const [k, v] of Object.entries(update)) {
    if ((prev as any)[k] !== v) changes[k] = { from: (prev as any)[k], to: v }
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'producto.stock', entidad: 'productos', entidadId: id,
    detalle: { changes, motivo: body.motivo || null },
    request,
  })

  return NextResponse.json({ ok: true })
}

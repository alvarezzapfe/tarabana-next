import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isStaff, isSuperAdmin } from '../../../../src/lib/roles'
import { logAction } from '../../../../src/lib/audit'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isStaff(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data: configs } = await supabase.from('app_config').select('*')
  const result: Record<string, any> = {}
  for (const c of configs || []) result[c.key] = c.value
  return NextResponse.json(result)
}

const VALID_KEYS = ['branding', 'negocio'] as const

const validateBranding = (v: any) => {
  if (typeof v !== 'object') return false
  const allowed = ['color_primary', 'sidebar_bg', 'sidebar_text']
  return Object.keys(v).every(k => allowed.includes(k) && typeof v[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(v[k]))
}

const validateNegocio = (v: any) => {
  if (typeof v !== 'object') return false
  if (v.dias_credito_default !== undefined && (typeof v.dias_credito_default !== 'number' || v.dias_credito_default < 0 || v.dias_credito_default > 90)) return false
  if (v.dias_alerta_vencido !== undefined && (typeof v.dias_alerta_vencido !== 'number' || v.dias_alerta_vencido < 1 || v.dias_alerta_vencido > 90)) return false
  if (v.moneda !== undefined && !['MXN', 'USD'].includes(v.moneda)) return false
  return true
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { key, value } = await request.json()
  if (!VALID_KEYS.includes(key)) return NextResponse.json({ error: `Key desconocida: ${key}` }, { status: 400 })

  if (key === 'branding' && !validateBranding(value)) return NextResponse.json({ error: 'Valores de branding inválidos. Usa colores hex de 6 dígitos.' }, { status: 400 })
  if (key === 'negocio' && !validateNegocio(value)) return NextResponse.json({ error: 'Valores de negocio inválidos.' }, { status: 400 })

  const service = createServiceClient()

  // Get current value for audit
  const { data: current } = await service.from('app_config').select('value').eq('key', key).single()

  // Merge with existing (partial update)
  const merged = { ...(current?.value || {}), ...value }
  await service.from('app_config').update({ value: merged, updated_at: new Date().toISOString() }).eq('key', key)

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'config.update', entidad: 'app_config', entidadId: key,
    detalle: { from: current?.value, to: merged },
    request,
  })

  return NextResponse.json({ ok: true, value: merged })
}

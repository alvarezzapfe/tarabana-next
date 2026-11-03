import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isStaff, isSuperAdmin } from '../../../../src/lib/roles'
import { esHex6, contrastaConChrome, contraste, ADMIN_CHROME_BG, CONTRASTE_MINIMO } from '../../../../src/lib/contraste'
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

// sidebar_bg y sidebar_text salieron a proposito: el chrome del admin esta
// fijo en codigo (ver app/admin/Sidebar.tsx). Dejarlos configurables permitia
// elegir un fondo claro y romper el contraste de toda la navegacion. Las
// claves que ya esten guardadas en app_config quedan ahi pero nadie las lee.
const BRANDING_KEYS = ['color_primary'] as const

type BrandingKey = (typeof BRANDING_KEYS)[number]

const esBrandingKey = (k: string): k is BrandingKey =>
  (BRANDING_KEYS as readonly string[]).includes(k)

/** Devuelve el motivo del rechazo, o null si es valido. */
const validateBranding = (v: unknown): string | null => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'Branding debe ser un objeto.'
  const obj = v as Record<string, unknown>
  for (const k of Object.keys(obj)) {
    if (!esBrandingKey(k)) return `Clave de branding no permitida: ${k}`
    if (!esHex6(obj[k])) return `${k} debe ser un color hex de 6 digitos.`
  }
  // El acento se pinta sobre el chrome oscuro: si no contrasta, no se lee.
  const acento = obj.color_primary
  if (esHex6(acento) && !contrastaConChrome(acento)) {
    const r = contraste(acento, ADMIN_CHROME_BG).toFixed(2)
    return `color_primary ${acento} contrasta ${r}:1 contra ${ADMIN_CHROME_BG}; se requiere al menos ${CONTRASTE_MINIMO}:1.`
  }
  return null
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

  if (key === 'branding') {
    const err = validateBranding(value)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }
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

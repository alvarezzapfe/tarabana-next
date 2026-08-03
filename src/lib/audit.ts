import { createServiceClient } from './supabase-server'

interface AuditParams {
  actorId: string
  actorEmail: string
  actorRole: string
  accion: string
  entidad: string
  entidadId?: string
  detalle?: Record<string, any>
  request?: Request
}

export async function logAction({
  actorId, actorEmail, actorRole, accion, entidad, entidadId, detalle, request,
}: AuditParams): Promise<void> {
  try {
    const service = createServiceClient()
    const ip = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    await service.from('audit_log').insert({
      actor_id: actorId,
      actor_email: actorEmail,
      actor_role: actorRole,
      accion,
      entidad,
      entidad_id: entidadId || null,
      detalle: detalle || null,
      ip,
    })
  } catch (err) {
    console.error('[audit] Failed to log action:', err)
  }
}

import { createServiceClient } from './supabase-server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface InvitarResult {
  sent?: boolean
  skipped?: 'ya_activada' | 'reciente'
  error?: string
}

/**
 * Sends a portal invitation email to a client (comprador).
 * Uses a password recovery link so the client can set their password.
 * Never throws — returns result or logs error.
 *
 * @param clienteId - profile ID
 * @param options.force - skip the 24h cooldown (for manual resend by admin)
 * @param options.pedidoId - for the email content (shows pedido info)
 * @param options.pedidoTotal - for the email content
 */
export async function enviarInvitacionCliente(
  clienteId: string,
  options?: { force?: boolean; pedidoId?: string; pedidoTotal?: number }
): Promise<InvitarResult> {
  try {
    const service = createServiceClient()

    const { data: profile } = await service
      .from('profiles')
      .select('full_name, email, cuenta_activada_at, invitacion_enviada_at')
      .eq('id', clienteId)
      .single()

    if (!profile || !profile.email) return { error: 'Perfil no encontrado' }

    // Already activated
    if (profile.cuenta_activada_at) return { skipped: 'ya_activada' }

    // Cooldown: skip if sent in the last 24h (unless forced)
    if (!options?.force && profile.invitacion_enviada_at) {
      const lastSent = new Date(profile.invitacion_enviada_at).getTime()
      if (Date.now() - lastSent < 24 * 60 * 60 * 1000) return { skipped: 'reciente' }
    }

    // Generate recovery link (lets client set password)
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tarabana.mx'}/auth/confirm` },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[invitar-cliente] generateLink failed:', linkError?.message)
      return { error: linkError?.message || 'No se pudo generar el link' }
    }

    const actionLink = linkData.properties.action_link
    const nombre = profile.full_name?.split(' ')[0] || 'cliente'
    const pedidoRef = options?.pedidoId ? `#${options.pedidoId.slice(-6).toUpperCase()}` : ''
    const pedidoMonto = options?.pedidoTotal ? `$${options.pedidoTotal.toLocaleString('es-MX')}` : ''

    await resend.emails.send({
      from: 'Tarabaña <hola@tarabana.mx>',
      to: profile.email,
      subject: 'Tu pedido en Tarabaña — accede a tu portal',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="padding:32px 40px 0;text-align:center;">
            <img src="https://tarabana.mx/tarabanalogo.png" alt="Tarabaña" height="48" style="display:block;margin:0 auto 20px;">
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <h1 style="margin:0 0 12px;color:#111;font-size:22px;font-weight:800;">Hola, ${nombre}</h1>
            <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">
              ${pedidoRef ? `Registramos tu pedido <strong style="color:#111;">${pedidoRef}</strong>${pedidoMonto ? ` por <strong style="color:#E8531D;">${pedidoMonto}</strong>` : ''}.` : 'Ya tienes un pedido registrado.'}
              Desde tu portal puedes seguir el estado de tus pedidos y hacer nuevos.
            </p>
            <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.7;">
              Para acceder, crea tu contraseña con el boton de abajo:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#E8531D;border-radius:10px;">
                  <a href="${actionLink}" style="display:block;padding:16px 40px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">
                    Crear mi contraseña
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
              Este link expira en 7 dias. Si no lo usas, seguimos atendiendote por los medios de siempre.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">Tarabaña · Compañia Cervecera Tierra Mojada · CDMX</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })

    await service.from('profiles').update({
      invitacion_enviada_at: new Date().toISOString(),
    }).eq('id', clienteId)

    return { sent: true }
  } catch (err: any) {
    console.error('[invitar-cliente] Error:', err?.message || err)
    return { error: err?.message || 'Error desconocido' }
  }
}

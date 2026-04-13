import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  produccion: 'Jefe de Producción',
  ventas: 'Ventas',
  contabilidad: 'Lector / Contabilidad',
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { nombre, email, cel, rol } = await request.json()
  const rolesPermitidos = ['admin', 'produccion', 'ventas', 'contabilidad']
  if (!rolesPermitidos.includes(rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })

  const serviceClient = createServiceClient()

  // Crear invitación en DB
  const { data: inv, error: invError } = await serviceClient
    .from('invitaciones')
    .insert({ email, full_name: nombre, role: rol, created_by: user.id })
    .select('token')
    .single()

  if (invError) return NextResponse.json({ error: invError.message }, { status: 400 })

  const activationUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tarabana-next.vercel.app'}/activar/${inv.token}`

  // Mandar email bonito
  await resend.emails.send({
    from: 'Tarabaña <hola@tarabana.mx>',
    to: email,
    subject: `Te invitaron a unirte al equipo Tarabaña`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:16px;overflow:hidden;border:1px solid #1e1e1e;">
        <tr>
          <td style="background:#0a0a0a;padding:32px 40px;text-align:center;border-bottom:1px solid #1e1e1e;">
            <img src="https://tarabana-next.vercel.app/tarabanalogo.png" alt="Tarabaña" height="56" style="display:block;margin:0 auto;filter:brightness(0) invert(1);">
          </td>
        </tr>
        <tr>
          <td style="background:#E8531D;padding:8px 40px;text-align:center;">
            <p style="margin:0;color:#fff;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Cervecería Artesanal · Lerma & Condesa CDMX</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 8px;color:#fff;font-size:24px;font-weight:800;">Hola, ${nombre} 👋</h1>
            <p style="margin:0 0 24px;color:#888;font-size:15px;line-height:1.7;">
              Luis te ha invitado a unirte al panel interno de Tarabaña como <strong style="color:#fff;">${roleLabel[rol]}</strong>.
            </p>
            <div style="background:#1a1a1a;border-radius:10px;padding:16px 20px;margin-bottom:28px;border:1px solid #2a2a2a;">
              <p style="margin:0 0 4px;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Tu rol</p>
              <p style="margin:0;color:#E8531D;font-size:15px;font-weight:700;">${roleLabel[rol]}</p>
            </div>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#E8531D;border-radius:10px;">
                  <a href="${activationUrl}" style="display:block;padding:16px 40px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;">
                    Activar mi cuenta →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#555;font-size:12px;">Este link expira en 48 horas. Si no esperabas esta invitación, ignora este correo.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#0a0a0a;padding:20px 40px;text-align:center;border-top:1px solid #1e1e1e;">
            <p style="margin:0;color:#333;font-size:12px;">Tarabaña · Compañía Cervecera Tierra Mojada · CDMX</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  })

  return NextResponse.json({ ok: true })
}

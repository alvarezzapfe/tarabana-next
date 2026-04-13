import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const { nombre, email, asunto, mensaje } = await req.json()
  if (!nombre || !mensaje) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const { error } = await resend.emails.send({
    from: 'Tarabaña Web <hola@tarabana.mx>',
    to: ['hola@tarabana.mx'],
    replyTo: email || undefined,
    subject: `[Web] ${asunto || 'Consulta'} — ${nombre}`,
    html: `
      <div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:32px;background:#1A1108;color:#F5F0E8;border-radius:8px">
        <h2 style="color:#F0A030;font-size:20px;margin:0 0 20px">Nuevo mensaje desde tarabana.mx</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:rgba(245,240,232,0.4);font-size:12px;padding:8px 0;border-bottom:1px solid rgba(245,240,232,0.08);text-transform:uppercase;letter-spacing:0.1em">Nombre</td><td style="color:#F5F0E8;font-size:14px;padding:8px 0;border-bottom:1px solid rgba(245,240,232,0.08)">${nombre}</td></tr>
          <tr><td style="color:rgba(245,240,232,0.4);font-size:12px;padding:8px 0;border-bottom:1px solid rgba(245,240,232,0.08);text-transform:uppercase;letter-spacing:0.1em">Email</td><td style="color:#F5F0E8;font-size:14px;padding:8px 0;border-bottom:1px solid rgba(245,240,232,0.08)">${email || '—'}</td></tr>
          <tr><td style="color:rgba(245,240,232,0.4);font-size:12px;padding:8px 0;border-bottom:1px solid rgba(245,240,232,0.08);text-transform:uppercase;letter-spacing:0.1em">Asunto</td><td style="color:#F5F0E8;font-size:14px;padding:8px 0;border-bottom:1px solid rgba(245,240,232,0.08)">${asunto || '—'}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:rgba(245,240,232,0.04);border-left:3px solid #C8720A">
          <p style="color:rgba(245,240,232,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">Mensaje</p>
          <p style="color:#F5F0E8;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${mensaje}</p>
        </div>
        <p style="color:rgba(245,240,232,0.25);font-size:11px;margin-top:24px">Enviado desde tarabana.mx/contacto</p>
      </div>
    `,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

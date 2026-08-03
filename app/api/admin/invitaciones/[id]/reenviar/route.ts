import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { isSuperAdmin } from '../../../../../../src/lib/roles'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/admin', req.url))

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.redirect(new URL('/admin/usuarios', req.url))

  const serviceClient = createServiceClient()
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: inv } = await serviceClient.from('invitaciones').update({ expires_at: newExpiry }).eq('id', id).select().single()

  if (inv) {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tarabana.mx'}/activar/${inv.token}`
    const roleLabel: Record<string, string> = { admin: 'Administrador', produccion: 'Jefe de Producción', ventas: 'Ventas', contabilidad: 'Lector / Contabilidad' }
    await resend.emails.send({
      from: 'Tarabaña <hola@tarabana.mx>',
      to: inv.email,
      subject: 'Recordatorio — Tu invitación a Tarabaña',
      html: `<div style="font-family:sans-serif;background:#0a0a0a;padding:40px;color:#fff;">
        <img src="https://tarabana.mx/tarabanalogo.png" height="48" style="filter:brightness(0) invert(1);display:block;margin-bottom:24px;">
        <h2 style="color:#fff;">Hola ${inv.full_name}</h2>
        <p style="color:#888;">Tu invitacion para unirte como <strong style="color:#E8531D;">${roleLabel[inv.role]}</strong>.</p>
        <a href="${url}" style="display:inline-block;background:#E8531D;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0;">Activar cuenta</a>
        <p style="color:#555;font-size:12px;">Válido por 7 días.</p>
      </div>`
    })
  }

  return NextResponse.redirect(new URL('/admin/usuarios', req.url))
}

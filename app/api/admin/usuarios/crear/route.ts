import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { isSuperAdmin, ASSIGNABLE_ROLES } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'

const resend = new Resend(process.env.RESEND_API_KEY)

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  produccion: 'Jefe de Producción',
  ventas: 'Ventas',
  vendedor: 'Vendedor',
  contabilidad: 'Lector / Contabilidad',
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { nombre, email, cel, rol, vendedor_id, vendedor_nuevo } = await request.json()
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })

  const serviceClient = createServiceClient()

  // ── Ficha de vendedor ─────────────────────────────────────
  //
  // Un vendedor sin ficha entra al panel y no puede crear nada, porque
  // mi_vendedor_id() resuelve por vendedores.profile_id. Asi que se exige
  // aqui y se resuelve en el mismo paso que la invitacion.
  //
  // La ficha NO se liga ahora: al invitar todavia no existe el perfil. Se
  // guarda en invitaciones.vendedor_id y /api/invitaciones/activar hace la
  // liga cuando el perfil ya existe.
  const TIPOS_FICHA = ['interno', 'externo', 'distribuidor']
  let fichaId: string | null = null

  if (rol === 'vendedor') {
    if (vendedor_nuevo) {
      const nombreFicha = String(vendedor_nuevo.nombre || '').trim()
      const tipoFicha = String(vendedor_nuevo.tipo || 'externo')
      if (nombreFicha.length < 2)
        return NextResponse.json({ error: 'El nombre de la ficha es obligatorio' }, { status: 400 })
      if (!TIPOS_FICHA.includes(tipoFicha))
        return NextResponse.json({ error: 'Tipo de ficha invalido' }, { status: 400 })

      // comision_pct se deja en el default de la tabla: en Fase 3 las
      // comisiones pasan a tramos marginales, asi que pedir un porcentaje
      // aqui seria capturar un dato que se va a reemplazar.
      const { data: creada, error: eFicha } = await serviceClient
        .from('vendedores')
        .insert({ nombre: nombreFicha, tipo: tipoFicha, activo: true })
        .select('id')
        .single()
      if (eFicha || !creada)
        return NextResponse.json({ error: eFicha?.message || 'No se pudo crear la ficha' }, { status: 400 })
      fichaId = creada.id
    } else if (vendedor_id) {
      const { data: ficha } = await serviceClient
        .from('vendedores')
        .select('id, profile_id, activo')
        .eq('id', vendedor_id)
        .maybeSingle()
      if (!ficha) return NextResponse.json({ error: 'Ficha de vendedor no encontrada' }, { status: 404 })
      if (ficha.profile_id) return NextResponse.json({ error: 'Esa ficha ya esta ligada a otro usuario' }, { status: 409 })
      if (ficha.activo === false) return NextResponse.json({ error: 'Esa ficha esta inactiva' }, { status: 400 })

      // Que no quede comprometida en dos invitaciones pendientes a la vez.
      const { data: comprometida } = await serviceClient
        .from('invitaciones')
        .select('id, email')
        .eq('vendedor_id', vendedor_id)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (comprometida)
        return NextResponse.json({ error: `Esa ficha ya esta reservada para la invitacion de ${comprometida.email}` }, { status: 409 })

      fichaId = ficha.id
    } else {
      return NextResponse.json({ error: 'Un vendedor necesita una ficha de vendedor' }, { status: 400 })
    }
  }

  // Validar duplicados antes de insertar
  const { data: existingProfile } = await serviceClient.from('profiles').select('id').eq('email', email).single()
  if (existingProfile) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese correo. Búscalo en la lista de usuarios.' }, { status: 409 })
  }

  const { data: existingInv } = await serviceClient
    .from('invitaciones')
    .select('id, used, expires_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingInv) {
    if (!existingInv.used && new Date(existingInv.expires_at) > new Date()) {
      return NextResponse.json({ error: 'Ya hay una invitación pendiente para ese correo. Reenvíala desde la lista en vez de crear una nueva.' }, { status: 409 })
    }
    // used=true but no profile → activación a medias, permitir nueva invitación
    if (existingInv.used && !existingProfile) {
      logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'usuario.invitar.override', entidad: 'invitaciones', detalle: { email, nota: 'Invitación previa marcada como used pero sin profile — se permite crear nueva' }, request })
    }
  }

  // Crear invitación en DB — expires_at calculado server-side (7 días)
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: inv, error: invError } = await serviceClient
    .from('invitaciones')
    .insert({ email, full_name: nombre, role: rol, created_by: user.id, expires_at, vendedor_id: fichaId })
    .select('token')
    .single()

  if (invError) return NextResponse.json({ error: invError.message }, { status: 400 })

  const activationUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tarabana.mx'}/activar/${inv.token}`

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
            <img src="https://tarabana.mx/tarabanalogo.png" alt="Tarabaña" height="56" style="display:block;margin:0 auto;filter:brightness(0) invert(1);">
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
            <p style="margin:0;color:#555;font-size:12px;">Este link expira en 7 días. Si no esperabas esta invitación, ignora este correo.</p>
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

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'usuario.invitar', entidad: 'invitaciones', entidadId: inv.token, detalle: { email, nombre, rol, vendedor_id: fichaId }, request })
  return NextResponse.json({ ok: true })
}

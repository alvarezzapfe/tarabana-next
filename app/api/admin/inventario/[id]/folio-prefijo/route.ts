import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canManageInventory } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

/**
 * Prefijo de folio de lote de un producto.
 *
 * Ruta propia y no parte del update grande de `/admin/inventario/edit/[id]`
 * por dos razones:
 *
 *   1. Esa pantalla escribe `productos` con la anon key desde el browser,
 *      que es la deuda que docs/RLS.md marca como pendiente. Un campo nuevo
 *      no tiene por qué sumarse a ella.
 *   2. El prefijo es UNICO entre productos, asi que el 23505 necesita un
 *      mensaje propio ("ya lo usa Brasa"), y eso pide saber quien lo tiene.
 *
 * Cambiar el prefijo NO reescribe los folios ya emitidos: `lotes` guarda su
 * propio `folio_prefijo` y su `folio` ya formado. Eso es a proposito — un
 * folio impreso en una caja no puede cambiar porque alguien editó el
 * catalogo. El consecutivo sigue por la serie del prefijo NUEVO.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canManageInventory(profile?.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const crudo = typeof body.folio_prefijo === 'string' ? body.folio_prefijo.trim().toUpperCase() : ''

  // Vacio = quitar el prefijo. Un producto sin prefijo simplemente no se
  // puede cocinar (el trigger lo rechaza con un mensaje claro), que es lo
  // correcto para una cerveza de invitado o un producto de reventa.
  const prefijo = crudo || null

  if (prefijo !== null && !/^[A-Z]{3}$/.test(prefijo)) {
    return NextResponse.json(
      { error: 'El prefijo son exactamente 3 letras (A–Z), sin números ni acentos.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const { data: producto } = await service
    .from('productos').select('nombre, folio_prefijo').eq('id', id).single()
  if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  if (producto.folio_prefijo === prefijo) {
    return NextResponse.json({ ok: true, folio_prefijo: prefijo })
  }

  // El unique parcial de la DB es la verdad, pero mirar antes deja decir
  // QUIEN lo tiene; el 23505 solo diria que choca.
  if (prefijo !== null) {
    const { data: dueno } = await service
      .from('productos').select('nombre').eq('folio_prefijo', prefijo).maybeSingle()
    if (dueno) {
      return NextResponse.json(
        { error: `El prefijo ${prefijo} ya lo usa ${dueno.nombre}.` },
        { status: 409 }
      )
    }
  }

  const { error } = await service
    .from('productos').update({ folio_prefijo: prefijo }).eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `El prefijo ${prefijo} ya está en uso.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'producto.folio_prefijo', entidad: 'productos', entidadId: id,
    detalle: { nombre: producto.nombre, de: producto.folio_prefijo, a: prefijo },
    request,
  })

  return NextResponse.json({ ok: true, folio_prefijo: prefijo })
}

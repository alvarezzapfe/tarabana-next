import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isStaff, isVendedor } from '../../../../../src/lib/roles'
import { construirLibro, validarHojas } from '../../../../../src/lib/libro-xlsx'
import {
  armarHojasClientes, filtrarClientes, nombreArchivoClientes,
  type ClienteExport, type FiltrosClientes,
} from '../../../../../src/lib/clientes-export'
import type { FilaSaldo } from '../../../../../src/lib/metricas'
import { logAction } from '../../../../../src/lib/audit'

/**
 * El .xlsx de la lista de clientes.
 *
 * A diferencia del export de Pedidos, que escribe los renglones que el
 * navegador ya tiene en pantalla, esta ruta CONSULTA: el archivo pide
 * facturado, cobrado, saldo y ultimo pedido, y eso no esta cargado en la
 * tabla. Lo que manda el cliente son nada mas los filtros.
 *
 * Que eso no abra una via para sacar datos de mas depende de dos cosas:
 *
 *   1. Las consultas van con el cliente de SESION, no con el service client,
 *      asi que RLS aplica. Un vendedor recibe solo su cartera
 *      (`profiles_vendedor_read`) y solo sus pedidos (`pedidos_vendedor_read`
 *      a traves de `pedidos_saldo`, que tiene security_invoker = on) sin que
 *      esta ruta tenga que filtrar nada por vendedor_id.
 *   2. El guard de abajo, que es por ROL y no por que el boton este oculto.
 *
 * El unico uso del service client es traducir `vendedor_id` a un nombre, y
 * acotado a los ids que ya aparecen en las filas que el usuario pudo leer.
 * Hace falta porque `vendedores` pide is_staff() por RLS y un vendedor no lo
 * es, asi que su propio nombre no le llegaria.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role

  // Staff —contabilidad incluida, que exporta aunque no de de alta clientes—
  // o vendedor, que pasa el mismo guard y a quien RLS deja en su cartera.
  if (!isStaff(role) && !isVendedor(role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let filtros: FiltrosClientes = {}
  try {
    const body = await request.json()
    const f = (body?.filtros ?? {}) as Record<string, unknown>
    filtros = {
      q: typeof f.q === 'string' ? f.q : null,
      tipo: typeof f.tipo === 'string' ? f.tipo : null,
      nivel: typeof f.nivel === 'string' ? f.nivel : null,
    }
  } catch {
    // Sin cuerpo se exporta todo, que es lo que significa "sin filtros".
  }

  const [{ data: clientes, error: errorClientes }, { data: saldos, error: errorSaldos }] = await Promise.all([
    supabase
      .from('profiles')
      .select(`
        id, email, full_name, marca_negocio, razon_social, giro, tipo_consumidor,
        nivel_precio, rfc, vendedor_id, contacto_nombre, contacto_whatsapp, phone,
        instagram, sitio_web, requiere_factura, tipo_persona_registro, tipo_persona,
        regimen_fiscal, cp_fiscal, uso_cfdi, calle, num_ext, num_int, colonia,
        municipio, estado, cp, referencias, horario_recepcion, dias_credito,
        limite_credito, notas, created_at
      `)
      .eq('role', 'comprador')
      .order('created_at', { ascending: false }),
    supabase
      .from('pedidos_saldo')
      .select('id, cliente_id, total, pagado, saldo, status, estado_cobro, dias_vencido, fecha_pedido, created_at'),
  ])

  const falla = errorClientes || errorSaldos
  if (falla) {
    console.error('[clientes/exportar]', falla)
    return NextResponse.json({ error: `No se pudieron leer los datos: ${falla.message}` }, { status: 500 })
  }

  const filtrados = filtrarClientes((clientes || []) as ClienteExport[], filtros)
  if (filtrados.length === 0) {
    return NextResponse.json({ error: 'No hay clientes que exportar con esos filtros.' }, { status: 400 })
  }

  // Solo los nombres de los vendedores que de verdad salen en el archivo.
  const idsVendedor = [...new Set(filtrados.map(c => c.vendedor_id).filter(Boolean))] as string[]
  const vendedores = new Map<string, string>()
  if (idsVendedor.length) {
    const { data: fichas } = await createServiceClient()
      .from('vendedores').select('id, nombre').in('id', idsVendedor)
    for (const v of (fichas || []) as { id: string; nombre: string | null }[]) {
      if (v.nombre) vendedores.set(v.id, v.nombre)
    }
  }

  // Los saldos se acotan a los clientes exportados: si no, un cliente que el
  // filtro dejo fuera aportaria sus pedidos al resumen.
  const exportados = new Set(filtrados.map(c => c.id))

  const hojas = validarHojas(armarHojasClientes({
    clientes: filtrados,
    saldos: ((saldos || []) as FilaSaldo[]).filter(f => f.cliente_id && exportados.has(f.cliente_id)),
    vendedores,
  }))
  if ('error' in hojas) return NextResponse.json({ error: hojas.error }, { status: 400 })

  const bytes = await construirLibro(hojas)
  const nombre = nombreArchivoClientes()

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: role!,
    accion: 'cliente.exportar', entidad: 'profiles',
    detalle: { renglones: filtrados.length, filtros, archivo: nombre },
    request,
  })

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.byteLength),
    },
  })
}

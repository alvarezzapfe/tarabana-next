import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { cargarTasaIva } from '../../../../../src/lib/iva'
import { NextResponse } from 'next/server'
import { canManageAsAdmin, canWrite, isVendedor } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { cargarCatalogoImport } from '../../../../../src/lib/catalogo-import'
import { cargarComprometido, cargarStockMap, crearPedido } from '../../../../../src/lib/crear-pedido'
import { LIMITE_BYTES, leerHojaCaptura } from '../../../../../src/lib/leer-xlsx'
import { columnaStockDe } from '../../../../../src/lib/unidades'
import { hoyMx } from '../../../../../src/lib/fechas'
import {
  COLUMNAS_ADMIN, COLUMNAS_BASE,
  construirPlan, itemsParaCrear,
  type PedidoPlan,
} from '../../../../../src/lib/pedidos-importar'

/**
 * Carga masiva de pedidos desde Excel. Dos modos sobre el MISMO archivo:
 *
 *   modo=preview     parsea, valida y devuelve el plan. No crea nada.
 *   modo=confirmar   reparsea, revalida y crea los pedidos validos.
 *
 * Confirmar recibe el archivo otra vez, no el plan que tiene el navegador.
 * Suena redundante y es a proposito: si aceptara el plan del cliente habria
 * que revalidarlo entero de todos modos, y lo que se crea podria no ser lo
 * que la persona aprobo. Reparsear el mismo archivo es determinista.
 *
 * Lo unico que puede cambiar entre los dos pasos es el mundo: stock que se
 * movio, un cliente que salio de la cartera. Por eso confirmar vuelve a
 * validar y reporta pedido por pedido.
 */

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role
  const esVendedor = isVendedor(role)
  if (!canWrite(role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const puedeDescuento = canManageAsAdmin(role)
  const columnas = puedeDescuento ? [...COLUMNAS_BASE, ...COLUMNAS_ADMIN] : [...COLUMNAS_BASE]

  // ── Rechazo barato por Content-Length ─────────────────────
  // Es una pista del cliente, no una garantia, asi que el tope de verdad lo
  // vuelve a aplicar leerHojaCaptura sobre los bytes reales.
  const declarado = Number(request.headers.get('content-length') || 0)
  if (declarado > LIMITE_BYTES * 2) {
    return NextResponse.json(
      { error: `El archivo excede el limite de ${LIMITE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el formulario.' }, { status: 400 })
  }

  const archivo = form.get('archivo')
  const modo = String(form.get('modo') || 'preview')
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
  }
  if (modo !== 'preview' && modo !== 'confirmar') {
    return NextResponse.json({ error: "modo debe ser 'preview' o 'confirmar'." }, { status: 400 })
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())

  const lectura = await leerHojaCaptura(bytes, columnas)
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 })

  const service = createServiceClient()
  const catalogo = await cargarCatalogoImport({ service, userId: user.id, esVendedor })
  if ('error' in catalogo)
    return NextResponse.json({ error: catalogo.error }, { status: catalogo.status })

  // `hoyMx()` y no `new Date()`: la fecha de negocio es la de Mexico, y de
  // ella dependen el default de fecha_pedido y la validacion de "no futura".
  // La tasa es solo para que la vista previa prometa el mismo total que va a
  // cobrar la vista. La que se GUARDA la vuelve a leer `crearPedido`.
  const plan = construirPlan(lectura.filas, catalogo, {
    puedeDescuento,
    esVendedor,
    hoy: hoyMx(),
    ivaTasa: await cargarTasaIva(service),
  })

  const avisos: string[] = [...plan.erroresGlobales]
  if (lectura.columnasDesconocidas.length) {
    avisos.push(
      `Estas columnas del archivo no se usaron: ${lectura.columnasDesconocidas.join(', ')}.` +
      (puedeDescuento ? '' : ' Las de descuento y envio solo las puede usar un admin.')
    )
  }

  // ── Preview ───────────────────────────────────────────────
  if (modo === 'preview') {
    return NextResponse.json({
      ok: true,
      modo,
      archivo: archivo.name,
      avisos,
      plan: {
        renglones: plan.renglones,
        validos: plan.validos,
        invalidos: plan.invalidos,
        totalValido: plan.totalValido,
        pedidos: plan.pedidos,
      },
    })
  }

  // ── Confirmar ─────────────────────────────────────────────
  if (plan.erroresGlobales.length) {
    return NextResponse.json({ error: plan.erroresGlobales.join(' ') }, { status: 400 })
  }

  const porCrear = plan.pedidos.filter(p => p.valido)
  if (porCrear.length === 0) {
    return NextResponse.json(
      { error: 'Ningun pedido del archivo es valido. Corrige los errores y vuelve a subirlo.' },
      { status: 400 }
    )
  }

  // Un solo catalogo para todo el lote, que se va descontando conforme cada
  // pedido se crea: asi dos pedidos del mismo archivo no se reparten el mismo
  // barril.
  //
  // Y un solo comprometido, que NO se muta: lo que consume cada pedido del
  // lote ya se descuenta del catalogo de arriba (`descontarDelMapa`), asi que
  // sumarlo tambien al comprometido contaria dos veces el mismo pedido.
  //
  // OJO: esto sigue sin RESERVAR stock. El disponible se calcula al validar,
  // no se aparta, asi que un pedido que alguien mas levante mientras corre el
  // archivo puede dejar corto al siguiente.
  const [stockMap, comprometido] = await Promise.all([
    cargarStockMap(service),
    cargarComprometido(service),
  ])

  const creados: { referencia: string; pedido_id: string; total: number }[] = []
  const fallidos: { referencia: string; error: string }[] = []

  for (const pedido of porCrear) {
    const resultado = await crearPedido(
      {
        cliente_id: pedido.cliente_id!,
        items: itemsParaCrear(pedido),
        condiciones_pago: pedido.condiciones_pago,
        fecha_pedido: pedido.fecha_pedido,
        fecha_entrega: pedido.fecha_entrega,
        orden_compra: pedido.orden_compra,
        folio_factura: pedido.folio_factura,
        notas: notaDe(pedido, archivo.name),
        costo_envio: pedido.costo_envio,
        descuento_tipo: pedido.descuento_tipo,
        descuento_valor: pedido.descuento_valor,
        descuento_motivo: pedido.descuento_motivo,
        incluye_iva: pedido.incluye_iva,
      },
      {
        userId: user.id,
        userEmail: user.email!,
        role: role!,
        db: supabase,
        service,
        request,
        stockMap,
        comprometido: comprometido.por,
      }
    )

    if (resultado.ok) {
      creados.push({ referencia: pedido.referencia, pedido_id: resultado.pedido_id, total: resultado.total })
      descontarDelMapa(stockMap, pedido)
    } else {
      fallidos.push({ referencia: pedido.referencia, error: resultado.error })
    }
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: role!,
    accion: 'pedido.importar', entidad: 'pedidos',
    detalle: {
      archivo: archivo.name,
      bytes: bytes.byteLength,
      renglones: plan.renglones,
      pedidos_en_archivo: plan.pedidos.length,
      creados: creados.length,
      fallidos: fallidos.length,
      omitidos_por_invalidos: plan.invalidos,
      referencias_creadas: creados.map(c => c.referencia),
      referencias_fallidas: fallidos.map(f => f.referencia),
      pedido_ids: creados.map(c => c.pedido_id),
      total: creados.reduce((s, c) => s + c.total, 0),
    },
    request,
  })

  return NextResponse.json({
    ok: true,
    modo,
    archivo: archivo.name,
    avisos,
    creados,
    fallidos,
    omitidos: plan.invalidos,
    total: creados.reduce((s, c) => s + c.total, 0),
  })
}

/**
 * La nota del pedido, con la referencia del archivo pegada.
 *
 * Sin esto, un pedido importado es indistinguible de uno capturado a mano y
 * no hay forma de volver del pedido al renglon del Excel que lo origino.
 */
function notaDe(pedido: PedidoPlan, archivo: string): string {
  const marca = `Importado de ${archivo} · referencia ${pedido.referencia}`
  return pedido.notas ? `${pedido.notas}\n${marca}` : marca
}

/** Descuenta del catalogo en memoria lo que un pedido ya consumio. */
function descontarDelMapa(stockMap: Map<string, Record<string, unknown>>, pedido: PedidoPlan) {
  for (const partida of pedido.partidas) {
    const prod = stockMap.get(partida.producto_id)
    const col = columnaStockDe(partida.presentacion)
    if (!prod || !col) continue
    prod[col] = (Number(prod[col]) || 0) - partida.cantidad
  }
}

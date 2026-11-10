import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { LIMITE_BYTES, leerHojaCaptura } from '../../../../../src/lib/leer-xlsx'
import { NOMBRE_HOJA_CLIENTES } from '../../../../../src/lib/clientes-export'
import {
  CLAVES_IMPORT, avisoCalculadas, construirPlanClientes,
  type CatalogoClientes, type FilaPlan,
} from '../../../../../src/lib/clientes-importar'
import { crearCliente, fichaVendedorDe } from '../../../../../src/lib/crear-cliente'
import { normalizarRFC } from '../../../../../src/lib/clientes'

/**
 * Carga masiva de clientes NUEVOS desde Excel. Dos modos sobre el MISMO
 * archivo:
 *
 *   modo=preview     parsea, valida y devuelve el plan. No crea nada.
 *   modo=confirmar   reparsea, revalida y crea los renglones nuevos.
 *
 * Confirmar recibe el archivo otra vez, no el plan que tiene el navegador.
 * Igual que en la carga de pedidos: si aceptara el plan del cliente habria
 * que revalidarlo entero de todos modos, y lo que se crea podria no ser lo
 * que la persona aprobo. Reparsear el mismo archivo es determinista.
 *
 * Lo unico que puede cambiar entre los dos pasos es el mundo: un correo que
 * alguien mas dio de alta en el intervalo. Por eso confirmar vuelve a cargar
 * el catalogo y a validar, y reporta renglon por renglon.
 *
 * NO manda invitaciones: crear la ficha y mandarle el correo al cliente son
 * dos decisiones distintas, y mandar 200 correos de golpe no es la que
 * alguien quiere tomar sin pedirla.
 */

/** Correos y RFCs que ya existen, mas los vendedores activos. */
async function cargarCatalogo(service: SupabaseClient): Promise<CatalogoClientes> {
  // Con el service client y no con el de sesion a proposito: la deteccion de
  // repetidos tiene que ver TODOS los correos, no los que RLS le deja ver a
  // quien sube. Un vendedor no puede leer la ficha de un cliente ajeno, pero
  // si tiene que enterarse de que ese correo ya esta ocupado — que es lo
  // mismo que ya le dice hoy el alta de uno en uno.
  //
  // Solo se leen las dos columnas que se comparan, y nunca se devuelven al
  // navegador: lo que sale de aqui es un Set que se consulta del lado del
  // servidor.
  const [{ data: perfiles }, { data: fichas }] = await Promise.all([
    service.from('profiles').select('email, rfc'),
    service.from('vendedores').select('id, nombre').eq('activo', true),
  ])

  const emails = new Set<string>()
  const rfcs = new Set<string>()
  for (const p of (perfiles || []) as { email: string | null; rfc: string | null }[]) {
    if (p.email) emails.add(p.email.trim().toLowerCase())
    const rfc = normalizarRFC(p.rfc)
    if (rfc) rfcs.add(rfc)
  }

  return {
    emails,
    rfcs,
    vendedores: ((fichas || []) as { id: string; nombre: string | null }[])
      .filter((f): f is { id: string; nombre: string } => !!f.nombre),
  }
}

/** Lo que viaja al navegador de cada renglon: el plan sin el cuerpo. */
const paraUI = (f: FilaPlan) => ({
  fila: f.fila,
  estado: f.estado,
  nombre: f.nombre,
  email: f.email,
  rfc: f.rfc,
  giro: f.giro,
  nivel: f.nivel,
  vendedor: f.vendedor,
  motivo: f.motivo,
})

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role
  const esVendedor = isVendedor(role)
  // Mismo guard que el alta de uno en uno: crear clientes es escribir.
  // Contabilidad exporta pero no da de alta.
  if (!canWrite(role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

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

  const lectura = await leerHojaCaptura(bytes, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 })

  const service = createServiceClient()
  const vendedorId = esVendedor ? await fichaVendedorDe(service, user.id) : null
  if (esVendedor && !vendedorId) {
    return NextResponse.json(
      { error: 'Tu usuario no esta ligado a una ficha de vendedor activa. Pide a un super admin que la asigne.' },
      { status: 403 }
    )
  }

  const catalogo = await cargarCatalogo(service)
  const plan = construirPlanClientes(lectura.filas, catalogo, { esVendedor })

  const avisos = [...plan.avisos]
  const avisoCalc = avisoCalculadas(lectura.columnasUsadas)
  if (avisoCalc) avisos.push(avisoCalc)
  if (lectura.columnasDesconocidas.length) {
    avisos.push(`Estas columnas del archivo no se usaron: ${lectura.columnasDesconocidas.join(', ')}.`)
  }

  // ── Preview ───────────────────────────────────────────────
  if (modo === 'preview') {
    return NextResponse.json({
      ok: true,
      modo,
      archivo: archivo.name,
      avisos,
      erroresGlobales: plan.erroresGlobales,
      plan: {
        renglones: plan.renglones,
        nuevos: plan.nuevos,
        existentes: plan.existentes,
        errores: plan.errores,
        filas: plan.filas.map(paraUI),
      },
    })
  }

  // ── Confirmar ─────────────────────────────────────────────
  if (plan.erroresGlobales.length) {
    return NextResponse.json({ error: plan.erroresGlobales.join(' ') }, { status: 400 })
  }

  const porCrear = plan.filas.filter(f => f.estado === 'nuevo' && f.cuerpo)
  if (porCrear.length === 0) {
    return NextResponse.json(
      { error: 'No hay ningun cliente nuevo que crear en ese archivo.' },
      { status: 400 }
    )
  }

  const creados: { fila: number; id: string; nombre: string; email: string }[] = []
  const fallidos: { fila: number; nombre: string; email: string; error: string }[] = []

  for (const f of porCrear) {
    const resultado = await crearCliente(f.cuerpo!, {
      userId: user.id,
      userEmail: user.email!,
      role: role!,
      esVendedor,
      vendedorId,
      service,
      request,
      // Una entrada por archivo, no una por cliente: 200 entradas identicas
      // no son un rastro, son ruido. La del lote va abajo con el detalle.
      auditar: false,
    })

    if (resultado.ok) {
      creados.push({ fila: f.fila, id: resultado.id, nombre: f.nombre, email: resultado.email })
    } else {
      fallidos.push({ fila: f.fila, nombre: f.nombre, email: f.email, error: resultado.error })
    }
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: role!,
    accion: 'cliente.importar', entidad: 'profiles',
    detalle: {
      archivo: archivo.name,
      bytes: bytes.byteLength,
      renglones: plan.renglones,
      creados: creados.length,
      fallidos: fallidos.length,
      omitidos_por_existentes: plan.existentes,
      omitidos_por_errores: plan.errores,
      cliente_ids: creados.map(c => c.id),
      emails: creados.map(c => c.email),
      vendedor_id: vendedorId,
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
    existentes: plan.existentes,
    errores: plan.errores,
  })
}

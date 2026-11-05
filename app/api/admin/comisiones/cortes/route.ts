import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { cargarDatosComision } from '../../../../../src/lib/comisiones-datos'
import {
  comisionesPorVendedor,
  periodoDeFecha,
  primerDiaDelPeriodo,
  resolverTramos,
} from '../../../../../src/lib/comisiones'

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Cierra el mes de uno o varios vendedores: calcula y guarda el snapshot.
 *
 * El mes abierto se calcula en vivo cada vez que se mira; cerrarlo es
 * justamente congelarlo, para que cambiar los tramos o las tasas despues no
 * reescriba un mes ya conciliado. Por eso el corte guarda, ademas del monto,
 * las tasas y la escalera con las que se calculo.
 *
 * Body: { periodo: 'YYYY-MM', vendedor_ids: string[] }
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const body = await request.json()
  const periodo: string = body?.periodo
  const vendedorIds: string[] = Array.isArray(body?.vendedor_ids) ? body.vendedor_ids : []

  if (!FORMATO_PERIODO.test(periodo || '')) {
    return NextResponse.json({ error: 'periodo debe venir como YYYY-MM' }, { status: 400 })
  }
  if (!vendedorIds.length) {
    return NextResponse.json({ error: 'Hay que indicar al menos un vendedor' }, { status: 400 })
  }
  // Cerrar el mes en curso es valido (la UI avisa que va incompleto); cerrar
  // uno que no ha empezado no.
  if (periodo > periodoDeFecha(new Date())) {
    return NextResponse.json({ error: 'Ese mes todavia no empieza' }, { status: 400 })
  }

  const datos = await cargarDatosComision(supabase)

  // Un mes sin escalera no se cierra: congelaria un 0 que nadie decidio.
  const sinEsquema = vendedorIds.filter(id => resolverTramos(datos.tramos, id).length === 0)
  if (sinEsquema.length) {
    const { data: fichas } = await supabase.from('vendedores').select('nombre').in('id', sinEsquema)
    const nombres = (fichas || []).map(f => f.nombre).join(', ') || sinEsquema.join(', ')
    return NextResponse.json(
      { error: `Sin tramos de comision configurados para ${nombres}. Captura su escalera o la global antes de cerrar el mes.` },
      { status: 400 }
    )
  }

  const calculos = comisionesPorVendedor({
    vendedorIds,
    pagos: datos.pagos,
    pedidos: datos.pedidos,
    tramos: datos.tramos,
    periodo,
    ivaTasa: datos.ivaTasa,
    iepsTasa: datos.iepsTasa,
  })

  const filas = calculos.map(c => ({
    vendedor_id: c.vendedor_id,
    periodo: primerDiaDelPeriodo(periodo),
    base: c.base,
    comision: c.comision,
    iva_tasa: c.ivaTasa,
    ieps_tasa: c.iepsTasa,
    por_tramo: c.porTramo,
    detalle: c.detalle,
    tramos_usados: resolverTramos(datos.tramos, c.vendedor_id),
    estado: 'pendiente',
    cerrado_por: user.id,
  }))

  // El indice unico (vendedor_id, periodo) es el que impide cerrar dos veces
  // el mismo mes; `ignoreDuplicates` lo convierte en "los que faltaban" en vez
  // de un error que no dice cual choco.
  const { data: creados, error } = await supabase
    .from('comision_cortes')
    .upsert(filas, { onConflict: 'vendedor_id,periodo', ignoreDuplicates: true })
    .select('id, vendedor_id, base, comision')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const creadosIds = new Set((creados || []).map(c => c.vendedor_id))
  const yaExistian = vendedorIds.filter(id => !creadosIds.has(id))

  for (const c of creados || []) {
    logAction({
      actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
      accion: 'comision.corte.cerrar', entidad: 'comision_cortes', entidadId: c.id,
      detalle: { vendedor_id: c.vendedor_id, periodo, base: c.base, comision: c.comision },
      request,
    })
  }

  return NextResponse.json({ ok: true, creados: creados || [], ya_existian: yaExistian })
}

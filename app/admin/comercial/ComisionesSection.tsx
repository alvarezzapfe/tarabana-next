import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { canManageAsAdmin, isSuperAdmin } from '../../../src/lib/roles'
import { cargarDatosComision } from '../../../src/lib/comisiones-datos'
import {
  comisionesPorVendedor,
  periodoDeFecha,
  primerDiaDelPeriodo,
} from '../../../src/lib/comisiones'
import ComisionesClient, { type Corte, type Fila, type Vendedor } from './ComisionesClient'

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Comisiones del mes por vendedor.
 *
 * El calculo corre en el servidor, no en el cliente: asi los pagos de todos
 * los vendedores no viajan al navegador y el mes que se mira es un parametro
 * de la URL en vez de estado local. Cambiar de mes es navegar.
 */
export default async function ComisionesSection({
  periodo: periodoParam,
  acento,
}: {
  periodo?: string
  acento: string
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  // La pestana la ve admin y super admin (misma regla que el sidebar), pero
  // editar tramos y mover cortes es solo de super admin, igual que las
  // policies de escritura de las dos tablas.
  if (!canManageAsAdmin(profile?.role)) {
    return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>
  }
  const puedeEditar = isSuperAdmin(profile?.role)

  const mesEnCurso = periodoDeFecha(new Date())
  // Un periodo invalido o futuro en la URL cae al mes en curso en vez de
  // reventar o mostrar un mes vacio sin explicacion.
  const periodo =
    periodoParam && FORMATO_PERIODO.test(periodoParam) && periodoParam <= mesEnCurso
      ? periodoParam
      : mesEnCurso

  const [datos, { data: vendedores }, { data: cortes }] = await Promise.all([
    cargarDatosComision(supabase),
    supabase.from('vendedores').select('id, nombre, activo, tipo').order('nombre'),
    supabase
      .from('comision_cortes')
      .select('id, vendedor_id, periodo, base, comision, estado, pagado_at, por_tramo, detalle')
      .eq('periodo', primerDiaDelPeriodo(periodo)),
  ])

  const fichas = (vendedores || []) as Vendedor[]

  const calculos = comisionesPorVendedor({
    vendedorIds: fichas.map(v => v.id),
    pagos: datos.pagos,
    pedidos: datos.pedidos,
    tramos: datos.tramos,
    periodo,
    ivaTasa: datos.ivaTasa,
    iepsTasa: datos.iepsTasa,
  })

  const cortePor = new Map((cortes || []).map(c => [c.vendedor_id, c as Corte]))

  const filas: Fila[] = fichas.map((vendedor, i) => ({
    vendedor,
    calculo: calculos[i],
    corte: cortePor.get(vendedor.id) ?? null,
  }))

  // Las fichas sin movimiento ni corte van al final: lo que importa arriba es
  // quien cobro algo este mes.
  filas.sort((a, b) => {
    const pesoA = (a.corte?.comision ?? a.calculo.comision) || 0
    const pesoB = (b.corte?.comision ?? b.calculo.comision) || 0
    if (pesoB !== pesoA) return pesoB - pesoA
    return a.vendedor.nombre.localeCompare(b.vendedor.nombre, 'es')
  })

  return (
    <ComisionesClient
      periodo={periodo}
      esMesEnCurso={periodo === mesEnCurso}
      filas={filas}
      tramos={datos.tramos}
      acento={acento}
      puedeEditar={puedeEditar}
      ivaTasa={datos.ivaTasa}
      iepsTasa={datos.iepsTasa}
    />
  )
}

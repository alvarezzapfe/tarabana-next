/**
 * El reporte imprimible, armado una sola vez.
 *
 * Este archivo COMPONE: toda la aritmetica vive en ./metricas y aqui solo se
 * la llama en orden y se junta el resultado. La razon es que el reporte sale
 * por dos lados —la pagina que se imprime y el .xlsx— y si cada uno calculara
 * lo suyo, tarde o temprano dirian numeros distintos del mismo periodo.
 *
 * `armarReporte` devuelve todo lo que necesitan las tres secciones;
 * `hojasDeReporte` traduce ese mismo objeto a hojas de Excel. Nada se vuelve a
 * sumar en el camino.
 */
import {
  antiguedadCartera,
  bucketsDe,
  granularidadEfectiva,
  hallazgos,
  itemsVendidosEn,
  mesesDeTendencia,
  mezclaPorBucket,
  partidasValuadas,
  pedidosConSaldo,
  porCobrarDe,
  rangoAnterior,
  rangoTendencia,
  resumenDePeriodo,
  ritmoAnualizado,
  serieCrecimiento,
  serieDePeriodo,
  totalesDeClientes,
  ventasPorCliente,
  ventasPorEstilo,
  ventasPorPresentacion,
  vencidoDe,
  type BucketCartera,
  type FilaCobranza,
  type FilaEstilo,
  type FilaPresentacion,
  type FilaVentasCliente,
  type Hallazgo,
  type MezclaBucket,
  type PuntoCrecimiento,
  type PuntoSerie,
  type Rango,
  type ResumenPeriodo,
  type TotalesCliente,
} from './metricas.ts'
import { litrosTotales, topProductosEnLitros, type FilaProducto } from './unidades.ts'
import { etiquetaFecha, fechaHoraMx } from './fechas.ts'
import { FMT_ENTERO, FMT_PESOS, type Celda, type HojaDatos } from './libro-xlsx.ts'
import type { DatosReporte } from './reporte-datos.ts'

/** Cuantos clientes y productos entran en las tablas largas. */
export const TOPE_TABLA = 60

export type Reporte = {
  rango: Rango
  /** El periodo contra el que se compara: misma duracion, pegado atras. */
  anterior: Rango
  /** Fecha y hora de generacion, en hora de Mexico. */
  generado: string

  // Seccion 1
  resumen: ResumenPeriodo
  previo: ResumenPeriodo
  serie: PuntoSerie[]
  hoy: { porCobrar: number; vencido: number; litrosStock: number }
  hallazgos: Hallazgo[]

  // Seccion 2
  clientes: FilaVentasCliente[]
  totales: TotalesCliente
  presentaciones: FilaPresentacion[]
  estilos: FilaEstilo[]
  productos: FilaProducto[]
  /** Partidas del periodo sin presentacion registrada. No suman litros. */
  partidasSinUnidad: number
  /** Neto de pedidos cuyo importe no se pudo repartir entre sus partidas. */
  sinReparto: number
  cartera: BucketCartera[]
  cobranza: FilaCobranza[]

  // Seccion 3
  meses: 12 | 24
  rangoMeses: Rango
  crecimiento: PuntoCrecimiento[]
  mezcla: MezclaBucket[]
  /** Facturado del periodo extrapolado a 365 dias. */
  ritmo: number
}

export function armarReporte(fuente: DatosReporte, rango: Rango, ahora: Date = new Date()): Reporte {
  const { datos, stock, clientes, estiloDeProducto } = fuente
  const anterior = rangoAnterior(rango)

  const resumen = resumenDePeriodo(datos, rango)
  const previo = resumenDePeriodo(datos, anterior)

  const { partidas, sinReparto } = partidasValuadas(datos, rango)
  const { filas: productos, sinUnidad } = topProductosEnLitros(itemsVendidosEn(datos.pedidos, rango), TOPE_TABLA)

  const porCobrar = porCobrarDe(datos.saldos)
  const vencido = vencidoDe(datos.saldos)
  const cobranza = pedidosConSaldo(datos.saldos, clientes)

  const filasClientes = ventasPorCliente(datos, clientes, rango)

  const meses = mesesDeTendencia(rango)
  const rangoMeses = rangoTendencia(meses, ahora)
  const bucketsMeses = bucketsDe(rangoMeses, 'mes')

  return {
    rango,
    anterior,
    generado: fechaHoraMx(ahora),

    resumen,
    previo,
    // Con la granularidad automatica del periodo: es la serie de los
    // sparklines del resumen, no la de la tendencia de 12/24 meses.
    serie: serieDePeriodo(datos, bucketsDe(rango, granularidadEfectiva(rango, null))),
    hoy: { porCobrar, vencido, litrosStock: litrosTotales(stock) },
    hallazgos: hallazgos({ resumen, previo, cobranza, productos, porCobrar, vencido }),

    clientes: filasClientes,
    // Los totales se suman de la tabla completa y no del periodo: si se
    // recortara la tabla a los primeros N, el renglon de totales tiene que
    // seguir siendo el del periodo entero, y eso se dice en la pagina.
    totales: totalesDeClientes(filasClientes),
    presentaciones: ventasPorPresentacion(partidas),
    estilos: ventasPorEstilo(partidas, estiloDeProducto),
    productos,
    partidasSinUnidad: sinUnidad,
    sinReparto,
    cartera: antiguedadCartera(datos.saldos),
    cobranza,

    meses,
    rangoMeses,
    crecimiento: serieCrecimiento(datos, bucketsMeses),
    mezcla: mezclaPorBucket(datos, bucketsMeses),
    ritmo: ritmoAnualizado(resumen.facturado, rango),
  }
}

// ── Excel ───────────────────────────────────────────────────

const ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  corriente: 'Al corriente',
  parcial: 'Parcial',
  vencido: 'Vencido',
}

/** "Vencido 92 días" / "Al corriente". Lo comparten la pagina y el Excel. */
export const etiquetaCobranza = (e: { clave: string; dias: number }): string =>
  e.clave === 'vencido' ? `Vencido ${e.dias} ${e.dias === 1 ? 'día' : 'días'}` : ESTADO_LABEL[e.clave] || e.clave

/** Folio corto de un pedido: los ultimos seis del uuid, como en Pedidos. */
export const folioDe = (id: string) => `#${id.slice(-6).toUpperCase()}`

const pct = (n: number) => Number(n.toFixed(1))
const dinero = (n: number) => Number(n.toFixed(2))
const litros = (n: number) => Number(n.toFixed(1))

/**
 * El reporte como hojas de Excel: una por seccion.
 *
 * Los numeros van como NUMEROS y el formato se declara aparte, para que quien
 * reciba el archivo pueda sumar una columna sin limpiarla primero. Las fechas
 * se mandan como texto 'YYYY-MM-DD' a proposito: son columnas `date` sin hora
 * ni zona, y convertirlas a un Date de JS las corre un dia (ver
 * docs/SCHEMA_NOTES.md).
 */
export function hojasDeReporte(r: Reporte): HojaDatos[] {
  const periodo = `${r.rango.desde} a ${r.rango.hasta}`

  const resumen: Record<string, Celda>[] = [
    { Concepto: 'Periodo', Valor: periodo, Unidad: '' },
    { Concepto: 'Generado', Valor: r.generado, Unidad: '' },
    { Concepto: 'Periodo anterior', Valor: `${r.anterior.desde} a ${r.anterior.hasta}`, Unidad: '' },
    { Concepto: 'Facturado (sin IVA)', Valor: dinero(r.resumen.facturado), Unidad: 'MXN' },
    { Concepto: 'Facturado periodo anterior (sin IVA)', Valor: dinero(r.previo.facturado), Unidad: 'MXN' },
    // Renglon aparte y no sumado arriba: ver las dos unidades en metricas.ts.
    // Siempre visible aunque sea 0, porque en una hoja de calculo la ausencia
    // de un renglon se lee como un olvido y no como un cero.
    { Concepto: 'IVA facturado', Valor: dinero(r.resumen.iva), Unidad: 'MXN' },
    { Concepto: 'Total facturado (con IVA)', Valor: dinero(r.resumen.facturado + r.resumen.iva), Unidad: 'MXN' },
    { Concepto: 'Cobrado (por fecha de pago, con IVA)', Valor: dinero(r.resumen.cobrado), Unidad: 'MXN' },
    { Concepto: '% cobrado de lo facturado', Valor: r.resumen.pctCobrado === null ? '—' : pct(r.resumen.pctCobrado), Unidad: '%' },
    { Concepto: 'Pedidos', Valor: r.resumen.pedidos, Unidad: '' },
    { Concepto: 'Litros vendidos', Valor: litros(r.resumen.litros), Unidad: 'L' },
    { Concepto: 'Ticket promedio', Valor: r.resumen.ticket === null ? '—' : dinero(r.resumen.ticket), Unidad: 'MXN' },
    { Concepto: 'Clientes que compraron', Valor: r.resumen.clientes, Unidad: '' },
    { Concepto: 'Ritmo anualizado', Valor: dinero(r.ritmo), Unidad: 'MXN' },
    { Concepto: 'Por cobrar (al día de hoy)', Valor: dinero(r.hoy.porCobrar), Unidad: 'MXN' },
    { Concepto: 'Vencido (al día de hoy)', Valor: dinero(r.hoy.vencido), Unidad: 'MXN' },
    { Concepto: 'Stock (al día de hoy)', Valor: litros(r.hoy.litrosStock), Unidad: 'L' },
    ...r.hallazgos.map(h => ({ Concepto: 'Hallazgo', Valor: h.texto, Unidad: '' })),
  ]

  return [
    {
      nombre: 'Resumen',
      columnas: ['Concepto', 'Valor', 'Unidad'],
      anchos: [34, 46, 8],
      filas: resumen,
    },
    {
      nombre: 'Por cliente',
      columnas: ['Cliente', 'Pedidos', 'Litros', 'Facturado', 'Cobrado', 'Saldo', 'Cobranza'],
      anchos: [38, 9, 11, 14, 14, 14, 18],
      formatos: { Facturado: FMT_PESOS, Cobrado: FMT_PESOS, Saldo: FMT_PESOS, Pedidos: FMT_ENTERO },
      filas: [
        ...r.clientes.map(c => ({
          Cliente: c.nombre,
          Pedidos: c.pedidos,
          Litros: litros(c.litros),
          Facturado: dinero(c.facturado),
          Cobrado: dinero(c.cobrado),
          Saldo: dinero(c.saldo),
          Cobranza: etiquetaCobranza(c.estado),
        })),
        {
          Cliente: 'TOTAL',
          Pedidos: r.totales.pedidos,
          Litros: litros(r.totales.litros),
          Facturado: dinero(r.totales.facturado),
          Cobrado: dinero(r.totales.cobrado),
          Saldo: dinero(r.totales.saldo),
          Cobranza: '',
        },
      ],
    },
    {
      nombre: 'Por presentacion',
      columnas: ['Presentación', 'Unidades', 'Litros', 'Importe', '% del total'],
      anchos: [22, 11, 12, 14, 12],
      formatos: { Importe: FMT_PESOS, Unidades: FMT_ENTERO },
      filas: r.presentaciones.map(p => ({
        'Presentación': p.label,
        Unidades: p.unidades,
        Litros: litros(p.litros),
        Importe: dinero(p.importe),
        '% del total': pct(p.pct),
      })),
    },
    {
      nombre: 'Por estilo',
      columnas: ['Estilo', 'Litros', 'Importe', '% del total'],
      anchos: [26, 12, 14, 12],
      formatos: { Importe: FMT_PESOS },
      filas: r.estilos.map(e => ({
        Estilo: e.estilo,
        Litros: litros(e.litros),
        Importe: dinero(e.importe),
        '% del total': pct(e.pct),
      })),
    },
    {
      nombre: 'Cartera',
      columnas: ['Tramo', 'Pedidos', 'Saldo'],
      anchos: [18, 10, 14],
      formatos: { Saldo: FMT_PESOS, Pedidos: FMT_ENTERO },
      filas: r.cartera.map(b => ({ Tramo: b.etiqueta, Pedidos: b.pedidos, Saldo: dinero(b.monto) })),
    },
    {
      nombre: 'Pedidos con saldo',
      columnas: ['Folio', 'Cliente', 'Fecha', 'Vencimiento', 'Días de atraso', 'Saldo'],
      anchos: [11, 38, 12, 13, 15, 14],
      formatos: { Saldo: FMT_PESOS, 'Días de atraso': FMT_ENTERO },
      filas: r.cobranza.map(c => ({
        Folio: folioDe(c.id),
        Cliente: c.nombre,
        Fecha: c.fecha_pedido,
        Vencimiento: c.fecha_vencimiento || '—',
        'Días de atraso': c.dias,
        Saldo: dinero(c.saldo),
      })),
    },
    {
      nombre: 'Crecimiento',
      columnas: ['Mes', 'Facturado', 'Año anterior', 'Var. anual %', 'Var. mes %', 'Pedidos', 'Litros', 'Clientes nuevos', 'Clientes recurrentes'],
      anchos: [11, 14, 14, 13, 12, 10, 12, 17, 20],
      formatos: { Facturado: FMT_PESOS, 'Año anterior': FMT_PESOS, Pedidos: FMT_ENTERO },
      filas: r.crecimiento.map(p => ({
        Mes: p.desde.slice(0, 7),
        Facturado: dinero(p.facturado),
        'Año anterior': dinero(p.anoAnterior),
        // El signo va en el numero y el "sin base" como guion: un 0% donde no
        // hay con que comparar seria un dato inventado.
        'Var. anual %': p.varAnual ? (p.varAnual.dir === 'up' ? p.varAnual.pct : -p.varAnual.pct) : '—',
        'Var. mes %': p.varMes ? (p.varMes.dir === 'up' ? p.varMes.pct : -p.varMes.pct) : '—',
        Pedidos: p.pedidos,
        Litros: litros(p.litros),
        'Clientes nuevos': p.clientesNuevos,
        'Clientes recurrentes': p.clientesRecurrentes,
      })),
    },
    {
      nombre: 'Mezcla por mes',
      columnas: ['Mes', 'Litros', ...PRESENTACIONES_EXCEL.map(p => p.label)],
      anchos: [11, 12, ...PRESENTACIONES_EXCEL.map(() => 15)],
      filas: r.mezcla.map(m => ({
        Mes: m.clave.slice(0, 7),
        Litros: litros(m.litros),
        ...Object.fromEntries(
          PRESENTACIONES_EXCEL.map(p => [p.label, litros(m.porUnidad[p.unidad] || 0)])
        ),
      })),
    },
  ]
}

/**
 * Las columnas de la hoja de mezcla.
 *
 * Fijas y no derivadas de los datos: una hoja cuyas columnas cambian segun lo
 * que se vendio ese mes no se puede pegar en otra ni comparar entre periodos.
 */
const PRESENTACIONES_EXCEL = [
  { unidad: 'lata', label: 'Lata' },
  { unidad: 'caja12', label: 'Caja 12' },
  { unidad: 'caja24', label: 'Caja 24' },
  { unidad: 'mix24', label: 'Caja 24 mixta' },
  { unidad: 'barril_pet', label: 'Barril PET 20 L' },
  { unidad: 'barril_acero', label: 'Barril acero 20 L' },
  { unidad: 'barril10_pet', label: 'Barril PET 10 L' },
  { unidad: 'barril10_acero', label: 'Barril acero 10 L' },
]

/** Nombre del archivo, con el periodo adentro para no pisar dos exports. */
export const nombreArchivo = (r: Rango) => `Reporte-Tarabana-${r.desde}-a-${r.hasta}.xlsx`

/** Rotulo del periodo para el encabezado impreso. */
export const periodoLegible = (r: Rango) =>
  r.desde === r.hasta ? etiquetaFecha(r.desde) : `${etiquetaFecha(r.desde)} – ${etiquetaFecha(r.hasta)}`

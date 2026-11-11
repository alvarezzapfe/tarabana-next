/**
 * El libro de Excel de la lista de clientes.
 *
 * Devuelve `HojaDatos[]`; quien escribe el .xlsx es `libro-xlsx.ts`. Asi se
 * puede probar el armado del libro sin generar un archivo.
 *
 * SOLO SERVIDOR: importa `libro-xlsx.ts`, que importa exceljs. Un client
 * component que importe algo de aqui se baja casi un mega al navegador. El
 * filtro compartido con la pantalla vive aparte, en `clientes-lista.ts`,
 * justamente por eso.
 *
 * DE DONDE SALE LA PLATA: de `pedidos_saldo`, como todo el admin (ver la nota
 * de `metricas.ts`). Dos consecuencias que importan al leer el archivo:
 *
 *   * "Total facturado" es el NETO (`pagado + saldo`), no la suma de `total`,
 *     que es bruto antes de descuento y de envio. Va CON IVA, igual que
 *     "Cobrado" y "Saldo": este archivo es de cobranza —lo que el cliente
 *     debe— y los tres numeros tienen que cuadrar entre si. La columna "IVA"
 *     dice cuanto de ese total es impuesto, para quien quiera la venta sin
 *     IVA. En el Inicio y en el reporte, en cambio, Facturado va SIN IVA;
 *     ver las dos unidades en `metricas.ts`.
 *   * "# pedidos" NO cuenta cancelados, porque la vista los excluye. La
 *     columna "Pedidos" de la pantalla si los cuenta (consulta la tabla
 *     `pedidos`), asi que para un cliente con pedidos cancelados los dos
 *     numeros no coinciden. El del archivo es el que cuadra con los montos.
 */
import {
  FMT_ENTERO, FMT_FECHA, FMT_PESOS, type Celda, type HojaDatos,
} from './libro-xlsx.ts'
import { giroLabel, nivelLabel, regimenLabel, tipoLabel, usoCfdiLabel } from './clientes.ts'
import { cobradoDe, ivaTotal, nombreLegible, netoTotal, porCobrarDe, type FilaSaldo } from './metricas.ts'
import { fechaMx } from './fechas.ts'
import type { ClienteLista } from './clientes-lista.ts'
import { COLUMNAS_CLIENTES, TITULOS_CLIENTES } from './clientes-columnas.ts'

// Se reexportan para que quien ya arma el libro no tenga que importar de dos
// lados; el filtro en si vive en `clientes-lista.ts`, sin exceljs detras.
export { filtrarClientes } from './clientes-lista.ts'
export type { ClienteLista, FiltrosClientes } from './clientes-lista.ts'

/** Todo lo que ademas necesita el renglon del Excel. */
export type ClienteExport = ClienteLista & {
  vendedor_id?: string | null
  contacto_nombre?: string | null
  contacto_whatsapp?: string | null
  phone?: string | null
  instagram?: string | null
  sitio_web?: string | null
  requiere_factura?: boolean | null
  tipo_persona_registro?: string | null
  tipo_persona?: string | null
  regimen_fiscal?: string | null
  cp_fiscal?: string | null
  uso_cfdi?: string | null
  calle?: string | null
  num_ext?: string | null
  num_int?: string | null
  colonia?: string | null
  municipio?: string | null
  estado?: string | null
  cp?: string | null
  referencias?: string | null
  horario_recepcion?: string | null
  dias_credito?: number | null
  limite_credito?: number | null
  notas?: string | null
  created_at: string
}

export const SIN_VENDEDOR = 'Sin vendedor'

/**
 * El nombre de la hoja de datos, compartido con la plantilla y con el lector.
 *
 * No es 'Captura' como en pedidos a proposito: es el nombre que trae el
 * archivo del export, y lo que hace que ese mismo archivo se pueda volver a
 * subir con renglones nuevos abajo.
 */
export const NOMBRE_HOJA_CLIENTES = 'Clientes'

// ── Lo que aporta cada cliente ──────────────────────────────

export type MetricasCliente = {
  pedidos: number
  /** Con IVA. La columna `iva` dice cuanto de esto lo es. */
  facturado: number
  iva: number
  cobrado: number
  saldo: number
  /** 'YYYY-MM-DD' del pedido mas reciente, o null si no tiene ninguno. */
  ultimo: string | null
}

const VACIO: MetricasCliente = { pedidos: 0, facturado: 0, iva: 0, cobrado: 0, saldo: 0, ultimo: null }

/**
 * Agrupa `pedidos_saldo` por cliente.
 *
 * Los montos salen de los helpers de `metricas.ts` y no de sumas a mano, para
 * que el archivo cuadre con los KPIs de las pantallas hasta el centavo.
 */
export function metricasPorCliente(filas: FilaSaldo[]): Map<string, MetricasCliente> {
  const porCliente = new Map<string, FilaSaldo[]>()
  for (const f of filas) {
    if (!f.cliente_id) continue
    const acum = porCliente.get(f.cliente_id)
    if (acum) acum.push(f)
    else porCliente.set(f.cliente_id, [f])
  }

  const salida = new Map<string, MetricasCliente>()
  for (const [id, delCliente] of porCliente) {
    salida.set(id, {
      pedidos: delCliente.length,
      facturado: netoTotal(delCliente),
      iva: ivaTotal(delCliente),
      cobrado: cobradoDe(delCliente),
      saldo: porCobrarDe(delCliente),
      // Las fechas de la DB son 'YYYY-MM-DD', asi que el maximo como string
      // es el maximo como fecha. Sin pasar por `Date`, que correria el dia.
      ultimo: delCliente.reduce<string | null>(
        (max, f) => (f.fecha_pedido && (!max || f.fecha_pedido > max) ? f.fecha_pedido : max),
        null
      ),
    })
  }
  return salida
}

// ── Celdas ──────────────────────────────────────────────────

/** Texto, o celda vacia. Un guion largo en un Excel es basura que no se filtra. */
const txt = (v: unknown): Celda => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

/** Un numero solo si lo es. `null` deja la celda vacia, que no es lo mismo que 0. */
const num = (v: unknown): Celda => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Una fecha 'YYYY-MM-DD' como celda de fecha de Excel.
 *
 * Se ancla a MEDIODIA UTC por lo mismo que `src/lib/fechas.ts`: exceljs
 * convierte el `Date` a serial con los milisegundos UTC, asi que a medianoche
 * cualquier corrimiento de zona mueve el dia que se ve en la celda.
 */
export function fechaCelda(fecha: string | null | undefined): Date | null {
  const [a, m, d] = (fecha || '').slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  return new Date(Date.UTC(a, m - 1, d, 12))
}

/** 'Física' / 'Moral', de lo que haya en las dos columnas que existen. */
const personaLabel = (c: ClienteExport): Celda => {
  const v = txt(c.tipo_persona_registro) || txt(c.tipo_persona)
  if (!v) return null
  return v === 'moral' ? 'Moral' : v === 'fisica' ? 'Física' : v
}

/**
 * El giro, con `tipo_consumidor` como respaldo.
 *
 * Igual que en la tabla: los clientes que se dieron de alta desde el portal
 * declaran `tipo_consumidor` y pueden no tener `giro`.
 */
const giroDe = (c: ClienteLista): string =>
  c.giro ? giroLabel(c.giro) : c.tipo_consumidor ? tipoLabel(c.tipo_consumidor) : 'Sin giro'

// ── Hoja "Clientes" ─────────────────────────────────────────

/**
 * De donde sale cada celda, por encabezado.
 *
 * Los encabezados, su orden, su ancho y su formato NO viven aqui: viven en
 * `clientes-columnas.ts`, que es la misma declaracion que usan la plantilla y
 * el importador. Aqui solo esta lo que el export agrega, que es el accesor.
 *
 * El test verifica que haya un accesor por columna declarada: agregar una
 * columna sin su accesor no compila una hoja con la celda vacia en silencio.
 */
const VALORES: Record<string, (c: ClienteExport, m: MetricasCliente, vendedor: string | null) => Celda> = {
  // ── Negocio ──
  'Nombre comercial': c => nombreLegible(c),
  'Razón social':     c => txt(c.razon_social),
  'Giro':             c => giroDe(c),
  'Nivel de precio':  c => nivelLabel(c.nivel_precio || 'publico'),
  'Vendedor':         (_c, _m, vendedor) => vendedor,

  // ── Contacto ──
  'Contacto':  c => txt(c.contacto_nombre),
  'WhatsApp':  c => txt(c.contacto_whatsapp),
  'Email':     c => txt(c.email),
  'Teléfono':  c => txt(c.phone),
  'Instagram': c => txt(c.instagram),
  'Sitio web': c => txt(c.sitio_web),

  // ── Facturacion ──
  'Requiere factura': c => (c.requiere_factura ? 'Sí' : 'No'),
  'RFC':              c => txt(c.rfc),
  'Tipo de persona':  c => personaLabel(c),
  // Los catalogos SAT se exportan como "codigo · descripcion", que es como se
  // ven en la ficha: el codigo solo no le dice nada a quien abre el archivo.
  // El importador acepta las dos formas, asi que el round-trip funciona.
  'Régimen fiscal':   c => (txt(c.regimen_fiscal) ? regimenLabel(c.regimen_fiscal) : null),
  'CP fiscal':        c => txt(c.cp_fiscal),
  'Uso CFDI':         c => (txt(c.uso_cfdi) ? usoCfdiLabel(c.uso_cfdi) : null),

  // ── Entrega ──
  'Calle':                c => txt(c.calle),
  'Núm. ext.':            c => txt(c.num_ext),
  'Núm. int.':            c => txt(c.num_int),
  'Colonia':              c => txt(c.colonia),
  'Municipio':            c => txt(c.municipio),
  'Estado':               c => txt(c.estado),
  'CP':                   c => txt(c.cp),
  'Referencias':          c => txt(c.referencias),
  'Horario de recepción': c => txt(c.horario_recepcion),

  // ── Credito ──
  'Días de crédito':   c => num(c.dias_credito),
  'Límite de crédito': c => num(c.limite_credito),

  // ── Historial ──
  // `created_at` es timestamptz: la fecha se saca en la zona del negocio, que
  // es la que esperaria quien dio de alta al cliente.
  'Fecha de alta':   c => fechaCelda(fechaMx(new Date(c.created_at))),
  '# pedidos':       (_c, m) => m.pedidos,
  'Total facturado': (_c, m) => m.facturado,
  'IVA':             (_c, m) => m.iva,
  'Cobrado':         (_c, m) => m.cobrado,
  'Saldo':           (_c, m) => m.saldo,
  'Último pedido':   (_c, m) => fechaCelda(m.ultimo),

  'Notas': c => txt(c.notas),
}

/** Los codigos de Excel de los formatos simbolicos de la declaracion. */
const FORMATO: Record<string, string> = {
  pesos: FMT_PESOS,
  fecha: FMT_FECHA,
  entero: FMT_ENTERO,
}

// ── Hoja "Resumen" ──────────────────────────────────────────

/**
 * Cuenta por una clave y devuelve renglones ordenados: primero los mas
 * numerosos y, a igual cuenta, alfabetico, para que dos exports del mismo
 * conjunto salgan identicos.
 */
function agrupar(
  clientes: ClienteExport[],
  grupo: string,
  clave: (c: ClienteExport) => string
): Record<string, Celda>[] {
  const cuentas = new Map<string, number>()
  for (const c of clientes) {
    const k = clave(c)
    cuentas.set(k, (cuentas.get(k) || 0) + 1)
  }
  return [...cuentas.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], 'es')))
    .map(([concepto, n]) => ({ Agrupación: grupo, Concepto: concepto, Clientes: n }))
}

export type DatosLibroClientes = {
  /** Los clientes YA filtrados: el archivo y el resumen son lo mismo. */
  clientes: ClienteExport[]
  /** Filas de `pedidos_saldo` de esos clientes. */
  saldos: FilaSaldo[]
  /** id de vendedor -> nombre. Lo que falte sale como "Sin vendedor". */
  vendedores: Map<string, string>
}

/**
 * Las dos hojas del archivo.
 *
 * El Resumen describe lo EXPORTADO, no la cartera completa: si hay filtros
 * activos, un total que contara a todos los clientes no cuadraria con los
 * renglones de la hoja de al lado.
 */
export function armarHojasClientes({ clientes, saldos, vendedores }: DatosLibroClientes): HojaDatos[] {
  const metricas = metricasPorCliente(saldos)
  const nombreVendedor = (c: ClienteExport) =>
    (c.vendedor_id && vendedores.get(c.vendedor_id)) || null

  const filas = clientes.map(c => {
    const m = metricas.get(c.id) || VACIO
    const vendedor = nombreVendedor(c)
    const fila: Record<string, Celda> = {}
    for (const col of COLUMNAS_CLIENTES) fila[col.titulo] = VALORES[col.titulo](c, m, vendedor)
    return fila
  })

  const formatos: Record<string, string> = {}
  for (const col of COLUMNAS_CLIENTES) if (col.formato) formatos[col.titulo] = FORMATO[col.formato]

  const resumen: Record<string, Celda>[] = [
    { Agrupación: 'Total', Concepto: 'Clientes exportados', Clientes: clientes.length },
    ...agrupar(clientes, 'Giro', giroDe),
    ...agrupar(clientes, 'Nivel de precio', c => nivelLabel(c.nivel_precio || 'publico')),
    ...agrupar(clientes, 'Vendedor', c => nombreVendedor(c) || SIN_VENDEDOR),
  ]

  return [
    {
      nombre: NOMBRE_HOJA_CLIENTES,
      columnas: TITULOS_CLIENTES,
      anchos: COLUMNAS_CLIENTES.map(c => c.ancho),
      formatos,
      filas,
    },
    {
      nombre: 'Resumen',
      columnas: ['Agrupación', 'Concepto', 'Clientes'],
      anchos: [18, 34, 10],
      formatos: { Clientes: FMT_ENTERO },
      filas: resumen,
    },
  ]
}

/** `clientes-tarabana-AAAA-MM-DD.xlsx`, con la fecha de Mexico. */
export function nombreArchivoClientes(ahora: Date = new Date()): string {
  return `clientes-tarabana-${fechaMx(ahora)}.xlsx`
}

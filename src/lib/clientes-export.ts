/**
 * El filtro de la lista de clientes y el libro de Excel que sale de ella.
 *
 * Las dos cosas viven juntas porque el contrato del export es exactamente
 * "lo que esta viendo la tabla": si el filtro se implementara dos veces —una
 * en la pantalla y otra en la ruta— el boton "Exportar Excel" diria que
 * respeta los filtros y un dia dejaria de hacerlo sin que nada falle. Por eso
 * `filtrarClientes` la usan los dos: `ClientesClient.tsx` para pintar y
 * `app/api/admin/clientes/exportar` para armar el archivo.
 *
 * Nada de exceljs aqui: esto devuelve `HojaDatos[]` y quien escribe el
 * archivo es `libro-xlsx.ts`, del lado del servidor. Asi se puede probar el
 * armado del libro sin generar un .xlsx.
 *
 * DE DONDE SALE LA PLATA: de `pedidos_saldo`, como todo el admin (ver la nota
 * de `metricas.ts`). Dos consecuencias que importan al leer el archivo:
 *
 *   * "Total facturado" es el NETO (`pagado + saldo`), no la suma de `total`,
 *     que es bruto antes de descuento y de envio.
 *   * "# pedidos" NO cuenta cancelados, porque la vista los excluye. La
 *     columna "Pedidos" de la pantalla si los cuenta (consulta la tabla
 *     `pedidos`), asi que para un cliente con pedidos cancelados los dos
 *     numeros no coinciden. El del archivo es el que cuadra con los montos.
 */
import {
  FMT_ENTERO, FMT_FECHA, FMT_PESOS, type Celda, type HojaDatos,
} from './libro-xlsx.ts'
import { giroLabel, nivelLabel, regimenLabel, tipoLabel, usoCfdiLabel } from './clientes.ts'
import { cobradoDe, nombreLegible, netoTotal, porCobrarDe, type FilaSaldo } from './metricas.ts'
import { fechaMx } from './fechas.ts'

/** Un cliente como lo trae `profiles` para la lista del admin. */
export type ClienteLista = {
  id: string
  email: string
  full_name: string | null
  marca_negocio: string | null
  razon_social: string | null
  giro: string | null
  tipo_consumidor: string | null
  nivel_precio: string | null
  rfc: string | null
}

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

/** Los tres controles de la tabla: buscador, tipo y nivel de precio. */
export type FiltrosClientes = {
  q?: string | null
  /** `tipo_consumidor`, que es por lo que filtra el select de la pantalla. */
  tipo?: string | null
  nivel?: string | null
}

export const SIN_VENDEDOR = 'Sin vendedor'

/**
 * El filtro de la lista, tal cual lo aplica la tabla.
 *
 * El buscador cubre nombre comercial, razon social, nombre, correo y RFC: es
 * lo mismo que se ve y lo mismo que se factura, que son las dos formas en que
 * alguien busca a un cliente.
 *
 * Generico en `T` para que no haga falta un tipo mas ancho del que cada lado
 * ya tiene: la pantalla pasa su `Cliente` y la ruta su `ClienteExport`.
 */
export function filtrarClientes<T extends ClienteLista>(clientes: T[], filtros: FiltrosClientes): T[] {
  const q = (filtros.q || '').trim().toLowerCase()
  const tipo = filtros.tipo || ''
  const nivel = filtros.nivel || ''

  return clientes.filter(c => {
    if (q) {
      const campos = [c.marca_negocio, c.razon_social, c.full_name, c.email, c.rfc]
      if (!campos.some(v => (v || '').toLowerCase().includes(q))) return false
    }
    if (tipo && c.tipo_consumidor !== tipo) return false
    // Un cliente sin nivel es publico: es el default de la columna y lo que
    // pinta la tabla.
    if (nivel && (c.nivel_precio || 'publico') !== nivel) return false
    return true
  })
}

// ── Lo que aporta cada cliente ──────────────────────────────

export type MetricasCliente = {
  pedidos: number
  facturado: number
  cobrado: number
  saldo: number
  /** 'YYYY-MM-DD' del pedido mas reciente, o null si no tiene ninguno. */
  ultimo: string | null
}

const VACIO: MetricasCliente = { pedidos: 0, facturado: 0, cobrado: 0, saldo: 0, ultimo: null }

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
 * Las columnas, en orden, con su ancho y de donde sale cada celda.
 *
 * Una sola lista para las tres cosas: los encabezados, los formatos y los
 * valores. Agregar una columna es agregar un renglon aqui y nada mas.
 */
const COLUMNAS: {
  titulo: string
  ancho: number
  formato?: string
  valor: (c: ClienteExport, m: MetricasCliente, vendedor: string | null) => Celda
}[] = [
  // ── Negocio ──
  { titulo: 'Nombre comercial', ancho: 30, valor: c => nombreLegible(c) },
  { titulo: 'Razón social',     ancho: 30, valor: c => txt(c.razon_social) },
  { titulo: 'Giro',             ancho: 18, valor: c => giroDe(c) },
  { titulo: 'Nivel de precio',  ancho: 15, valor: c => nivelLabel(c.nivel_precio || 'publico') },
  { titulo: 'Vendedor',         ancho: 20, valor: (_c, _m, vendedor) => vendedor },

  // ── Contacto ──
  { titulo: 'Contacto',   ancho: 22, valor: c => txt(c.contacto_nombre) },
  { titulo: 'WhatsApp',   ancho: 15, valor: c => txt(c.contacto_whatsapp) },
  { titulo: 'Email',      ancho: 28, valor: c => txt(c.email) },
  { titulo: 'Teléfono',   ancho: 15, valor: c => txt(c.phone) },
  { titulo: 'Instagram',  ancho: 18, valor: c => txt(c.instagram) },
  { titulo: 'Sitio web',  ancho: 24, valor: c => txt(c.sitio_web) },

  // ── Facturacion ──
  { titulo: 'Requiere factura', ancho: 10, valor: c => (c.requiere_factura ? 'Sí' : 'No') },
  { titulo: 'RFC',              ancho: 15, valor: c => txt(c.rfc) },
  { titulo: 'Tipo de persona',  ancho: 14, valor: c => personaLabel(c) },
  // Los catalogos SAT se exportan como "codigo · descripcion", que es como se
  // ven en la ficha: el codigo solo no le dice nada a quien abre el archivo.
  { titulo: 'Régimen fiscal',   ancho: 34, valor: c => (txt(c.regimen_fiscal) ? regimenLabel(c.regimen_fiscal) : null) },
  { titulo: 'CP fiscal',        ancho: 10, valor: c => txt(c.cp_fiscal) },
  { titulo: 'Uso CFDI',         ancho: 30, valor: c => (txt(c.uso_cfdi) ? usoCfdiLabel(c.uso_cfdi) : null) },

  // ── Entrega ──
  { titulo: 'Calle',                ancho: 26, valor: c => txt(c.calle) },
  { titulo: 'Núm. ext.',            ancho: 10, valor: c => txt(c.num_ext) },
  { titulo: 'Núm. int.',            ancho: 10, valor: c => txt(c.num_int) },
  { titulo: 'Colonia',              ancho: 22, valor: c => txt(c.colonia) },
  { titulo: 'Municipio',            ancho: 20, valor: c => txt(c.municipio) },
  { titulo: 'Estado',               ancho: 18, valor: c => txt(c.estado) },
  { titulo: 'CP',                   ancho: 10, valor: c => txt(c.cp) },
  { titulo: 'Referencias',          ancho: 30, valor: c => txt(c.referencias) },
  { titulo: 'Horario de recepción', ancho: 22, valor: c => txt(c.horario_recepcion) },

  // ── Credito ──
  { titulo: 'Días de crédito',   ancho: 12, formato: FMT_ENTERO, valor: c => num(c.dias_credito) },
  { titulo: 'Límite de crédito', ancho: 16, formato: FMT_PESOS,  valor: c => num(c.limite_credito) },

  // ── Historial ──
  // `created_at` es timestamptz: la fecha se saca en la zona del negocio, que
  // es la que esperaria quien dio de alta al cliente.
  { titulo: 'Fecha de alta',   ancho: 13, formato: FMT_FECHA,  valor: c => fechaCelda(fechaMx(new Date(c.created_at))) },
  { titulo: '# pedidos',       ancho: 11, formato: FMT_ENTERO, valor: (_c, m) => m.pedidos },
  { titulo: 'Total facturado', ancho: 16, formato: FMT_PESOS,  valor: (_c, m) => m.facturado },
  { titulo: 'Cobrado',         ancho: 14, formato: FMT_PESOS,  valor: (_c, m) => m.cobrado },
  { titulo: 'Saldo',           ancho: 14, formato: FMT_PESOS,  valor: (_c, m) => m.saldo },
  { titulo: 'Último pedido',   ancho: 13, formato: FMT_FECHA,  valor: (_c, m) => fechaCelda(m.ultimo) },

  { titulo: 'Notas', ancho: 34, valor: c => txt(c.notas) },
]

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
    for (const col of COLUMNAS) fila[col.titulo] = col.valor(c, m, vendedor)
    return fila
  })

  const formatos: Record<string, string> = {}
  for (const col of COLUMNAS) if (col.formato) formatos[col.titulo] = col.formato

  const resumen: Record<string, Celda>[] = [
    { Agrupación: 'Total', Concepto: 'Clientes exportados', Clientes: clientes.length },
    ...agrupar(clientes, 'Giro', giroDe),
    ...agrupar(clientes, 'Nivel de precio', c => nivelLabel(c.nivel_precio || 'publico')),
    ...agrupar(clientes, 'Vendedor', c => nombreVendedor(c) || SIN_VENDEDOR),
  ]

  return [
    {
      nombre: 'Clientes',
      columnas: COLUMNAS.map(c => c.titulo),
      anchos: COLUMNAS.map(c => c.ancho),
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

/**
 * Modelo de fila y helpers de la tabla de Pedidos.
 *
 * Toda la plata viene de `pedidos_saldo`, que es la fuente unica: `total` de
 * la tabla `pedidos` es el importe BRUTO, antes de descuento y envio (ver
 * docs/SCHEMA_NOTES.md). Lo que se muestra como total es `total_con_envio`,
 * que es lo que de verdad se le cobra al cliente.
 *
 * Los tokens visuales se reusan del Inicio (`../dash-ui`) para que las dos
 * pantallas se vean como el mismo producto.
 */
import { litrosDeItem } from '../../../src/lib/unidades'
import { periodoDeFechaDB } from '../../../src/lib/fechas'
import { nombreLegible } from '../../../src/lib/metricas'

export {
  ACENTO, ROJO, TINTA, TINTA_MEDIA, GRIS, GRIS_SUAVE, BORDE, PISTA,
  card, tabular, moneda,
} from '../dash-ui'

// ── Catalogos de estado ─────────────────────────────────────

export const STATUS = [
  { key: 'pendiente', label: 'Pendiente', color: '#b45309', fondo: '#fef3c7' },
  { key: 'confirmado', label: 'Confirmado', color: '#1d4ed8', fondo: '#dbeafe' },
  { key: 'enviado', label: 'En camino', color: '#6d28d9', fondo: '#ede9fe' },
  { key: 'entregado', label: 'Entregado', color: '#047857', fondo: '#d1fae5' },
  { key: 'cancelado', label: 'Cancelado', color: '#b91c1c', fondo: '#fee2e2' },
] as const

export const COBRO = [
  { key: 'pagado', label: 'Pagado', color: '#047857', fondo: '#d1fae5' },
  { key: 'parcial', label: 'Parcial', color: '#1d4ed8', fondo: '#dbeafe' },
  { key: 'pendiente', label: 'Pendiente', color: '#b45309', fondo: '#fef3c7' },
  { key: 'vencido', label: 'Vencido', color: '#b91c1c', fondo: '#fee2e2' },
] as const

export const statusDe = (k: string) => STATUS.find(s => s.key === k) ?? STATUS[0]
export const cobroDe = (k: string) => COBRO.find(c => c.key === k) ?? COBRO[2]

/**
 * Los chips de filtro rapido.
 *
 * `vencidos` y `con_saldo` no son status: son estados de COBRO, y por eso van
 * en la misma barra. Agrupar "en que va el pedido" con "como va el cobro" es
 * justo lo que uno quiere filtrar junto.
 */
export const CHIPS = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'entregado', label: 'Entregado' },
  { key: 'vencidos', label: 'Vencidos' },
  { key: 'con_saldo', label: 'Con saldo' },
] as const

export type ChipKey = (typeof CHIPS)[number]['key']

// ── Fila ────────────────────────────────────────────────────

export type ItemFila = {
  nombre: string
  unidad: string | null
  cantidad: number
  precio: number
  subtotal: number
  litros: number
}

export type PagoFila = {
  id: string
  monto: number
  metodo: string | null
  referencia: string | null
  fecha_pago: string
  cancelado_at: string | null
  cancelado_motivo: string | null
}

export type FilaPedido = {
  id: string
  folio: string
  fecha_pedido: string
  /** Solo para el panel de auditoria. */
  created_at: string
  cliente: string
  cliente_id: string | null
  vendedor: string | null
  vendedor_id: string | null
  litros: number
  /** total_con_envio: lo que se le cobra al cliente. */
  total: number
  /** El bruto, antes de descuento y envio. Para el desglose. */
  subtotal: number
  descuento: number
  costo_envio: number
  cobrado: number
  saldo: number
  /** 0 a 100. */
  pctCobrado: number
  status: string
  estado_cobro: string
  dias_vencido: number
  condiciones_pago: string | null
  fecha_vencimiento: string | null
  fecha_entrega: string | null
  fecha_entrega_real: string | null
  orden_compra: string | null
  folio_factura: string | null
  paqueteria: string | null
  guia_envio: string | null
  notas: string | null
  items: ItemFila[]
  pagos: PagoFila[]
}

type Crudo = Record<string, unknown>

const num = (v: unknown) => Number(v ?? 0) || 0
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Supabase tipa un to-one anidado como arreglo segun la version. */
function uno<T>(v: unknown): T | null {
  if (!v) return null
  return (Array.isArray(v) ? v[0] : v) as T
}

export const folioDe = (id: string) => `#${id.slice(-6).toUpperCase()}`

/**
 * Arma las filas de la tabla a partir de las tres consultas.
 *
 * Un pedido sin fila en `pedidos_saldo` es un cancelado: la vista los
 * excluye. Se conserva en la tabla con sus montos en cero de cobro, para que
 * no desaparezca del historial.
 */
export function armarFilas(
  pedidos: Crudo[],
  saldos: Crudo[],
  pagos: Crudo[]
): FilaPedido[] {
  const porPedido = new Map<string, Crudo>(saldos.map(s => [String(s.id), s]))

  const pagosPorPedido = new Map<string, PagoFila[]>()
  for (const p of pagos) {
    const id = String(p.pedido_id)
    const fila: PagoFila = {
      id: String(p.id),
      monto: num(p.monto),
      metodo: texto(p.metodo),
      referencia: texto(p.referencia),
      fecha_pago: String(p.fecha_pago ?? '').slice(0, 10),
      cancelado_at: texto(p.cancelado_at),
      cancelado_motivo: texto(p.cancelado_motivo),
    }
    const lista = pagosPorPedido.get(id)
    if (lista) lista.push(fila)
    else pagosPorPedido.set(id, [fila])
  }

  return pedidos.map(p => {
    const id = String(p.id)
    const s = porPedido.get(id)
    const perfil = uno<{ id: string; full_name: string | null; email: string | null; razon_social: string | null }>(p.profiles)
    const vend = uno<{ id: string; nombre: string }>(p.vendedores)

    const items: ItemFila[] = ((p.pedido_items as Crudo[]) || []).map(it => {
      const prod = uno<{ nombre: string | null }>(it.productos)
      const cantidad = num(it.cantidad)
      const precio = num(it.precio_unitario)
      const unidad = texto(it.unidad)
      // Un mix se mide por las latas de sus estilos.
      let litros = litrosDeItem(unidad, cantidad) ?? 0
      if (unidad === 'mix24') {
        const estilos = (it.metadata as { estilos?: { latas?: number }[] } | null)?.estilos || []
        const latas = estilos.reduce((a, e) => a + num(e.latas), 0)
        litros = (litrosDeItem('lata', latas) ?? 0) * cantidad
      }
      return {
        nombre: prod?.nombre || 'Sin producto',
        unidad,
        cantidad,
        precio,
        subtotal: cantidad * precio,
        litros,
      }
    })

    const subtotal = num(p.total)
    const descuento = s ? num(s.descuento_monto) : 0
    const costoEnvio = num(p.costo_envio)
    const total = s ? num(s.total_con_envio) : Math.max(0, subtotal - descuento) + costoEnvio
    const cobrado = s ? num(s.pagado) : 0
    const saldo = s ? num(s.saldo) : 0

    return {
      id,
      folio: folioDe(id),
      // La vista y la tabla traen lo mismo; se prefiere la vista por ser la
      // fuente unica, con la tabla como respaldo para los cancelados.
      fecha_pedido: String((s?.fecha_pedido ?? p.fecha_pedido) ?? '').slice(0, 10),
      created_at: String(p.created_at ?? ''),
      cliente: perfil ? nombreLegible(perfil) : 'Cliente sin nombre',
      cliente_id: perfil?.id ?? (texto(p.cliente_id) as string | null),
      vendedor: vend?.nombre ?? null,
      vendedor_id: texto(p.vendedor_id) as string | null,
      litros: items.reduce((a, it) => a + it.litros, 0),
      total,
      subtotal,
      descuento,
      costo_envio: costoEnvio,
      cobrado,
      saldo: Math.max(0, saldo),
      pctCobrado: total > 0 ? Math.min(100, (cobrado / total) * 100) : 0,
      status: String(p.status ?? 'pendiente'),
      // Un cancelado no esta en la vista: su cobro no aplica.
      estado_cobro: s ? String(s.estado_cobro) : 'cancelado',
      dias_vencido: s ? num(s.dias_vencido) : 0,
      condiciones_pago: texto(p.condiciones_pago),
      fecha_vencimiento: texto(p.fecha_vencimiento)?.slice(0, 10) ?? null,
      fecha_entrega: texto(p.fecha_entrega)?.slice(0, 10) ?? null,
      fecha_entrega_real: texto(p.fecha_entrega_real)?.slice(0, 10) ?? null,
      orden_compra: texto(p.orden_compra),
      folio_factura: texto(p.folio_factura),
      paqueteria: texto(p.paqueteria),
      guia_envio: texto(p.guia_envio),
      notas: texto(p.notas),
      items,
      pagos: pagosPorPedido.get(id) ?? [],
    }
  })
}

// ── Filtros ─────────────────────────────────────────────────

export type Filtros = {
  chip: ChipKey
  desde: string
  hasta: string
  vendedor: string
  cliente: string
  busqueda: string
}

export const FILTROS_VACIOS: Filtros = {
  chip: 'todos', desde: '', hasta: '', vendedor: '', cliente: '', busqueda: '',
}

export const hayFiltros = (f: Filtros) =>
  f.chip !== 'todos' || !!f.desde || !!f.hasta || !!f.vendedor || !!f.cliente || !!f.busqueda.trim()

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Aplica los filtros.
 *
 * La busqueda cubre folio, cliente y orden de compra, que son las tres formas
 * en que alguien llega preguntando por un pedido.
 */
export function filtrar(filas: FilaPedido[], f: Filtros): FilaPedido[] {
  const q = norm(f.busqueda.trim())

  return filas.filter(fila => {
    switch (f.chip) {
      case 'pendiente':
      case 'confirmado':
      case 'entregado':
        if (fila.status !== f.chip) return false
        break
      case 'vencidos':
        if (fila.estado_cobro !== 'vencido' && fila.dias_vencido <= 0) return false
        if (fila.saldo <= 0) return false
        break
      case 'con_saldo':
        if (fila.saldo <= 0) return false
        break
    }

    // Las fechas se comparan como string: 'YYYY-MM-DD' ordena bien y no pasa
    // por Date, que movería el día según la zona.
    if (f.desde && fila.fecha_pedido < f.desde) return false
    if (f.hasta && fila.fecha_pedido > f.hasta) return false

    if (f.vendedor) {
      if (f.vendedor === 'sin' ? !!fila.vendedor_id : fila.vendedor_id !== f.vendedor) return false
    }
    if (f.cliente && fila.cliente_id !== f.cliente) return false

    if (q) {
      const heno = norm(`${fila.folio} ${fila.cliente} ${fila.orden_compra || ''} ${fila.folio_factura || ''}`)
      if (!heno.includes(q)) return false
    }
    return true
  })
}

// ── Orden ───────────────────────────────────────────────────

export type ColumnaOrden =
  | 'folio' | 'fecha_pedido' | 'cliente' | 'vendedor' | 'litros'
  | 'total' | 'cobrado' | 'saldo' | 'status' | 'estado_cobro' | 'entrega' | 'orden_compra'

export type Orden = { columna: ColumnaOrden; asc: boolean }

const valorDe = (f: FilaPedido, c: ColumnaOrden): string | number => {
  switch (c) {
    case 'folio': return f.folio
    case 'fecha_pedido': return f.fecha_pedido
    case 'cliente': return norm(f.cliente)
    case 'vendedor': return norm(f.vendedor || '')
    case 'litros': return f.litros
    case 'total': return f.total
    case 'cobrado': return f.cobrado
    case 'saldo': return f.saldo
    case 'status': return f.status
    // Ordenar por cobro es ordenar por urgencia: lo mas vencido primero.
    case 'estado_cobro': return f.dias_vencido
    case 'entrega': return f.fecha_entrega_real || f.fecha_entrega || ''
    case 'orden_compra': return norm(f.orden_compra || '')
  }
}

export function ordenar(filas: FilaPedido[], orden: Orden): FilaPedido[] {
  const copia = [...filas]
  copia.sort((a, b) => {
    const va = valorDe(a, orden.columna)
    const vb = valorDe(b, orden.columna)
    let cmp: number
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va).localeCompare(String(vb), 'es')
    // Desempate estable por fecha y folio, para que el orden no baile entre
    // renders cuando hay empates.
    if (cmp === 0) cmp = a.fecha_pedido.localeCompare(b.fecha_pedido) || a.folio.localeCompare(b.folio)
    return orden.asc ? cmp : -cmp
  })
  return copia
}

// ── Totales ─────────────────────────────────────────────────

export const totalesDe = (filas: FilaPedido[]) => ({
  pedidos: filas.length,
  litros: filas.reduce((s, f) => s + f.litros, 0),
  total: filas.reduce((s, f) => s + f.total, 0),
  cobrado: filas.reduce((s, f) => s + f.cobrado, 0),
  saldo: filas.reduce((s, f) => s + f.saldo, 0),
})

/** Los meses presentes, para el selector rapido de rango. */
export function mesesDe(filas: FilaPedido[]): string[] {
  return [...new Set(filas.map(f => periodoDeFechaDB(f.fecha_pedido)).filter(Boolean))].sort().reverse()
}

/**
 * Arma la plantilla .xlsx de carga masiva de pedidos.
 *
 * Cinco hojas: Captura (vacia, con desplegables), Instrucciones, Productos,
 * Clientes y Listas.
 *
 * La hoja Productos no es un listado del catalogo: trae un renglon por
 * COMBINACION de producto y presentacion que de verdad se puede pedir, con su
 * precio y su stock. En el catalogo real casi ningun barril tiene precio
 * mayorista, asi que una lista plana de presentaciones haria que la gente
 * capture combinaciones que van a reventar en la vista previa.
 */
import ExcelJS from 'exceljs'
import { precioUnitario } from './calcular-pedido.ts'
import { columnaStockDe } from './unidades.ts'
import {
  CONDICIONES_PAGO, LIMITE_PARTIDAS, LIMITE_PEDIDOS, PRESENTACIONES,
  type ClienteCatalogo, type ProductoCatalogo,
} from './pedidos-importar.ts'
import { LIMITE_RENGLONES, NOMBRE_HOJA_CAPTURA } from './leer-xlsx.ts'

const ACENTO = 'FFD95F2E'
const GRIS = 'FF6B7280'
const BORDE_GRIS = 'FFE5E7EB'

/** Renglones de captura que llevan desplegable y formato. */
const RENGLONES_PREPARADOS = 300

type Encabezado = { clave: string; titulo: string; ancho: number; nota?: string }

const ENCABEZADOS_BASE: Encabezado[] = [
  { clave: 'referencia', titulo: 'referencia', ancho: 14, nota: 'Agrupa renglones en un pedido' },
  { clave: 'cliente', titulo: 'cliente', ancho: 30, nota: 'Correo del cliente' },
  { clave: 'producto', titulo: 'producto', ancho: 18 },
  { clave: 'presentacion', titulo: 'presentacion', ancho: 20 },
  { clave: 'cantidad', titulo: 'cantidad', ancho: 10 },
  { clave: 'condiciones_pago', titulo: 'condiciones_pago', ancho: 18 },
  { clave: 'fecha_pedido', titulo: 'fecha_pedido', ancho: 14, nota: 'Vacio = hoy. Nunca futura.' },
  { clave: 'fecha_entrega', titulo: 'fecha_entrega', ancho: 14, nota: 'Entrega programada. Opcional.' },
  { clave: 'orden_compra', titulo: 'orden_compra', ancho: 18 },
  { clave: 'notas', titulo: 'notas', ancho: 30 },
]

const ENCABEZADOS_ADMIN: Encabezado[] = [
  { clave: 'costo_envio', titulo: 'costo_envio', ancho: 13 },
  { clave: 'descuento_tipo', titulo: 'descuento_tipo', ancho: 16 },
  { clave: 'descuento_valor', titulo: 'descuento_valor', ancho: 16 },
  { clave: 'descuento_motivo', titulo: 'descuento_motivo', ancho: 26 },
  { clave: 'folio_factura', titulo: 'folio_factura', ancho: 16 },
]

export type OpcionesPlantilla = {
  productos: ProductoCatalogo[]
  clientes: ClienteCatalogo[]
  /** Genera las columnas de envio y descuento. */
  puedeDescuento: boolean
  /** Para la nota de la hoja de instrucciones. */
  esVendedor: boolean
}

/** Una combinacion producto + presentacion que se puede pedir. */
type Combinacion = {
  producto: string
  presentacion: string
  precioPublico: number
  precioMayorista: number
  stock: number
}

export function combinacionesDisponibles(productos: ProductoCatalogo[]): Combinacion[] {
  const filas: Combinacion[] = []
  for (const p of productos) {
    for (const pres of PRESENTACIONES) {
      const precioPublico = precioUnitario(p, pres.key, 'publico')
      const precioMayorista = precioUnitario(p, pres.key, 'taproom')
      // Sin ningun precio configurado, la combinacion no existe para vender.
      if (precioPublico <= 0 && precioMayorista <= 0) continue
      const col = columnaStockDe(pres.key)
      filas.push({
        producto: p.nombre,
        presentacion: pres.label,
        precioPublico,
        precioMayorista,
        stock: col ? Number(p[col] ?? 0) || 0 : 0,
      })
    }
  }
  return filas
}

export async function construirPlantilla(opciones: OpcionesPlantilla): Promise<Uint8Array> {
  const { productos, clientes, puedeDescuento, esVendedor } = opciones
  const encabezados = puedeDescuento ? [...ENCABEZADOS_BASE, ...ENCABEZADOS_ADMIN] : ENCABEZADOS_BASE

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tarabana'
  wb.created = new Date()

  // ── Listas (fuente de los desplegables) ───────────────────
  // Va primero para que los rangos existan cuando se definan las
  // validaciones, y de ultima en el orden visible.
  const listas = wb.addWorksheet('Listas')
  listas.columns = [
    { header: 'productos', width: 22 },
    { header: 'presentaciones', width: 22 },
    { header: 'condiciones', width: 16 },
    { header: 'descuento', width: 14 },
    { header: 'clientes', width: 34 },
  ]
  const nombresProducto = [...productos].map(p => p.nombre).sort((a, b) => a.localeCompare(b, 'es'))
  const correos = clientes.map(c => c.email).filter((e): e is string => !!e).sort()
  const maxFilas = Math.max(nombresProducto.length, PRESENTACIONES.length, CONDICIONES_PAGO.length, 2, correos.length)
  for (let i = 0; i < maxFilas; i++) {
    listas.addRow([
      nombresProducto[i] ?? null,
      PRESENTACIONES[i]?.label ?? null,
      CONDICIONES_PAGO[i]?.label ?? null,
      ['porcentaje', 'monto'][i] ?? null,
      correos[i] ?? null,
    ])
  }

  const rango = (col: string, n: number) => `=Listas!$${col}$2:$${col}$${Math.max(2, n + 1)}`

  // ── Captura ───────────────────────────────────────────────
  const captura = wb.addWorksheet(NOMBRE_HOJA_CAPTURA, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  captura.columns = encabezados.map(h => ({ header: h.titulo, key: h.clave, width: h.ancho }))

  const filaEncabezado = captura.getRow(1)
  filaEncabezado.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  filaEncabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACENTO } }
  filaEncabezado.alignment = { vertical: 'middle' }
  filaEncabezado.height = 22
  for (const [i, h] of encabezados.entries()) {
    if (h.nota) captura.getCell(1, i + 1).note = h.nota
  }

  const col = (clave: string) => encabezados.findIndex(h => h.clave === clave) + 1

  for (let r = 2; r <= RENGLONES_PREPARADOS + 1; r++) {
    captura.getCell(r, col('cliente')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [rango('E', correos.length)],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: 'Cliente fuera de la lista',
      error: esVendedor
        ? 'Solo puedes capturar clientes de tu cartera. Revisa la hoja Clientes.'
        : 'Ese correo no esta en la hoja Clientes. Puedes continuar, pero la carga lo va a marcar en rojo.',
    }
    captura.getCell(r, col('producto')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [rango('A', nombresProducto.length)],
      showErrorMessage: true, errorTitle: 'Producto invalido', error: 'Elige un producto de la lista.',
    }
    captura.getCell(r, col('presentacion')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [rango('B', PRESENTACIONES.length)],
      showErrorMessage: true, errorTitle: 'Presentacion invalida', error: 'Elige una presentacion de la lista.',
    }
    captura.getCell(r, col('condiciones_pago')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [rango('C', CONDICIONES_PAGO.length)],
      showErrorMessage: true, errorTitle: 'Condiciones invalidas', error: 'Elige una opcion de la lista.',
    }
    // Formato de fecha explicito: sin el, Excel guarda la fecha como numero
    // de serie y el lector recibe "46327" en vez de una fecha.
    for (const clave of ['fecha_pedido', 'fecha_entrega']) {
      const celda = captura.getCell(r, col(clave))
      celda.numFmt = 'yyyy-mm-dd'
      celda.dataValidation = {
        type: 'date', operator: 'lessThanOrEqual', allowBlank: true,
        // El tope es hoy mas un ano: la validacion de Excel es una ayuda, el
        // "no futura" de verdad lo imponen crearPedido y el trigger.
        formulae: [new Date(Date.now() + 365 * 86400000)],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Fecha fuera de rango',
        error: 'Usa el formato AAAA-MM-DD. La fecha del pedido no puede ser futura.',
      }
    }

    const celdaCant = captura.getCell(r, col('cantidad'))
    celdaCant.numFmt = '0'
    celdaCant.dataValidation = {
      type: 'whole', operator: 'greaterThan', formulae: [0], allowBlank: true,
      showErrorMessage: true, errorTitle: 'Cantidad invalida',
      error: 'Tiene que ser un numero entero mayor a 0.',
    }

    if (puedeDescuento) {
      captura.getCell(r, col('costo_envio')).numFmt = '"$"#,##0.00'
      captura.getCell(r, col('descuento_valor')).numFmt = '#,##0.00'
      captura.getCell(r, col('descuento_tipo')).dataValidation = {
        type: 'list', allowBlank: true, formulae: [rango('D', 2)],
        showErrorMessage: true, errorTitle: 'Tipo invalido', error: 'Usa "porcentaje" o "monto".',
      }
    }
  }

  captura.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezados.length } }

  // ── Instrucciones ─────────────────────────────────────────
  const inst = wb.addWorksheet('Instrucciones')
  inst.columns = [{ width: 24 }, { width: 86 }]

  const titulo = (texto: string) => {
    const r = inst.addRow([texto, ''])
    r.font = { bold: true, size: 13, color: { argb: ACENTO } }
    r.height = 22
  }
  const linea = (a: string, b = '') => {
    const r = inst.addRow([a, b])
    r.getCell(1).font = { bold: true, size: 10 }
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    r.getCell(2).font = { size: 10 }
  }

  titulo('Carga masiva de pedidos')
  linea('Como funciona', 'Captura en la hoja "Captura": un renglon por partida. Los renglones que comparten la misma referencia se juntan en un solo pedido. Despues sube el archivo en Pedidos y revisa la vista previa antes de confirmar.')
  linea('Nada se crea al subir', 'Subir el archivo solo muestra la vista previa con los totales y los errores. Los pedidos se crean cuando le das Confirmar.')
  inst.addRow([])

  titulo('Columnas')
  linea('referencia', 'Lo que agrupa. Dos renglones con "P-1" son el mismo pedido. Puede ser cualquier texto: P-1, OC-4471, lunes-centro.')
  linea('cliente', 'El correo del cliente, tal como aparece en la hoja Clientes. Tambien acepta su id.')
  linea('producto', 'Nombre del producto. Elige de la lista.')
  linea('presentacion', 'Elige de la lista. La hoja Productos dice que presentaciones tienen precio y stock.')
  linea('cantidad', 'Numero entero mayor a 0. Son piezas: cajas, barriles o latas, segun la presentacion.')
  linea('condiciones_pago', `Opcional, por default Contado. Opciones: ${CONDICIONES_PAGO.map(c => c.label).join(', ')}. Todos los renglones del mismo pedido tienen que coincidir.`)
  linea('fecha_pedido', 'Opcional, por default hoy. Formato AAAA-MM-DD o DD/MM/AAAA. Nunca futura. De esta fecha sale el vencimiento y el mes en los reportes, NO de cuando se sube el archivo.')
  linea('fecha_entrega', 'Opcional. La entrega programada, que el cliente ve en su portal. No puede ser antes de la fecha del pedido.')
  linea('orden_compra', 'Opcional. La OC del cliente; se puede buscar por ella en la pantalla de Pedidos.')
  linea('notas', 'Opcional. Se guarda en el pedido; si hay varias en el mismo pedido se usa la primera.')

  if (puedeDescuento) {
    linea('costo_envio', 'Opcional. Se captura una vez por pedido.')
    linea('descuento_tipo', 'Opcional: "porcentaje" o "monto".')
    linea('descuento_valor', 'El numero del descuento. Si el tipo es porcentaje, de 0 a 100.')
    linea('descuento_motivo', 'Obligatorio si hay descuento.')
    linea('folio_factura', 'Opcional. El folio de la factura emitida.')
  }
  inst.addRow([])

  titulo('Reglas y limites')
  linea('Precios', 'No se capturan: salen del nivel de precio de cada cliente y del catalogo, al momento de confirmar.')
  linea('Fechas', 'Una sola por pedido: si dos renglones de la misma referencia traen fechas distintas, el pedido se marca en rojo.')
  linea('Stock', 'Se valida contra el inventario, y acumulando dentro del archivo: dos pedidos del mismo archivo no se reparten la misma caja.')
  linea('Repetidos', 'Si el mismo producto y presentacion aparece dos veces en el mismo pedido, las cantidades se suman.')
  linea('Limites', `${LIMITE_RENGLONES} renglones, ${LIMITE_PEDIDOS} pedidos por archivo, ${LIMITE_PARTIDAS} partidas por pedido, 2 MB.`)
  linea('Mixes', 'Las cajas mixtas (mix24) no se pueden capturar aqui: llevan el desglose de estilos. Esas van por el formulario de pedido nuevo.')
  if (!puedeDescuento) {
    linea('Descuentos', 'Esta plantilla no trae columnas de descuento ni de envio: solo admin y super admin pueden aplicarlos.')
  }
  if (esVendedor) {
    linea('Tu cartera', 'La hoja Clientes solo trae tus clientes, y el pedido queda asignado a ti.')
    linea('Fecha', 'Como vendedor la fecha del pedido es siempre hoy: deja la columna vacia. Una fecha retroactiva cambiaria el periodo de tu comision, y lo captura la oficina.')
  }

  // ── Productos ─────────────────────────────────────────────
  const hojaProd = wb.addWorksheet('Productos')
  hojaProd.columns = [
    { header: 'producto', key: 'producto', width: 20 },
    { header: 'presentacion', key: 'presentacion', width: 20 },
    { header: 'precio publico', key: 'pub', width: 15 },
    { header: 'precio mayorista', key: 'may', width: 17 },
    { header: 'stock disponible', key: 'stock', width: 17 },
  ]
  hojaProd.getRow(1).font = { bold: true }
  for (const c of combinacionesDisponibles(productos)) {
    const r = hojaProd.addRow({
      producto: c.producto,
      presentacion: c.presentacion,
      pub: c.precioPublico > 0 ? c.precioPublico : 'sin precio',
      may: c.precioMayorista > 0 ? c.precioMayorista : 'sin precio',
      stock: c.stock,
    })
    r.getCell('pub').numFmt = c.precioPublico > 0 ? '"$"#,##0' : '@'
    r.getCell('may').numFmt = c.precioMayorista > 0 ? '"$"#,##0' : '@'
    // Lo que no tiene stock se apaga: se puede capturar, pero va a fallar.
    if (c.stock <= 0) r.font = { color: { argb: GRIS }, italic: true }
  }
  hojaProd.addRow([])
  const notaProd = hojaProd.addRow(['Los renglones en gris no tienen stock hoy.'])
  notaProd.font = { italic: true, color: { argb: GRIS }, size: 9 }

  // ── Clientes ──────────────────────────────────────────────
  const hojaCli = wb.addWorksheet('Clientes')
  hojaCli.columns = [
    { header: 'cliente (correo)', key: 'email', width: 34 },
    { header: 'nombre', key: 'nombre', width: 38 },
    { header: 'nivel de precio', key: 'nivel', width: 16 },
    { header: 'id', key: 'id', width: 38 },
  ]
  hojaCli.getRow(1).font = { bold: true }
  for (const c of [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
    hojaCli.addRow({
      email: c.email || '(sin correo, usa el id)',
      nombre: c.nombre,
      nivel: c.nivel_precio === 'taproom' ? 'Mayorista' : c.nivel_precio === 'distribuidor' ? 'Distribuidor' : 'Público',
      id: c.id,
    })
  }

  for (const hoja of [hojaProd, hojaCli]) {
    hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BORDE_GRIS } }
  }

  // Las listas quedan al final y ocultas: son maquinaria, no contenido.
  listas.state = 'hidden'
  listas.getRow(1).font = { bold: true }

  return new Uint8Array(await wb.xlsx.writeBuffer())
}

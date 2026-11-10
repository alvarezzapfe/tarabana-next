/**
 * Arma la plantilla .xlsx de carga masiva de clientes.
 *
 * La hoja de captura se llama "Clientes" y trae EXACTAMENTE los encabezados
 * de la hoja "Clientes" del export, en el mismo orden, porque las dos salen
 * de `clientes-columnas.ts`. Eso es lo que hace que el flujo natural
 * funcione: exportar, agregar renglones abajo, volver a subir.
 *
 * Las columnas calculadas (fecha de alta, # pedidos, facturado, cobrado,
 * saldo, ultimo pedido) van igual, en gris y marcadas en el encabezado: si no
 * estuvieran, el archivo del export y la plantilla serian dos formatos
 * distintos y no se podria subir lo que se acaba de bajar.
 *
 * Cuatro hojas: Clientes (captura), Instrucciones, Vendedores y Listas.
 */
import ExcelJS from 'exceljs'
import {
  COLUMNAS_CLIENTES, type ListaColumna,
} from './clientes-columnas.ts'
import { NOMBRE_HOJA_CLIENTES } from './clientes-export.ts'
import {
  GIROS, NIVELES_PRECIO, REGIMENES_FISICA, REGIMENES_MORAL, USOS_CFDI,
} from './clientes.ts'
import { LIMITE_CLIENTES } from './clientes-importar.ts'
import { FMT_ENTERO, FMT_FECHA, FMT_PESOS } from './libro-xlsx.ts'

const ACENTO = 'FFD95F2E'
const GRIS = 'FF6B7280'
const GRIS_CLARO = 'FF9CA3AF'
const BORDE_GRIS = 'FFE5E7EB'

/** Renglones con desplegable y formato listos para capturar. */
export const RENGLONES_PREPARADOS = 200

const FORMATO: Record<string, string> = {
  pesos: FMT_PESOS,
  fecha: FMT_FECHA,
  entero: FMT_ENTERO,
}

/** Las etiquetas de los catalogos SAT, como las escribe el export. */
const etiquetaSat = (c: { codigo: string; desc: string }) => `${c.codigo} · ${c.desc}`

export type OpcionesPlantillaClientes = {
  /** Fichas activas, para el desplegable y la hoja Vendedores. */
  vendedores: { id: string; nombre: string }[]
  /**
   * Quien la pide es vendedor: las columnas comerciales siguen presentes
   * —el formato tiene que ser el mismo que el del export— pero se marcan y la
   * carga las ignora.
   */
  esVendedor: boolean
}

/** Las columnas de la hoja Listas, en orden, con sus valores. */
function columnasDeListas(vendedores: { nombre: string }[]) {
  return [
    { lista: 'giro' as ListaColumna, titulo: 'giros', ancho: 22, valores: GIROS.map(g => g.label) },
    { lista: 'nivel' as ListaColumna, titulo: 'niveles', ancho: 16, valores: NIVELES_PRECIO.map(n => n.label) },
    {
      lista: 'vendedor' as ListaColumna, titulo: 'vendedores', ancho: 26,
      valores: vendedores.map(v => v.nombre).sort((a, b) => a.localeCompare(b, 'es')),
    },
    {
      lista: 'regimen' as ListaColumna, titulo: 'regimenes', ancho: 40,
      // Los dos juegos juntos: cual aplica lo dice el RFC, y el validador lo
      // rechaza si no corresponde. El desplegable no puede saberlo de antemano.
      valores: [...REGIMENES_FISICA, ...REGIMENES_MORAL].map(etiquetaSat),
    },
    { lista: 'uso_cfdi' as ListaColumna, titulo: 'usos_cfdi', ancho: 36, valores: USOS_CFDI.map(etiquetaSat) },
    { lista: 'si_no' as ListaColumna, titulo: 'si_no', ancho: 8, valores: ['Sí', 'No'] },
  ]
}

export async function construirPlantillaClientes(
  opciones: OpcionesPlantillaClientes
): Promise<Uint8Array> {
  const { vendedores, esVendedor } = opciones

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tarabana'
  wb.created = new Date()

  // ── Listas ────────────────────────────────────────────────
  // Va primero para que los rangos existan cuando se definan las
  // validaciones; se esconde al final.
  const listas = wb.addWorksheet('Listas')
  const defs = columnasDeListas(vendedores)
  listas.columns = defs.map(d => ({ header: d.titulo, width: d.ancho }))
  const alto = Math.max(...defs.map(d => d.valores.length), 1)
  for (let i = 0; i < alto; i++) {
    listas.addRow(defs.map(d => d.valores[i] ?? null))
  }

  /** Letra de columna de una lista en la hoja Listas. */
  const letra = (lista: ListaColumna) =>
    String.fromCharCode(65 + defs.findIndex(d => d.lista === lista))

  const rangoDe = (lista: ListaColumna) => {
    const def = defs.find(d => d.lista === lista)!
    const col = letra(lista)
    return `=Listas!$${col}$2:$${col}$${Math.max(2, def.valores.length + 1)}`
  }

  // ── Clientes (captura) ────────────────────────────────────
  const captura = wb.addWorksheet(NOMBRE_HOJA_CLIENTES, { views: [{ state: 'frozen', ySplit: 1 }] })
  captura.columns = COLUMNAS_CLIENTES.map(c => ({
    header: c.titulo,
    key: c.titulo,
    width: c.ancho,
    ...(c.formato ? { style: { numFmt: FORMATO[c.formato] } } : {}),
  }))

  const encabezado = captura.getRow(1)
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACENTO } }
  encabezado.alignment = { vertical: 'middle' }
  encabezado.height = 22

  for (const [i, c] of COLUMNAS_CLIENTES.entries()) {
    const celda = captura.getCell(1, i + 1)
    if (c.calculada) {
      // En gris y con nota: la columna existe para que el archivo del export
      // se pueda volver a subir, no para capturarla.
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_CLARO } }
      celda.note = 'Sale del historial de pedidos. No se lee al cargar.'
    }
    if (c.clave === 'email') celda.note = 'Obligatorio. Es con lo que el cliente entra al portal.'
    if (c.clave === 'nombre_comercial') celda.note = 'Obligatorio. Como se conoce el negocio.'
    if (c.clave === 'tipo_de_persona') celda.note = 'No se captura: lo dice el largo del RFC.'
    if (esVendedor && ['nivel_de_precio', 'vendedor', 'dias_de_credito', 'limite_de_credito', 'notas'].includes(c.clave)) {
      celda.note = 'No la capturas tú: la define la oficina. Se ignora al cargar.'
    }
  }

  // Desplegables y formatos, renglon por renglon.
  for (let r = 2; r <= RENGLONES_PREPARADOS + 1; r++) {
    for (const [i, c] of COLUMNAS_CLIENTES.entries()) {
      if (!c.lista) continue
      // El vendedor no elige vendedor: se le asigna su propia cartera.
      if (esVendedor && c.lista === 'vendedor') continue
      const def = defs.find(d => d.lista === c.lista)!
      captura.getCell(r, i + 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [rangoDe(c.lista)],
        showErrorMessage: true,
        // Aviso y no bloqueo: la validacion de verdad la hace el servidor y
        // da un mensaje mejor. Bloquear aqui impide pegar varias celdas.
        errorStyle: 'warning',
        errorTitle: `${c.titulo} fuera de la lista`,
        error: `Elige una opción de la lista. Opciones: ${def.valores.slice(0, 4).join(', ')}${def.valores.length > 4 ? ', …' : ''}`,
      }
    }
  }

  captura.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS_CLIENTES.length } }

  // ── Instrucciones ─────────────────────────────────────────
  const inst = wb.addWorksheet('Instrucciones')
  inst.columns = [{ width: 26 }, { width: 86 }]

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

  titulo('Carga masiva de clientes')
  linea('Como funciona', `Captura en la hoja "${NOMBRE_HOJA_CLIENTES}": un renglón por cliente. Después sube el archivo en Clientes y revisa la vista previa antes de confirmar.`)
  linea('Nada se crea al subir', 'Subir el archivo solo muestra la vista previa: qué renglones son nuevos, cuáles ya existen y cuáles tienen un error. Los clientes se crean cuando le das Confirmar.')
  linea('Solo clientes NUEVOS', 'Esta carga no actualiza fichas existentes. Un renglón cuyo correo o RFC ya está en el sistema se marca "ya existe" y se omite. Para cambiar una ficha, édítala en su pantalla.')
  linea('Exportar y volver a subir', `Los encabezados son los mismos que los del botón Exportar Excel, en el mismo orden. Puedes exportar, agregar renglones abajo y volver a subir el mismo archivo: los que ya existen se omiten solos.`)
  linea('No manda correos', 'Crear el cliente NO le envía la invitación al portal. Eso se hace después, cliente por cliente, desde su ficha.')
  inst.addRow([])

  titulo('Columnas obligatorias')
  linea('Email', 'Es la identidad del cliente: con eso entra al portal y con eso se detecta si ya existe. Sin correo el renglón no se puede crear.')
  linea('Nombre comercial', 'Como se conoce el negocio. Es el nombre principal de la ficha; si el cliente es una persona física que opera un bar, aquí va el bar.')
  inst.addRow([])

  titulo('Columnas con lista')
  linea('Giro', `Elige de la lista. Opciones: ${GIROS.map(g => g.label).join(', ')}.`)
  linea('Nivel de precio', `${NIVELES_PRECIO.map(n => n.label).join(', ')}. Vacío = Público. De aquí salen los precios de sus pedidos.`)
  linea('Vendedor', 'El nombre tal como aparece en la hoja Vendedores. Si no coincide, el renglón se marca en rojo en vez de quedar sin vendedor.')
  linea('Requiere factura', 'Sí o No. Si es Sí, el RFC, la razón social y el uso de CFDI pasan a ser obligatorios.')
  linea('Régimen fiscal', 'Elige de la lista. Tiene que corresponder al tipo de persona que dice el RFC: un régimen de persona moral con un RFC de 13 caracteres se rechaza.')
  linea('Uso CFDI', 'Elige de la lista.')
  inst.addRow([])

  titulo('Columnas que NO se capturan')
  linea('Tipo de persona', 'Lo dice el largo del RFC: 12 caracteres es moral, 13 es física. La columna viene porque el export la escribe.')
  for (const c of COLUMNAS_CLIENTES.filter(x => x.calculada)) {
    linea(c.titulo, 'Sale del historial de pedidos. Se exporta, no se lee.')
  }
  inst.addRow([])

  titulo('Reglas y limites')
  linea('Repetidos', 'Se revisa contra la base Y dentro del propio archivo: dos renglones con el mismo correo o el mismo RFC, y el segundo se omite.')
  linea('Teléfonos', 'Diez dígitos. Se guardan con el prefijo +52; no hace falta escribirlo.')
  linea('Crédito', 'Días y límite no pueden ser negativos. Vacío no es cero: es "sin definir".')
  linea('Límites', `${LIMITE_CLIENTES} clientes por archivo, 2 MB.`)
  linea('Todo o nada', 'Cada cliente se crea completo o no se crea: si falla al guardar su ficha, su usuario se borra y el renglón se reporta como fallido.')
  if (esVendedor) {
    linea('Tu cartera', 'Los clientes que cargues quedan asignados a ti. Las columnas de nivel de precio, crédito, vendedor y notas internas las define la oficina y se ignoran.')
  }

  // ── Vendedores ────────────────────────────────────────────
  const hojaVend = wb.addWorksheet('Vendedores')
  hojaVend.columns = [
    { header: 'vendedor', key: 'nombre', width: 30 },
    { header: 'id', key: 'id', width: 38 },
  ]
  hojaVend.getRow(1).font = { bold: true }
  hojaVend.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BORDE_GRIS } }
  if (esVendedor) {
    const r = hojaVend.addRow({ nombre: 'Tus clientes quedan asignados a ti.', id: '' })
    r.font = { italic: true, color: { argb: GRIS } }
  } else {
    for (const v of [...vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
      hojaVend.addRow({ nombre: v.nombre, id: v.id })
    }
    if (vendedores.length === 0) {
      const r = hojaVend.addRow({ nombre: 'No hay vendedores activos.', id: '' })
      r.font = { italic: true, color: { argb: GRIS } }
    }
  }

  listas.state = 'hidden'
  listas.getRow(1).font = { bold: true }

  return new Uint8Array(await wb.xlsx.writeBuffer())
}

/** `plantilla-clientes-tarabana-AAAA-MM-DD.xlsx`. */
export function nombrePlantillaClientes(fecha: string): string {
  return `plantilla-clientes-tarabana-${fecha}.xlsx`
}

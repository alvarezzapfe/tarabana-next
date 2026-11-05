/**
 * Convierte hojas de datos en un .xlsx. Sin nada de negocio.
 *
 * Existe para que exceljs se quede del lado del SERVIDOR. El export de
 * Pedidos se armaba en el navegador con `xlsx`, y cambiarlo a exceljs ahi
 * habria metido cerca de un mega al bundle de la pantalla, para todos los que
 * la abren aunque nunca exporten. Asi el cliente manda los renglones que ya
 * tiene en pantalla y recibe el archivo.
 *
 * Deliberadamente tonto: no sabe que es un pedido ni calcula nada. Quien
 * llama decide el contenido, igual que cuando lo armaba `json_to_sheet`.
 */
import ExcelJS from 'exceljs'

/** Valor que cabe en una celda. */
export type Celda = string | number | boolean | null

export type HojaDatos = {
  nombre: string
  /** Encabezados en orden. Definen tambien el orden de las columnas. */
  columnas: string[]
  /** Un objeto por renglon, indexado por encabezado. */
  filas: Record<string, Celda>[]
  /** Anchos por columna, en caracteres. */
  anchos?: number[]
}

/** Topes para que un POST armado a mano no tumbe el proceso. */
export const MAX_HOJAS = 10
export const MAX_FILAS = 20_000
export const MAX_COLUMNAS = 60

export type ErrorLibro = { error: string }

export function validarHojas(hojas: unknown): HojaDatos[] | ErrorLibro {
  if (!Array.isArray(hojas) || hojas.length === 0) return { error: 'Sin hojas que exportar.' }
  if (hojas.length > MAX_HOJAS) return { error: `Maximo ${MAX_HOJAS} hojas.` }

  let total = 0
  for (const h of hojas) {
    if (!h || typeof h !== 'object') return { error: 'Hoja invalida.' }
    const hoja = h as Record<string, unknown>
    if (typeof hoja.nombre !== 'string' || !hoja.nombre.trim()) return { error: 'Hay una hoja sin nombre.' }
    if (!Array.isArray(hoja.columnas) || hoja.columnas.length === 0) {
      return { error: `La hoja "${hoja.nombre}" no tiene columnas.` }
    }
    if (hoja.columnas.length > MAX_COLUMNAS) return { error: `Maximo ${MAX_COLUMNAS} columnas por hoja.` }
    if (!Array.isArray(hoja.filas)) return { error: `La hoja "${hoja.nombre}" no trae renglones.` }
    total += hoja.filas.length
  }
  if (total > MAX_FILAS) return { error: `El export tiene ${total} renglones y el maximo es ${MAX_FILAS}.` }

  return hojas as HojaDatos[]
}

export async function construirLibro(hojas: HojaDatos[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tarabana'
  wb.created = new Date()

  for (const hoja of hojas) {
    // Excel no acepta : \ / ? * [ ] en el nombre de una hoja, ni mas de 31
    // caracteres. Se sanea en vez de dejar que exceljs tire.
    const nombre = hoja.nombre.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
    const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })

    ws.columns = hoja.columnas.map((c, i) => ({
      header: c,
      key: c,
      width: hoja.anchos?.[i] ?? Math.min(34, Math.max(10, c.length + 4)),
    }))

    const encabezado = ws.getRow(1)
    encabezado.font = { bold: true }
    encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }

    for (const fila of hoja.filas) {
      // `addRow` con objeto respeta las `key` de las columnas, asi que una
      // columna faltante queda vacia en vez de correr los valores.
      ws.addRow(fila)
    }

    if (hoja.filas.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } }
    }
  }

  return new Uint8Array(await wb.xlsx.writeBuffer())
}

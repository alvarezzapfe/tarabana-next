/**
 * Lectura de la hoja de captura de un .xlsx subido por un usuario.
 *
 * Leer una hoja de calculo ajena es descomprimir un ZIP y parsear XML que
 * alguien mas escribio, asi que las defensas no dependen de la libreria:
 *
 *   - Tope de bytes, revisado sobre el buffer real y no sobre Content-Length.
 *   - El archivo tiene que empezar con la firma ZIP (PK\x03\x04). Sin eso no
 *     se intenta parsear: un .xls viejo, un CSV renombrado o un ejecutable se
 *     rechazan antes de tocar el parser.
 *   - Tope de renglones, para que un archivo con un millon de filas vacias no
 *     se convierta en un millon de objetos.
 *   - De las celdas con formula se toma SOLO el resultado cacheado. Nada se
 *     evalua: exceljs devuelve `{ formula, result }` y aqui se lee `result`.
 *   - Todo corre en el servidor. El navegador nunca parsea ni manda filas ya
 *     interpretadas.
 *
 * Se usa exceljs y no `xlsx` (SheetJS) porque la version de `xlsx` publicada
 * en npm arrastra dos advisories de PARSEO sin version corregida disponible
 * (prototype pollution GHSA-4r6h-8v6p-xvw6 y ReDoS GHSA-5pgg-2g8v-p4x9), y
 * ademas exceljs si sabe escribir listas desplegables, que la plantilla
 * necesita.
 */
import ExcelJS from 'exceljs'

/** 2 MB alcanza de sobra para miles de renglones de captura. */
export const LIMITE_BYTES = 2 * 1024 * 1024
export const LIMITE_RENGLONES = 2000

/** Firma de todo ZIP, y por lo tanto de todo .xlsx. */
const FIRMA_ZIP = [0x50, 0x4b, 0x03, 0x04]

export const NOMBRE_HOJA_CAPTURA = 'Captura'

export type FilaCruda = {
  /** Numero de renglon en la hoja, tal como lo ve el usuario en Excel. */
  fila: number
  valores: Record<string, string>
}

export type LecturaXlsx =
  | { ok: true; filas: FilaCruda[]; columnasDesconocidas: string[] }
  | { ok: false; error: string }

/** Normaliza un encabezado: sin acentos, minusculas, con guion bajo. */
export function claveColumna(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * El valor de una celda como string plano.
 *
 * exceljs devuelve varias formas segun el tipo: un objeto con `formula` y
 * `result` para formulas, `{ richText }` para texto con formato, `{ text,
 * hyperlink }` para links, Date para fechas y `{ error }` para #REF!. Si se
 * hace `String(valor)` a ciegas sale "[object Object]" y el error se vuelve
 * incomprensible, asi que cada forma se desarma aqui.
 */
export function textoDeCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor)
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)

  if (typeof valor === 'object') {
    const v = valor as Record<string, unknown>
    // Formula: solo el resultado cacheado, nunca se evalua la formula.
    if ('result' in v) return textoDeCelda(v.result)
    // Celda en error (#REF!, #DIV/0!): se trata como vacia.
    if ('error' in v) return ''
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map(t => String((t as { text?: unknown }).text ?? '')).join('').trim()
    }
    if ('text' in v) return textoDeCelda(v.text)
    if ('hyperlink' in v) return textoDeCelda(v.hyperlink)
  }
  return ''
}

/**
 * Lee la hoja de captura y devuelve sus renglones con datos.
 *
 * `columnasEsperadas` son las claves ya normalizadas. Las columnas que no
 * esten en esa lista se reportan en `columnasDesconocidas` en vez de
 * ignorarse en silencio: si alguien captura "descuento" en una plantilla de
 * no-admin, tiene que enterarse de que no se uso.
 */
export async function leerHojaCaptura(
  bytes: Uint8Array,
  columnasEsperadas: readonly string[]
): Promise<LecturaXlsx> {
  if (bytes.length === 0) return { ok: false, error: 'El archivo esta vacio.' }
  if (bytes.length > LIMITE_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa ${(bytes.length / 1024 / 1024).toFixed(1)} MB y el limite es ${LIMITE_BYTES / 1024 / 1024} MB.`,
    }
  }
  if (!FIRMA_ZIP.every((b, i) => bytes[i] === b)) {
    return {
      ok: false,
      error: 'El archivo no es un .xlsx. Si lo guardaste como .xls o .csv, vuelve a guardarlo como "Libro de Excel (.xlsx)".',
    }
  }

  const wb = new ExcelJS.Workbook()
  try {
    // El buffer ya esta en memoria y acotado por LIMITE_BYTES.
    //
    // El cast reconcilia dos declaraciones, no cambia nada en runtime:
    // exceljs declara `load(buffer: Buffer)` con el Buffer de su propio
    // @types/node, que no es asignable al Buffer generico de @types/node 20+.
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  } catch {
    // A proposito no se filtra el mensaje de la libreria: puede traer rutas
    // internas y no le dice nada util a quien subio el archivo.
    return { ok: false, error: 'No se pudo leer el archivo. Puede estar danado o protegido con contrasena.' }
  }

  const hoja =
    wb.getWorksheet(NOMBRE_HOJA_CAPTURA) ??
    wb.worksheets.find(h => claveColumna(h.name) === claveColumna(NOMBRE_HOJA_CAPTURA)) ??
    wb.worksheets[0]

  if (!hoja) return { ok: false, error: 'El archivo no tiene ninguna hoja.' }

  // ── Encabezados ───────────────────────────────────────────
  const encabezado = hoja.getRow(1)
  const porColumna = new Map<number, string>()
  const columnasDesconocidas: string[] = []

  encabezado.eachCell({ includeEmpty: false }, (celda, col) => {
    const crudo = textoDeCelda(celda.value)
    if (!crudo) return
    const clave = claveColumna(crudo)
    if (columnasEsperadas.includes(clave)) porColumna.set(col, clave)
    else columnasDesconocidas.push(crudo)
  })

  if (porColumna.size === 0) {
    return {
      ok: false,
      error: `La hoja "${hoja.name}" no tiene los encabezados esperados en el primer renglon. Descarga la plantilla y captura ahi.`,
    }
  }

  // ── Renglones ─────────────────────────────────────────────
  const filas: FilaCruda[] = []
  // `rowCount` puede venir inflado por formato aplicado a filas vacias, asi
  // que el tope se revisa sobre los renglones CON datos, no sobre el conteo.
  let leidos = 0

  for (let n = 2; n <= hoja.rowCount; n++) {
    const row = hoja.getRow(n)
    const valores: Record<string, string> = {}
    let algo = false

    for (const [col, clave] of porColumna) {
      const texto = textoDeCelda(row.getCell(col).value)
      valores[clave] = texto
      if (texto !== '') algo = true
    }

    if (!algo) continue
    leidos++
    if (leidos > LIMITE_RENGLONES) {
      return {
        ok: false,
        error: `El archivo trae mas de ${LIMITE_RENGLONES} renglones con datos. Pártelo en varios archivos.`,
      }
    }
    filas.push({ fila: n, valores })
  }

  if (filas.length === 0) {
    return { ok: false, error: 'La hoja de captura no tiene ningun renglon con datos.' }
  }

  return { ok: true, filas, columnasDesconocidas: [...new Set(columnasDesconocidas)] }
}

/**
 * Normalizacion del encabezado de una columna de Excel.
 *
 * Vive sola, sin importar nada, porque la necesitan dos lados que no se
 * pueden mezclar: el lector de archivos subidos (`leer-xlsx.ts`, que importa
 * exceljs) y la declaracion de columnas de la plantilla de clientes
 * (`clientes-columnas.ts`, que a proposito no arrastra exceljs). Antes vivia
 * dentro de `leer-xlsx.ts`, que la sigue reexportando.
 */

/**
 * Clave estable de un encabezado: sin acentos, en minusculas, con guion bajo.
 *
 * Todo lo que no es letra ni digito se convierte en separador, no solo los
 * espacios. Asi "Núm. ext.", "Num ext" y "NÚM EXT" dan la misma clave y un
 * punto de mas en el encabezado no desconecta la columna en silencio.
 */
export function claveColumna(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

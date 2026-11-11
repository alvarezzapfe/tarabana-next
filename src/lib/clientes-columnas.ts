/**
 * Las columnas de la hoja "Clientes", en orden. Fuente unica de tres cosas:
 *
 *   1. El export (`clientes-export.ts`) escribe estos encabezados.
 *   2. La plantilla de carga (`plantilla-clientes.ts`) escribe LOS MISMOS,
 *      en el MISMO orden.
 *   3. El importador (`clientes-importar.ts`) lee por estas claves.
 *
 * Que sean los mismos no es cosmetico: es lo que permite exportar, agregar
 * renglones abajo y volver a subir el mismo archivo. Si la plantilla
 * declarara sus columnas aparte, un dia el export agregaria una y el
 * round-trip se rompería sin que nada fallara — por eso hay un test que
 * compara las dos listas.
 *
 * No importa exceljs ni nada que lo arrastre: la declaracion la necesita
 * tambien codigo que no escribe archivos. `formato` es un nombre simbolico y
 * cada consumidor lo traduce al codigo de Excel que le toca.
 */
import { claveColumna } from './clave-columna.ts'

/** Que lista desplegable lleva la columna en la plantilla. */
export type ListaColumna = 'giro' | 'nivel' | 'vendedor' | 'regimen' | 'uso_cfdi' | 'si_no'

export type ColumnaCliente = {
  titulo: string
  /** Clave normalizada con la que la lee el importador. Se deriva del titulo. */
  clave: string
  ancho: number
  formato?: 'pesos' | 'fecha' | 'entero'
  /**
   * Sale del historial de pedidos, no de la ficha. Se EXPORTA y se IGNORA al
   * leer: subir un archivo con "Cobrado" capturado a mano no mueve un peso.
   */
  calculada?: true
  lista?: ListaColumna
}

/** Sin la clave, que se deriva abajo para que no puedan divergir. */
type Declaracion = Omit<ColumnaCliente, 'clave'>

const DECLARADAS: Declaracion[] = [
  // ── Negocio ──
  { titulo: 'Nombre comercial', ancho: 30 },
  { titulo: 'Razón social',     ancho: 30 },
  { titulo: 'Giro',             ancho: 18, lista: 'giro' },
  { titulo: 'Nivel de precio',  ancho: 15, lista: 'nivel' },
  { titulo: 'Vendedor',         ancho: 20, lista: 'vendedor' },

  // ── Contacto ──
  { titulo: 'Contacto',   ancho: 22 },
  { titulo: 'WhatsApp',   ancho: 15 },
  { titulo: 'Email',      ancho: 28 },
  { titulo: 'Teléfono',   ancho: 15 },
  { titulo: 'Instagram',  ancho: 18 },
  { titulo: 'Sitio web',  ancho: 24 },

  // ── Facturacion ──
  { titulo: 'Requiere factura', ancho: 10, lista: 'si_no' },
  { titulo: 'RFC',              ancho: 15 },
  // No lleva lista: no se captura, lo dice el largo del RFC.
  { titulo: 'Tipo de persona',  ancho: 14 },
  { titulo: 'Régimen fiscal',   ancho: 34, lista: 'regimen' },
  { titulo: 'CP fiscal',        ancho: 10 },
  { titulo: 'Uso CFDI',         ancho: 30, lista: 'uso_cfdi' },

  // ── Entrega ──
  { titulo: 'Calle',                ancho: 26 },
  { titulo: 'Núm. ext.',            ancho: 10 },
  { titulo: 'Núm. int.',            ancho: 10 },
  { titulo: 'Colonia',              ancho: 22 },
  { titulo: 'Municipio',            ancho: 20 },
  { titulo: 'Estado',               ancho: 18 },
  { titulo: 'CP',                   ancho: 10 },
  { titulo: 'Referencias',          ancho: 30 },
  { titulo: 'Horario de recepción', ancho: 22 },

  // ── Credito ──
  { titulo: 'Días de crédito',   ancho: 12, formato: 'entero' },
  { titulo: 'Límite de crédito', ancho: 16, formato: 'pesos' },

  // ── Historial: se exporta, no se captura ──
  { titulo: 'Fecha de alta',   ancho: 13, formato: 'fecha',  calculada: true },
  { titulo: '# pedidos',       ancho: 11, formato: 'entero', calculada: true },
  { titulo: 'Total facturado', ancho: 16, formato: 'pesos',  calculada: true },
  // Cuanto de ese total es IVA. Va aqui y no en lugar de la de arriba porque
  // este archivo es de cobranza: facturado, cobrado y saldo tienen que
  // cuadrar entre si, y los tres van con IVA.
  { titulo: 'IVA',             ancho: 13, formato: 'pesos',  calculada: true },
  // Cuanto del total es ajuste de OC. Puede ser negativo.
  { titulo: 'Ajuste',          ancho: 13, formato: 'pesos',  calculada: true },
  { titulo: 'Cobrado',         ancho: 14, formato: 'pesos',  calculada: true },
  { titulo: 'Saldo',           ancho: 14, formato: 'pesos',  calculada: true },
  { titulo: 'Último pedido',   ancho: 13, formato: 'fecha',  calculada: true },

  { titulo: 'Notas', ancho: 34 },
]

export const COLUMNAS_CLIENTES: ColumnaCliente[] = DECLARADAS.map(d => ({
  ...d,
  clave: claveColumna(d.titulo),
}))

/** Los encabezados, en orden. Lo que escriben el export y la plantilla. */
export const TITULOS_CLIENTES: string[] = COLUMNAS_CLIENTES.map(c => c.titulo)

/**
 * Las claves que el lector acepta.
 *
 * Incluye tambien las calculadas: tienen que reconocerse para NO reportarlas
 * como "columnas que no se usaron" cuando alguien sube el archivo del export
 * tal como salio.
 */
export const CLAVES_CLIENTES: string[] = COLUMNAS_CLIENTES.map(c => c.clave)

/** Las que se ignoran al leer, por titulo, para poder decirlo en la UI. */
export const CALCULADAS_CLIENTES: string[] = COLUMNAS_CLIENTES
  .filter(c => c.calculada)
  .map(c => c.titulo)

/** La columna de una clave, o undefined. */
export const columnaPorClave = (clave: string): ColumnaCliente | undefined =>
  COLUMNAS_CLIENTES.find(c => c.clave === clave)

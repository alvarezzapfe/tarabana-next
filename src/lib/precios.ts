/**
 * La lista de precios: que celda existe, cual se edita y cual se deriva.
 *
 * El dato que manda todo este archivo: en `productos` hay DIEZ columnas de
 * precio —lata y los cuatro barriles, por dos niveles— y NINGUNA para cajas.
 * `precioUnitario` (calcular-pedido.ts) saca la caja de 12 y la de 24
 * multiplicando el precio por lata:
 *
 *   caja12 = round(precio_lata * 12)
 *   caja24 = round(precio_lata * 24)
 *
 * Asi que la caja no tiene precio propio que capturar: se MUESTRA en la lista
 * —quien la consulta quiere ver a cuanto sale la caja— pero se edita en el
 * renglon de la lata. Darle una celda editable propia obligaria a inventar
 * columnas, y entonces habria dos verdades sobre el precio de una caja: la de
 * la lista y la que cobra el pedido.
 *
 * Los niveles son los mismos dos del resto del sistema: `publico` y `taproom`
 * (el mayorista). El sufijo sale de `precioSufijo` segun el nivel del cliente;
 * aqui solo se nombran las columnas.
 */
import type { ColumnaStock } from './unidades.ts'

export type NivelPrecio = 'publico' | 'taproom'

export const NIVELES: { nivel: NivelPrecio; label: string }[] = [
  { nivel: 'publico', label: 'Público' },
  { nivel: 'taproom', label: 'Mayorista' },
]

export type FilaPrecio = {
  /** Unidad de venta, la misma clave que usa `precioUnitario`. */
  unidad: string
  label: string
  /**
   * Columna por nivel, o null si el precio es DERIVADO del de la lata. Es lo
   * que decide si la celda se puede editar.
   */
  columna: Record<NivelPrecio, string> | null
  /** Latas que lleva la presentacion, cuando el precio se deriva. */
  latas?: number
  /** Columna de stock, para mostrar el disponible como referencia. */
  stock: ColumnaStock
}

export const FILAS_PRECIO: FilaPrecio[] = [
  {
    unidad: 'lata',
    label: 'Lata',
    columna: { publico: 'precio_lata_publico', taproom: 'precio_lata_taproom' },
    stock: 'stock_latas',
  },
  { unidad: 'caja12', label: 'Caja 12', columna: null, latas: 12, stock: 'stock_caja12' },
  { unidad: 'caja24', label: 'Caja 24', columna: null, latas: 24, stock: 'stock_caja24' },
  {
    unidad: 'barril_pet',
    label: 'Barril PET 20 L',
    columna: { publico: 'precio_barril_pet_publico', taproom: 'precio_barril_pet_taproom' },
    stock: 'stock_barril_pet',
  },
  {
    unidad: 'barril_acero',
    label: 'Barril acero 20 L',
    columna: { publico: 'precio_barril_acero_publico', taproom: 'precio_barril_acero_taproom' },
    stock: 'stock_barril_acero',
  },
  {
    unidad: 'barril10_pet',
    label: 'Barril PET 10 L',
    columna: { publico: 'precio_barril10_pet_publico', taproom: 'precio_barril10_pet_taproom' },
    stock: 'stock_barril10_pet',
  },
  {
    unidad: 'barril10_acero',
    label: 'Barril acero 10 L',
    columna: { publico: 'precio_barril10_acero_publico', taproom: 'precio_barril10_acero_taproom' },
    stock: 'stock_barril10_acero',
  },
]

/** Las filas que de verdad se capturan. Las derivadas salen de estas. */
export const FILAS_EDITABLES = FILAS_PRECIO.filter(f => f.columna !== null)

/**
 * Las diez columnas de precio, la lista blanca de lo que la ruta acepta
 * escribir. Derivada de FILAS_PRECIO para que agregar una presentacion no
 * exija acordarse de actualizar dos listas.
 */
export const COLUMNAS_PRECIO: string[] = FILAS_EDITABLES.flatMap(f => [
  f.columna!.publico,
  f.columna!.taproom,
])

export const esColumnaPrecio = (x: unknown): x is string =>
  typeof x === 'string' && COLUMNAS_PRECIO.includes(x)

/** Tope de cordura. Un precio de siete cifras es un dedazo, no una venta. */
export const PRECIO_MAX = 1_000_000

export type ProductoPrecios = { id: string; nombre: string } & Record<string, unknown>

/** El precio capturado de una celda, o null si esta vacia. */
export function precioGuardado(producto: ProductoPrecios, columna: string): number | null {
  const v = producto[columna]
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * El precio que la celda muestra, ya sea capturado o derivado.
 *
 * Para las cajas replica exactamente lo que hace `precioUnitario`, redondeo
 * incluido: si la lista mostrara un numero y el pedido cobrara otro, la lista
 * no serviria para cotizar.
 */
export function precioMostrado(
  producto: ProductoPrecios,
  fila: FilaPrecio,
  nivel: NivelPrecio
): number | null {
  if (fila.columna) return precioGuardado(producto, fila.columna[nivel])

  const lata = precioGuardado(producto, `precio_lata_${nivel}`)
  if (lata === null || !fila.latas) return null
  return Math.round(lata * fila.latas)
}

/**
 * El redondeo que el pedido le aplica a la LATA SUELTA, si cambia el precio.
 *
 * `precioUnitario` hace `Math.round(precioLata)` para la lata suelta, pero NO
 * redondea el precio base al calcular la caja: esa es `round(precio * 12)` o
 * `* 24`. Asi que un precio por lata de 37.45 se cobra como **37** por lata
 * suelta y como **899** por caja de 24.
 *
 * Esta pantalla ya no puede CREAR ese caso: `leerPrecio` solo acepta pesos
 * enteros, justamente para que la lata y la caja cobren consistente sin tocar
 * el redondeo de `precioUnitario`. El aviso sigue aqui porque la ficha del
 * producto (`/admin/inventario/edit/[id]`) usa `parseFloat` y todavia puede
 * guardar centavos: si alguien los metio por ahi, la lista tiene que decir lo
 * que de verdad se cobra en vez de mostrar 37.45 junto a "lata".
 *
 * Verificado el 2026-11-10: hoy ningun precio de produccion trae decimales.
 *
 * Devuelve el precio que de verdad se cobra, o null si no hay diferencia.
 */
export function redondeoLata(precio: number | null): number | null {
  if (precio === null || !Number.isFinite(precio)) return null
  const cobrado = Math.round(precio)
  return cobrado === precio ? null : cobrado
}

/** Celdas editables vacias de un producto. Es lo que cuenta "Solo faltantes". */
export function faltantesDe(producto: ProductoPrecios): number {
  return COLUMNAS_PRECIO.filter(c => precioGuardado(producto, c) === null).length
}

/** true si al producto le falta algun precio. */
export const tieneFaltantes = (producto: ProductoPrecios): boolean => faltantesDe(producto) > 0

// ── Captura ─────────────────────────────────────────────────

/**
 * Clave de una celda editable: producto + columna.
 *
 * Se parte por el ULTIMO separador y no por el primero: los nombres de columna
 * son una lista blanca conocida y ninguno trae '|', mientras que el id es un
 * dato ajeno. Cortando por el primero, un id con '|' se partiria mal y el
 * UPDATE iria a un producto que no existe.
 */
export const claveCelda = (productoId: string, columna: string): string => `${productoId}|${columna}`

export function partirClave(clave: string): { productoId: string; columna: string } | null {
  const corte = clave.lastIndexOf('|')
  if (corte <= 0) return null
  return { productoId: clave.slice(0, corte), columna: clave.slice(corte + 1) }
}

export type ValorCelda = { valor: number } | { error: string }

/**
 * Interpreta lo que se escribio en una celda.
 *
 * Acepta separador de miles y el signo de pesos porque la gente pega precios
 * de otra hoja. Lo que NO acepta:
 *
 *   - Cero ni negativo. Un precio en cero no es "gratis": en todo el sistema
 *     significa "sin precio configurado" (`precioUnitario` devuelve 0 y
 *     `calcularPedido` rechaza la venta), asi que guardar un 0 seria una forma
 *     silenciosa de dejar la celda vacia.
 *
 *   - CENTAVOS. `precioUnitario` redondea el precio de la lata suelta pero no
 *     el de la caja, asi que 37.45 se cobraria 37 por lata y 899 por caja de
 *     24 — dos precios que no corresponden al mismo valor por lata. Con pesos
 *     enteros los dos salen consistentes sin tener que tocar el redondeo de
 *     `precioUnitario`, que es lo que cobran todos los pedidos.
 *
 * Un texto con decimales cuyo VALOR es entero si pasa ("2700.00"), porque es
 * lo que sale al pegar de una hoja de calculo y no tiene nada de ambiguo.
 */
export function leerPrecio(texto: string): ValorCelda {
  const limpio = texto.replace(/[$\s,]/g, '')
  if (limpio === '') return { error: 'vacío' }

  const n = Number(limpio)
  if (!Number.isFinite(n)) return { error: 'no es un número' }
  if (n <= 0) return { error: 'tiene que ser mayor que 0' }
  if (!Number.isInteger(n)) return { error: 'solo pesos enteros, sin centavos' }
  if (n > PRECIO_MAX) return { error: `no puede pasar de ${PRECIO_MAX.toLocaleString('es-MX')}` }

  return { valor: n }
}

// ── Sugerencia de mayorista ─────────────────────────────────

export const DESCUENTO_DEFAULT = 15

/**
 * Mayorista = publico - X%.
 *
 * Es una SUGERENCIA: se escribe en la celda y se puede corregir antes de
 * guardar. Devuelve null si no hay publico del que partir, en vez de un cero
 * que se veria como un precio capturado.
 *
 * Redondea a PESOS ENTEROS porque es lo unico que `leerPrecio` acepta: una
 * sugerencia con centavos llenaria la hoja de celdas que la validacion va a
 * rechazar al guardar. El descuento si puede traer decimales (12.5%), lo que
 * se redondea es el resultado.
 */
export function mayoristaSugerido(publico: number | null, descuentoPct: number): number | null {
  if (publico === null || !Number.isFinite(publico) || publico <= 0) return null
  if (!Number.isFinite(descuentoPct) || descuentoPct < 0 || descuentoPct >= 100) return null
  return Math.round(publico * (1 - descuentoPct / 100))
}

// ── Lote por guardar ────────────────────────────────────────

export type CambioProducto = { id: string; precios: Record<string, number> }

export type Lote = {
  cambios: CambioProducto[]
  /** Cuantas celdas cambian de verdad. Es el numero del boton. */
  celdas: number
  /** Celda -> por que no se puede guardar. */
  errores: Record<string, string>
}

/**
 * Lo que hay que mandar al servidor, a partir de lo que se escribio.
 *
 * Solo entran las celdas cuyo valor DIFIERE del guardado: volver a teclear el
 * mismo precio no es un cambio, y mandarlo ensuciaria el audit_log con
 * entradas que no cambian nada.
 */
export function armarLote(
  productos: ProductoPrecios[],
  editados: Record<string, string>
): Lote {
  const porProducto = new Map<string, Record<string, number>>()
  const errores: Record<string, string> = {}
  let celdas = 0

  const indice = new Map(productos.map(p => [p.id, p]))

  for (const [clave, texto] of Object.entries(editados)) {
    const partes = partirClave(clave)
    if (!partes) continue
    const { productoId, columna } = partes

    const producto = indice.get(productoId)
    if (!producto || !esColumnaPrecio(columna)) continue

    // Una celda que se dejo igual que estaba, o que se vacio sin tocar nada,
    // no es un cambio ni un error.
    const actual = precioGuardado(producto, columna)
    if (texto.trim() === '' && actual === null) continue

    const leido = leerPrecio(texto)
    if ('error' in leido) {
      errores[clave] = leido.error
      continue
    }
    if (leido.valor === actual) continue

    const previo = porProducto.get(productoId) || {}
    previo[columna] = leido.valor
    porProducto.set(productoId, previo)
    celdas += 1
  }

  return {
    cambios: [...porProducto.entries()].map(([id, precios]) => ({ id, precios })),
    celdas,
    errores,
  }
}

// ── Formularios de producto ─────────────────────────────────
//
// La lista de precios no es la unica pantalla que escribe estas columnas: la
// ficha del producto y el alta tambien. Si cada una tuviera su propia lectura,
// la regla de "pesos enteros" valdria en una y no en las otras, y el mismo
// precio con centavos entraria por la puerta de al lado.

/** Nombre legible de una columna, para los mensajes de error. */
export function etiquetaColumna(columna: string): string {
  for (const f of FILAS_EDITABLES) {
    if (f.columna!.publico === columna) return `${f.label} · Público`
    if (f.columna!.taproom === columna) return `${f.label} · Mayorista`
  }
  return columna
}

export type PreciosLeidos =
  | { precios: Record<string, number | null>; errores?: undefined }
  | { errores: Record<string, string>; precios?: undefined }

/**
 * Lee los campos de precio de un formulario de producto.
 *
 * Diferencias con `leerPrecio`, que es para una celda de la lista:
 *
 *   - Una celda VACIA es `null` (sin precio), no un error: al dar de alta un
 *     producto es normal no tener todavia el precio de todas las
 *     presentaciones, y en la ficha se guarda lo que haya.
 *   - Solo se leen las columnas que vienen en el objeto. Una columna ausente
 *     se OMITE del resultado en vez de devolverse como null, para que un
 *     formulario que no la trae no borre un precio ya capturado.
 *
 * Lo demas es la misma regla: mayor que 0 y en pesos enteros.
 */
export function leerPreciosDeFormulario(crudos: Record<string, unknown>): PreciosLeidos {
  const precios: Record<string, number | null> = {}
  const errores: Record<string, string> = {}

  for (const columna of COLUMNAS_PRECIO) {
    if (!(columna in crudos)) continue

    const crudo = crudos[columna]
    const texto = crudo === null || crudo === undefined ? '' : String(crudo)
    if (texto.trim() === '') {
      precios[columna] = null
      continue
    }

    const leido = leerPrecio(texto)
    if ('error' in leido) errores[columna] = leido.error
    else precios[columna] = leido.valor
  }

  return Object.keys(errores).length > 0 ? { errores } : { precios }
}

/** El primer error, ya redactado. Para formularios que muestran un solo aviso. */
export function primerErrorDePrecios(errores: Record<string, string>): string {
  const [columna, motivo] = Object.entries(errores)[0] ?? []
  if (!columna) return ''
  const cuantos = Object.keys(errores).length
  return `${etiquetaColumna(columna)}: ${motivo}.` +
    (cuantos > 1 ? ` (y ${cuantos - 1} ${cuantos === 2 ? 'precio más' : 'precios más'} con problemas)` : '')
}

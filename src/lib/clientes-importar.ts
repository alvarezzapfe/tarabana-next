/**
 * Validacion de una carga masiva de clientes desde Excel.
 *
 * Puro: no toca red ni DB. Recibe los renglones ya leidos del archivo y el
 * catalogo que armo el servidor, y devuelve el PLAN: un renglon por fila, con
 * su estado y, si va a crearse, el cuerpo listo para `crearCliente`.
 *
 * Tres estados y nada mas:
 *
 *   nuevo   se va a crear.
 *   existe  ya hay un cliente con ese correo o ese RFC —en la base o en un
 *           renglon anterior del mismo archivo—, asi que se omite. No es un
 *           error: subir el archivo del export con diez renglones nuevos
 *           abajo tiene que decir "23 ya existen, 10 nuevos", no 23 errores.
 *   error   el renglon no se puede crear. Trae el motivo pegado.
 *
 * Las reglas de negocio no se reimplementan aqui: la forma de un cliente la
 * valida `validarCliente` y las columnas las mapea `camposCliente`, los
 * mismos que usa el formulario. Lo que agrega este archivo es lo que solo
 * existe en una carga masiva: traducir las ETIQUETAS del Excel a valores
 * (giro, nivel, vendedor, los catalogos SAT), detectar repetidos dentro del
 * propio archivo, e ignorar las columnas calculadas.
 *
 * Por que se ignoran las calculadas: la plantilla es el export, para poder
 * exportar, agregar renglones y volver a subir. Ese archivo trae "# pedidos",
 * "Cobrado", "Saldo" y compania, que salen del historial. Capturarlas a mano
 * no mueve un peso y ni se leen.
 */
import { COLUMNAS_CLIENTES } from './clientes-columnas.ts'
import { validarCliente, type CuerpoCliente } from './cliente-campos.ts'
import {
  GIROS, NIVELES_PRECIO, REGIMENES_FISICA, REGIMENES_MORAL, USOS_CFDI,
  normalizarRFC,
} from './clientes.ts'

/**
 * Tope de clientes por archivo.
 *
 * Mas bajo que el de renglones de `leer-xlsx.ts` a proposito: cada alta son
 * tres viajes a Supabase (correo repetido, crear usuario de auth, escribir el
 * perfil), asi que mil clientes en una sola request se pasarian del tiempo
 * limite a media creacion y dejarian el lote partido.
 */
export const LIMITE_CLIENTES = 300

/** Las claves que el lector tiene que reconocer. */
export const CLAVES_IMPORT = COLUMNAS_CLIENTES.map(c => c.clave)

/** Las claves que se leen de verdad: todo menos lo calculado. */
export const CLAVES_CAPTURABLES = COLUMNAS_CLIENTES.filter(c => !c.calculada).map(c => c.clave)

/** Columnas que un vendedor no decide, igual que en el formulario. */
export const COLUMNAS_COMERCIALES = ['nivel_de_precio', 'vendedor', 'dias_de_credito', 'limite_de_credito', 'notas']

export type EstadoFila = 'nuevo' | 'existe' | 'error'

export type FilaPlan = {
  /** Renglon en la hoja, tal como lo ve la persona en Excel. */
  fila: number
  estado: EstadoFila
  /** Lo que se muestra en la vista previa. */
  nombre: string
  email: string
  rfc: string | null
  giro: string | null
  nivel: string | null
  vendedor: string | null
  /** Por que se omite, o que esta mal. null si es nuevo. */
  motivo: string | null
  /** Listo para `crearCliente`. Solo cuando `estado === 'nuevo'`. */
  cuerpo?: CuerpoCliente
}

export type PlanClientes = {
  renglones: number
  nuevos: number
  existentes: number
  errores: number
  filas: FilaPlan[]
  /** Lo que invalida el archivo entero, no un renglon. */
  erroresGlobales: string[]
  /** Lo que conviene saber pero no impide cargar. */
  avisos: string[]
}

export type VendedorCatalogo = { id: string; nombre: string }

export type CatalogoClientes = {
  /** Correos que ya existen, en minusculas. */
  emails: Set<string>
  /** RFCs que ya existen, normalizados. */
  rfcs: Set<string>
  vendedores: VendedorCatalogo[]
}

export type OpcionesImportClientes = {
  /** Quien sube es vendedor: no captura columnas comerciales. */
  esVendedor: boolean
}

// ── Traduccion de etiquetas a valores ───────────────────────

/** Sin acentos, sin espacios de sobra, en minusculas. */
const norm = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Busca en un catalogo por etiqueta o por valor.
 *
 * Las dos formas porque el archivo puede venir de dos lados: del export, que
 * escribe la etiqueta ("Bar o cantina"), o de alguien que conoce los valores
 * internos y teclea "bar". Las dos tienen que funcionar.
 */
function buscarCatalogo<T extends { value: string; label: string }>(
  catalogo: readonly T[],
  texto: string
): T | undefined {
  const t = norm(texto)
  return catalogo.find(o => norm(o.label) === t) || catalogo.find(o => norm(o.value) === t)
}

/**
 * El codigo de un catalogo SAT a partir de la celda.
 *
 * El export escribe "601 · General de Ley Personas Morales" y la plantilla
 * ofrece eso mismo en el desplegable, asi que se corta en el separador. Un
 * codigo solo ("601") tambien pasa.
 */
export function codigoSat(texto: string): string {
  const t = texto.trim()
  if (!t) return ''
  const antes = t.split('·')[0].trim()
  // El codigo es lo primero que haya: letras y digitos sin espacios.
  return (antes.match(/^[A-Za-z0-9]+/)?.[0] || '').toUpperCase()
}

/** 'Sí' / 'No' y las formas en que la gente lo escribe. */
export function parseSiNo(texto: string): boolean {
  const t = norm(texto)
  return ['si', 'sí', 's', 'x', 'true', 'verdadero', '1', 'yes'].includes(t)
}

/**
 * Un numero de una celda, o null si esta vacia.
 *
 * Devuelve el string tal cual cuando no es numero, para que `validarCliente`
 * sea quien rechace "treinta" con su propio mensaje y no haya dos lugares
 * decidiendo que es un numero valido.
 */
function parseNumeroCelda(texto: string): number | string | null {
  const t = texto.replace(/[\s,$]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : texto.trim()
}

// ── Construccion del plan ───────────────────────────────────

type FilaEntrada = { fila: number; valores: Record<string, string> }

const v = (valores: Record<string, string>, clave: string): string => (valores[clave] || '').trim()

export function construirPlanClientes(
  filas: FilaEntrada[],
  catalogo: CatalogoClientes,
  opciones: OpcionesImportClientes
): PlanClientes {
  const erroresGlobales: string[] = []
  const avisos: string[] = []

  if (filas.length > LIMITE_CLIENTES) {
    erroresGlobales.push(
      `El archivo trae ${filas.length} renglones y el maximo por carga es ${LIMITE_CLIENTES}. Pártelo en varios archivos.`
    )
  }

  // Lo visto en renglones ANTERIORES del mismo archivo. Un correo repetido
  // dentro del archivo se omite igual que uno que ya esta en la base: si no,
  // el segundo reventaria en la creacion con "ya existe ese correo" despues
  // de que la vista previa dijo que era nuevo.
  const emailsVistos = new Map<string, number>()
  const rfcsVistos = new Map<string, number>()

  // Que columnas comerciales traen algo, para avisarle al vendedor una vez en
  // vez de ensuciar cada renglon.
  const comercialesConDatos = new Set<string>()

  const salida: FilaPlan[] = []

  for (const { fila, valores } of filas) {
    const email = v(valores, 'email').toLowerCase()
    const rfcCrudo = v(valores, 'rfc')
    const rfc = normalizarRFC(rfcCrudo) || null
    const nombre = v(valores, 'nombre_comercial')

    const base: Omit<FilaPlan, 'estado' | 'motivo'> = {
      fila,
      nombre: nombre || v(valores, 'razon_social') || email || '(sin nombre)',
      email,
      rfc,
      giro: v(valores, 'giro') || null,
      nivel: v(valores, 'nivel_de_precio') || null,
      vendedor: v(valores, 'vendedor') || null,
    }
    const error = (motivo: string): FilaPlan => ({ ...base, estado: 'error', motivo })
    const existe = (motivo: string): FilaPlan => ({ ...base, estado: 'existe', motivo })

    // ── El correo, antes que nada ───────────────────────────
    // Es la identidad del cliente: sin el no se puede crear el usuario de
    // auth ni se puede saber si ya existe.
    if (!email) {
      salida.push(error('Falta el correo. Es obligatorio: es con lo que el cliente entra al portal.'))
      continue
    }

    // ── Ya existe ───────────────────────────────────────────
    // Se revisa antes de validar la forma: en un renglon que ya esta en el
    // sistema no hay nada que corregir, y decir "corrige el RFC" de un
    // cliente que ya existe manda a la gente a arreglar lo que no toca.
    if (catalogo.emails.has(email)) {
      salida.push(existe('Ya hay un cliente con ese correo.'))
      continue
    }
    if (rfc && catalogo.rfcs.has(rfc)) {
      salida.push(existe(`Ya hay un cliente con el RFC ${rfc}.`))
      continue
    }
    const filaEmail = emailsVistos.get(email)
    if (filaEmail !== undefined) {
      salida.push(existe(`El correo se repite: ya venia en el renglon ${filaEmail}.`))
      continue
    }
    if (rfc) {
      const filaRfc = rfcsVistos.get(rfc)
      if (filaRfc !== undefined) {
        salida.push(existe(`El RFC ${rfc} se repite: ya venia en el renglon ${filaRfc}.`))
        continue
      }
    }

    // ── Catalogos ───────────────────────────────────────────
    const giroTexto = v(valores, 'giro')
    let giro: string | null = null
    if (giroTexto) {
      const encontrado = buscarCatalogo(GIROS, giroTexto)
      if (!encontrado) {
        salida.push(error(`Giro desconocido: "${giroTexto}". Elige uno de la lista de la plantilla.`))
        continue
      }
      giro = encontrado.value
    }

    const nivelTexto = v(valores, 'nivel_de_precio')
    let nivel: string | null = null
    if (nivelTexto) {
      const encontrado = buscarCatalogo(NIVELES_PRECIO, nivelTexto)
      if (!encontrado) {
        salida.push(error(`Nivel de precio desconocido: "${nivelTexto}". Usa Público, Mayorista o Distribuidor.`))
        continue
      }
      nivel = encontrado.value
    }

    const vendedorTexto = v(valores, 'vendedor')
    let vendedorId: string | null = null
    if (vendedorTexto && !opciones.esVendedor) {
      const ficha = catalogo.vendedores.find(x => norm(x.nombre) === norm(vendedorTexto))
      if (!ficha) {
        // No se deja pasar en silencio: un cliente asignado al vendedor
        // equivocado —o a ninguno— cambia quien lo ve y quien cobra comision.
        salida.push(error(`Vendedor desconocido: "${vendedorTexto}". Tiene que estar en la hoja Vendedores.`))
        continue
      }
      vendedorId = ficha.id
    }

    for (const clave of COLUMNAS_COMERCIALES) {
      if (v(valores, clave)) comercialesConDatos.add(clave)
    }

    // ── El cuerpo, igual que el del formulario ──────────────
    const requiereFactura = parseSiNo(v(valores, 'requiere_factura'))
    const cuerpo: CuerpoCliente = {
      marca_negocio: nombre,
      razon_social: v(valores, 'razon_social'),
      giro,
      instagram: v(valores, 'instagram'),
      sitio_web: v(valores, 'sitio_web'),

      contacto_nombre: v(valores, 'contacto'),
      contacto_whatsapp: v(valores, 'whatsapp'),
      email,
      phone: v(valores, 'telefono'),

      requiere_factura: requiereFactura,
      rfc: rfcCrudo,
      // El tipo de persona NO se captura: lo dice el largo del RFC y lo
      // deriva `camposCliente`. La columna existe en el archivo porque el
      // export la escribe.
      regimen_fiscal: codigoSat(v(valores, 'regimen_fiscal')),
      cp_fiscal: v(valores, 'cp_fiscal'),
      uso_cfdi: codigoSat(v(valores, 'uso_cfdi')),

      calle: v(valores, 'calle'),
      num_ext: v(valores, 'num_ext'),
      num_int: v(valores, 'num_int'),
      colonia: v(valores, 'colonia'),
      municipio: v(valores, 'municipio'),
      estado: v(valores, 'estado'),
      cp: v(valores, 'cp'),
      referencias: v(valores, 'referencias'),
      horario_recepcion: v(valores, 'horario_de_recepcion'),

      nivel_precio: nivel,
      dias_credito: parseNumeroCelda(v(valores, 'dias_de_credito')),
      limite_credito: parseNumeroCelda(v(valores, 'limite_de_credito')),
      vendedor_id: vendedorId,
      notas: v(valores, 'notas'),
    }

    // ── La forma, con el validador del formulario ───────────
    const fallo = validarCliente(cuerpo, { alCrear: true })
    if (fallo) {
      salida.push(error(fallo.error))
      continue
    }

    emailsVistos.set(email, fila)
    if (rfc) rfcsVistos.set(rfc, fila)
    salida.push({ ...base, estado: 'nuevo', motivo: null, cuerpo })
  }

  if (opciones.esVendedor && comercialesConDatos.size > 0) {
    avisos.push(
      `Como vendedor no capturas nivel de precio, credito, vendedor ni notas internas: ` +
      `esas columnas se ignoran y los clientes quedan en tu cartera. ` +
      `(Traian datos: ${[...comercialesConDatos].join(', ')}.)`
    )
  }

  return {
    renglones: filas.length,
    nuevos: salida.filter(f => f.estado === 'nuevo').length,
    existentes: salida.filter(f => f.estado === 'existe').length,
    errores: salida.filter(f => f.estado === 'error').length,
    filas: salida,
    erroresGlobales,
    avisos,
  }
}

/**
 * El aviso de las columnas calculadas, cuando el archivo las trae.
 *
 * Es el caso normal —subir el export tal como salio—, asi que se dice una vez
 * y como informacion, no como advertencia de algo mal hecho.
 *
 * Recibe las CLAVES que el lector reconocio, no los titulos: es lo que
 * devuelve `leerHojaCaptura` y evita volver a normalizar encabezados aqui.
 */
export function avisoCalculadas(clavesEnArchivo: readonly string[]): string | null {
  const presentes = COLUMNAS_CLIENTES
    .filter(c => c.calculada && clavesEnArchivo.includes(c.clave))
    .map(c => c.titulo)
  if (presentes.length === 0) return null
  return `Estas columnas salen del historial de pedidos y no se leen: ${presentes.join(', ')}.`
}

/** Los codigos SAT validos, para la plantilla y para los tests. */
export const CODIGOS_REGIMEN = [...REGIMENES_FISICA, ...REGIMENES_MORAL].map(r => r.codigo)
export const CODIGOS_USO_CFDI = USOS_CFDI.map(u => u.codigo)

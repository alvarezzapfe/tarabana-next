/**
 * El mapeo del cuerpo del alta de clientes a columnas de `profiles`.
 *
 * Existe porque las dos rutas que escriben un cliente se habian separado:
 * `clientes/crear` escribia 14 columnas mientras la pagina posteaba 25, asi
 * que un cliente recien creado perdia su direccion estructurada, su nivel de
 * precio y sus notas — y la unica forma de tener un cliente completo era
 * crearlo y despues editarlo. Con un solo mapeo, crear y actualizar no pueden
 * volver a divergir.
 *
 * Dos reglas que valen para todo el archivo:
 *
 * 1. Lo que NO viene en el cuerpo no se toca. `undefined` es "dejalo como
 *    estaba" y es distinto de `null`, que es "borralo". Importa: el
 *    formulario del admin ya no captura `tipo_consumidor` ni el nombre de
 *    pila, y escribirlos como null borraria lo que el cliente puso en el
 *    portal.
 * 2. Los telefonos se guardan con el prefijo. La ruta de crear ponia `+52` y
 *    la de actualizar no, asi que editar un cliente le quitaba el prefijo que
 *    el alta le habia puesto.
 */
import {
  GIROS_VALIDOS, REGIMENES_FISICA, REGIMENES_MORAL, USOS_CFDI,
  normalizarRFC, rfcValido, tipoPersonaDeRFC,
} from './clientes.ts'

export type CuerpoCliente = Record<string, unknown>

/** Un fallo de validacion, listo para devolverse como respuesta. */
export type FalloCliente = { error: string; status: number }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

/** Diez digitos con prefijo de pais, o null. */
const telefono = (v: unknown): string | null => {
  const t = texto(v)
  if (!t) return null
  const d = t.replace(/\D/g, '').replace(/^52/, '').slice(-10)
  return d.length === 10 ? `+52${d}` : null
}

/**
 * Un numero, conservando el signo.
 *
 * El signo importa: una version anterior limpiaba con /[^\d.]/g, que se
 * COMIA el menos, asi que un -5 llegaba a la validacion como 5, pasaba, y se
 * guardaba como cinco dias de credito. Lo negativo tiene que poder
 * rechazarse, y para eso tiene que poder leerse.
 */
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const limpio = String(v).trim().replace(/[^\d.-]/g, '')
  if (!limpio || limpio === '-' || limpio === '.') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * El nombre con el que se identifica al cliente en auth y en el codigo viejo.
 *
 * Se deriva, no se captura: el cliente es el negocio, asi que el nombre
 * comercial manda. Esto es lo que mantiene coherentes las pantallas que
 * siguen leyendo `full_name` crudo sin saber de `marca_negocio`.
 */
export function nombreCompletoDe(body: CuerpoCliente): string | null {
  return texto(body.marca_negocio) || texto(body.razon_social) || texto(body.contacto_nombre)
}

/**
 * Valida lo que el servidor no puede dar por bueno.
 *
 * El formulario ya valida en vivo, pero estas rutas son endpoints: lo que
 * llega por HTTP no pasó necesariamente por el formulario.
 */
export function validarCliente(body: CuerpoCliente, opciones: { alCrear: boolean }): FalloCliente | null {
  if (!texto(body.marca_negocio)) {
    return { error: 'El nombre comercial es obligatorio.', status: 400 }
  }

  const email = texto(body.email)
  if (opciones.alCrear && !email) {
    return { error: 'El correo es obligatorio.', status: 400 }
  }
  if (email && !EMAIL_RE.test(email)) {
    return { error: 'Formato de correo invalido.', status: 400 }
  }

  const giro = texto(body.giro)
  if (giro && !GIROS_VALIDOS.includes(giro)) {
    return { error: `Giro invalido: ${giro}`, status: 400 }
  }

  if (body.requiere_factura) {
    const rfc = normalizarRFC(texto(body.rfc))
    if (!rfc) return { error: 'Con factura, el RFC es obligatorio.', status: 400 }
    if (!rfcValido(rfc)) {
      return { error: 'El RFC no tiene un formato valido.', status: 400 }
    }
    if (!texto(body.razon_social)) {
      return { error: 'Con factura, la razon social es obligatoria.', status: 400 }
    }

    const uso = texto(body.uso_cfdi)
    if (!uso) return { error: 'Con factura, el uso de CFDI es obligatorio.', status: 400 }
    if (!USOS_CFDI.some(u => u.codigo === uso)) {
      return { error: `Uso de CFDI invalido: ${uso}`, status: 400 }
    }

    // El regimen tiene que corresponder al tipo de persona que dice el RFC:
    // un 601 con un RFC de 13 caracteres es un dato imposible.
    const regimen = texto(body.regimen_fiscal)
    if (regimen) {
      const permitidos = tipoPersonaDeRFC(rfc) === 'moral' ? REGIMENES_MORAL : REGIMENES_FISICA
      if (!permitidos.some(r => r.codigo === regimen)) {
        return {
          error: `El regimen ${regimen} no corresponde a una persona ${tipoPersonaDeRFC(rfc) === 'moral' ? 'moral' : 'fisica'}.`,
          status: 400,
        }
      }
    }
  }

  for (const campo of ['dias_credito', 'limite_credito'] as const) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') continue
    const n = numero(body[campo])
    if (n === null || n < 0) {
      return { error: `${campo === 'dias_credito' ? 'Los dias' : 'El limite'} de credito no puede ser negativo.`, status: 400 }
    }
  }

  return null
}

/**
 * Las columnas de `profiles` que escribe el alta/edicion de un cliente.
 *
 * `comercial` separa lo que un vendedor NO decide: nivel de precio, credito,
 * de quien es la cuenta y las notas internas. Si viene en false, esas
 * columnas no se incluyen — ni siquiera como null —, asi que un vendedor no
 * puede moverlas ni por accidente mandando el campo a mano.
 */
export function camposCliente(
  body: CuerpoCliente,
  opciones: { comercial: boolean }
): Record<string, unknown> {
  const conFactura = !!body.requiere_factura
  const rfc = conFactura ? normalizarRFC(texto(body.rfc)) : null

  const campos: Record<string, unknown> = {
    // ── Negocio ──
    marca_negocio: texto(body.marca_negocio),
    giro: texto(body.giro),
    instagram: texto(body.instagram),
    sitio_web: texto(body.sitio_web),

    // ── Contacto ──
    contacto_nombre: texto(body.contacto_nombre),
    contacto_whatsapp: telefono(body.contacto_whatsapp),
    phone: telefono(body.phone),

    // ── Facturacion ──
    //
    // Sin factura se limpia todo el bloque: dejar un RFC colgando de un
    // cliente que no factura es lo que despues timbra mal.
    requiere_factura: conFactura,
    rfc: rfc || null,
    razon_social: conFactura ? texto(body.razon_social) : null,
    regimen_fiscal: conFactura ? texto(body.regimen_fiscal) : null,
    cp_fiscal: conFactura ? texto(body.cp_fiscal) : null,
    uso_cfdi: conFactura ? texto(body.uso_cfdi) : null,
    // No se pregunta: lo dice el largo del RFC.
    tipo_persona_registro: rfc ? tipoPersonaDeRFC(rfc) : null,

    // ── Entrega ──
    calle: texto(body.calle),
    num_ext: texto(body.num_ext),
    num_int: texto(body.num_int),
    colonia: texto(body.colonia),
    municipio: texto(body.municipio),
    estado: texto(body.estado),
    cp: texto(body.cp),
    referencias: texto(body.referencias),
    horario_recepcion: texto(body.horario_recepcion),
    // Columnas viejas que se mantienen en sincronia: hay pantallas y la orden
    // en Word que todavia las leen.
    direccion_entrega: [texto(body.calle), texto(body.num_ext)].filter(Boolean).join(' ') || null,
    ciudad: texto(body.municipio),
  }

  const nombre = nombreCompletoDe(body)
  if (nombre) campos.full_name = nombre

  if (opciones.comercial) {
    campos.nivel_precio = texto(body.nivel_precio) || 'publico'
    campos.dias_credito = numero(body.dias_credito)
    campos.limite_credito = numero(body.limite_credito)
    campos.vendedor_id = texto(body.vendedor_id)
    campos.notas = texto(body.notas)
  }

  // Lo que el formulario del admin ya no captura pero el portal si: se copia
  // solo si viene, para no borrar lo que el cliente declaro de si mismo.
  for (const campo of ['tipo_consumidor', 'nombre_pila', 'apellido_paterno', 'apellido_materno'] as const) {
    if (body[campo] !== undefined) campos[campo] = texto(body[campo])
  }

  return campos
}

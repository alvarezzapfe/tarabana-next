/**
 * Validacion de una carga masiva de pedidos desde Excel.
 *
 * Puro: no toca red ni DB. Recibe los renglones ya leidos del archivo y el
 * catalogo que armo el servidor, y devuelve el PLAN: un pedido por
 * `referencia`, con sus partidas, su total y sus errores por renglon.
 *
 * Reusa las primitivas de `calcular-pedido.ts` (`precioUnitario`) y de
 * `unidades.ts` (`columnaStockDe`) en lugar de recalcular precios o adivinar
 * columnas de stock. La validacion definitiva la vuelve a hacer
 * `crearPedido` con `calcularPedido` al confirmar: esto es la vista previa,
 * y su razon de existir es dar el error PEGADO AL RENGLON, que
 * `calcularPedido` no puede porque corta en el primer fallo del pedido.
 *
 * Dos cosas que importan y no son obvias:
 *
 *   - El stock se descuenta ACUMULANDO a lo largo del archivo. Dos pedidos
 *     del mismo lote, cada uno valido por separado, no pueden repartirse el
 *     mismo barril. Ojo: esto NO reserva nada. Hoy el stock se descuenta al
 *     marcar el pedido como entregado, no al crearlo, asi que entre la vista
 *     previa y el confirmar alguien mas puede dejarte corto.
 *
 *   - Dos renglones del mismo pedido con el mismo producto y presentacion se
 *     CONSOLIDAN sumando cantidades. Si no, `calcularPedido` validaria cada
 *     uno contra el stock completo y dejaria pasar 5 + 5 cajas habiendo 6.
 */
import { precioUnitario } from './calcular-pedido.ts'
import { columnaStockDe } from './unidades.ts'

/** Tope de pedidos por archivo: acota el bucle de creacion. */
export const LIMITE_PEDIDOS = 200
/** Tope de partidas por pedido. */
export const LIMITE_PARTIDAS = 50

export const COLUMNAS_BASE = [
  'referencia', 'cliente', 'producto', 'presentacion', 'cantidad', 'condiciones_pago',
  'fecha_pedido', 'fecha_entrega', 'orden_compra', 'notas',
] as const

/** Solo se generan y se leen si quien sube es admin o super admin. */
export const COLUMNAS_ADMIN = [
  'costo_envio', 'descuento_tipo', 'descuento_valor', 'descuento_motivo', 'folio_factura',
] as const

/**
 * Presentaciones que se pueden capturar en un renglon.
 *
 * `mix24` queda fuera a proposito: se arma con latas de varios estilos y vive
 * en `metadata.estilos`, que no cabe en una celda. Los mix se siguen
 * levantando desde el formulario.
 */
export const PRESENTACIONES = [
  { key: 'lata', label: 'Lata' },
  { key: 'caja12', label: 'Caja 12 latas' },
  { key: 'caja24', label: 'Caja 24 latas' },
  { key: 'barril_pet', label: 'Barril 20L PET' },
  { key: 'barril_acero', label: 'Barril 20L Acero' },
  { key: 'barril10_pet', label: 'Barril 10L PET' },
  { key: 'barril10_acero', label: 'Barril 10L Acero' },
] as const

export const CONDICIONES_PAGO = [
  { key: 'contado', label: 'Contado' },
  { key: '15_dias', label: '15 días' },
  { key: '30_dias', label: '30 días' },
] as const

// ── Tipos ───────────────────────────────────────────────────

export type ProductoCatalogo = Record<string, unknown> & { id: string; nombre: string }

export type ClienteCatalogo = {
  id: string
  email: string | null
  nombre: string
  nivel_precio: string | null
}

export type Catalogo = {
  productos: ProductoCatalogo[]
  clientes: ClienteCatalogo[]
}

export type OpcionesImport = {
  /** Puede capturar costo de envio, descuento y folio de factura. */
  puedeDescuento: boolean
  /**
   * Un vendedor captura siempre con la fecha de hoy: mover un pedido a un mes
   * anterior le cambiaria el periodo de comision, que pudo quedar cerrado.
   */
  esVendedor: boolean
  /** Hoy en Mexico, 'YYYY-MM-DD'. Se inyecta para poder probarlo. */
  hoy: string
}

export type ErrorFila = { fila: number | null; mensaje: string }

export type PartidaPlan = {
  /** Renglones del archivo que la componen (mas de uno si se consolido). */
  filas: number[]
  producto_id: string
  producto: string
  presentacion: string
  presentacionLabel: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export type PedidoPlan = {
  referencia: string
  cliente_id: string | null
  clienteNombre: string
  nivelPrecio: string | null
  condiciones_pago: string
  fecha_pedido: string
  fecha_entrega: string | null
  orden_compra: string | null
  folio_factura: string | null
  notas: string | null
  costo_envio: number
  descuento_tipo: string | null
  descuento_valor: number | null
  descuento_motivo: string | null
  partidas: PartidaPlan[]
  /** Suma de las partidas, antes de descuento y envio. */
  subtotal: number
  /** Lo que se va a cobrar: subtotal - descuento + envio. */
  total: number
  descuentoMonto: number
  errores: ErrorFila[]
  valido: boolean
  filas: number[]
}

export type Plan = {
  pedidos: PedidoPlan[]
  /** Problemas del archivo completo, no de un renglon. */
  erroresGlobales: string[]
  renglones: number
  validos: number
  invalidos: number
  /** Total de los pedidos que si se van a crear. */
  totalValido: number
}

// ── Normalizacion ───────────────────────────────────────────

/** Sin acentos, sin espacios de sobra, en minusculas. */
export function norm(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cantidad entera y positiva.
 *
 * Acepta "1,000" y "1 000" porque Excel los entrega asi segun el formato de
 * la celda, pero NO acepta 2.5: las presentaciones son piezas enteras.
 */
export function parseCantidad(texto: string): number | null {
  const limpio = texto.replace(/[\s,]/g, '')
  if (!limpio) return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}

/**
 * Fecha de una celda, normalizada a 'YYYY-MM-DD'.
 *
 * Excel entrega las fechas de tres formas segun el formato de la celda: ya
 * como 'YYYY-MM-DD' (lo que hace el lector con una celda de tipo fecha),
 * como 'DD/MM/YYYY' si se capturo como texto, o como un timestamp completo.
 * Se aceptan las tres y se rechaza cualquier otra cosa, en vez de dejar que
 * Postgres adivine.
 */
export function parseFecha(texto: string): string | null {
  const t = texto.trim()
  if (!t) return null

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // DD/MM/YYYY o DD-MM-YYYY. Dia primero: es el formato de Mexico.
  const latino = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (latino) {
    const d = Number(latino[1]), m = Number(latino[2]), a = Number(latino[3])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function parseMonto(texto: string): number | null {
  const limpio = texto.replace(/[\s,$]/g, '')
  if (!limpio) return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

// ── Construccion del plan ───────────────────────────────────

type FilaEntrada = { fila: number; valores: Record<string, string> }

export function construirPlan(
  filas: FilaEntrada[],
  catalogo: Catalogo,
  opciones: OpcionesImport
): Plan {
  const erroresGlobales: string[] = []

  const porNombre = new Map(catalogo.productos.map(p => [norm(p.nombre), p]))
  const porId = new Map(catalogo.productos.map(p => [p.id, p]))
  const presentacionPorTexto = new Map<string, string>()
  for (const p of PRESENTACIONES) {
    presentacionPorTexto.set(norm(p.label), p.key)
    presentacionPorTexto.set(norm(p.key), p.key)
  }
  const condicionPorTexto = new Map<string, string>()
  for (const c of CONDICIONES_PAGO) {
    condicionPorTexto.set(norm(c.label), c.key)
    condicionPorTexto.set(norm(c.key), c.key)
    condicionPorTexto.set(norm(c.key.replace('_', ' ')), c.key)
  }

  const clientePorEmail = new Map<string, ClienteCatalogo>()
  const clientePorId = new Map<string, ClienteCatalogo>()
  for (const c of catalogo.clientes) {
    if (c.email) clientePorEmail.set(norm(c.email), c)
    clientePorId.set(c.id, c)
  }

  // Nombres de producto repetidos: no se puede resolver por nombre.
  const nombresVistos = new Map<string, number>()
  for (const p of catalogo.productos) {
    const k = norm(p.nombre)
    nombresVistos.set(k, (nombresVistos.get(k) || 0) + 1)
  }
  const ambiguos = new Set([...nombresVistos.entries()].filter(([, n]) => n > 1).map(([k]) => k))

  // ── Paso 1: agrupar por referencia, en orden de aparicion ──
  const grupos = new Map<string, FilaEntrada[]>()
  const sinReferencia: ErrorFila[] = []

  for (const f of filas) {
    const ref = (f.valores.referencia || '').trim()
    if (!ref) {
      sinReferencia.push({ fila: f.fila, mensaje: 'Sin referencia: no se sabe a que pedido pertenece este renglon.' })
      continue
    }
    const lista = grupos.get(ref)
    if (lista) lista.push(f)
    else grupos.set(ref, [f])
  }

  if (grupos.size > LIMITE_PEDIDOS) {
    erroresGlobales.push(
      `El archivo trae ${grupos.size} pedidos distintos y el limite es ${LIMITE_PEDIDOS}. Pártelo en varios archivos.`
    )
  }

  // Stock de trabajo: se va descontando pedido por pedido.
  const stockTrabajo = new Map<string, Record<string, number>>()
  const disponible = (prodId: string, columna: string): number => {
    let fila = stockTrabajo.get(prodId)
    if (!fila) {
      const p = porId.get(prodId)
      fila = {}
      for (const pres of PRESENTACIONES) {
        const col = columnaStockDe(pres.key)
        if (col) fila[col] = Number(p?.[col] ?? 0) || 0
      }
      stockTrabajo.set(prodId, fila)
    }
    return fila[columna] ?? 0
  }
  const consumir = (prodId: string, columna: string, cantidad: number) => {
    const fila = stockTrabajo.get(prodId)
    if (fila) fila[columna] = (fila[columna] ?? 0) - cantidad
  }

  const pedidos: PedidoPlan[] = []

  for (const [referencia, filasDelPedido] of grupos) {
    const errores: ErrorFila[] = []
    const numerosFila = filasDelPedido.map(f => f.fila)

    // ── Cliente: uno solo por referencia ────────────────────
    const textosCliente = [...new Set(filasDelPedido.map(f => (f.valores.cliente || '').trim()).filter(Boolean))]
    let cliente: ClienteCatalogo | null = null

    if (textosCliente.length === 0) {
      errores.push({ fila: numerosFila[0], mensaje: 'Falta el cliente.' })
    } else if (textosCliente.length > 1) {
      errores.push({
        fila: null,
        mensaje: `La referencia "${referencia}" tiene ${textosCliente.length} clientes distintos (${textosCliente.join(', ')}). Un pedido es de un solo cliente; usa referencias distintas.`,
      })
    } else {
      const texto = textosCliente[0]
      cliente = (UUID.test(texto) ? clientePorId.get(texto) : clientePorEmail.get(norm(texto))) ?? null
      if (!cliente) {
        errores.push({
          fila: numerosFila[0],
          mensaje: `El cliente "${texto}" no existe o no esta en tu cartera. Usa el correo tal como aparece en la hoja Clientes.`,
        })
      }
    }

    // ── Condiciones de pago ─────────────────────────────────
    const textosCond = [...new Set(filasDelPedido.map(f => (f.valores.condiciones_pago || '').trim()).filter(Boolean))]
    let condiciones = 'contado'
    if (textosCond.length > 1) {
      errores.push({
        fila: null,
        mensaje: `La referencia "${referencia}" tiene condiciones de pago distintas (${textosCond.join(', ')}).`,
      })
    } else if (textosCond.length === 1) {
      const k = condicionPorTexto.get(norm(textosCond[0]))
      if (!k) {
        errores.push({
          fila: numerosFila[0],
          mensaje: `Condiciones de pago "${textosCond[0]}" no validas. Usa: ${CONDICIONES_PAGO.map(c => c.label).join(', ')}.`,
        })
      } else condiciones = k
    }

    const notas = filasDelPedido.map(f => (f.valores.notas || '').trim()).find(Boolean) || null
    const ordenCompra = filasDelPedido.map(f => (f.valores.orden_compra || '').trim()).find(Boolean) || null
    const folioFactura = opciones.puedeDescuento
      ? filasDelPedido.map(f => (f.valores.folio_factura || '').trim()).find(Boolean) || null
      : null

    // ── Fecha del pedido ────────────────────────────────────
    const textosFecha = [...new Set(filasDelPedido.map(f => (f.valores.fecha_pedido || '').trim()).filter(Boolean))]
    let fechaPedido = opciones.hoy
    if (textosFecha.length > 1) {
      errores.push({
        fila: null,
        mensaje: `La referencia "${referencia}" tiene fechas de pedido distintas (${textosFecha.join(', ')}).`,
      })
    } else if (textosFecha.length === 1) {
      const parseada = parseFecha(textosFecha[0])
      if (!parseada) {
        errores.push({
          fila: numerosFila[0],
          mensaje: `Fecha de pedido "${textosFecha[0]}" no valida. Usa AAAA-MM-DD o DD/MM/AAAA.`,
        })
      } else if (parseada > opciones.hoy) {
        errores.push({
          fila: numerosFila[0],
          mensaje: `La fecha del pedido no puede ser futura (${parseada}, hoy es ${opciones.hoy}).`,
        })
      } else if (opciones.esVendedor && parseada !== opciones.hoy) {
        errores.push({
          fila: numerosFila[0],
          mensaje: 'Como vendedor solo puedes capturar con la fecha de hoy. Pide a la oficina que lo capture con fecha retroactiva.',
        })
      } else {
        fechaPedido = parseada
      }
    }

    // ── Entrega programada ──────────────────────────────────
    const textosEntrega = [...new Set(filasDelPedido.map(f => (f.valores.fecha_entrega || '').trim()).filter(Boolean))]
    let fechaEntrega: string | null = null
    if (textosEntrega.length > 1) {
      errores.push({ fila: null, mensaje: `La referencia "${referencia}" tiene fechas de entrega distintas.` })
    } else if (textosEntrega.length === 1) {
      const parseada = parseFecha(textosEntrega[0])
      if (!parseada) {
        errores.push({
          fila: numerosFila[0],
          mensaje: `Fecha de entrega "${textosEntrega[0]}" no valida. Usa AAAA-MM-DD o DD/MM/AAAA.`,
        })
      } else if (parseada < fechaPedido) {
        errores.push({
          fila: numerosFila[0],
          mensaje: `La entrega (${parseada}) no puede ser antes de la fecha del pedido (${fechaPedido}).`,
        })
      } else {
        fechaEntrega = parseada
      }
    }

    // ── Envio y descuento (solo admin) ──────────────────────
    let costoEnvio = 0
    let descuentoTipo: string | null = null
    let descuentoValor: number | null = null
    let descuentoMotivo: string | null = null

    const capturoEnvioODescuento = filasDelPedido.some(f =>
      (f.valores.costo_envio || '').trim() ||
      (f.valores.descuento_tipo || '').trim() ||
      (f.valores.descuento_valor || '').trim()
    )

    if (capturoEnvioODescuento && !opciones.puedeDescuento) {
      errores.push({
        fila: null,
        mensaje: 'Capturaste costo de envio o descuento, y solo admin y super admin pueden hacerlo. Quita esas columnas o pide que lo suba un admin.',
      })
    } else if (opciones.puedeDescuento) {
      const envios = [...new Set(filasDelPedido.map(f => (f.valores.costo_envio || '').trim()).filter(Boolean))]
      if (envios.length > 1) {
        errores.push({ fila: null, mensaje: `La referencia "${referencia}" tiene costos de envio distintos (${envios.join(', ')}).` })
      } else if (envios.length === 1) {
        const n = parseMonto(envios[0])
        if (n === null) errores.push({ fila: numerosFila[0], mensaje: `Costo de envio "${envios[0]}" no valido.` })
        else costoEnvio = n
      }

      const tipos = [...new Set(filasDelPedido.map(f => norm(f.valores.descuento_tipo || '')).filter(Boolean))]
      if (tipos.length > 1) {
        errores.push({ fila: null, mensaje: `La referencia "${referencia}" tiene tipos de descuento distintos.` })
      } else if (tipos.length === 1) {
        if (!['porcentaje', 'monto'].includes(tipos[0])) {
          errores.push({ fila: numerosFila[0], mensaje: `Tipo de descuento "${tipos[0]}" no valido. Usa "porcentaje" o "monto".` })
        } else {
          descuentoTipo = tipos[0]
          const valores = [...new Set(filasDelPedido.map(f => (f.valores.descuento_valor || '').trim()).filter(Boolean))]
          const n = valores.length === 1 ? parseMonto(valores[0]) : null
          if (valores.length !== 1 || n === null || n <= 0) {
            errores.push({ fila: numerosFila[0], mensaje: 'El descuento necesita un valor mayor a 0.' })
          } else if (descuentoTipo === 'porcentaje' && n > 100) {
            errores.push({ fila: numerosFila[0], mensaje: `Un descuento porcentual no puede ser ${n}%.` })
          } else descuentoValor = n

          descuentoMotivo = filasDelPedido.map(f => (f.valores.descuento_motivo || '').trim()).find(Boolean) || null
          if (!descuentoMotivo) {
            errores.push({ fila: numerosFila[0], mensaje: 'El motivo del descuento es obligatorio.' })
          }
        }
      } else if (filasDelPedido.some(f => (f.valores.descuento_valor || '').trim())) {
        errores.push({ fila: numerosFila[0], mensaje: 'Hay un valor de descuento sin tipo de descuento.' })
      }
    }

    const sufijo = cliente ? (cliente.nivel_precio === 'taproom' || cliente.nivel_precio === 'distribuidor' ? 'taproom' : 'publico') : 'publico'

    // ── Partidas ────────────────────────────────────────────
    type Acum = { filas: number[]; producto: ProductoCatalogo; presentacion: string; cantidad: number }
    const acum = new Map<string, Acum>()

    for (const f of filasDelPedido) {
      const textoProd = (f.valores.producto || '').trim()
      const textoPres = (f.valores.presentacion || '').trim()
      const textoCant = (f.valores.cantidad || '').trim()

      // Un renglon que solo trae referencia y cliente (p.ej. donde se
      // capturo el envio) no es una partida y no se reclama.
      if (!textoProd && !textoPres && !textoCant) continue

      if (!textoProd) {
        errores.push({ fila: f.fila, mensaje: 'Falta el producto.' })
        continue
      }
      const clave = norm(textoProd)
      if (ambiguos.has(clave)) {
        errores.push({ fila: f.fila, mensaje: `Hay mas de un producto llamado "${textoProd}". Usa su id en vez del nombre.` })
        continue
      }
      const producto = porNombre.get(clave) ?? (UUID.test(textoProd) ? porId.get(textoProd) : undefined)
      if (!producto) {
        errores.push({ fila: f.fila, mensaje: `El producto "${textoProd}" no existe o no esta activo.` })
        continue
      }

      const presentacion = presentacionPorTexto.get(norm(textoPres))
      if (!presentacion) {
        errores.push({
          fila: f.fila,
          mensaje: textoPres
            ? `La presentacion "${textoPres}" no es valida. Usa una de la lista: ${PRESENTACIONES.map(p => p.label).join(', ')}.`
            : 'Falta la presentacion.',
        })
        continue
      }

      const cantidad = parseCantidad(textoCant)
      if (cantidad === null) {
        errores.push({
          fila: f.fila,
          mensaje: `Cantidad "${textoCant}" no valida: tiene que ser un numero entero mayor a 0.`,
        })
        continue
      }

      // Consolidacion: mismo producto y presentacion en el mismo pedido.
      const k = `${producto.id}|${presentacion}`
      const previo = acum.get(k)
      if (previo) {
        previo.cantidad += cantidad
        previo.filas.push(f.fila)
      } else {
        acum.set(k, { filas: [f.fila], producto, presentacion, cantidad })
      }
    }

    if (acum.size === 0 && errores.length === 0) {
      errores.push({ fila: numerosFila[0], mensaje: 'El pedido no tiene ninguna partida.' })
    }
    if (acum.size > LIMITE_PARTIDAS) {
      errores.push({
        fila: null,
        mensaje: `El pedido "${referencia}" tiene ${acum.size} partidas y el limite es ${LIMITE_PARTIDAS}.`,
      })
    }

    // ── Precio y stock por partida ──────────────────────────
    //
    // Sin cliente resuelto no se cotiza: el precio depende de su
    // `nivel_precio`, asi que calcularlo con el nivel 'publico' por default
    // mostraria un total inventado al lado del error que dice que el cliente
    // no existe. Las partidas se listan igual, con precio en cero, para que
    // quien capturo vea lo que escribio.
    const partidas: PartidaPlan[] = []
    let subtotal = 0

    for (const a of cliente ? acum.values() : []) {
      const label = PRESENTACIONES.find(p => p.key === a.presentacion)!.label
      const precio = precioUnitario(a.producto, a.presentacion, sufijo)

      if (precio <= 0) {
        errores.push({
          fila: a.filas[0],
          mensaje: `${a.producto.nombre} no tiene precio ${sufijo === 'taproom' ? 'mayorista' : 'publico'} para ${label}.`,
        })
        continue
      }

      const columna = columnaStockDe(a.presentacion)
      if (!columna) {
        errores.push({ fila: a.filas[0], mensaje: `Presentacion sin columna de stock: ${label}.` })
        continue
      }

      const hay = disponible(a.producto.id, columna)
      if (hay < a.cantidad) {
        errores.push({
          fila: a.filas[0],
          mensaje: `Stock insuficiente de ${label} para ${a.producto.nombre}: pides ${a.cantidad} y quedan ${Math.max(0, hay)}${hay < Number(a.producto[columna] ?? 0) ? ' (ya contando los pedidos anteriores de este archivo)' : ''}.`,
        })
        continue
      }

      const sub = precio * a.cantidad
      subtotal += sub
      partidas.push({
        filas: a.filas,
        producto_id: a.producto.id,
        producto: a.producto.nombre,
        presentacion: a.presentacion,
        presentacionLabel: label,
        cantidad: a.cantidad,
        precioUnitario: precio,
        subtotal: sub,
      })
    }

    if (!cliente) {
      for (const a of acum.values()) {
        partidas.push({
          filas: a.filas,
          producto_id: a.producto.id,
          producto: a.producto.nombre,
          presentacion: a.presentacion,
          presentacionLabel: PRESENTACIONES.find(p => p.key === a.presentacion)!.label,
          cantidad: a.cantidad,
          precioUnitario: 0,
          subtotal: 0,
        })
      }
    }

    // ── Descuento sobre el subtotal ─────────────────────────
    let descuentoMonto = 0
    if (descuentoTipo && descuentoValor) {
      descuentoMonto = descuentoTipo === 'porcentaje'
        ? Math.round(subtotal * descuentoValor) / 100
        : descuentoValor
      if (descuentoMonto > subtotal) {
        errores.push({ fila: numerosFila[0], mensaje: 'El descuento no puede ser mayor al subtotal.' })
      }
    }

    const valido = errores.length === 0 && partidas.length > 0 && !!cliente

    // El stock solo se consume si el pedido se va a crear: un pedido
    // invalido no se crea, asi que no debe quitarle inventario a los que
    // vienen despues en el archivo.
    if (valido) {
      for (const p of partidas) {
        const col = columnaStockDe(p.presentacion)
        if (col) consumir(p.producto_id, col, p.cantidad)
      }
    }

    pedidos.push({
      referencia,
      cliente_id: cliente?.id ?? null,
      clienteNombre: cliente?.nombre ?? (textosCliente[0] || '—'),
      nivelPrecio: cliente?.nivel_precio ?? null,
      condiciones_pago: condiciones,
      fecha_pedido: fechaPedido,
      fecha_entrega: fechaEntrega,
      orden_compra: ordenCompra,
      folio_factura: folioFactura,
      notas,
      costo_envio: costoEnvio,
      descuento_tipo: descuentoTipo,
      descuento_valor: descuentoValor,
      descuento_motivo: descuentoMotivo,
      partidas,
      subtotal,
      descuentoMonto,
      total: Math.max(0, subtotal - descuentoMonto) + costoEnvio,
      errores,
      valido,
      filas: numerosFila,
    })
  }

  // Los renglones sin referencia se reportan como un pedido fantasma al
  // final, para que no desaparezcan del reporte.
  if (sinReferencia.length) {
    pedidos.push({
      referencia: '(sin referencia)',
      cliente_id: null, clienteNombre: '—', nivelPrecio: null,
      condiciones_pago: 'contado', fecha_pedido: opciones.hoy, fecha_entrega: null,
      orden_compra: null, folio_factura: null, notas: null, costo_envio: 0,
      descuento_tipo: null, descuento_valor: null, descuento_motivo: null,
      partidas: [], subtotal: 0, descuentoMonto: 0, total: 0,
      errores: sinReferencia, valido: false,
      filas: sinReferencia.map(e => e.fila!).filter(Boolean),
    })
  }

  const validos = pedidos.filter(p => p.valido)

  return {
    pedidos,
    erroresGlobales,
    renglones: filas.length,
    validos: validos.length,
    invalidos: pedidos.length - validos.length,
    totalValido: validos.reduce((s, p) => s + p.total, 0),
  }
}

/** Los items en el formato que espera `crearPedido`. */
export function itemsParaCrear(pedido: PedidoPlan) {
  return pedido.partidas.map(p => ({
    producto_id: `${p.producto_id}-${p.presentacion}`,
    cantidad: p.cantidad,
  }))
}

/**
 * Comision de vendedores por tramos marginales sobre lo COBRADO.
 *
 * Toda la aritmetica de comisiones vive aqui y en ningun otro lado. El admin
 * y el Inicio del vendedor leen las mismas filas (src/lib/comisiones-datos.ts)
 * y llaman a `calcularComision`.
 *
 * ── Las cuatro reglas ──────────────────────────────────────
 *
 * 1. MARGINALES, como el ISR: cada tramo paga su % solo sobre la porcion de
 *    la base que cae dentro de el. Base de 60k con tramos 0-50k al 5% y
 *    50k-100k al 8% paga 50k*5% + 10k*8% = 3,300, no 60k*8% = 4,800.
 *
 * 2. La base es lo COBRADO, no lo vendido, y es NETA: sin envio, sin
 *    descuento y sin impuestos. Un pago parcial entra prorrateado:
 *
 *      base = monto * (total - descuento_monto) / total_con_envio
 *                   / (1 + iva) / (1 + ieps)
 *
 *    El factor saca el envio (que no es venta y no comisiona) y el descuento
 *    ya viene restado del numerador. `descuento_monto` y `total_con_envio` se
 *    toman tal como los da la vista `pedidos_saldo`: reimplementar aqui el
 *    `round(total * pct / 100, 2)` del descuento porcentual da diferencias de
 *    centavos contra lo que la DB considera cobrado (ver docs/SCHEMA_NOTES.md).
 *
 * 3. Periodo mensual por FECHA DE PAGO. `pagos.fecha_pago` es `date` en
 *    produccion, asi que el mes se saca del string ('2026-08-07' -> '2026-08')
 *    y la fecha NUNCA pasa por `new Date()`: en un navegador en Mexico
 *    `new Date('2026-08-01')` es el 31 de julio a las 18:00 locales y el pago
 *    se iria al mes anterior.
 *
 * 4. No cuentan: los pagos cancelados, los pagos de pedidos cancelados (la
 *    vista `pedidos_saldo` ya los excluye, asi que su pago se queda sin
 *    pedido y se descarta) ni la parte sobrepagada de un pedido.
 *
 * ── Los precios traen los impuestos adentro ────────────────
 *
 * Ninguna tabla desglosa impuestos: `calcular-pedido.ts` arma
 * total = SUM(cantidad * precio_unitario), el documento imprime
 * Subtotal/Descuento/Envio/TOTAL sin renglon de impuestos, y
 * `requiere_factura` no cambia el monto. Lo unico explicito del repo es el
 * catalogo de WhatsApp: "Precios mayorista, IVA incluido". Decision del
 * negocio: los precios traen IVA (16%) e IEPS de cerveza (26.5%), y la base
 * de comision es neta de los dos. Las tasas viven en `app_config.impuestos`
 * y se copian dentro de cada corte para que un mes cerrado no cambie si
 * despues se ajustan.
 */

/** Fallback si no se puede leer `app_config.impuestos`. Mismos valores que siembra la migracion. */
export const IVA_TASA_DEFAULT = 0.16
/** IEPS de cerveza hasta 14 grados GL. */
export const IEPS_TASA_DEFAULT = 0.265

/** Un tramo de la escalera. `hasta` null = abierto (solo el ultimo). */
export type Tramo = {
  desde: number
  hasta: number | null
  porcentaje: number
}

/** Fila de `comision_tramos`. vendedor_id null = esquema global. */
export type TramoFila = Tramo & { vendedor_id: string | null }

/**
 * Un pago con su pedido ya resuelto.
 *
 * `fecha_pago` llega como string y se queda como string. Ver regla 3.
 */
export type PagoParaComision = {
  pago_id: string
  pedido_id: string
  monto: number | null
  fecha_pago: string
  cancelado_at: string | null
}

/**
 * Los montos del pedido que recibio el pago.
 *
 * `total`, `descuento_monto` y `total_con_envio` salen de `pedidos_saldo`;
 * `vendedor_id` de `pedidos`, que la vista no expone. Los pedidos cancelados
 * no estan en la vista y por lo tanto tampoco aqui.
 */
export type PedidoParaComision = {
  id: string
  vendedor_id: string | null
  descuento_monto: number | null
  total: number | null
  total_con_envio: number | null
}

export type EntradaComision = {
  /**
   * TODOS los pagos de los pedidos del vendedor, de cualquier mes — no solo
   * los del periodo. El tope de sobrepago es por pedido y acumulado en el
   * tiempo, asi que filtrar por mes antes de topar daria comision sobre
   * dinero sobrepagado. El filtro del periodo se aplica aqui adentro.
   */
  pagos: PagoParaComision[]
  pedidos: PedidoParaComision[]
  /** Escalera ya resuelta para este vendedor (ver `resolverTramos`). */
  tramos: Tramo[]
  /** Mes a calcular, 'YYYY-MM'. */
  periodo: string
  ivaTasa?: number
  iepsTasa?: number
}

export type RenglonPedido = {
  pedido_id: string
  /** Cobrado en el periodo, ya topado al saldo del pedido. Bruto. */
  cobrado: number
  /** Ese cobrado neto de envio, descuento e impuestos. */
  base: number
}

export type RenglonTramo = Tramo & {
  /** Parte de la base que cayo en este tramo. */
  porcion: number
  comision: number
}

export type ResultadoComision = {
  /** Base acumulada del mes, neta. Sobre esta corre la escalera. */
  base: number
  /** Suma de los renglones de `porTramo`. */
  comision: number
  /** Lo cobrado bruto del mes que entro al calculo. Para cuadrar contra cobranza. */
  cobrado: number
  detalle: RenglonPedido[]
  /** La escalera completa, incluidos los tramos no alcanzados (porcion 0). */
  porTramo: RenglonTramo[]
  /**
   * El tramo donde cae el SIGUIENTE peso, con intervalo semiabierto
   * [desde, hasta). Con la base justo en un limite, el siguiente peso ya paga
   * la tasa del tramo de arriba — que es lo que debe mostrar la barra de
   * avance, y no coincide con el ultimo tramo con porcion > 0 de `porTramo`.
   * null si la base ya rebaso un ultimo tramo cerrado.
   */
  tramoActual: Tramo | null
  siguienteTramo: Tramo | null
  /** Cuanto falta de base para entrar al siguiente tramo. null si no hay. */
  faltaParaSiguiente: number | null
  /** % que paga el siguiente peso cobrado. */
  tasaMarginal: number | null
  /** No hay escalera: la comision es 0 porque no hay con que calcularla. */
  sinEsquema: boolean
  /** La base rebaso el ultimo tramo y ese tramo es cerrado: lo de arriba no comisiona. */
  topado: boolean
  ivaTasa: number
  iepsTasa: number
}

// ── Aritmetica en centavos enteros ──────────────────────────
//
// Todo el dinero se calcula en centavos y con BigInt, no en pesos con float.
// La razon no es el error acumulado (es minusculo) sino el DETERMINISMO en el
// medio centavo exacto: con float, 3629.55 * 0.10 da 362.95499999999998, asi
// que `Math.round(x * 100) / 100` entrega 362.95 cuando la regla dice 362.96.
// Que un reparto de comision dependa de la representacion binaria del
// resultado intermedio no es aceptable en dinero.
//
// Con enteros la regla queda explicita: medio centavo redondea HACIA ARRIBA
// en valor absoluto, siempre.

/** Las tasas vienen con 4 decimales (numeric(6,4)); 1e6 da holgura. */
const ESCALA_TASA = 1_000_000n
/** Los porcentajes vienen con 3 decimales (numeric(6,3)). */
const ESCALA_PCT = 1_000n

/**
 * Division entera con redondeo de medio hacia arriba (en valor absoluto).
 * Es la unica regla de redondeo del archivo.
 */
function divRedondeada(num: bigint, den: bigint): bigint {
  if (den === 0n) return 0n
  if (den < 0n) { num = -num; den = -den }
  return num >= 0n
    ? (2n * num + den) / (2n * den)
    : -((2n * -num + den) / (2n * den))
}

/**
 * Pesos -> centavos. El `Math.round` aqui es seguro: los montos de la DB
 * traen 2 decimales (numeric(12,2)), asi que el error del float es de
 * ordenes de magnitud menos que el medio centavo que decide el redondeo.
 */
const aCentavos = (n: number | null | undefined) => BigInt(Math.round((n || 0) * 100))

/** Centavos -> pesos, para la frontera publica de la funcion. */
const aPesos = (c: bigint) => Number(c) / 100

const escalar = (n: number, escala: bigint) => BigInt(Math.round(n * Number(escala)))

/** Mes de una fecha de la DB, sin pasar por Date. Ver regla 3. */
export const periodoDe = (fecha: string) => fecha.slice(0, 7)

/** Mes de un Date, en hora local. */
export function periodoDeFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' -> 'YYYY-MM-01', que es como `comision_cortes.periodo` lo guarda. */
export const primerDiaDelPeriodo = (periodo: string) => `${periodo}-01`

/** Etiqueta legible de un periodo. */
export function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  // El dia 1 a mediodia: construido con numeros locales no hay corrimiento.
  return new Date(anio, mes - 1, 1, 12).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

/** El mes anterior al dado. */
export function periodoPrevio(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  return periodoDeFecha(new Date(anio, mes - 2, 1, 12))
}

/**
 * La escalera que le aplica a un vendedor: la propia si tiene aunque sea un
 * tramo, si no la global.
 *
 * Todo o nada, nunca mezcla. Mezclar haria que agregarle a un vendedor un
 * tramo alto le heredara en silencio los bajos del esquema global, y la
 * escalera resultante podria no ser ni contigua.
 */
export function resolverTramos(tramos: TramoFila[], vendedorId: string | null): Tramo[] {
  const propios = tramos.filter(t => t.vendedor_id === vendedorId)
  const fuente = propios.length > 0 ? propios : tramos.filter(t => t.vendedor_id === null)
  return fuente
    .map(({ desde, hasta, porcentaje }) => ({ desde, hasta, porcentaje }))
    .sort((a, b) => a.desde - b.desde)
}

/** true si la escalera del vendedor es la global y no una propia. */
export function usaEsquemaGlobal(tramos: TramoFila[], vendedorId: string | null): boolean {
  return !tramos.some(t => t.vendedor_id === vendedorId)
}

/**
 * Comision de un vendedor en un mes.
 *
 * Los pagos y pedidos que recibe ya vienen acotados a un solo vendedor (los
 * agrupa `comisionesPorVendedor`). Con RLS, para el propio vendedor eso ya lo
 * garantiza la DB.
 */
export function calcularComision(entrada: EntradaComision): ResultadoComision {
  const { pagos, pedidos, tramos, periodo } = entrada
  const ivaTasa = entrada.ivaTasa ?? IVA_TASA_DEFAULT
  const iepsTasa = entrada.iepsTasa ?? IEPS_TASA_DEFAULT

  const porId = new Map(pedidos.map(p => [p.id, p]))

  // (1 + tasa) como fraccion exacta, para dividir sin pasar por float.
  const divisorImpuestos =
    (ESCALA_TASA + escalar(ivaTasa, ESCALA_TASA)) * (ESCALA_TASA + escalar(iepsTasa, ESCALA_TASA))
  const escalaImpuestos = ESCALA_TASA * ESCALA_TASA

  // Orden cronologico estable: el tope de sobrepago se consume en el orden en
  // que se cobro, asi que el excedente cae en el pago mas reciente y no en el
  // que resulte primero en el arreglo. El id desempata dos pagos del mismo dia.
  const vivos = pagos
    .filter(pa => !pa.cancelado_at && porId.has(pa.pedido_id) && (pa.monto || 0) > 0)
    .sort((a, b) =>
      a.fecha_pago === b.fecha_pago
        ? a.pago_id.localeCompare(b.pago_id)
        : a.fecha_pago.localeCompare(b.fecha_pago)
    )

  /** Saldo en centavos que a cada pedido le queda por comisionar. */
  const restante = new Map<string, bigint>()
  /** Cobrado del periodo por pedido, en centavos. Suma exacta, sin redondeos intermedios. */
  const cobradoPorPedido = new Map<string, bigint>()
  let cobradoDelPeriodo = 0n

  for (const pago of vivos) {
    const pedido = porId.get(pago.pedido_id)!

    const conEnvio = aCentavos(pedido.total_con_envio)
    if (!restante.has(pedido.id)) restante.set(pedido.id, conEnvio)

    const disponible = restante.get(pedido.id)!
    // Lo que exceda el total del pedido es un sobrepago: no es venta y no
    // comisiona. Se descuenta del disponible aunque el pago sea de otro mes,
    // porque el tope es del pedido, no del periodo.
    const monto = aCentavos(pago.monto)
    const computable = monto < disponible ? monto : disponible
    const neto = computable > 0n ? computable : 0n
    restante.set(pedido.id, disponible - neto)

    if (periodoDe(pago.fecha_pago) !== periodo) continue
    if (neto <= 0n) continue

    cobradoDelPeriodo += neto
    cobradoPorPedido.set(pedido.id, (cobradoPorPedido.get(pedido.id) ?? 0n) + neto)
  }

  // La base se redondea UNA vez por pedido, sobre el cobrado del mes ya
  // acumulado: varios pagos del mismo pedido comparten el mismo factor, asi
  // que sumarlos antes de dividir es exacto y ademas evita que el redondeo
  // dependa de en cuantos pagos llego el dinero.
  const detalle: RenglonPedido[] = []
  let baseCentavos = 0n

  for (const [pedidoId, cobrado] of cobradoPorPedido) {
    const pedido = porId.get(pedidoId)!
    const conEnvio = aCentavos(pedido.total_con_envio)
    // Fuera el envio. El descuento ya viene restado del numerador, y los dos
    // montos salen de pedidos_saldo para no reimplementar su redondeo.
    const mercancia = aCentavos(pedido.total) - aCentavos(pedido.descuento_monto)

    const base = conEnvio > 0n
      ? divRedondeada(cobrado * mercancia * escalaImpuestos, conEnvio * divisorImpuestos)
      : 0n

    baseCentavos += base
    detalle.push({ pedido_id: pedidoId, cobrado: aPesos(cobrado), base: aPesos(base) })
  }

  detalle.sort((a, b) => b.base - a.base)

  const escalera = [...tramos].sort((a, b) => a.desde - b.desde)
  const sinEsquema = escalera.length === 0

  // Cada renglon se redondea y la comision es la suma de los renglones, para
  // que el desglose siempre cuadre con el total que se muestra.
  let comisionCentavos = 0n
  const porTramo: RenglonTramo[] = escalera.map(t => {
    const desde = aCentavos(t.desde)
    const techo = t.hasta === null ? baseCentavos : aCentavos(t.hasta)
    const dentro = (techo < baseCentavos ? techo : baseCentavos) - desde
    const porcion = dentro > 0n ? dentro : 0n
    const comision = divRedondeada(porcion * escalar(t.porcentaje, ESCALA_PCT), 100n * ESCALA_PCT)
    comisionCentavos += comision
    return { ...t, porcion: aPesos(porcion), comision: aPesos(comision) }
  })

  // Donde cae el siguiente peso, con [desde, hasta). Ver el comentario de
  // `tramoActual` en el tipo: a proposito no es el ultimo tramo con porcion.
  const indiceActual = escalera.findIndex(
    t => baseCentavos >= aCentavos(t.desde) && (t.hasta === null || baseCentavos < aCentavos(t.hasta))
  )
  const tramoActual = indiceActual >= 0 ? escalera[indiceActual] : null
  const siguienteTramo = indiceActual >= 0 ? escalera[indiceActual + 1] ?? null : null

  const ultimo = escalera[escalera.length - 1]
  const topado = !sinEsquema && ultimo.hasta !== null && baseCentavos >= aCentavos(ultimo.hasta)

  return {
    base: aPesos(baseCentavos),
    comision: aPesos(comisionCentavos),
    cobrado: aPesos(cobradoDelPeriodo),
    detalle,
    porTramo,
    tramoActual,
    siguienteTramo,
    faltaParaSiguiente:
      tramoActual && tramoActual.hasta !== null
        ? aPesos(aCentavos(tramoActual.hasta) - baseCentavos)
        : null,
    tasaMarginal: tramoActual ? tramoActual.porcentaje : null,
    sinEsquema,
    topado,
    ivaTasa,
    iepsTasa,
  }
}

export type ComisionDeVendedor = ResultadoComision & {
  vendedor_id: string
  /** La escalera usada es la global y no una propia. */
  global: boolean
}

/**
 * La comision del periodo de cada vendedor que reciba.
 *
 * No hace aritmetica propia: parte los pagos por vendedor y delega en
 * `calcularComision`. Los pedidos sin vendedor_id no comisionan a nadie.
 */
export function comisionesPorVendedor(opciones: {
  vendedorIds: string[]
  pagos: PagoParaComision[]
  pedidos: PedidoParaComision[]
  tramos: TramoFila[]
  periodo: string
  ivaTasa?: number
  iepsTasa?: number
}): ComisionDeVendedor[] {
  const { vendedorIds, pagos, pedidos, tramos, periodo, ivaTasa, iepsTasa } = opciones

  return vendedorIds.map(vendedor_id => {
    const suyos = pedidos.filter(p => p.vendedor_id === vendedor_id)
    const ids = new Set(suyos.map(p => p.id))
    return {
      vendedor_id,
      global: usaEsquemaGlobal(tramos, vendedor_id),
      ...calcularComision({
        pagos: pagos.filter(pa => ids.has(pa.pedido_id)),
        pedidos: suyos,
        tramos: resolverTramos(tramos, vendedor_id),
        periodo,
        ivaTasa,
        iepsTasa,
      }),
    }
  })
}

// ── Validacion de la escalera ───────────────────────────────

/**
 * Los mismos invariantes que impone el constraint trigger
 * `trg_validar_comision_tramos`, para poder avisar en el formulario antes de
 * mandar. La DB sigue siendo la autoridad: esto es UX, no seguridad.
 *
 * Devuelve la lista de problemas; vacia = valida. Una escalera vacia es
 * valida y significa "sin esquema".
 */
export function validarTramos(tramos: Tramo[]): string[] {
  const errores: string[] = []
  if (tramos.length === 0) return errores

  const orden = [...tramos].sort((a, b) => a.desde - b.desde)

  for (const t of orden) {
    if (!Number.isFinite(t.desde) || t.desde < 0) errores.push('Hay un tramo con inicio invalido o negativo.')
    if (t.hasta !== null && !Number.isFinite(t.hasta)) errores.push('Hay un tramo con fin invalido.')
    if (t.hasta !== null && t.hasta <= t.desde) errores.push(`El tramo que empieza en ${t.desde} cierra en ${t.hasta}, que no es mayor.`)
    if (!Number.isFinite(t.porcentaje) || t.porcentaje < 0 || t.porcentaje > 100) errores.push('Hay un porcentaje fuera de 0 a 100.')
  }

  if (orden[0].desde !== 0) errores.push(`El primer tramo debe empezar en 0, empieza en ${orden[0].desde}.`)

  for (let i = 1; i < orden.length; i++) {
    const previo = orden[i - 1]
    if (previo.hasta === null) {
      errores.push('Solo el ultimo tramo puede quedar abierto.')
      break
    }
    if (previo.hasta !== orden[i].desde) {
      errores.push(
        previo.hasta < orden[i].desde
          ? `Queda un hueco entre ${previo.hasta} y ${orden[i].desde}.`
          : `Se traslapan los tramos en ${orden[i].desde}.`
      )
    }
  }

  if (orden.some((t, i) => i > 0 && t.desde === orden[i - 1].desde)) {
    errores.push('Hay dos tramos que empiezan en el mismo monto.')
  }

  return [...new Set(errores)]
}

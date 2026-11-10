/**
 * Catalogos y helpers de cliente.
 *
 * Un solo lugar para los valores que el portal y el admin tienen que leer
 * igual: si divergen, un cliente ve un precio y el pedido se arma con otro.
 *
 * Los catalogos SAT (regimenes y usos de CFDI) vivian duplicados en
 * `src/components/ClienteForm.tsx` con descripciones cortas y en
 * `app/portal/(auth)/cuenta/page.tsx` con las largas. Aqui estan una vez, con
 * las largas.
 */

export const TIPOS_CLIENTE = [
  { value: 'ocasional',    label: 'Consumidor ocasional', desc: 'Compra para casa o reuniones',       iconPath: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { value: 'tiene_tap',    label: 'Tap Room',             desc: 'Cuenta con líneas de barril',        iconPath: 'M17 11h1a3 3 0 010 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L18 8z' },
  { value: 'tiene_bar',    label: 'Bar o cantina',        desc: 'Carta de cervezas',                  iconPath: 'M17 11h1a3 3 0 010 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L18 8z' },
  { value: 'restaurante',  label: 'Restaurante',          desc: 'Cocina con carta de bebidas',        iconPath: 'M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3' },
  { value: 'distribuidor', label: 'Distribuidor',         desc: 'Revende a terceros',                 iconPath: 'M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM7 21h10M12 3v18' },
  { value: 'hotel',        label: 'Hotel',                desc: 'Hospedaje con servicio de bebidas',  iconPath: 'M3 21h18M3 7v14M21 7v14M6 7V4a1 1 0 011-1h10a1 1 0 011 1v3M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01' },
  { value: 'tienda',       label: 'Tienda o abarrotes',   desc: 'Venta al menudeo',                   iconPath: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0' },
  { value: 'eventos',      label: 'Eventos o catering',   desc: 'Servicio para eventos',              iconPath: 'M8 21h8M12 17v4M17 5H7l-2 8h14l-2-8zM7 5V3h10v2' },
] as const

/**
 * El giro del negocio: a que se dedica el cliente.
 *
 * Distinto de `TIPOS_CLIENTE` / `tipo_consumidor`, que es lo que el cliente
 * declaro de si mismo en el onboarding del portal con su propia UX de ocho
 * tarjetas. `giro` es la taxonomia del admin, mas fina, y es la que manda
 * ahi. Los dos campos coexisten a proposito (ver la migracion
 * 20261109000000_cliente_negocio.sql).
 */
export const GIROS = [
  { value: 'bar',              label: 'Bar o cantina' },
  { value: 'restaurante',      label: 'Restaurante' },
  { value: 'taproom',          label: 'Taproom' },
  { value: 'cafeteria',        label: 'Cafetería' },
  { value: 'hotel',            label: 'Hotel' },
  { value: 'vinateria',        label: 'Vinatería' },
  { value: 'abarrotes',        label: 'Abarrotes' },
  { value: 'autoservicio',     label: 'Autoservicio' },
  { value: 'club',             label: 'Club o antro' },
  { value: 'eventos',          label: 'Eventos o catering' },
  { value: 'corporativo',      label: 'Corporativo' },
  { value: 'distribuidor',     label: 'Distribuidor' },
  { value: 'tienda_linea',     label: 'Tienda en línea' },
  { value: 'consumidor_final', label: 'Consumidor final' },
  { value: 'otro',             label: 'Otro' },
] as const

export type Giro = (typeof GIROS)[number]['value']

export const GIROS_VALIDOS: readonly string[] = GIROS.map(g => g.value)

export function giroLabel(value?: string | null): string {
  return GIROS.find(g => g.value === value)?.label || value || '—'
}

export const NIVELES_PRECIO = [
  { value: 'publico',      label: 'Público',      desc: 'Precio de lista' },
  { value: 'taproom',      label: 'Mayorista',    desc: 'Precio para negocios' },
  { value: 'distribuidor', label: 'Distribuidor', desc: 'Precio de volumen' },
] as const

/**
 * El nivel de precio que sugiere cada giro.
 *
 * Es una SUGERENCIA: se precarga al elegir el giro y queda editable. Un bar
 * chico puede terminar en precio publico y un corporativo grande en
 * distribuidor; esto solo evita teclear lo de siempre.
 */
const NIVEL_POR_GIRO: Record<Giro, NivelPrecio> = {
  bar: 'taproom',
  restaurante: 'taproom',
  taproom: 'taproom',
  cafeteria: 'taproom',
  hotel: 'taproom',
  vinateria: 'taproom',
  abarrotes: 'taproom',
  club: 'taproom',
  eventos: 'taproom',
  corporativo: 'taproom',
  tienda_linea: 'taproom',
  // Volumen: compran para revender.
  autoservicio: 'distribuidor',
  distribuidor: 'distribuidor',
  // Precio de lista: le compran como le compraria cualquiera.
  consumidor_final: 'publico',
  otro: 'publico',
}

export function nivelSugeridoPorGiro(giro?: string | null): NivelPrecio | null {
  if (!giro) return null
  return NIVEL_POR_GIRO[giro as Giro] ?? null
}

export type TipoCliente = (typeof TIPOS_CLIENTE)[number]['value']
export type NivelPrecio = (typeof NIVELES_PRECIO)[number]['value']

export function tipoLabel(value?: string | null): string {
  return TIPOS_CLIENTE.find(t => t.value === value)?.label || value || '—'
}

export function nivelLabel(value?: string | null): string {
  return NIVELES_PRECIO.find(n => n.value === value)?.label || value || '—'
}

export function tipoIcon(value?: string | null): string {
  return TIPOS_CLIENTE.find(t => t.value === value)?.iconPath || 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8'
}

/** Maps nivel_precio to the column suffix for product prices */
export function precioSufijo(nivel?: string | null): 'publico' | 'taproom' {
  if (nivel === 'taproom' || nivel === 'distribuidor') return 'taproom'
  return 'publico'
}

// ── Catalogos SAT ───────────────────────────────────────────
//
// Estaban duplicados en `src/components/ClienteForm.tsx` (descripciones
// cortas) y en `app/portal/(auth)/cuenta/page.tsx` (largas). Aqui una vez.

export const REGIMENES_FISICA = [
  { codigo: '605', desc: 'Sueldos y salarios e ingresos asimilados a salarios' },
  { codigo: '606', desc: 'Arrendamiento' },
  { codigo: '612', desc: 'Personas físicas con actividades empresariales y profesionales' },
  { codigo: '621', desc: 'Incorporación fiscal' },
  { codigo: '626', desc: 'Régimen simplificado de confianza' },
] as const

export const REGIMENES_MORAL = [
  { codigo: '601', desc: 'General de ley personas morales' },
  { codigo: '603', desc: 'Personas morales con fines no lucrativos' },
  { codigo: '626', desc: 'Régimen simplificado de confianza' },
] as const

export const USOS_CFDI = [
  { codigo: 'G01', desc: 'Adquisición de mercancías' },
  { codigo: 'G03', desc: 'Gastos en general' },
  { codigo: 'P01', desc: 'Por definir' },
] as const

export type TipoPersona = 'fisica' | 'moral'

/** Los regimenes que aplican segun el tipo de persona. */
export const regimenesDe = (tipo: TipoPersona | null) =>
  tipo === 'moral' ? REGIMENES_MORAL : REGIMENES_FISICA

export const regimenLabel = (codigo?: string | null): string => {
  const r = [...REGIMENES_FISICA, ...REGIMENES_MORAL].find(x => x.codigo === codigo)
  return r ? `${r.codigo} · ${r.desc}` : codigo || '—'
}

export const usoCfdiLabel = (codigo?: string | null): string => {
  const u = USOS_CFDI.find(x => x.codigo === codigo)
  return u ? `${u.codigo} · ${u.desc}` : codigo || '—'
}

// ── RFC ─────────────────────────────────────────────────────

/**
 * El tipo de persona que implica el RFC, por su largo.
 *
 * Una moral trae 3 letras de razon social + 6 de fecha + 3 de homoclave = 12.
 * Una fisica trae 4 letras (dos del apellido paterno, una del materno, una
 * del nombre) y por eso son 13. No hay que preguntarlo: el RFC ya lo dice.
 */
export function tipoPersonaDeRFC(rfc?: string | null): TipoPersona | null {
  const limpio = (rfc || '').trim().toUpperCase()
  if (limpio.length === 12) return 'moral'
  if (limpio.length === 13) return 'fisica'
  return null
}

/**
 * Valida el RFC por FORMA, no solo por largo.
 *
 * El formulario viejo solo contaba caracteres, asi que 'AAAAAAAAAAAA' pasaba.
 * Se piden las letras iniciales, los seis digitos de la fecha y la homoclave.
 * La Ñ y el & son validos en la raiz de una razon social.
 */
export function rfcValido(rfc?: string | null): boolean {
  const limpio = (rfc || '').trim().toUpperCase()
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(limpio)) return false
  // Que el largo de la raiz concuerde con el total: 3+9=12, 4+9=13.
  return limpio.length === 12 || limpio.length === 13
}

/** El RFC como se guarda: sin espacios, sin guiones, en mayusculas. */
export const normalizarRFC = (rfc?: string | null): string =>
  (rfc || '').toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13)

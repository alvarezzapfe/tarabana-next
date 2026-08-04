/**
 * Centralized client type and price level definitions.
 * Used across portal (onboarding, cuenta, catalogo) and admin (clientes).
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

export const NIVELES_PRECIO = [
  { value: 'publico',      label: 'Público',      desc: 'Precio de lista' },
  { value: 'taproom',      label: 'Mayorista',    desc: 'Precio para negocios' },
  { value: 'distribuidor', label: 'Distribuidor', desc: 'Precio de volumen' },
] as const

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

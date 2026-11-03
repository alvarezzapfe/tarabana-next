/**
 * Contraste WCAG 2.1 entre dos colores hex.
 *
 * Lo usa la validacion de `color_primary` en /api/admin/config: el acento se
 * pinta sobre el chrome oscuro del admin, asi que un color demasiado apagado
 * lo vuelve ilegible. El umbral es 3:1, que es lo que WCAG 2.1 pide para
 * componentes de interfaz y texto grande (1.4.11 / 1.4.3).
 */

/** Fondo del chrome del admin. Contra esto se valida el acento. */
export const ADMIN_CHROME_BG = '#0B0D10'

/** Minimo WCAG 2.1 para componentes de UI y texto grande. */
export const CONTRASTE_MINIMO = 3

export function esHex6(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
}

function canalLineal(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Luminancia relativa (WCAG). */
export function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = canalLineal((n >> 16) & 0xff)
  const g = canalLineal((n >> 8) & 0xff)
  const b = canalLineal(n & 0xff)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razon de contraste entre dos hex. Va de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const oscuro = Math.min(la, lb)
  return (claro + 0.05) / (oscuro + 0.05)
}

/** true si `color` se lee sobre el chrome oscuro del admin. */
export function contrastaConChrome(color: string): boolean {
  return contraste(color, ADMIN_CHROME_BG) >= CONTRASTE_MINIMO
}

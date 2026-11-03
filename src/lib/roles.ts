/**
 * Centralized role definitions — must mirror the SQL functions
 * public.is_staff(), public.is_admin(), public.is_super_admin()
 * in supabase/migrations/.
 */

/** is_staff() — can read admin panel (SELECT policies) */
export const STAFF_ROLES = ['super_admin', 'admin', 'ventas', 'produccion', 'contabilidad'] as const

/** is_admin() — can write (INSERT/UPDATE/DELETE policies). Contabilidad excluded. */
export const WRITE_ROLES = ['super_admin', 'admin', 'ventas', 'produccion'] as const

export const SUPER_ADMIN = 'super_admin' as const

/**
 * Vendedor de campo. A proposito NO esta en STAFF_ROLES ni en WRITE_ROLES:
 * esas listas espejean is_staff() e is_admin() en SQL, que significan "lee
 * todo" y "escribe todo". El vendedor solo ve sus pedidos y sus clientes, asi
 * que lleva su propio predicado y sus propias policies (ver
 * supabase/migrations/20261103100000_rol_vendedor.sql).
 */
export const VENDEDOR = 'vendedor' as const

/** Roles that can be assigned via invitation */
export const ASSIGNABLE_ROLES = ['admin', 'produccion', 'ventas', 'contabilidad', 'vendedor'] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaff(role?: string | null): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role)
}

export function canWrite(role?: string | null): boolean {
  return !!role && (WRITE_ROLES as readonly string[]).includes(role)
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === SUPER_ADMIN
}

export function isVendedor(role?: string | null): boolean {
  return role === VENDEDOR
}

/**
 * Puede entrar al panel admin. Dos caminos distintos: el staff entra con
 * visibilidad global, el vendedor entra acotado por RLS a lo suyo.
 */
export function canEnterPanel(role?: string | null): boolean {
  return isStaff(role) || isVendedor(role)
}

/**
 * Helper para declarar visibilidad con una lista explicita de roles, cuando
 * ningun predicado existente describe el recorte. Se usa en admin-nav para
 * las secciones que no le tocan a ventas.
 */
export function enRoles(...roles: string[]) {
  return (role?: string | null): boolean => !!role && roles.includes(role)
}

// ── Feature-specific subsets (more restrictive than is_admin() in SQL) ──
// These exist because the UI promises narrower access per role description:
//   admin = "Todo excepto usuarios"
//   produccion = "Inventario y stock"
//   ventas = "Pedidos y pagos"
// Ventas y produccion no gestionan contenido de marca (medallero, taproom,
// vendedores, comisiones, puntos de venta) ni catálogos comerciales.

/** Admin-only management — super_admin + admin. More restrictive than is_admin()
 *  in SQL on purpose: ventas/produccion don't manage brand content. */
export const ADMIN_ONLY_ROLES = ['super_admin', 'admin'] as const
export function canManageAsAdmin(role?: string | null): boolean {
  return !!role && (ADMIN_ONLY_ROLES as readonly string[]).includes(role)
}

/** Inventory management — admin + produccion, not ventas */
export const INVENTORY_ROLES = ['super_admin', 'admin', 'produccion'] as const
export function canManageInventory(role?: string | null): boolean {
  return !!role && (INVENTORY_ROLES as readonly string[]).includes(role)
}

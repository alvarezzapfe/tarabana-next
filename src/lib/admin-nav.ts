/**
 * Fuente unica de la navegacion del admin.
 *
 * El sidebar, el command palette y las pestanas de cada seccion se arman
 * desde aqui. Para agregar o mover una seccion se toca este archivo y nada
 * mas.
 *
 * Reglas de visibilidad: cada item declara el permiso del destino usando los
 * helpers de ./roles. La regla es que el predicado de un item sea el mismo
 * guard que la pagina destino ya impone server-side, para que ningun link
 * del sidebar lleve a una pantalla de "sin permiso". Esto es solo para la UI;
 * la autorizacion real vive en cada page/route handler y en las policies RLS.
 */
import {
  canWrite,
  canManageAsAdmin,
  canManageInventory,
  isSuperAdmin,
  isStaff,
  isVendedor,
  canEnterPanel,
  enRoles,
} from './roles'

/** canWrite (staff de oficina) o el vendedor, acotado por RLS a lo suyo. */
const canWriteOVendedor: RolePredicate = role => canWrite(role) || isVendedor(role)

/**
 * Staff menos ventas. Ventas no gestiona produccion ni finanzas.
 * Se escribe con lista explicita porque ningun predicado de roles.ts
 * describe este recorte.
 */
const staffSinVentas = enRoles('super_admin', 'admin', 'produccion', 'contabilidad')

type RolePredicate = (role?: string | null) => boolean

export type NavTabDef = {
  key: string
  label: string
  /** Ruta vieja que ahora redirige a esta pestana (se conecta en 1.C). */
  legacyHref?: string
  visible: RolePredicate
}

export type NavItemDef = {
  key: string
  label: string
  href: string
  /** path del <svg viewBox="0 0 24 24">, stroke currentColor */
  icon: string
  visible: RolePredicate
  tabs?: NavTabDef[]
  /**
   * 'principal' va en el cuerpo scrolleable; 'inferior' se ancla abajo,
   * encima del bloque de usuario, separado por una linea fina.
   */
  bloque?: 'principal' | 'inferior'
  /** Clave del contador a pintar como badge. */
  badge?: 'pedidosPendientes'
  /** Punto rojo de alerta. */
  alerta?: 'saldosVencidos'
}

/** Items serializados: sin funciones, aptos para cruzar al cliente. */
export type NavItem = Omit<NavItemDef, 'visible' | 'tabs'> & {
  tabs?: Omit<NavTabDef, 'visible'>[]
}

export const NAV: NavItemDef[] = [
  {
    key: 'inicio',
    label: 'Inicio',
    href: '/admin',
    icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
    visible: canEnterPanel,
  },
  {
    key: 'pedidos',
    label: 'Pedidos',
    href: '/admin/pedidos',
    icon: 'M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    visible: canWriteOVendedor,
    badge: 'pedidosPendientes',
    alerta: 'saldosVencidos',
    tabs: [
      { key: 'todos', label: 'Todos', visible: canWriteOVendedor },
      // Cobranza es de oficina. El vendedor no la gestiona, pero si ve el
      // saldo de cada pedido suyo en la lista.
      { key: 'por-cobrar', label: 'Por cobrar', legacyHref: '/admin/cobranza', visible: canWrite },
    ],
  },
  {
    key: 'clientes',
    label: 'Clientes',
    href: '/admin/clientes',
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
    visible: canWriteOVendedor,
    tabs: [
      { key: 'clientes', label: 'Clientes', visible: canWriteOVendedor },
      { key: 'puntos-venta', label: 'Puntos de venta', legacyHref: '/admin/puntos-venta', visible: isStaff },
    ],
  },
  {
    key: 'produccion',
    label: 'Producción',
    href: '/admin/produccion',
    icon: 'M3 3h18v18H3z M3 9h18 M9 21V9',
    visible: staffSinVentas,
  },
  {
    key: 'inventario',
    label: 'Inventario',
    href: '/admin/inventario',
    icon: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01',
    visible: canManageInventory,
  },
  {
    key: 'comercial',
    label: 'Comercial',
    href: '/admin/comercial',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    visible: canManageAsAdmin,
    tabs: [
      { key: 'vendedores', label: 'Vendedores', legacyHref: '/admin/vendedores', visible: canManageAsAdmin },
      { key: 'comisiones', label: 'Comisiones', legacyHref: '/admin/comisiones', visible: canManageAsAdmin },
    ],
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    href: '/admin/finanzas',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    visible: staffSinVentas,
    tabs: [
      { key: 'reportes', label: 'Reportes', legacyHref: '/admin/reportes', visible: staffSinVentas },
      { key: 'contabilidad', label: 'Contabilidad', legacyHref: '/admin/contabilidad', visible: staffSinVentas },
    ],
  },
  {
    key: 'equipo',
    label: 'Equipo',
    href: '/admin/equipo',
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
    // Usuarios internos, MFA y invitaciones. La pagina valida super_admin.
    visible: isSuperAdmin,
    bloque: 'inferior',
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    href: '/admin/configuracion',
    icon: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 15a3 3 0 100-6 3 3 0 000 6z',
    // Ahora si llega hasta admin: la pagina es un host de pestanas y cada
    // pestana valida su propio permiso. Marca, Negocio y Actividad son
    // super-only; Taproom y Medallero llegan a admin.
    visible: canManageAsAdmin,
    bloque: 'inferior',
    tabs: [
      { key: 'marca', label: 'Marca', visible: isSuperAdmin },
      { key: 'negocio', label: 'Negocio', visible: isSuperAdmin },
      { key: 'taproom', label: 'Taproom', legacyHref: '/admin/taproom', visible: canManageAsAdmin },
      { key: 'medallero', label: 'Medallero', legacyHref: '/admin/medallero', visible: canManageAsAdmin },
      { key: 'actividad', label: 'Actividad', legacyHref: '/admin/actividad', visible: isSuperAdmin },
    ],
  },
]

type TabPlano = Omit<NavTabDef, 'visible'>

function serializarTab(tab: NavTabDef): TabPlano {
  return { key: tab.key, label: tab.label, ...(tab.legacyHref ? { legacyHref: tab.legacyHref } : {}) }
}

function serializarItem(item: NavItemDef, role?: string | null): NavItem {
  const plano: NavItem = {
    key: item.key,
    label: item.label,
    href: item.href,
    icon: item.icon,
    bloque: item.bloque ?? 'principal',
    ...(item.badge ? { badge: item.badge } : {}),
    ...(item.alerta ? { alerta: item.alerta } : {}),
  }
  if (item.tabs) plano.tabs = item.tabs.filter(t => t.visible(role)).map(serializarTab)
  return plano
}

/** Items (y pestanas) que el rol puede ver, ya serializados. */
export function navParaRol(role?: string | null): NavItem[] {
  return NAV.filter(item => item.visible(role)).map(item => serializarItem(item, role))
}

/** Pestanas visibles de una seccion. Lo usan las paginas de 1.C. */
export function tabsParaRol(key: string, role?: string | null): TabPlano[] {
  const item = NAV.find(i => i.key === key)
  if (!item?.tabs || !item.visible(role)) return []
  return item.tabs.filter(t => t.visible(role)).map(serializarTab)
}

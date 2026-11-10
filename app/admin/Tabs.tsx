import Link from 'next/link'

/**
 * Cabecera de seccion con pestanas.
 *
 * Server component: las pestanas son links, no necesitan estado. El hover va
 * en un <style> con scope por clase para no mandar JS.
 *
 * La pestana activa la resuelve la pagina host con resolverTab(), que ya
 * valida contra las pestanas que el rol puede ver.
 *
 * Dos formas de pestana. La de siempre es `?tab=<key>` sobre la misma pagina,
 * que es como estan Pedidos, Finanzas y las demas secciones. La otra es una
 * pestana con `href` propio, para una seccion cuyas vistas son RUTAS distintas
 * (Inventario / Inventario-Precios): ahi cada pagina pinta la cabecera con su
 * `activa`, porque no hay un host que resuelva el `?tab=`.
 *
 * `titulo` es opcional: una pagina que ya trae su propio encabezado solo
 * necesita la tira de pestanas, y repetir el titulo encima se veria como un
 * error.
 */

export type Tab = {
  key: string
  label: string
  /** Ruta propia de la pestana. Sin esto, se usa `basePath?tab=<key>`. */
  href?: string
}

type Props = {
  titulo?: string
  descripcion?: string
  tabs: Tab[]
  activa: string
  /** Ruta de la seccion, p.ej. /admin/pedidos */
  basePath: string
  acento: string
  /** Acciones a la derecha del titulo (botones de alta, export, etc.). */
  acciones?: React.ReactNode
}

/**
 * Elige la pestana a mostrar: la pedida si el rol la puede ver, si no la
 * primera disponible. Devuelve null si el rol no tiene ninguna.
 */
export function resolverTab(tabs: Tab[], pedida?: string | string[]): string | null {
  if (!tabs.length) return null
  const key = Array.isArray(pedida) ? pedida[0] : pedida
  if (key && tabs.some(t => t.key === key)) return key
  return tabs[0].key
}

export default function Tabs({ titulo, descripcion, tabs, activa, basePath, acento, acciones }: Props) {
  return (
    <div style={{ marginBottom: 28 }}>
      <style>{`
        .admin-tab { color: #6b7280; }
        .admin-tab:hover { color: #1a1a1a; background: #f3f4f6; }
        .admin-tab[aria-current="page"] { color: #1a1a1a; background: transparent; }
      `}</style>

      {(titulo || acciones) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: descripcion ? 4 : 18 }}>
          {titulo && <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, margin: 0 }}>{titulo}</h1>}
          {acciones && <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{acciones}</div>}
        </div>
      )}

      {descripcion && (
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 18px' }}>{descripcion}</p>
      )}

      {tabs.length > 1 && (
        <div
          role="tablist"
          style={{
            display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb',
            overflowX: 'auto', paddingBottom: 0,
          }}
        >
          {tabs.map(t => {
            const activo = t.key === activa
            return (
              <Link
                key={t.key}
                className="admin-tab"
                role="tab"
                aria-selected={activo}
                aria-current={activo ? 'page' : undefined}
                href={t.href ?? `${basePath}?tab=${t.key}`}
                style={{
                  position: 'relative',
                  padding: '9px 14px 11px',
                  fontSize: 13.5,
                  fontWeight: activo ? 600 : 500,
                  textDecoration: 'none',
                  borderRadius: '7px 7px 0 0',
                  whiteSpace: 'nowrap',
                  transition: 'color 120ms ease, background 120ms ease',
                }}
              >
                {t.label}
                {activo && (
                  <span
                    aria-hidden
                    style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2, background: acento, borderRadius: 1 }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

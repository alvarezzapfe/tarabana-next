'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import type { NavItem } from '../../src/lib/admin-nav'

/**
 * Chrome del admin. Los colores estan fijos a proposito: antes venian de
 * app_config.branding y se podia elegir un fondo claro que rompia el
 * contraste de toda la navegacion. Lo unico configurable es el acento
 * (color_primary), que /api/admin/config valida a 3:1 contra CHROME.bg.
 */
const CHROME = {
  bg: '#0B0D10',
  borde: '#1C2128',
  textoInactivo: '#8B93A1',
  hoverBg: '#14181E',
  activoBg: '#1A1F27',
  activoTexto: '#FFFFFF',
}

const ANCHO_ABIERTO = 240
const ANCHO_CERRADO = 64
const LS_KEY = 'tarabana.admin.sidebar.colapsado'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  ventas: 'Ventas',
  produccion: 'Produccion',
  contabilidad: 'Contabilidad',
}

export type Badges = {
  pedidosPendientes: number
  saldosVencidos: boolean
}

type Props = {
  items: NavItem[]
  usuario: { nombre: string; role: string }
  badges: Badges
  /** app_config.branding.color_primary, ya validado server-side. */
  acento: string
}

/**
 * El estado colapsado vive en localStorage, que es un store externo a React.
 * Se lee con useSyncExternalStore en vez de copiarlo a state dentro de un
 * efecto: eso provocaba renders en cascada y ademas sincroniza gratis entre
 * pestanas via el evento 'storage'.
 *
 * localStorage puede tirar en modo privado o con cookies bloqueadas; en ese
 * caso el sidebar se queda expandido y el toggle sigue funcionando en memoria.
 */
const EVENTO_LOCAL = 'admin-sidebar-colapsado'

function suscribir(onCambio: () => void) {
  window.addEventListener('storage', onCambio)
  window.addEventListener(EVENTO_LOCAL, onCambio)
  return () => {
    window.removeEventListener('storage', onCambio)
    window.removeEventListener(EVENTO_LOCAL, onCambio)
  }
}

function snapshot(): boolean {
  try {
    return window.localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

/** En el servidor no hay localStorage: se asume expandido. */
function snapshotServidor(): boolean {
  return false
}

function guardarColapsado(v: boolean) {
  try {
    window.localStorage.setItem(LS_KEY, v ? '1' : '0')
  } catch {
    // Sin persistencia. Se emite igual para que el componente se re-renderice.
  }
  window.dispatchEvent(new Event(EVENTO_LOCAL))
}

export default function Sidebar({ items, usuario, badges, acento }: Props) {
  const pathname = usePathname()
  const colapsado = useSyncExternalStore(suscribir, snapshot, snapshotServidor)
  const [hover, setHover] = useState<string | null>(null)

  // El <main> del layout usa esta variable como margen, asi no hace falta
  // subir el estado a un server component.
  useEffect(() => {
    const ancho = colapsado ? ANCHO_CERRADO : ANCHO_ABIERTO
    document.documentElement.style.setProperty('--admin-sidebar-w', `${ancho}px`)
  }, [colapsado])

  const toggle = useCallback(() => {
    guardarColapsado(!snapshot())
  }, [])

  // Gana el href mas largo que haga match, si no "/admin" se activaria siempre.
  const activoKey = items
    .filter(i => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.key

  const ancho = colapsado ? ANCHO_CERRADO : ANCHO_ABIERTO

  return (
    <aside
      style={{
        width: ancho,
        background: CHROME.bg,
        borderRight: `1px solid ${CHROME.borde}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        zIndex: 50,
        transition: 'width 160ms ease',
      }}
    >
      {/* Titulo */}
      <div
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: colapsado ? 'center' : 'space-between',
          padding: colapsado ? 0 : '0 14px',
          borderBottom: `1px solid ${CHROME.borde}`,
          flexShrink: 0,
        }}
      >
        {!colapsado && (
          <span
            className="font-mono"
            style={{
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            Tarabaña OS
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={colapsado ? 'Expandir navegacion' : 'Colapsar navegacion'}
          aria-expanded={!colapsado}
          style={{
            background: 'transparent',
            border: 'none',
            color: CHROME.textoInactivo,
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {colapsado ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
      </div>

      {/* Buscador — abre el command palette */}
      <button
        onClick={() => window.dispatchEvent(new Event('admin-palette-open'))}
        title={colapsado ? 'Buscar (⌘K)' : undefined}
        style={{
          margin: colapsado ? '10px auto' : '10px 12px',
          width: colapsado ? 36 : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: colapsado ? 'center' : 'space-between',
          gap: 8,
          padding: colapsado ? 8 : '8px 10px',
          background: CHROME.hoverBg,
          border: `1px solid ${CHROME.borde}`,
          borderRadius: 8,
          color: CHROME.textoInactivo,
          fontSize: 13,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          {!colapsado && 'Buscar'}
        </span>
        {!colapsado && (
          <kbd className="font-mono" style={{ fontSize: 10, color: CHROME.textoInactivo, border: `1px solid ${CHROME.borde}`, borderRadius: 4, padding: '1px 5px' }}>
            ⌘K
          </kbd>
        )}
      </button>

      {/* Items */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 12px' }}>
        {items.map(item => {
          const activo = item.key === activoKey
          const pendientes = item.badge === 'pedidosPendientes' ? badges.pedidosPendientes : 0
          const alerta = item.alerta === 'saldosVencidos' && badges.saldosVencidos

          return (
            <div key={item.key}>
              {item.separadorArriba && (
                <div style={{ height: 1, background: CHROME.borde, margin: '10px 2px' }} />
              )}
              <a
                href={item.href}
                aria-current={activo ? 'page' : undefined}
                onMouseEnter={() => setHover(item.key)}
                onMouseLeave={() => setHover(null)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: colapsado ? 'center' : 'flex-start',
                  gap: 10,
                  padding: colapsado ? '10px 0' : '9px 10px',
                  marginBottom: 2,
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: activo ? 500 : 450,
                  color: activo ? CHROME.activoTexto : CHROME.textoInactivo,
                  background: activo ? CHROME.activoBg : hover === item.key ? CHROME.hoverBg : 'transparent',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {activo && (
                  <span
                    aria-hidden
                    style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 2, background: acento, borderRadius: 1 }}
                  />
                )}

                <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  {/* Colapsado no hay lugar para el conteo: queda el punto. */}
                  {colapsado && (pendientes > 0 || alerta) && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute', top: -3, right: -4, width: 7, height: 7, borderRadius: '50%',
                        background: alerta ? '#ef4444' : acento,
                        border: `1.5px solid ${activo ? CHROME.activoBg : CHROME.bg}`,
                      }}
                    />
                  )}
                </span>

                {!colapsado && (
                  <>
                    <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {pendientes > 0 && (
                        <span
                          className="font-mono"
                          title={`${pendientes} pedido(s) pendiente(s)`}
                          style={{
                            fontSize: 10, lineHeight: 1, padding: '3px 6px', borderRadius: 999,
                            background: CHROME.borde, color: '#C9D1D9', fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {pendientes}
                        </span>
                      )}
                      {alerta && (
                        <span
                          title="Hay saldos vencidos"
                          style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}
                        />
                      )}
                    </span>
                  </>
                )}

                {/* Tooltip cuando esta colapsado */}
                {colapsado && hover === item.key && (
                  <span
                    role="tooltip"
                    style={{
                      position: 'absolute', left: ANCHO_CERRADO - 4, top: '50%', transform: 'translateY(-50%)',
                      background: '#1A1F27', color: '#fff', fontSize: 12, padding: '5px 9px', borderRadius: 6,
                      border: `1px solid ${CHROME.borde}`, whiteSpace: 'nowrap', zIndex: 60, pointerEvents: 'none',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                    }}
                  >
                    {item.label}
                    {pendientes > 0 && ` · ${pendientes}`}
                    {alerta && ' · vencidos'}
                  </span>
                )}
              </a>
            </div>
          )
        })}
      </nav>

      {/* Usuario + logout */}
      <div style={{ borderTop: `1px solid ${CHROME.borde}`, padding: colapsado ? '10px 0' : '12px 12px', flexShrink: 0 }}>
        {!colapsado && (
          <div style={{ padding: '0 10px', marginBottom: 10 }}>
            <p style={{ margin: 0, color: '#C9D1D9', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {usuario.nombre}
            </p>
            <span
              className="font-mono"
              style={{
                display: 'inline-block', marginTop: 5, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 4, border: `1px solid ${CHROME.borde}`, color: CHROME.textoInactivo,
              }}
            >
              {ROLE_LABEL[usuario.role] || usuario.role}
            </span>
          </div>
        )}
        <a
          href="/api/auth/logout"
          title={colapsado ? 'Cerrar sesion' : undefined}
          onMouseEnter={() => setHover('__logout')}
          onMouseLeave={() => setHover(null)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: colapsado ? 'center' : 'flex-start', gap: 10,
            padding: colapsado ? '9px 0' : '8px 10px', borderRadius: 8, textDecoration: 'none', fontSize: 13,
            color: CHROME.textoInactivo,
            background: hover === '__logout' ? CHROME.hoverBg : 'transparent',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          {!colapsado && 'Cerrar sesion'}
        </a>
      </div>
    </aside>
  )
}

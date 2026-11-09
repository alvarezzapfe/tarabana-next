'use client'
import { useEffect, useMemo, useState } from 'react'
import DireccionForm, { type DireccionData } from './DireccionForm'
import {
  GIROS, NIVELES_PRECIO, USOS_CFDI,
  giroLabel, nivelLabel, nivelSugeridoPorGiro, normalizarRFC, regimenesDe,
  rfcValido, tipoPersonaDeRFC,
} from '../lib/clientes'

/**
 * Alta y edicion de un cliente.
 *
 * El modelo es: **el cliente es el NEGOCIO**. El formulario viejo abria
 * preguntando "fisica o moral?" y de ahi derivaba los campos de nombre, lo
 * que obliga a elegir entre registrar a la persona o registrar al negocio —
 * y el caso mas comun es una persona fisica que opera un bar con su propia
 * marca. Aqui el nombre comercial es el primer campo de la pantalla y lo
 * fiscal es un bloque que solo aparece si hace falta factura; el tipo de
 * persona no se pregunta, lo dice el RFC.
 *
 * `ClienteForm.tsx` sigue existiendo sin tocarse: lo usa el onboarding del
 * portal, que es otra conversacion con otro usuario.
 */

const ACENTO = '#D95F2E'
const ROJO = '#dc2626'
const TINTA = '#111827'
const TINTA_MEDIA = '#374151'
const GRIS = '#6b7280'
const GRIS_SUAVE = '#9ca3af'
const BORDE = '#e5e7eb'
const PISTA = '#f3f4f6'
const VERDE = '#047857'

/**
 * El `display` y el `position` de lo que depende del breakpoint viven aqui y
 * NO en un style inline: un inline le gana siempre a la clase, y entonces la
 * media query no apaga nada.
 */
const CSS = `
  .cp-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
  .cp-izq  { display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: 18px; align-items: start; }
  .cp-nav  { display: block; position: sticky; top: 16px; }
  .cp-vista { position: sticky; top: 16px; }
  .cp-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cp-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  @media (max-width: 1180px) {
    .cp-grid { grid-template-columns: minmax(0, 1fr); }
    .cp-vista { position: static; }
  }
  @media (max-width: 860px) {
    .cp-izq { grid-template-columns: minmax(0, 1fr); }
    .cp-nav { display: none; }
  }
  @media (max-width: 640px) {
    .cp-2, .cp-3 { grid-template-columns: 1fr; }
  }
`

export type ClienteProData = {
  // 1 Negocio
  marca_negocio: string
  giro: string
  instagram: string
  sitio_web: string
  // 2 Contacto
  contacto_nombre: string
  contacto_whatsapp: string
  email: string
  phone: string
  // 3 Facturacion
  requiere_factura: boolean
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cp_fiscal: string
  uso_cfdi: string
  // 4 Entrega
  direccion: DireccionData
  horario_recepcion: string
  // 5 Comercial
  nivel_precio: string
  dias_credito: string
  limite_credito: string
  vendedor_id: string
  notas: string
}

const DIR_VACIA: DireccionData = {
  cp: '', colonia: '', municipio: '', estado: '', calle: '', num_ext: '', num_int: '', referencias: '',
}

export const CLIENTE_PRO_VACIO: ClienteProData = {
  marca_negocio: '', giro: '', instagram: '', sitio_web: '',
  contacto_nombre: '', contacto_whatsapp: '', email: '', phone: '',
  requiere_factura: false, rfc: '', razon_social: '', regimen_fiscal: '', cp_fiscal: '', uso_cfdi: '',
  direccion: DIR_VACIA, horario_recepcion: '',
  nivel_precio: 'publico', dias_credito: '', limite_credito: '', vendedor_id: '', notas: '',
}

/**
 * El cuerpo que esperan las rutas de crear y actualizar.
 *
 * La direccion se aplana porque en `profiles` son ocho columnas, no un
 * objeto. Vive aqui, junto al tipo, para que las dos paginas manden lo mismo.
 */
export function cuerpoCliente(d: ClienteProData) {
  return {
    marca_negocio: d.marca_negocio,
    giro: d.giro,
    instagram: d.instagram,
    sitio_web: d.sitio_web,
    contacto_nombre: d.contacto_nombre,
    contacto_whatsapp: d.contacto_whatsapp,
    email: d.email,
    phone: d.phone,
    requiere_factura: d.requiere_factura,
    rfc: d.rfc,
    razon_social: d.razon_social,
    regimen_fiscal: d.regimen_fiscal,
    cp_fiscal: d.cp_fiscal,
    uso_cfdi: d.uso_cfdi,
    ...d.direccion,
    horario_recepcion: d.horario_recepcion,
    nivel_precio: d.nivel_precio,
    dias_credito: d.dias_credito,
    limite_credito: d.limite_credito,
    vendedor_id: d.vendedor_id,
    notas: d.notas,
  }
}

type SeccionKey = 'negocio' | 'contacto' | 'facturacion' | 'entrega' | 'comercial'

const SECCIONES: { key: SeccionKey; n: number; titulo: string }[] = [
  { key: 'negocio', n: 1, titulo: 'Negocio' },
  { key: 'contacto', n: 2, titulo: 'Contacto' },
  { key: 'facturacion', n: 3, titulo: 'Facturación' },
  { key: 'entrega', n: 4, titulo: 'Entrega' },
  { key: 'comercial', n: 5, titulo: 'Comercial' },
]

const idSeccion = (clave: SeccionKey) => `cp-sec-${clave}`

export type Duplicado = {
  id: string
  nombre: string
  detalle: string
  campo: 'rfc' | 'email' | 'telefono'
}

type Props = {
  initial?: Partial<ClienteProData>
  legacyAddress?: string | null
  /** El vendedor no ve nivel de precio ni credito. */
  esVendedor: boolean
  vendedores: { id: string; nombre: string }[]
  /** Al editar, el propio cliente no cuenta como duplicado de si mismo. */
  excluirId?: string
  guardando: boolean
  submitLabel: string
  onGuardar: (d: ClienteProData, irAPedido: boolean) => Promise<{ error?: string }>
}

/** Diez digitos como '555 123 4567'. Exportada para precargar la edicion. */
export const formatearTelefono = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ClienteProForm(props: Props) {
  const { initial, legacyAddress, esVendedor, vendedores, excluirId, guardando, submitLabel, onGuardar } = props

  const [d, setD] = useState<ClienteProData>({ ...CLIENTE_PRO_VACIO, ...initial })
  const [activa, setActiva] = useState<SeccionKey>('negocio')
  const [error, setError] = useState('')
  const [duplicados, setDuplicados] = useState<Duplicado[]>([])
  /** Si el nivel lo puso el giro o lo puso una persona. */
  const [nivelTocado, setNivelTocado] = useState(!!initial?.nivel_precio)

  const set = <K extends keyof ClienteProData>(k: K, v: ClienteProData[K]) => {
    setD(prev => ({ ...prev, [k]: v }))
    setError('')
  }

  /**
   * Elegir giro precarga el nivel de precio, salvo que ya se haya tocado a
   * mano: la sugerencia no debe pisar una decision.
   */
  const elegirGiro = (giro: string) => {
    const sugerido = nivelSugeridoPorGiro(giro)
    setD(prev => ({
      ...prev,
      giro,
      nivel_precio: nivelTocado || !sugerido ? prev.nivel_precio : sugerido,
    }))
    setError('')
  }

  const tipoPersona = useMemo(() => tipoPersonaDeRFC(d.rfc), [d.rfc])
  const rfcMal = d.requiere_factura && d.rfc.length > 0 && !rfcValido(d.rfc)

  // ── Que falta, por seccion ────────────────────────────────
  const faltantes = useMemo((): Record<SeccionKey, string[]> => {
    const f: Record<SeccionKey, string[]> = {
      negocio: [], contacto: [], facturacion: [], entrega: [], comercial: [],
    }

    if (!d.marca_negocio.trim()) f.negocio.push('Nombre comercial')
    if (!d.giro) f.negocio.push('Giro')

    if (!d.email.trim()) f.contacto.push('Correo')
    else if (!EMAIL_RE.test(d.email.trim())) f.contacto.push('Correo con formato válido')
    const tel = d.phone.replace(/\D/g, '')
    if (tel && tel.length !== 10) f.contacto.push('Teléfono de 10 dígitos')
    const wa = d.contacto_whatsapp.replace(/\D/g, '')
    if (wa && wa.length !== 10) f.contacto.push('WhatsApp de 10 dígitos')

    if (d.requiere_factura) {
      if (!d.rfc.trim()) f.facturacion.push('RFC')
      else if (!rfcValido(d.rfc)) f.facturacion.push('RFC con formato válido')
      if (!d.razon_social.trim()) f.facturacion.push('Razón social')
      if (!d.uso_cfdi) f.facturacion.push('Uso de CFDI')
    }

    if (d.dias_credito && Number(d.dias_credito) < 0) f.comercial.push('Días de crédito ≥ 0')
    if (d.limite_credito && Number(d.limite_credito) < 0) f.comercial.push('Límite de crédito ≥ 0')

    return f
  }, [d])

  const todosFaltantes = useMemo(
    () => SECCIONES.flatMap(s => faltantes[s.key]),
    [faltantes]
  )
  const puedeGuardar = todosFaltantes.length === 0 && !guardando

  // ── Duplicados en vivo ───────────────────────────────────
  //
  // Se consulta por RFC, correo y telefono con un debounce: teclear un correo
  // son veinte pulsaciones y no veinte consultas.
  useEffect(() => {
    const rfc = d.requiere_factura ? normalizarRFC(d.rfc) : ''
    const email = d.email.trim()
    const telefono = d.phone.replace(/\D/g, '')

    const vale = (rfc.length >= 12) || EMAIL_RE.test(email) || telefono.length === 10

    // Limpiar tambien va dentro del timeout: borrar en el cuerpo del efecto
    // es un setState sincrono que dispara un render en cascada por tecla.
    const t = setTimeout(() => {
      if (!vale) { setDuplicados([]); return }

      const q = new URLSearchParams()
      if (rfc.length >= 12) q.set('rfc', rfc)
      if (EMAIL_RE.test(email)) q.set('email', email)
      if (telefono.length === 10) q.set('telefono', telefono)
      if (excluirId) q.set('excluir', excluirId)

      fetch(`/api/admin/clientes/duplicados?${q.toString()}`)
        .then(r => (r.ok ? r.json() : { duplicados: [] }))
        .then(j => setDuplicados(j.duplicados || []))
        .catch(() => setDuplicados([]))
    }, 400)

    return () => clearTimeout(t)
  }, [d.rfc, d.email, d.phone, d.requiere_factura, excluirId])

  // ── Que seccion se esta viendo ───────────────────────────
  useEffect(() => {
    const nodos = Array.from(document.querySelectorAll<HTMLElement>('[data-sec]'))
    if (nodos.length === 0) return

    const obs = new IntersectionObserver(
      entradas => {
        const visible = entradas
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiva(visible.target.getAttribute('data-sec') as SeccionKey)
      },
      // La banda de arriba: la seccion activa es la que esta en el primer
      // tercio de la pantalla, no la que apenas asoma por abajo.
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )
    nodos.forEach(n => obs.observe(n))
    return () => obs.disconnect()
  }, [esVendedor])

  const irA = (key: SeccionKey) => {
    document.getElementById(idSeccion(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const guardar = async (irAPedido: boolean) => {
    if (!puedeGuardar) return
    const r = await onGuardar(d, irAPedido)
    if (r.error) setError(r.error)
  }

  const secciones = esVendedor ? SECCIONES.filter(s => s.key !== 'comercial') : SECCIONES

  return (
    <>
      <style>{CSS}</style>

      <div className="cp-grid">
        <div className="cp-izq">
          {/* ── Navegacion lateral ───────────────────────── */}
          <nav className="cp-nav">
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {secciones.map(s => {
                const esta = activa === s.key
                const falta = faltantes[s.key].length > 0
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => irA(s.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                        padding: '8px 9px', background: esta ? '#fff7f3' : 'none',
                        border: 'none', borderLeft: `2px solid ${esta ? ACENTO : 'transparent'}`,
                        borderRadius: '0 7px 7px 0', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 auto', width: 20, height: 20, borderRadius: '50%',
                          display: 'grid', placeItems: 'center',
                          background: esta ? ACENTO : PISTA,
                          color: esta ? '#fff' : GRIS, fontSize: 10.5, fontWeight: 700,
                        }}
                      >
                        {s.n}
                      </span>
                      <span style={{ flex: '1 1 auto', color: esta ? TINTA : GRIS, fontSize: 12.5, fontWeight: esta ? 700 : 500 }}>
                        {s.titulo}
                      </span>
                      {/* Un punto, no un tache: todavia se esta capturando. */}
                      <span
                        title={falta ? 'Falta algo' : 'Completa'}
                        style={{
                          flex: '0 0 auto', width: 6, height: 6, borderRadius: '50%',
                          background: falta ? '#fbbf24' : VERDE,
                        }}
                      />
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>

          {/* ── Secciones ────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, minWidth: 0 }}>
            <Seccion n={1} titulo="Negocio" clave="negocio"
              ayuda="Como se conoce el lugar. Es el nombre con el que va a aparecer en la tabla y en los pedidos.">
              <Campo label="Nombre comercial" obligatorio>
                <input
                  value={d.marca_negocio}
                  onChange={e => set('marca_negocio', e.target.value)}
                  placeholder="Bar La Esquina"
                  autoFocus
                  style={{ ...entrada, fontSize: 16, fontWeight: 600 }}
                />
              </Campo>

              <Campo label="Giro" obligatorio>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {GIROS.map(g => {
                    const sel = d.giro === g.value
                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => elegirGiro(g.value)}
                        style={{
                          padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
                          background: sel ? '#fff7f3' : '#fff',
                          border: `1.5px solid ${sel ? ACENTO : BORDE}`,
                          color: sel ? TINTA : GRIS,
                          fontSize: 12.5, fontWeight: sel ? 700 : 500, whiteSpace: 'nowrap',
                        }}
                      >
                        {g.label}
                      </button>
                    )
                  })}
                </div>
              </Campo>

              <div className="cp-2">
                <Campo label="Instagram">
                  <input
                    value={d.instagram}
                    onChange={e => set('instagram', e.target.value.replace(/^@/, ''))}
                    placeholder="barlaesquina"
                    style={entrada}
                  />
                </Campo>
                <Campo label="Sitio web">
                  <input value={d.sitio_web} onChange={e => set('sitio_web', e.target.value)} placeholder="barlaesquina.mx" style={entrada} />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={2} titulo="Contacto" clave="contacto"
              ayuda="Quien contesta cuando hay que coordinar una entrega.">
              <div className="cp-2">
                <Campo label="Nombre de quien atiende">
                  <input value={d.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)} placeholder="Quién recibe" style={entrada} />
                </Campo>
                <Campo label="WhatsApp">
                  <input
                    value={d.contacto_whatsapp}
                    onChange={e => set('contacto_whatsapp', formatearTelefono(e.target.value))}
                    placeholder="555 123 4567"
                    inputMode="numeric"
                    style={entrada}
                  />
                </Campo>
                <Campo label="Correo" obligatorio>
                  <input
                    value={d.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="hola@barlaesquina.mx"
                    type="email"
                    style={entrada}
                  />
                </Campo>
                <Campo label="Teléfono">
                  <input
                    value={d.phone}
                    onChange={e => set('phone', formatearTelefono(e.target.value))}
                    placeholder="555 123 4567"
                    inputMode="numeric"
                    style={entrada}
                  />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={3} titulo="Facturación" clave="facturacion"
              ayuda="Lo fiscal va aparte del negocio: una persona física puede facturar por un bar con su propia marca.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: d.requiere_factura ? 16 : 0 }}>
                <Switch on={d.requiere_factura} onToggle={() => set('requiere_factura', !d.requiere_factura)} etiqueta="¿Requiere factura?" />
                <span style={{ color: TINTA_MEDIA, fontSize: 13, fontWeight: 600 }}>¿Requiere factura?</span>
              </div>

              {d.requiere_factura && (
                <>
                  <div className="cp-2">
                    <Campo
                      label="RFC"
                      obligatorio
                      nota={
                        tipoPersona
                          ? `${tipoPersona === 'moral' ? 'Persona moral' : 'Persona física'} · ${d.rfc.length} caracteres`
                          : 'Se detecta persona física o moral por el RFC'
                      }
                    >
                      <input
                        value={d.rfc}
                        onChange={e => set('rfc', normalizarRFC(e.target.value))}
                        placeholder="AAAA000000AA0"
                        style={{ ...entrada, borderColor: rfcMal ? ROJO : BORDE, fontFamily: 'ui-monospace, monospace' }}
                      />
                    </Campo>
                    <Campo label="Razón social" obligatorio>
                      <input
                        value={d.razon_social}
                        onChange={e => set('razon_social', e.target.value.toUpperCase())}
                        placeholder="COMO APARECE EN EL SAT"
                        style={entrada}
                      />
                    </Campo>
                  </div>

                  <div className="cp-3">
                    <Campo label="Régimen fiscal" nota={tipoPersona ? undefined : 'Captura el RFC primero'}>
                      <select
                        value={d.regimen_fiscal}
                        onChange={e => set('regimen_fiscal', e.target.value)}
                        disabled={!tipoPersona}
                        style={{ ...entrada, cursor: tipoPersona ? 'pointer' : 'default' }}
                      >
                        <option value="">Elegir…</option>
                        {regimenesDe(tipoPersona).map(r => (
                          <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.desc}</option>
                        ))}
                      </select>
                    </Campo>
                    <Campo label="Uso de CFDI" obligatorio>
                      <select value={d.uso_cfdi} onChange={e => set('uso_cfdi', e.target.value)} style={{ ...entrada, cursor: 'pointer' }}>
                        <option value="">Elegir…</option>
                        {USOS_CFDI.map(u => (
                          <option key={u.codigo} value={u.codigo}>{u.codigo} · {u.desc}</option>
                        ))}
                      </select>
                    </Campo>
                    <Campo label="CP fiscal">
                      <input
                        value={d.cp_fiscal}
                        onChange={e => set('cp_fiscal', e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="00000"
                        inputMode="numeric"
                        style={entrada}
                      />
                    </Campo>
                  </div>
                </>
              )}
            </Seccion>

            <Seccion n={4} titulo="Entrega" clave="entrega"
              ayuda="A dónde llega la cerveza y en qué horario reciben.">
              <DireccionForm
                value={d.direccion}
                onChange={v => set('direccion', v)}
                legacyAddress={legacyAddress}
              />
              <div style={{ marginTop: 14 }}>
                <Campo label="Horario de recepción">
                  <input
                    value={d.horario_recepcion}
                    onChange={e => set('horario_recepcion', e.target.value)}
                    placeholder="Lunes a viernes de 9 a 14 h"
                    style={entrada}
                  />
                </Campo>
              </div>
            </Seccion>

            {/* El vendedor no define precio ni credito. */}
            {!esVendedor && (
              <Seccion n={5} titulo="Comercial" clave="comercial"
                ayuda="Precio, crédito y de quién es la cuenta.">
                <Campo
                  label="Nivel de precio"
                  nota={d.giro && !nivelTocado ? `Sugerido por el giro ${giroLabel(d.giro).toLowerCase()}` : undefined}
                >
                  <div style={{ display: 'flex', gap: 7 }}>
                    {NIVELES_PRECIO.map(n => {
                      const sel = d.nivel_precio === n.value
                      return (
                        <button
                          key={n.value}
                          type="button"
                          onClick={() => { set('nivel_precio', n.value); setNivelTocado(true) }}
                          style={{
                            flex: 1, padding: '9px 10px', textAlign: 'left', cursor: 'pointer',
                            background: sel ? '#fff7f3' : '#fff',
                            border: `1.5px solid ${sel ? ACENTO : BORDE}`, borderRadius: 8,
                          }}
                        >
                          <span style={{ display: 'block', color: sel ? TINTA : TINTA_MEDIA, fontSize: 12.5, fontWeight: 700 }}>{n.label}</span>
                          <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10.5, marginTop: 1 }}>{n.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </Campo>

                <div className="cp-3">
                  <Campo label="Días de crédito" nota="0 o vacío = contado">
                    <input
                      value={d.dias_credito}
                      onChange={e => set('dias_credito', e.target.value.replace(/\D/g, '').slice(0, 3))}
                      placeholder="30"
                      inputMode="numeric"
                      style={entrada}
                    />
                  </Campo>
                  <Campo label="Límite de crédito">
                    <input
                      value={d.limite_credito}
                      onChange={e => set('limite_credito', e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                      placeholder="50000"
                      inputMode="numeric"
                      style={entrada}
                    />
                  </Campo>
                  <Campo label="Vendedor">
                    <select value={d.vendedor_id} onChange={e => set('vendedor_id', e.target.value)} style={{ ...entrada, cursor: 'pointer' }}>
                      <option value="">Sin vendedor</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </Campo>
                </div>

                <Campo label="Notas internas">
                  <textarea
                    value={d.notas}
                    onChange={e => set('notas', e.target.value)}
                    rows={2}
                    placeholder="Observaciones, acuerdos, contacto alterno…"
                    style={{ ...entrada, resize: 'vertical' }}
                  />
                </Campo>
              </Seccion>
            )}

            {error && (
              <p style={{ margin: 0, padding: '10px 13px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5 }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', paddingTop: 4, borderTop: `1px solid ${BORDE}` }}>
              <button
                type="button"
                onClick={() => guardar(false)}
                disabled={!puedeGuardar}
                style={{
                  marginTop: 16, padding: '11px 20px', background: ACENTO, border: 'none', borderRadius: 9,
                  color: '#fff', fontSize: 13.5, fontWeight: 700,
                  cursor: puedeGuardar ? 'pointer' : 'default', opacity: puedeGuardar ? 1 : 0.5,
                }}
              >
                {guardando ? 'Guardando…' : submitLabel}
              </button>
              <button
                type="button"
                onClick={() => guardar(true)}
                disabled={!puedeGuardar}
                style={{
                  marginTop: 16, padding: '11px 18px', background: '#fff', border: `1px solid ${BORDE}`,
                  borderRadius: 9, color: TINTA_MEDIA, fontSize: 13.5, fontWeight: 600,
                  cursor: puedeGuardar ? 'pointer' : 'default', opacity: puedeGuardar ? 1 : 0.5,
                }}
              >
                Guardar y crear pedido
              </button>
            </div>
          </div>
        </div>

        {/* ── Vista previa ──────────────────────────────── */}
        <aside className="cp-vista">
          <Vista d={d} tipoPersona={tipoPersona} esVendedor={esVendedor} vendedores={vendedores} />
          <Alertas faltantes={todosFaltantes} rfcMal={rfcMal} duplicados={duplicados} />
        </aside>
      </div>
    </>
  )
}

// ── Piezas ──────────────────────────────────────────────────

const entrada: React.CSSProperties = {
  width: '100%', padding: '9px 11px', background: '#fff',
  border: `1px solid ${BORDE}`, borderRadius: 8, color: TINTA,
  fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const rotulo: React.CSSProperties = {
  display: 'block', color: GRIS_SUAVE, fontSize: 10, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}

function Campo({ label, obligatorio, nota, children }: {
  label: string
  obligatorio?: boolean
  nota?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={rotulo}>
        {label}
        {obligatorio && <span style={{ color: ACENTO, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {nota && <p style={{ margin: '4px 0 0', color: GRIS_SUAVE, fontSize: 10.5 }}>{nota}</p>}
    </div>
  )
}

/**
 * Una seccion, anclada por id en el DOM.
 *
 * Por id y no por un mapa de refs: la nav solo necesita hacer scroll y el
 * observer solo necesita observar — las dos cosas pasan despues del render —,
 * y un ref que viaja por props para que el hijo lo escriba es justo lo que el
 * compilador de React marca.
 */
function Seccion({ n, titulo, clave, ayuda, children }: {
  n: number
  titulo: string
  clave: SeccionKey
  ayuda: string
  children: React.ReactNode
}) {
  return (
    <section
      id={idSeccion(clave)}
      data-sec={clave}
      style={{ scrollMarginTop: 16 }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: TINTA, fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: GRIS_SUAVE, fontSize: 12, fontWeight: 600 }}>{n}</span>
          {titulo}
        </h2>
        <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 11.5 }}>{ayuda}</p>
      </div>
      {children}
    </section>
  )
}

/** El toggle que estaba inline en ClienteForm, ahora con su propio nombre. */
function Switch({ on, onToggle, etiqueta }: { on: boolean; onToggle: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={etiqueta}
      onClick={onToggle}
      style={{
        position: 'relative', flex: '0 0 auto', width: 44, height: 24, padding: 0,
        background: on ? ACENTO : '#d1d5db', border: 'none', borderRadius: 99,
        cursor: 'pointer', transition: 'background 0.2s',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
          background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

/**
 * La ficha como se va a ver.
 *
 * No es decoracion: el nombre comercial es el campo que despues aparece en la
 * tabla de clientes, en los pedidos y en la orden, y verlo mientras se
 * escribe es lo que evita dar de alta "Juan Perez" cuando el negocio se llama
 * "Bar La Esquina".
 */
function Vista({ d, tipoPersona, esVendedor, vendedores }: {
  d: ClienteProData
  tipoPersona: 'fisica' | 'moral' | null
  esVendedor: boolean
  vendedores: { id: string; nombre: string }[]
}) {
  const nombre = d.marca_negocio.trim() || d.razon_social.trim() || 'Sin nombre'
  const segunda = d.razon_social.trim() && d.razon_social.trim().toLowerCase() !== nombre.toLowerCase()
    ? d.razon_social.trim()
    : null

  const dir = [
    [d.direccion.calle, d.direccion.num_ext].filter(Boolean).join(' '),
    d.direccion.num_int && `int. ${d.direccion.num_int}`,
    d.direccion.colonia,
    [d.direccion.municipio, d.direccion.estado].filter(Boolean).join(', '),
    d.direccion.cp,
  ].filter(Boolean).join(' · ')

  const credito = d.dias_credito && Number(d.dias_credito) > 0
    ? `${d.dias_credito} días${d.limite_credito ? ` · hasta $${Number(d.limite_credito).toLocaleString('es-MX')}` : ''}`
    : 'Contado'

  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 12, padding: '16px 17px' }}>
      <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Vista previa
      </p>

      <p style={{ margin: '9px 0 0', color: d.marca_negocio.trim() ? TINTA : GRIS_SUAVE, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
        {nombre}
      </p>
      {segunda && (
        <p style={{ margin: '2px 0 0', color: GRIS_SUAVE, fontSize: 11.5, wordBreak: 'break-word' }}>{segunda}</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
        {d.giro && (
          <span style={{ padding: '2px 8px', borderRadius: 99, background: '#fff7f3', color: ACENTO, fontSize: 10.5, fontWeight: 600 }}>
            {giroLabel(d.giro)}
          </span>
        )}
        {!esVendedor && (
          <span style={{ padding: '2px 8px', borderRadius: 99, background: PISTA, color: GRIS, fontSize: 10.5, fontWeight: 600 }}>
            {nivelLabel(d.nivel_precio)}
          </span>
        )}
        {d.requiere_factura && tipoPersona && (
          <span style={{ padding: '2px 8px', borderRadius: 99, background: PISTA, color: GRIS, fontSize: 10.5 }}>
            {tipoPersona === 'moral' ? 'Moral' : 'Física'}
          </span>
        )}
      </div>

      <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Dato k="Contacto" v={[d.contacto_nombre, d.contacto_whatsapp].filter(Boolean).join(' · ')} />
        <Dato k="Correo" v={d.email} />
        <Dato k="Teléfono" v={d.phone} />
        <Dato k="Entrega" v={dir} />
        <Dato k="Horario" v={d.horario_recepcion} />
        {d.requiere_factura && <Dato k="RFC" v={d.rfc} mono />}
        {!esVendedor && <Dato k="Crédito" v={credito} />}
        {!esVendedor && d.vendedor_id && (
          <Dato k="Vendedor" v={vendedores.find(v => v.id === d.vendedor_id)?.nombre || ''} />
        )}
      </div>
    </div>
  )
}

function Dato({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ flex: '0 0 62px', color: GRIS_SUAVE, fontSize: 10 }}>{k}</span>
      <span
        style={{
          flex: '1 1 auto', color: v ? TINTA_MEDIA : '#d1d5db', fontSize: 11.5,
          wordBreak: 'break-word', fontFamily: mono && v ? 'ui-monospace, monospace' : 'inherit',
        }}
      >
        {v || '—'}
      </span>
    </div>
  )
}

function Alertas({ faltantes, rfcMal, duplicados }: {
  faltantes: string[]
  rfcMal: boolean
  duplicados: Duplicado[]
}) {
  if (faltantes.length === 0 && !rfcMal && duplicados.length === 0) return null

  const campoTexto: Record<Duplicado['campo'], string> = {
    rfc: 'el mismo RFC', email: 'el mismo correo', telefono: 'el mismo teléfono',
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
      {duplicados.length > 0 && (
        <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9 }}>
          <p style={{ margin: 0, color: '#b91c1c', fontSize: 11.5, fontWeight: 700 }}>
            {duplicados.length === 1 ? 'Ya existe un cliente así' : 'Ya existen clientes así'}
          </p>
          {duplicados.map(dup => (
            <p key={`${dup.campo}-${dup.id}`} style={{ margin: '5px 0 0', fontSize: 11.5 }}>
              <a
                href={`/admin/clientes/edit/${dup.id}`}
                style={{ color: '#b91c1c', fontWeight: 600 }}
              >
                {dup.nombre}
              </a>
              <span style={{ color: '#b91c1c' }}> — {campoTexto[dup.campo]}{dup.detalle ? ` (${dup.detalle})` : ''}</span>
            </p>
          ))}
        </div>
      )}

      {rfcMal && (
        <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9 }}>
          <p style={{ margin: 0, color: '#b91c1c', fontSize: 11.5 }}>
            El RFC no tiene forma de RFC: 3 o 4 letras, 6 dígitos de fecha y 3 de homoclave.
          </p>
        </div>
      )}

      {faltantes.length > 0 && (
        <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: 11.5, fontWeight: 700 }}>Falta</p>
          <p style={{ margin: '3px 0 0', color: '#92400e', fontSize: 11.5 }}>{faltantes.join(' · ')}</p>
        </div>
      )}
    </div>
  )
}

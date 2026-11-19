'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtLitros } from '../../../src/lib/produccion'
import { BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA } from '../dash-ui'
import Icono from '../produccion/Icono'
import {
  ICONOS, TANQUE_TIPO_LABEL, botonNeutro, botonPrimario, inputBase, labelBase,
  type TanqueFila, type TanqueTipo,
} from '../produccion/produccion-ui'

/**
 * CRUD de tanques.
 *
 * Escribe por route handler (`/api/admin/produccion/tanques`) y no con la
 * anon key desde el browser, a diferencia de Medallero y Taproom: esa es
 * justo la deuda que docs/RLS.md marca como pendiente, y no tiene sentido
 * sumarle una pantalla nueva.
 *
 * Borrar vs. desactivar: `lotes.tanque_id` tiene `on delete set null`, asi
 * que borrar un tanque con historial les quita a los lotes viejos el dato de
 * en que vasija se hicieron. La UI empuja a desactivar y solo ofrece Borrar
 * cuando ningun lote lo referencia.
 */

const TIPOS: TanqueTipo[] = ['fermentador', 'madurador', 'brite']

const VACIO = { nombre: '', tipo: 'fermentador' as TanqueTipo, capacidad_litros: '', notas: '' }

type Props = {
  tanques: TanqueFila[]
  usos: Record<string, { total: number; vivos: number }>
  acento: string
}

export default function TanquesClient({ tanques, usos, acento }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const cap = parseFloat(form.capacidad_litros)
  const valido = form.nombre.trim().length > 0 && Number.isFinite(cap) && cap > 0

  const guardar = async () => {
    setGuardando(true); setError('')
    try {
      const cuerpo = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        capacidad_litros: cap,
        notas: form.notas.trim() || null,
      }
      const res = await fetch(
        editId ? `/api/admin/produccion/tanques/${editId}` : '/api/admin/produccion/tanques',
        {
          method: editId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar'); return }
      setForm(VACIO)
      setEditId(null)
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  const accion = async (id: string, metodo: 'PATCH' | 'DELETE', cuerpo?: object) => {
    setOcupado(id); setError('')
    try {
      const res = await fetch(`/api/admin/produccion/tanques/${id}`, {
        method: metodo,
        ...(cuerpo ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo completar la acción'); return }
      router.refresh()
    } finally {
      setOcupado(null)
    }
  }

  const editar = (t: TanqueFila) => {
    setEditId(t.id)
    setForm({
      nombre: t.nombre,
      tipo: t.tipo,
      capacidad_litros: String(t.capacidad_litros),
      notas: t.notas ?? '',
    })
    setError('')
  }

  const capacidadTotal = tanques.filter(t => t.activo).reduce((a, t) => a + t.capacidad_litros, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 820 }}>
      <style>{`
        .tc-form { display: grid; grid-template-columns: 1.4fr 1fr 0.9fr; gap: 12px; }
        .tc-accion:hover { background: #f3f4f6; }
        @media (max-width: 720px) { .tc-form { grid-template-columns: 1fr; } }
      `}</style>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 13px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Alta / edicion */}
      <div style={{ background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 12, padding: '18px 20px' }}>
        <p style={{ margin: '0 0 14px', color: TINTA, fontSize: 13.5, fontWeight: 600 }}>
          {editId ? 'Editar tanque' : 'Nuevo tanque'}
        </p>

        <div className="tc-form" style={{ marginBottom: 12 }}>
          <label>
            <span style={labelBase}>Nombre</span>
            <input style={inputBase} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="FV1" maxLength={40} />
          </label>
          <label>
            <span style={labelBase}>Tipo</span>
            <select style={inputBase} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{TANQUE_TIPO_LABEL[t]}</option>)}
            </select>
          </label>
          <label>
            <span style={labelBase}>Capacidad (L)</span>
            <input style={inputBase} type="number" step="0.01" min="0.01" value={form.capacidad_litros} onChange={e => set('capacidad_litros', e.target.value)} placeholder="1000" />
          </label>
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={labelBase}>Notas</span>
          <input style={inputBase} value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Opcional" />
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={guardar}
            disabled={guardando || !valido}
            style={{ ...botonPrimario(acento), opacity: guardando || !valido ? 0.5 : 1, cursor: valido ? 'pointer' : 'not-allowed' }}
          >
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Agregar tanque'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm(VACIO) }} style={botonNeutro}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      {tanques.length === 0 ? (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 13, textAlign: 'center', padding: '28px 0' }}>
          No hay tanques dados de alta.
        </p>
      ) : (
        <div>
          <p style={{ margin: '0 0 10px', color: GRIS, fontSize: 12.5 }}>
            {tanques.filter(t => t.activo).length} activo
            {tanques.filter(t => t.activo).length === 1 ? '' : 's'} · {fmtLitros(capacidadTotal)} de capacidad
          </p>

          <div style={{ border: `1px solid ${BORDE}`, borderRadius: 11, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: PISTA }}>
                  {['Tanque', 'Tipo', 'Capacidad', 'Lotes', ''].map((h, i) => (
                    <th
                      key={h || i}
                      style={{
                        color: GRIS, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.06em', textAlign: i === 2 || i === 3 ? 'right' : 'left',
                        padding: '9px 13px',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tanques.map(t => {
                  const uso = usos[t.id] || { total: 0, vivos: 0 }
                  const trabajando = ocupado === t.id
                  return (
                    <tr key={t.id} style={{ borderTop: `1px solid ${BORDE}`, opacity: t.activo ? 1 : 0.55 }}>
                      <td style={{ padding: '10px 13px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: TINTA, fontWeight: 600 }}>
                          <Icono d={ICONOS.tanque} size={14} style={{ color: GRIS_SUAVE }} />
                          {t.nombre}
                          {!t.activo && (
                            <span style={{ color: GRIS_SUAVE, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Inactivo
                            </span>
                          )}
                        </span>
                        {t.notas && <p style={{ margin: '3px 0 0 21px', color: GRIS_SUAVE, fontSize: 11.5 }}>{t.notas}</p>}
                      </td>
                      <td style={{ padding: '10px 13px', color: TINTA_MEDIA }}>{TANQUE_TIPO_LABEL[t.tipo]}</td>
                      <td style={{ padding: '10px 13px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtLitros(t.capacidad_litros)}
                      </td>
                      <td style={{ padding: '10px 13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: uso.vivos > 0 ? TINTA_MEDIA : GRIS_SUAVE }}>
                        {uso.total === 0 ? '—' : uso.vivos > 0 ? `${uso.total} · ${uso.vivos} vivo${uso.vivos === 1 ? '' : 's'}` : uso.total}
                      </td>
                      <td style={{ padding: '10px 13px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => editar(t)} className="tc-accion" style={accionStyle}>Editar</button>
                        <button
                          onClick={() => accion(t.id, 'PATCH', { activo: !t.activo })}
                          disabled={trabajando}
                          className="tc-accion"
                          style={accionStyle}
                          title={uso.vivos > 0 && t.activo ? 'Tiene lotes vivos adentro' : undefined}
                        >
                          {t.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        {uso.total === 0 && (
                          // Solo si NINGUN lote lo referencia: con historial,
                          // borrarlo les quitaria el dato del tanque.
                          <button
                            onClick={() => accion(t.id, 'DELETE')}
                            disabled={trabajando}
                            className="tc-accion"
                            style={{ ...accionStyle, color: '#b91c1c' }}
                          >
                            Borrar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p style={{ margin: '10px 0 0', color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
            Un tanque con lotes en su historial se desactiva, no se borra:
            borrarlo les quitaría a esos lotes el dato de en qué vasija se
            hicieron.
          </p>
        </div>
      )}
    </div>
  )
}

const accionStyle = {
  background: 'none',
  border: 'none',
  borderRadius: 6,
  padding: '5px 9px',
  marginLeft: 2,
  fontSize: 12.5,
  fontWeight: 500,
  color: '#374151',
  cursor: 'pointer',
  fontFamily: 'inherit',
} as const

'use client'
import { useState } from 'react'
import { createClient } from '../../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'
import EditarPartidas from '../../EditarPartidas'
import { BotonEditarProductos } from '../../AccionEditarProductos'
import { folioDe } from '../../pedidos-ui'
import SwitchIva from '../../SwitchIva'
import CampoAjuste from '../../CampoAjuste'
import { guardarAjuste } from '../../guardar-ajuste'

const statusConfig: Record<string, string> = {
  pendiente: 'Pendiente', confirmado: 'Confirmado', enviado: 'En camino',
  entregado: 'Entregado', cancelado: 'Cancelado',
}

/**
 * Encabezado de seccion.
 *
 * Fuera del componente a proposito: declarado adentro, React lo ve como un
 * tipo distinto en cada render y remonta el nodo — el mismo problema que la
 * lista de precios tuvo con sus celdas, donde costaba el foco del input.
 */
function Section({ title }: { title: string }) {
  return (
    <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 12px', paddingBottom: 6, borderBottom: '1px solid #e5e7eb' }}>{title}</p>
  )
}

export default function EditPedidoClient({ pedido, vendedores, isSuperAdmin, puedeAjustar, totalAntesDeAjuste }: any) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [editandoProductos, setEditandoProductos] = useState(false)

  const [status, setStatus] = useState(pedido.status || 'pendiente')
  const [condicionesPago, setCondicionesPago] = useState(pedido.condiciones_pago || 'contado')
  const [vendedorId, setVendedorId] = useState(pedido.vendedor_id || '')
  const [descuentoTipo, setDescuentoTipo] = useState<'' | 'porcentaje' | 'monto'>(pedido.descuento_tipo || '')
  const [descuentoValor, setDescuentoValor] = useState(pedido.descuento_valor?.toString() || '')
  const [descuentoMotivo, setDescuentoMotivo] = useState(pedido.descuento_motivo || '')
  const [notas, setNotas] = useState(pedido.notas || '')
  const [notasInternas, setNotasInternas] = useState(pedido.notas_internas || '')
  const [fechaEntrega, setFechaEntrega] = useState(
    pedido.fecha_entrega ? new Date(pedido.fecha_entrega).toISOString().slice(0, 16) : ''
  )
  // Antes esto leia `created_at` y el valor nunca se mandaba en el PATCH: un
  // campo que parecia editable y descartaba lo que escribias. Ahora edita
  // `fecha_pedido`, que es la fecha de negocio.
  const [fechaPedido, setFechaPedido] = useState(
    pedido.fecha_pedido ? String(pedido.fecha_pedido).slice(0, 10) : ''
  )
  // El ajuste vive aqui y no dentro del bloque porque lo guarda el boton
  // Guardar de esta pagina. Tenerlo adentro con su propio boton fue el bug:
  // se capturaba el ajuste, se picaba el Guardar grande —que llama a
  // /actualizar, ruta que no sabe nada del ajuste— y se perdia con un 200.
  const [ajusteValor, setAjusteValor] = useState(pedido.ajuste ? String(pedido.ajuste) : '')
  const [ajusteMotivo, setAjusteMotivo] = useState(pedido.ajuste_motivo || '')
  const [errorGuardar, setErrorGuardar] = useState('')
  const [ordenCompra, setOrdenCompra] = useState(pedido.orden_compra || '')
  const [folioFactura, setFolioFactura] = useState(pedido.folio_factura || '')

  const handleSave = async () => {
    setSaving(true)
    setErrorGuardar('')
    // Los errores salen EN PANTALLA y no en un alert: un alert se cierra y no
    // deja rastro de que fue lo que no se guardo.
    if (descuentoTipo && !descuentoMotivo.trim()) {
      setErrorGuardar('El motivo del descuento es obligatorio.'); setSaving(false); return
    }
    const descVal = parseFloat(descuentoValor) || 0
    if (descuentoTipo === 'porcentaje' && (descVal < 0 || descVal > 100)) {
      setErrorGuardar('El porcentaje del descuento debe estar entre 0 y 100.'); setSaving(false); return
    }

    // ── El ajuste va PRIMERO, por su propia ruta ────────────
    //
    // Es la que valida el motivo, el 5%, el sobrepago y el total negativo, y
    // la que deja audit_log. Si falla se aborta aqui: guardar lo demas y
    // tirar el ajuste es exactamente el bug que esto arregla.
    const ajusteNum = Number(ajusteValor.replace(/[^\d.-]/g, '')) || 0
    const ajusteActual = Number(pedido.ajuste || 0)
    const motivoActual = (pedido.ajuste_motivo || '').trim()
    if (puedeAjustar && (ajusteNum !== ajusteActual || ajusteMotivo.trim() !== motivoActual)) {
      const r = await guardarAjuste(pedido.id, ajusteNum, ajusteMotivo.trim())
      if (!r.ok) { setErrorGuardar(r.error); setSaving(false); return }
    }

    const res = await fetch(`/api/admin/pedidos/${pedido.id}/actualizar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        condiciones_pago: condicionesPago,
        vendedor_id: vendedorId || null,
        descuento_tipo: descuentoTipo || null,
        descuento_valor: descuentoTipo ? descVal : null,
        descuento_motivo: descuentoTipo ? descuentoMotivo : null,
        notas: notas || null,
        notas_internas: notasInternas || null,
        fecha_entrega: fechaEntrega || null,
        fecha_pedido: fechaPedido || null,
        orden_compra: ordenCompra.trim() || null,
        folio_factura: folioFactura.trim() || null,
      }),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErrorGuardar(d.error || `No se pudo guardar el pedido (HTTP ${res.status}).`)
      setSaving(false)
      return
    }
    router.push('/admin/pedidos')
    router.refresh()
  }

  const inputStyle = { width: '100%', padding: '10px 13px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'system-ui' }
  const labelStyle = { color: '#6b7280', fontSize: 13, display: 'block' as const, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }

  return (
    <div style={{ maxWidth: 800, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <a href="/admin/pedidos" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Pedidos
        </a>
        <span style={{ color: '#2a2a2a' }}>/</span>
        <h1 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Editar pedido <span style={{ color: '#E8531D', fontFamily: 'monospace' }}>#{pedido.id.slice(-6).toUpperCase()}</span>
        </h1>
      </div>

      {/* Info cliente (read-only) */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, color: '#1a1a1a', fontSize: 14, fontWeight: 600 }}>{pedido.profiles?.full_name || '—'}</p>
            <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 12 }}>{pedido.profiles?.email}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, color: '#E8531D', fontSize: 20, fontWeight: 700 }}>${(pedido.total || 0).toLocaleString('es-MX')}</p>
            <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11 }}>{pedido.tipo_precio === 'taproom' ? 'Precio taproom' : 'Precio público'}</p>
          </div>
        </div>
      </div>

      {/* Productos */}
      <Section title="Productos del pedido" />
      {/* La regla mira el status GUARDADO, no el del selector de arriba: lo
          que decide es lo que el servidor va a ver, no lo que alguien dejo a
          medio cambiar en el formulario. */}
      <div style={{ marginBottom: 10 }}>
        <BotonEditarProductos
          pedido={{ id: pedido.id, status: pedido.status, cliente_id: pedido.cliente_id ?? null }}
          onEditar={() => setEditandoProductos(true)}
        />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['Producto', 'Estilo', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h, i) => (
                <th key={i} style={{ color: '#9ca3af', fontSize: 13, textAlign: 'left', padding: '8px 14px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pedido.pedido_items?.length > 0 ? pedido.pedido_items.map((item: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 14px', color: '#1a1a1a', fontSize: 13 }}>{item.productos?.nombre || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12 }}>{item.productos?.estilo || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>{item.cantidad}</td>
                <td style={{ padding: '10px 14px', color: '#374151', fontSize: 12 }}>${(item.precio_unitario || 0).toLocaleString('es-MX')}</td>
                <td style={{ padding: '10px 14px', color: '#1a1a1a', fontSize: 13, fontWeight: 600 }}>${((item.cantidad || 0) * (item.precio_unitario || 0)).toLocaleString('es-MX')}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} style={{ padding: '20px 14px', color: '#9ca3af', fontSize: 13 }}>Sin productos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status y pago */}
      <Section title="Status y condiciones" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
        <div>
          <label style={labelStyle}>Status de entrega</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Condiciones de pago</label>
          <select value={condicionesPago} onChange={e => setCondicionesPago(e.target.value)} style={inputStyle}>
            <option value="contado">Contado</option>
            <option value="15_dias">15 días</option>
            <option value="30_dias">30 días</option>
          </select>
        </div>
      </div>

      {/* Fechas */}
      {/* Descuento */}
      <Section title="Descuento" />
      <div style={{ display: 'flex', gap: 8, marginBottom: descuentoTipo ? 14 : 4 }}>
        {[{ key: '', label: 'Sin descuento' }, { key: 'porcentaje', label: 'Porcentaje' }, { key: 'monto', label: 'Monto fijo' }].map(t => (
          <button key={t.key} onClick={() => { setDescuentoTipo(t.key as any); if (!t.key) { setDescuentoValor(''); setDescuentoMotivo('') } }} style={{
            flex: 1, padding: '8px', background: descuentoTipo === t.key ? '#1e1e1e' : '#f9fafb',
            border: `1.5px solid ${descuentoTipo === t.key ? '#E8531D' : '#e5e7eb'}`,
            borderRadius: 7, cursor: 'pointer', color: descuentoTipo === t.key ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 500,
          }}>{t.label}</button>
        ))}
      </div>
      {descuentoTipo && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 4 }}>
          <div>
            <label style={labelStyle}>{descuentoTipo === 'porcentaje' ? '% (0-100)' : 'Monto'}</label>
            <input type="number" value={descuentoValor} onChange={e => setDescuentoValor(e.target.value)}
              min="0" max={descuentoTipo === 'porcentaje' ? '100' : undefined}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Motivo (obligatorio)</label>
            <input value={descuentoMotivo} onChange={e => setDescuentoMotivo(e.target.value)} placeholder="Volumen, cliente nuevo..."
              style={inputStyle} />
          </div>
        </div>
      )}

      {/* IVA.

          Se guarda SOLO, sin esperar al boton de abajo, porque va por su
          propia ruta: cambiar el IVA puede dejar el pedido sobrepagado y eso
          se pregunta antes de escribir. Meterlo en el PATCH general
          obligaria a repetir ahi esa confirmacion y el audit_log. */}
      <Section title="IVA" />
      <SwitchIva
        pedidoId={pedido.id}
        folio={folioDe(pedido.id)}
        status={pedido.status}
        partidas={(pedido.pedido_items || []).length}
        partidasConIva={(pedido.pedido_items || []).filter((i: { incluye_iva?: boolean }) => i.incluye_iva).length}
        envioConIva={!!pedido.envio_incluye_iva}
        conEnvio={Number(pedido.costo_envio || 0) > 0}
        ivaTasa={pedido.iva_tasa}
        canEdit
        onGuardado={() => router.refresh()}
      />

      {/* Ajuste.

          Como el IVA, se guarda SOLO y no con el boton de abajo: va por su
          propia ruta porque puede pedir dos confirmaciones —el 5% y el
          sobrepago— y meterlo en el PATCH general obligaria a repetirlas ahi
          junto con el audit_log. */}
      {/* `totalAntesDeAjuste` es null en un pedido cancelado, que la vista
          excluye: sin el total autoritativo no se puede cuadrar nada, y
          calcularlo a mano aqui daria un numero sin el IVA. */}
      {puedeAjustar && totalAntesDeAjuste !== null && (
        <>
          <Section title="Ajuste" />
          <CampoAjuste
            pedidoId={pedido.id}
            folio={folioDe(pedido.id)}
            status={pedido.status}
            ajuste={Number(pedido.ajuste || 0)}
            motivo={pedido.ajuste_motivo ?? null}
            totalAntes={Number(totalAntesDeAjuste)}
            canEdit
            onGuardado={() => router.refresh()}
            // Sin boton propio: lo guarda el Guardar de esta pagina, que es
            // el que el usuario pica. Dos botones costaron un ajuste perdido.
            conBoton={false}
            valor={ajusteValor}
            onValor={setAjusteValor}
            motivoTexto={ajusteMotivo}
            onMotivoTexto={setAjusteMotivo}
          />
        </>
      )}

      <Section title="Fechas" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
        <div>
          <label style={labelStyle}>Fecha del pedido</label>
          <input type="datetime-local" value={fechaPedido} onChange={e => setFechaPedido(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} disabled />
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>Solo lectura</p>
        </div>
        <div>
          <label style={labelStyle}>Fecha de entrega prometida</label>
          <input type="datetime-local" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
        </div>
      </div>

      {/* Vendedor */}
      <Section title="Vendedor" />
      <div style={{ marginBottom: 4 }}>
        <label style={labelStyle}>Vendedor asignado</label>
        <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} style={inputStyle}>
          <option value="">— Sin vendedor —</option>
          {vendedores.map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      </div>

      {/* Notas */}
      <Section title="Notas" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>Notas del cliente</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Instrucciones de entrega..."
            style={{ ...inputStyle, resize: 'none' as const }} />
        </div>
        <div>
          <label style={labelStyle}>Notas internas</label>
          <textarea value={notasInternas} onChange={e => setNotasInternas(e.target.value)} rows={3} placeholder="Solo visible para el equipo..."
            style={{ ...inputStyle, resize: 'none' as const }} />
        </div>
      </div>

      {/* El error del servidor, EN PANTALLA y pegado al boton que lo produjo.
          Antes esto era un alert: se cerraba y no quedaba rastro de que fue lo
          que no se guardo. */}
      {errorGuardar && (
        <div
          role="alert"
          style={{
            marginBottom: 12, padding: '10px 13px', background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13.5,
          }}
        >
          {errorGuardar}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10 }}>
        <a href="/admin/pedidos" style={{ padding: '11px 20px', background: '#f3f4f6', color: '#6b7280', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>Cancelar</a>
        <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '11px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#1a1a1a', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {editandoProductos && (
        <EditarPartidas
          pedido={{
            id: pedido.id,
            folio: folioDe(pedido.id),
            cliente: pedido.profiles?.full_name || pedido.profiles?.email || 'Cliente',
            cliente_id: pedido.cliente_id ?? null,
            status: pedido.status,
          }}
          onCerrar={() => setEditandoProductos(false)}
          onGuardado={() => router.refresh()}
        />
      )}
    </div>
  )
}

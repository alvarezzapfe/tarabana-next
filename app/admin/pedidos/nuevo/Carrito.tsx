'use client'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type Partida, litrosDePartida, litrosTotalesDe, moneda, tabular,
} from './pos-ui'
import { formatLitros } from '../../../../src/lib/unidades'
import { desglosar, etiquetaTasa } from '../../../../src/lib/iva'

/**
 * Carrito de la captura.
 *
 * Muestra el desglose completo: subtotal, descuento, envio, IVA y total. La
 * pantalla anterior calculaba el descuento y luego hacia `total = subtotal`,
 * asi que ensenaba el subtotal etiquetado como total. Aqui el total sale de
 * `desglosar`, que es la misma aritmetica —redondeo del IVA incluido— que
 * despues cobra la vista `pedidos_saldo`. Si las dos no coincidieran al
 * centavo, el pedido nunca llegaria a 'pagado'.
 *
 * Los precios de lista son SIN IVA. El switch decide si se cobra, y arranca
 * prendido para los clientes con `requiere_factura`.
 */

export type Descuento = {
  tipo: '' | 'porcentaje' | 'monto'
  valor: string
  motivo: string
}

type Props = {
  partidas: Partida[]
  /** Stock disponible por clave de celda, para marcar los excesos. */
  stockPorClave: Record<string, number>
  onCantidad: (partida: Partida, cantidad: number) => void
  onQuitar: (partida: Partida) => void

  puedeDescuento: boolean
  descuento: Descuento
  onDescuento: (d: Descuento) => void
  costoEnvio: string
  onCostoEnvio: (v: string) => void

  incluyeIva: boolean
  onIncluyeIva: (v: boolean) => void
  /** Tasa vigente, la que se guardara en el pedido. */
  ivaTasa: number
  /**
   * Quien puede mover el switch. El vendedor no: prenderlo o apagarlo cambia
   * en 16% lo que paga el cliente, igual que un descuento, y por eso sigue el
   * mismo criterio. Apagado sigue viendo el renglon, para saber que se cobra.
   */
  puedeIva: boolean

  /** Motivos por los que no se puede confirmar. Vacio = se puede. */
  bloqueos: string[]
  enviando: boolean
  onConfirmar: () => void
  error?: string
  /**
   * Texto del boton. Por default el de crear un pedido; la pantalla de editar
   * partidas lo cambia, porque ahi no se esta creando nada.
   */
  etiquetaConfirmar?: string
  etiquetaEnviando?: string
}

export default function Carrito(props: Props) {
  const {
    partidas, stockPorClave, onCantidad, onQuitar,
    puedeDescuento, descuento, onDescuento, costoEnvio, onCostoEnvio,
    incluyeIva, onIncluyeIva, ivaTasa, puedeIva,
    bloqueos, enviando, onConfirmar, error,
    etiquetaConfirmar = 'Confirmar pedido', etiquetaEnviando = 'Creando…',
  } = props

  const subtotal = partidas.reduce((s, p) => s + p.precio * p.cantidad, 0)
  const envio = Math.max(0, Number(costoEnvio.replace(/[^\d.]/g, '')) || 0)
  const descVal = Math.max(0, Number(descuento.valor.replace(/[^\d.]/g, '')) || 0)
  const descuentoMonto = descuento.tipo === 'porcentaje'
    ? Math.round(subtotal * descVal) / 100
    : descuento.tipo === 'monto' ? descVal : 0
  // El descuento se tope al subtotal, como antes: un descuento mayor que la
  // mercancia no puede volver negativa la base ni regalar envio.
  const { iva, total } = desglosar({
    subtotal,
    descuento: Math.min(descuentoMonto, subtotal),
    envio,
    incluyeIva,
    tasa: ivaTasa,
  })
  const litros = litrosTotalesDe(partidas)

  const input: React.CSSProperties = {
    width: '100%', padding: '7px 9px', background: '#fff',
    border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA,
    fontSize: 12.5, outline: 'none', boxSizing: 'border-box', ...tabular,
  }
  const etiqueta: React.CSSProperties = {
    display: 'block', color: GRIS, fontSize: 10.5, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Partidas ──────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
          <p style={{ margin: 0, color: TINTA, fontSize: 13.5, fontWeight: 600 }}>Carrito</p>
          <span style={{ marginLeft: 'auto', color: GRIS_SUAVE, fontSize: 11.5 }}>
            {partidas.length} {partidas.length === 1 ? 'partida' : 'partidas'}
          </span>
        </div>

        {partidas.length === 0 ? (
          <p style={{ margin: 0, padding: '18px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 12.5 }}>
            Captura cantidades en la matriz.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {partidas.map(p => {
              const disponible = stockPorClave[p.producto_id]
              // El mix no tiene una columna de stock propia: se valida por
              // estilo al crear, asi que aqui no se marca.
              const excede = p.unidad !== 'mix24' && disponible !== undefined && p.cantidad > disponible
              return (
                <div
                  key={p.producto_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 0', borderTop: `1px solid ${PISTA}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      title={p.nombre}
                      style={{
                        display: 'block', color: excede ? ROJO : TINTA_MEDIA, fontSize: 12.5,
                        fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {p.nombre}
                    </span>
                    <span style={{ ...tabular, display: 'block', color: excede ? ROJO : GRIS_SUAVE, fontSize: 10.5 }}>
                      {excede
                        ? `Solo quedan ${disponible}`
                        : `${moneda(p.precio)} c/u · ${formatLitros(litrosDePartida(p))}`}
                    </span>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    value={String(p.cantidad)}
                    onChange={e => {
                      const limpio = e.target.value.replace(/\D/g, '').slice(0, 5)
                      onCantidad(p, limpio === '' ? 0 : Number(limpio))
                    }}
                    style={{
                      ...input, width: 46, flexShrink: 0, textAlign: 'center',
                      borderColor: excede ? ROJO : BORDE, color: excede ? ROJO : TINTA,
                      fontWeight: 600,
                    }}
                  />

                  <span style={{ ...tabular, width: 72, textAlign: 'right', color: TINTA, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
                    {moneda(p.precio * p.cantidad)}
                  </span>

                  <button
                    type="button"
                    onClick={() => onQuitar(p)}
                    title="Quitar"
                    style={{ flexShrink: 0, width: 22, height: 22, padding: 0, background: 'none', border: 'none', color: GRIS_SUAVE, fontSize: 15, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Descuento y envio ─────────────────────────────── */}
      {puedeDescuento && partidas.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={etiqueta}>Descuento</label>
              <select
                value={descuento.tipo}
                onChange={e => onDescuento({ ...descuento, tipo: e.target.value as Descuento['tipo'] })}
                style={{ ...input, cursor: 'pointer' }}
              >
                <option value="">Sin descuento</option>
                <option value="porcentaje">Porcentaje</option>
                <option value="monto">Monto</option>
              </select>
            </div>
            {descuento.tipo && (
              <div style={{ width: 86 }}>
                <label style={etiqueta}>{descuento.tipo === 'porcentaje' ? '%' : '$'}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={descuento.valor}
                  onChange={e => onDescuento({ ...descuento, valor: e.target.value })}
                  placeholder="0"
                  style={input}
                />
              </div>
            )}
            <div style={{ width: 92 }}>
              <label style={etiqueta}>Envío</label>
              <input
                type="text"
                inputMode="decimal"
                value={costoEnvio}
                onChange={e => onCostoEnvio(e.target.value)}
                placeholder="0"
                style={input}
              />
            </div>
          </div>

          {descuento.tipo && (
            <div>
              <label style={etiqueta}>Motivo del descuento</label>
              <input
                value={descuento.motivo}
                onChange={e => onDescuento({ ...descuento, motivo: e.target.value })}
                placeholder="Obligatorio"
                style={{ ...input, borderColor: descuento.motivo.trim() ? BORDE : ROJO }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── IVA ───────────────────────────────────────────── */}
      {partidas.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 12 }}>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              cursor: puedeIva ? 'pointer' : 'default',
            }}
          >
            <input
              type="checkbox"
              checked={incluyeIva}
              disabled={!puedeIva}
              onChange={e => onIncluyeIva(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: ACENTO, cursor: puedeIva ? 'pointer' : 'default', margin: 0 }}
            />
            <span style={{ color: puedeIva ? TINTA : GRIS, fontSize: 12.5, fontWeight: 600 }}>
              Incluir IVA ({etiquetaTasa(ivaTasa)})
            </span>
          </label>
          <p style={{ margin: '5px 0 0 24px', color: GRIS_SUAVE, fontSize: 11 }}>
            Los precios de lista son sin IVA.
          </p>
        </div>
      )}

      {/* ── Totales ───────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Renglon label="Subtotal" valor={moneda(subtotal)} />
        {descuentoMonto > 0 && (
          <Renglon
            label={`Descuento${descuento.tipo === 'porcentaje' ? ` (${descVal}%)` : ''}`}
            valor={`−${moneda(descuentoMonto)}`}
            color={ACENTO}
          />
        )}
        {envio > 0 && <Renglon label="Envío" valor={moneda(envio)} />}
        {incluyeIva && <Renglon label={`IVA (${etiquetaTasa(ivaTasa)})`} valor={moneda(iva)} />}
        <Renglon label="Litros" valor={formatLitros(litros)} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingTop: 8, marginTop: 3, borderTop: `1px solid ${PISTA}` }}>
          <span style={{ color: TINTA, fontSize: 13, fontWeight: 600 }}>Total</span>
          <span style={{ ...tabular, marginLeft: 'auto', color: TINTA, fontSize: 21, fontWeight: 700 }}>
            {moneda(total)}
          </span>
        </div>
      </div>

      {/* ── Confirmar ─────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={enviando || bloqueos.length > 0}
          style={{
            width: '100%', padding: '12px', borderRadius: 9, border: 'none',
            background: bloqueos.length > 0 ? '#e5e7eb' : ACENTO,
            color: bloqueos.length > 0 ? GRIS_SUAVE : '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: enviando || bloqueos.length ? 'default' : 'pointer',
            opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? etiquetaEnviando : etiquetaConfirmar}
        </button>

        {/* El motivo escrito, no solo el boton apagado. */}
        {bloqueos.length > 0 && (
          <ul style={{ margin: '9px 0 0', padding: '0 0 0 16px', color: GRIS, fontSize: 11.5, lineHeight: 1.6 }}>
            {bloqueos.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}

        {error && (
          <p style={{ margin: '10px 0 0', padding: '9px 11px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

function Renglon({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ color: GRIS, fontSize: 12 }}>{label}</span>
      <span style={{ ...tabular, marginLeft: 'auto', color: color || TINTA_MEDIA, fontSize: 12.5, fontWeight: 600 }}>
        {valor}
      </span>
    </div>
  )
}

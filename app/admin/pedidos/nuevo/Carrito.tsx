'use client'
import { useState } from 'react'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type Partida, estadoIva, gravableDe, litrosDePartida, litrosTotalesDe,
  moneda, monedaExacta, monedaFirmada, tabular,
} from './pos-ui'
import { formatLitros } from '../../../../src/lib/unidades'
import { desglosar, etiquetaTasa, ivaDe } from '../../../../src/lib/iva'
import { TOLERANCIA_AJUSTE, ajusteParaCuadrar, excedeTolerancia, motivoRechazo } from '../../../../src/lib/ajuste'
import ChipIva from './ChipIva'

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
 * Los precios de lista son SIN IVA. El IVA se decide POR PARTIDA: cada
 * renglon tiene su casilla, el switch de arriba las prende todas de un golpe
 * —y se pinta indeterminado cuando hay mezcla— y el flete decide aparte.
 * Todos arrancan segun el `requiere_factura` del cliente.
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

  /** Marca o desmarca una partida. */
  onIvaPartida: (partida: Partida, valor: boolean) => void
  /** Todas de un golpe, desde el switch de arriba. */
  onIvaTodas: (valor: boolean) => void
  envioConIva: boolean
  onEnvioConIva: (valor: boolean) => void
  /** Tasa vigente, la que se guardara en el pedido. */
  ivaTasa: number

  /** Ajuste para cuadrar contra la OC. Texto, como el envio y el descuento. */
  ajuste: string
  onAjuste: (v: string) => void
  ajusteMotivo: string
  onAjusteMotivo: (v: string) => void
  /**
   * Quien puede mover los switches. El vendedor no: gravar o desgravar cambia
   * en 16% lo que paga el cliente, igual que un descuento, y por eso sigue el
   * mismo criterio. Apagado sigue viendo los renglones, para saber que se
   * cobra.
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
  // El total de la OC es un auxiliar de captura: no viaja al servidor ni le
  // importa a nadie mas, asi que vive aqui y no en la pagina.
  const [oc, setOc] = useState('')

  const {
    partidas, stockPorClave, onCantidad, onQuitar,
    puedeDescuento, descuento, onDescuento, costoEnvio, onCostoEnvio,
    onIvaPartida, onIvaTodas, envioConIva, onEnvioConIva, ivaTasa, puedeIva,
    ajuste, onAjuste, ajusteMotivo, onAjusteMotivo,
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
  const ajusteNum = Number(ajuste.replace(/[^\d.-]/g, '')) || 0
  const { baseGravable, iva, total } = desglosar({
    subtotal,
    gravable: gravableDe(partidas),
    descuento: Math.min(descuentoMonto, subtotal),
    envio,
    envioConIva,
    tasa: ivaTasa,
    ajuste: ajusteNum,
  })
  // Lo que se cobraria sin ajuste: contra esto se mide el 5% y contra esto se
  // cuadra la OC.
  const totalAntes = total - ajusteNum
  const rechazoAjuste = motivoRechazo({ ajuste: ajusteNum, motivo: ajusteMotivo, totalAntes })
  const estado = estadoIva(partidas)
  const litros = litrosTotalesDe(partidas)

  // Los anchos viven en constantes porque el encabezado y los renglones
  // tienen que quedar alineados: si se escriben dos veces, la columna "IVA"
  // deja de caer sobre los chips en cuanto alguien toca uno de los dos.
  const ANCHO_CANT = 42
  const ANCHO_IVA = 66
  const ANCHO_IMPORTE = 74
  const ANCHO_QUITAR = 22
  const HUECO = 6

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

        {/* ── IVA en todo ───────────────────────────────────
            Arriba de la lista y no abajo: es el control que manda sobre todos
            los de abajo, y debajo de la lista se leia como un total mas. */}
        {partidas.length > 0 && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 9px', marginBottom: 8,
              background: '#fafafa', border: `1px solid ${BORDE}`, borderRadius: 8,
            }}
          >
            <span style={{ color: TINTA_MEDIA, fontSize: 12, fontWeight: 600 }}>IVA en todo</span>
            {estado === 'mezcla' && (
              <span style={{ color: GRIS_SUAVE, fontSize: 10.5 }}>
                {partidas.filter(p => p.incluyeIva).length} de {partidas.length}
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>
              <ChipIva
                puesto={estado === 'todas'}
                indeterminado={estado === 'mezcla'}
                tasa={ivaTasa}
                deshabilitado={!puedeIva}
                onCambio={onIvaTodas}
                etiquetaApagado="Sin IVA"
                titulo={
                  estado === 'mezcla'
                    ? 'Unas partidas van gravadas y otras no. Prender cobra IVA en todas.'
                    : estado === 'todas' ? 'Quitar el IVA de todas' : 'Cobrar IVA en todas'
                }
              />
            </span>
          </div>
        )}

        {partidas.length === 0 ? (
          <p style={{ margin: 0, padding: '18px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 12.5 }}>
            Captura cantidades en la matriz.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Encabezado: lo unico que pide es que "IVA" caiga sobre los
                chips. Sin el, la columna de chips no se lee como columna. */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: HUECO, paddingBottom: 5,
                color: GRIS_SUAVE, fontSize: 9.5, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>Producto</span>
              <span style={{ width: ANCHO_CANT, textAlign: 'center', flexShrink: 0 }}>Cant.</span>
              <span style={{ width: ANCHO_IVA, textAlign: 'center', flexShrink: 0 }}>IVA</span>
              <span style={{ width: ANCHO_IMPORTE, textAlign: 'right', flexShrink: 0 }}>Importe</span>
              <span style={{ width: ANCHO_QUITAR, flexShrink: 0 }} />
            </div>

            {partidas.map(p => {
              const disponible = stockPorClave[p.producto_id]
              // El mix no tiene una columna de stock propia: se valida por
              // estilo al crear, asi que aqui no se marca.
              const excede = p.unidad !== 'mix24' && disponible !== undefined && p.cantidad > disponible
              return (
                <div
                  key={p.producto_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: HUECO,
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
                      ...input, width: ANCHO_CANT, flexShrink: 0, textAlign: 'center',
                      borderColor: excede ? ROJO : BORDE, color: excede ? ROJO : TINTA,
                      fontWeight: 600,
                    }}
                  />

                  {/* El chip va a la derecha de la cantidad, en su columna:
                      "esta partida lleva IVA" se contesta leyendo el renglon
                      de izquierda a derecha, como se lee el importe. */}
                  <span style={{ width: ANCHO_IVA, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <ChipIva
                      puesto={!!p.incluyeIva}
                      tasa={ivaTasa}
                      deshabilitado={!puedeIva}
                      onCambio={valor => onIvaPartida(p, valor)}
                      titulo={
                        puedeIva
                          ? (p.incluyeIva ? `Quitar el IVA de ${p.nombre}` : `Cobrar IVA en ${p.nombre}`)
                          : 'Solo admin cambia el IVA'
                      }
                    />
                  </span>

                  <span style={{ width: ANCHO_IMPORTE, textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ ...tabular, display: 'block', color: TINTA, fontSize: 12.5, fontWeight: 600 }}>
                      {moneda(p.precio * p.cantidad)}
                    </span>
                    {/* El IVA de ESTE renglon. Sin esto, el total de abajo
                        trae un impuesto que no se puede rastrear a ninguna
                        linea — y con mezcla es justo lo que uno quiere ver. */}
                    {p.incluyeIva && (
                      <span style={{ ...tabular, display: 'block', color: ACENTO, fontSize: 10, fontWeight: 600 }}>
                        + {monedaExacta(ivaDe(p.precio * p.cantidad, ivaTasa))} IVA
                      </span>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => onQuitar(p)}
                    title="Quitar"
                    style={{ flexShrink: 0, width: ANCHO_QUITAR, height: 22, padding: 0, background: 'none', border: 'none', color: GRIS_SUAVE, fontSize: 15, cursor: 'pointer', lineHeight: 1 }}
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
              {/* El mismo chip, pegado al campo que grava: el flete decide
                  aparte de la mercancia, y un pedido puede llevar producto
                  gravado con flete exento. */}
              {envio > 0 && (
                <span style={{ display: 'block', marginTop: 5 }}>
                  <ChipIva
                    puesto={envioConIva}
                    tasa={ivaTasa}
                    deshabilitado={!puedeIva}
                    onCambio={onEnvioConIva}
                    titulo={envioConIva ? 'Quitar el IVA del envío' : 'Cobrar IVA en el envío'}
                  />
                </span>
              )}
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

      {/* ── Ajuste ────────────────────────────────────────
          Despues del IVA porque entra despues del IVA: no mueve la base
          gravable, y por eso es un ajuste y no un descuento. */}
      {puedeDescuento && partidas.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: TINTA_MEDIA, fontSize: 12, fontWeight: 600 }}>Ajuste</span>
            <span style={{ marginLeft: 'auto', ...tabular, color: GRIS_SUAVE, fontSize: 10.5 }}>
              sin ajuste: {monedaExacta(totalAntes)}
            </span>
          </div>

          {/* Cuadrar contra la OC: la operacion real es "cuadrame en 10,000",
              no "ponle 0.27". Restar a mano es pedirle al usuario la
              aritmetica que esta pantalla ya tiene. */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={etiqueta}>Total de la OC</label>
              <input
                value={oc}
                onChange={e => setOc(e.target.value)}
                inputMode="decimal"
                placeholder="10,000.00"
                style={{ ...input, ...tabular }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const meta = Number(oc.replace(/[^\d.-]/g, ''))
                if (!Number.isFinite(meta)) return
                const calculado = ajusteParaCuadrar(meta, totalAntes)
                onAjuste(calculado === 0 ? '' : String(calculado))
              }}
              disabled={!oc.trim()}
              style={{
                padding: '7px 11px', background: '#fff', border: `1px solid ${BORDE}`,
                borderRadius: 7, color: oc.trim() ? TINTA_MEDIA : GRIS_SUAVE,
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                cursor: oc.trim() ? 'pointer' : 'default',
              }}
            >
              Cuadrar
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 104 }}>
              <label style={etiqueta}>Ajuste $</label>
              <input
                value={ajuste}
                onChange={e => {
                  const v = e.target.value.replace(/[^\d.-]/g, '')
                  const negativo = v.startsWith('-')
                  onAjuste((negativo ? '-' : '') + v.replace(/-/g, ''))
                }}
                inputMode="decimal"
                placeholder="0.00"
                style={{ ...input, ...tabular, color: ajusteNum < 0 ? ROJO : ajusteNum > 0 ? ACENTO : TINTA }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={etiqueta}>
                Motivo {ajusteNum !== 0 && <span style={{ color: ROJO }}>*</span>}
              </label>
              <input
                value={ajusteMotivo}
                onChange={e => onAjusteMotivo(e.target.value)}
                placeholder="Redondeo OC 4471"
                style={{ ...input, borderColor: ajusteNum !== 0 && !ajusteMotivo.trim() ? ROJO : BORDE }}
              />
            </div>
          </div>

          {ajusteNum !== 0 && !rechazoAjuste && excedeTolerancia(ajusteNum, totalAntes) && (
            <p style={{ margin: 0, color: ACENTO, fontSize: 11 }}>
              Pasa del {TOLERANCIA_AJUSTE * 100}% del total; se te va a pedir confirmación.
            </p>
          )}
          {rechazoAjuste && <p style={{ margin: 0, color: ROJO, fontSize: 11.5 }}>{rechazoAjuste}</p>}
        </div>
      )}

      {/* ── Totales ───────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {partidas.length > 0 && (
          <p style={{ margin: '0 0 3px', color: GRIS_SUAVE, fontSize: 10.5 }}>
            Los precios de lista son sin IVA.
          </p>
        )}
        {/* Con CENTAVOS en todo el desglose: `moneda` redondea a pesos, y
            aqui es donde el usuario cuadra contra una orden de compra. */}
        <Renglon label="Subtotal" valor={monedaExacta(subtotal)} />
        {descuentoMonto > 0 && (
          <Renglon
            label={`Descuento${descuento.tipo === 'porcentaje' ? ` (${descVal}%)` : ''}`}
            valor={`−${monedaExacta(descuentoMonto)}`}
            color={ACENTO}
          />
        )}
        {envio > 0 && <Renglon label="Envío" valor={monedaExacta(envio)} />}
        {/* La base gravable solo aparece cuando hay IVA: en un pedido
            exento seria un renglon en cero invitando a preguntar por que. */}
        {baseGravable > 0 && (
          <>
            <Renglon label="Base gravable" valor={monedaExacta(baseGravable)} />
            <Renglon label={`IVA (${etiquetaTasa(ivaTasa)})`} valor={monedaExacta(iva)} />
          </>
        )}
        {ajusteNum !== 0 && (
          <Renglon label="Ajuste" valor={monedaFirmada(ajusteNum)} color={ACENTO} />
        )}
        <Renglon label="Litros" valor={formatLitros(litros)} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingTop: 8, marginTop: 3, borderTop: `1px solid ${PISTA}` }}>
          <span style={{ color: TINTA, fontSize: 13, fontWeight: 600 }}>Total</span>
          <span style={{ ...tabular, marginLeft: 'auto', color: TINTA, fontSize: 21, fontWeight: 700 }}>
            {monedaExacta(total)}
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

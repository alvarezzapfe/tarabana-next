import QRCode from 'qrcode'
import BotonImprimir from './BotonImprimir'
import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { BORDE, GRIS, GRIS_SUAVE, TINTA } from '../dash-ui'
import { TANQUE_TIPO_LABEL, type TanqueFila } from '../produccion/produccion-ui'

/**
 * Hoja imprimible con un QR por tanque, para pegar en la vasija.
 *
 * ── Por que el SVG se genera en el servidor ──
 *
 * `qrcode` corre aqui y el QR sale como `<svg>` inline dentro del HTML. Eso
 * significa: cero JavaScript de cliente, cero llamadas a un servicio externo,
 * y —lo que importa al imprimir— nada que pueda fallar por red justo cuando
 * alguien le dio a Imprimir. Un `<img src="https://api.algo/qr?...">` deja la
 * hoja en blanco si ese servicio esta caido.
 *
 * ── El bloque de impresion ──
 *
 * Copiado de app/admin/reporte/reporte-ui.ts:213. Una page no puede salirse
 * del layout de su segmento, asi que el chrome del admin se apaga desde el
 * CSS de la propia pagina: `aside` es el sidebar y `main` su contenedor, y
 * `.no-print` cubre la barra movil con la hamburguesa y los botones.
 */

/** La URL que lleva el QR. Por NOMBRE: el QR sale chico y se verifica a ojo. */
function urlDe(nombre: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tarabana.mx'
  return `${base}/admin/produccion/t/${encodeURIComponent(nombre)}`
}

const CSS = `
  .qr-barra { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; }
  .qr-hoja {
    background: #fff; border: 1px solid ${BORDE}; border-radius: 12px;
    padding: 22px;
  }
  .qr-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  }
  .qr-celda {
    border: 1px solid ${BORDE}; border-radius: 10px; padding: 14px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    break-inside: avoid;
  }
  .qr-celda svg { width: 100%; height: auto; max-width: 150px; display: block; }
  @media screen and (max-width: 860px) {
    .qr-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media print {
    @page { size: letter; margin: 14mm }

    aside, .no-print { display: none !important }
    main {
      margin-left: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      min-height: 0 !important;
    }
    html, body { background: #fff !important }

    .qr-hoja { border: none; border-radius: 0; padding: 0 }
    .qr-grid { grid-template-columns: repeat(3, 1fr); gap: 10px }
    .qr-celda { border: 1px solid #999 }
    /* Que el negro del QR salga negro y no un gris de ahorro de tinta: un QR
       con poco contraste no escanea. */
    .qr-celda, .qr-celda * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
  }
`

export default async function TanquesQR() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('tanques')
    .select('id, nombre, tipo, capacidad_litros, activo, notas')
    .eq('activo', true)
    .order('nombre')

  const tanques = (data || []) as TanqueFila[]

  // `margin: 0` en el QR: el margen blanco lo da el padding de la celda, y el
  // que mete la libreria por default desperdicia la mitad del cuadro impreso.
  const qrs = await Promise.all(
    tanques.map(async t => ({
      t,
      svg: await QRCode.toString(urlDe(t.nombre), {
        type: 'svg', margin: 0, errorCorrectionLevel: 'M',
      }),
    }))
  )

  if (tanques.length === 0) {
    return (
      <p style={{ color: GRIS_SUAVE, fontSize: 13, padding: '28px 0', textAlign: 'center' }}>
        No hay tanques activos que imprimir.
      </p>
    )
  }

  return (
    <>
      <style>{CSS}</style>

      <div className="qr-barra no-print">
        <BotonImprimir />
        <span style={{ color: GRIS, fontSize: 12.5 }}>
          {tanques.length} tanque{tanques.length === 1 ? '' : 's'} activo
          {tanques.length === 1 ? '' : 's'}. Cada QR abre la captura de lectura
          del lote que esté en ese tanque.
        </span>
      </div>

      <div className="qr-hoja">
        <div className="qr-grid">
          {qrs.map(({ t, svg }) => (
            <div key={t.id} className="qr-celda">
              {/* El SVG viene de qrcode, no de entrada de usuario. */}
              <div dangerouslySetInnerHTML={{ __html: svg }} />
              <p style={{ margin: 0, color: TINTA, fontSize: 30, fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1 }}>
                {t.nombre}
              </p>
              <p style={{ margin: 0, color: GRIS, fontSize: 11 }}>
                {TANQUE_TIPO_LABEL[t.tipo]} · {t.capacidad_litros} L
              </p>
            </div>
          ))}
        </div>

        <p style={{ margin: '18px 0 0', color: GRIS_SUAVE, fontSize: 10.5, lineHeight: 1.5 }}>
          Si renombras un tanque, su QR impreso deja de resolver y hay que
          reimprimir esta hoja.
        </p>
      </div>
    </>
  )
}


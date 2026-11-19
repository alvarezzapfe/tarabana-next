import Link from 'next/link'
import { contextoAdmin } from '../../../../../src/lib/admin-contexto'
import { canManageInventory, isStaffSinVentas } from '../../../../../src/lib/roles'
import { etiquetaFecha } from '../../../../../src/lib/fechas'
import { esTerminal, fmtDias, fmtGravedad } from '../../../../../src/lib/produccion'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, TINTA, TINTA_MEDIA } from '../../../dash-ui'
import { etiquetaEtapa, type LoteFila } from '../../produccion-ui'
import CapturaRapida from './CapturaRapida'

/**
 * Captura por QR, pegado al tanque.
 *
 * El QR impreso lleva `/admin/produccion/t/FV3`. Esta pagina resuelve el
 * tanque por NOMBRE o por UUID: el nombre hace el QR chico y la URL legible
 * —se puede verificar a ojo que el QR pegado en FV3 sea el de FV3— y aceptar
 * tambien el uuid cubre el caso de un tanque renombrado sin tener que
 * reimprimir la hoja.
 *
 * La pantalla hace UNA cosa: capturar una lectura del lote que ocupa ese
 * tanque. Dos toques desde el escaneo — teclear el numero (el campo ya tiene
 * el foco y el teclado numerico) y Guardar.
 */

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function TanquePage({ params }: { params: Promise<{ tanque: string }> }) {
  const { tanque: clave } = await params
  const { supabase, role } = await contextoAdmin()

  if (!isStaffSinVentas(role)) {
    return <p style={{ color: GRIS, fontSize: 14 }}>Sin acceso a esta sección.</p>
  }

  const decodificada = decodeURIComponent(clave)

  // Por id si parece uuid, por nombre si no. El unique de `tanques` es sobre
  // lower(nombre), asi que la busqueda por nombre va en minusculas.
  const q = supabase.from('tanques').select('id, nombre, tipo, capacidad_litros, activo')
  const { data: tanques } = ES_UUID.test(decodificada)
    ? await q.eq('id', decodificada)
    : await q.ilike('nombre', decodificada)

  const tanque = tanques?.[0]

  if (!tanque) {
    return (
      <Marco titulo="Tanque no encontrado">
        <p style={{ margin: 0, color: GRIS, fontSize: 14, lineHeight: 1.6 }}>
          No hay un tanque llamado <strong>{decodificada}</strong>. Puede que lo
          hayan renombrado después de imprimir la hoja de QRs.
        </p>
        <Link href="/admin/produccion?tab=tanques" style={enlace}>Ver todos los tanques</Link>
      </Marco>
    )
  }

  const { data: filas } = await supabase
    .from('lotes_vista')
    .select('*')
    .eq('tanque_id', tanque.id)
    .order('fecha_coccion', { ascending: false, nullsFirst: false })

  const vivos = ((filas || []) as LoteFila[]).filter(l => !esTerminal(l.etapa))

  if (vivos.length === 0) {
    return (
      <Marco titulo={tanque.nombre} subtitulo={`${tanque.capacidad_litros} L · libre`}>
        <p style={{ margin: 0, color: GRIS, fontSize: 14, lineHeight: 1.6 }}>
          Este tanque no tiene ningún lote adentro, así que no hay nada que
          medir.
        </p>
        <Link href="/admin/produccion" style={enlace}>Ir al tablero</Link>
      </Marco>
    )
  }

  return (
    <Marco
      titulo={tanque.nombre}
      subtitulo={`${tanque.capacidad_litros} L${vivos.length > 1 ? ` · ${vivos.length} lotes` : ''}`}
    >
      {vivos.length > 1 && (
        // No se elige por el sistema: dos lotes vivos en un tanque es un error
        // de captura, y adivinar cual medir lo empeoraria.
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 13px', fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 }}>
          Este tanque tiene {vivos.length} lotes vivos asignados. Elige a cuál
          le estás midiendo, y revisa la asignación cuando puedas.
        </div>
      )}

      {vivos.map(l => (
        <div key={l.id} style={{ border: `1px solid ${BORDE}`, borderRadius: 11, padding: '14px 15px', marginBottom: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, color: TINTA, fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {l.folio || '—'}
            </p>
            <p style={{ margin: '2px 0 0', color: GRIS, fontSize: 13 }}>
              {l.producto_nombre} · {etiquetaEtapa(l.etapa)} · {fmtDias(l.dias_en_etapa)}
            </p>
            <p style={{ margin: '6px 0 0', color: GRIS_SUAVE, fontSize: 12 }}>
              Última gravedad:{' '}
              <span style={{ color: TINTA_MEDIA, fontVariantNumeric: 'tabular-nums' }}>
                {l.ultima_gravedad === null ? 'sin lecturas' : fmtGravedad(l.ultima_gravedad)}
              </span>
              {l.ultima_lectura_fecha && ` · ${etiquetaFecha(l.ultima_lectura_fecha.slice(0, 10))}`}
              {l.fg_obj !== null && ` · objetivo ${fmtGravedad(l.fg_obj)}`}
            </p>
          </div>

          {canManageInventory(role) ? (
            <CapturaRapida
              loteId={l.id}
              folio={l.folio}
              // Solo el primero recibe el foco: con dos lotes, autoenfocar los
              // dos haria que el teclado salte al de abajo.
              autoFoco={vivos.length === 1}
            />
          ) : (
            <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12.5 }}>
              Tu rol puede ver la producción pero no capturar lecturas.
            </p>
          )}
        </div>
      ))}

      <Link href={`/admin/produccion?lote=${vivos[0].id}`} style={enlace}>
        Ver la ficha completa
      </Link>
    </Marco>
  )
}

const enlace = {
  display: 'inline-block', marginTop: 14, color: ACENTO,
  fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
} as const

function Marco({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ margin: 0, color: TINTA, fontSize: 24, fontWeight: 700, letterSpacing: '0.01em' }}>{titulo}</h1>
      {subtitulo && <p style={{ margin: '3px 0 18px', color: GRIS, fontSize: 13 }}>{subtitulo}</p>}
      {!subtitulo && <div style={{ height: 18 }} />}
      {children}
    </div>
  )
}

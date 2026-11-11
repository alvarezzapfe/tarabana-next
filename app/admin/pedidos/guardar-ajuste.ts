'use client'
import { monedaExacta, monedaFirmada } from './pedidos-ui'

/**
 * Guarda el ajuste de un pedido, con las dos confirmaciones.
 *
 * Vive aparte del componente porque hay DOS pantallas que lo guardan y no
 * debian llamar a la ruta cada una a su manera: el panel lateral (desde el
 * boton del propio bloque) y /admin/pedidos/[id]/edit, donde el ajuste se
 * guarda con el boton Guardar de la pagina.
 *
 * ── El bug que esto arregla ────────────────────────────────
 *
 * En la pantalla vieja quedaron dos botones: el "Guardar ajuste" del bloque y
 * el "Guardar" grande de la pagina. El grande llama a /actualizar, que no sabe
 * nada del ajuste, asi que capturar un ajuste y picar Guardar devolvia 200 y
 * tiraba el ajuste a la basura sin un solo error. Pasó en localhost con el
 * pedido #3EC534: el log del dev server no tiene ni una peticion a /ajuste,
 * solo dos PATCH a /actualizar con 200.
 *
 * Ahora el ajuste se guarda SIEMPRE por su ruta —que es la que valida el
 * motivo, el 5%, el sobrepago y el total negativo, y la que deja audit_log— y
 * la pagina la llama antes de su PATCH.
 *
 * Devuelve un mensaje de error en vez de lanzarlo: quien llama lo pinta en
 * pantalla. Nada de esto puede terminar en una excepcion que nadie vea.
 */
export async function guardarAjuste(
  pedidoId: string,
  ajuste: number,
  motivo: string,
  confirmaciones: { confirmarAjuste?: boolean; confirmarSobrepago?: boolean } = {}
): Promise<{ ok: true; sinCambio?: boolean } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await fetch(`/api/admin/pedidos/${pedidoId}/ajuste`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ajuste, ajuste_motivo: motivo, ...confirmaciones }),
    })
  } catch {
    // Sin esto, una red caida terminaba en una promesa rechazada que nadie
    // atrapaba y el usuario veia la pantalla igual que si hubiera guardado.
    return { ok: false, error: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }

  const d = await res.json().catch(() => ({} as Record<string, unknown>))

  if (res.ok) return { ok: true, sinCambio: !!(d as { sinCambio?: boolean }).sinCambio }

  const datos = d as {
    error?: string
    requiereConfirmacion?: boolean
    sobrepago?: { aCobrar: number; pagado: number; sobra: number }
    tolerancia?: { ajuste: number; totalAntes: number; pct: number }
  }

  // Los dos 409 se preguntan, no se deciden solos. Es el mismo trato que da la
  // pantalla de editar productos.
  if (res.status === 409 && datos.requiereConfirmacion) {
    if (datos.sobrepago && !confirmaciones.confirmarSobrepago) {
      const ok = window.confirm(
        `${datos.error}\n\n` +
        `A cobrar: ${monedaExacta(datos.sobrepago.aCobrar)}\n` +
        `Ya pagado: ${monedaExacta(datos.sobrepago.pagado)}\n` +
        `Sobra: ${monedaExacta(datos.sobrepago.sobra)}\n\n` +
        '¿Guardar de todos modos?'
      )
      if (!ok) return { ok: false, error: 'Ajuste no guardado: no se confirmó el sobrepago.' }
      return guardarAjuste(pedidoId, ajuste, motivo, { ...confirmaciones, confirmarSobrepago: true })
    }
    if (datos.tolerancia && !confirmaciones.confirmarAjuste) {
      const ok = window.confirm(
        `${datos.error}\n\n` +
        `Ajuste: ${monedaFirmada(datos.tolerancia.ajuste)}\n` +
        `Total antes del ajuste: ${monedaExacta(datos.tolerancia.totalAntes)}\n\n` +
        '¿Es correcto?'
      )
      if (!ok) return { ok: false, error: 'Ajuste no guardado: no se confirmó el monto.' }
      return guardarAjuste(pedidoId, ajuste, motivo, { ...confirmaciones, confirmarAjuste: true })
    }
  }

  // Cualquier otra cosa —400 por motivo vacio, 403 por permiso, 409 por
  // entregado, 500— sale como texto para la pantalla. Incluye el status
  // porque un error sin numero es imposible de buscar en el log.
  return { ok: false, error: datos.error || `No se pudo guardar el ajuste (HTTP ${res.status}).` }
}

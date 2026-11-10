/**
 * El mensaje de error de una respuesta que fallo.
 *
 * Existe porque `await res.json().catch(() => ({}))` seguido de
 * `json.error || 'No se pudo guardar.'` esconde justo los fallos que mas
 * cuesta diagnosticar: un 500 de Next no devuelve JSON, devuelve la pagina de
 * error en HTML, asi que `json.error` queda undefined y en pantalla sale el
 * texto genérico. El error real — un TypeError del servidor, por ejemplo — no
 * aparece en ningun lado y hay que ir a los logs a buscarlo.
 *
 * Aqui el status SIEMPRE viaja en el mensaje, y el cuerpo se intenta leer como
 * JSON y, si no lo es, se saca algo legible del HTML.
 */

/** Saca la primera linea util de una pagina de error en HTML. */
function deHtml(cuerpo: string): string {
  const sinTags = cuerpo
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

  if (!sinTags) return ''

  // La pagina de error de dev trae el mensaje del throw; es lo unico que
  // sirve de todo el HTML.
  const tipado = sinTags.match(/((?:Type|Range|Reference|Syntax)?Error:[^.]{0,200})/)
  return (tipado ? tipado[1] : sinTags).slice(0, 220)
}

/**
 * Un mensaje que siempre dice algo.
 *
 * @param res      La respuesta que fallo.
 * @param contexto Que se estaba intentando: "No se pudo guardar el cliente".
 */
export async function mensajeDeError(res: Response, contexto: string): Promise<string> {
  const cuerpo = await res.text().catch(() => '')

  let detalle = ''
  if (cuerpo) {
    try {
      const json = JSON.parse(cuerpo)
      detalle = String(json?.error || json?.message || '').trim()
    } catch {
      detalle = deHtml(cuerpo)
    }
  }

  // El status va siempre: distingue un 403 de un 409 y de un 500 sin tener
  // que abrir la consola.
  return detalle
    ? `${contexto} (HTTP ${res.status}): ${detalle}`
    : `${contexto} (HTTP ${res.status}). Sin detalle en la respuesta; revisa los logs del servidor.`
}

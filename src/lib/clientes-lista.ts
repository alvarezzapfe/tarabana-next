/**
 * El filtro de la lista de clientes. Lo usan la pantalla y el servidor.
 *
 * Vive SOLO aqui, sin importar nada que arrastre exceljs, y eso es el punto
 * del archivo: `ClientesClient.tsx` es un client component, asi que todo lo
 * que importe viaja al navegador. Cuando este filtro estaba en
 * `clientes-export.ts` —que si toca `libro-xlsx.ts`— la pantalla de Clientes
 * empezaba a bajar 951 KB de exceljs en su primer load, para todos los que la
 * abren aunque nunca exporten. Es la misma razon por la que existe
 * `libro-xlsx.ts`: el escritor de .xlsx se queda del lado del servidor.
 *
 * Que el filtro este compartido tambien es deliberado: el contrato del export
 * es "lo que esta viendo la tabla". Si se implementara dos veces, el boton
 * diria que respeta los filtros y un dia dejaria de hacerlo sin que nada
 * falle.
 */

/** Un cliente como lo trae `profiles` para la lista del admin. */
export type ClienteLista = {
  id: string
  email: string
  full_name: string | null
  marca_negocio: string | null
  razon_social: string | null
  giro: string | null
  tipo_consumidor: string | null
  nivel_precio: string | null
  rfc: string | null
}

/** Los tres controles de la tabla: buscador, tipo y nivel de precio. */
export type FiltrosClientes = {
  q?: string | null
  /** `tipo_consumidor`, que es por lo que filtra el select de la pantalla. */
  tipo?: string | null
  nivel?: string | null
}

/**
 * El filtro de la lista, tal cual lo aplica la tabla.
 *
 * El buscador cubre nombre comercial, razon social, nombre, correo y RFC: es
 * lo mismo que se ve y lo mismo que se factura, que son las dos formas en que
 * alguien busca a un cliente.
 *
 * Generico en `T` para que no haga falta un tipo mas ancho del que cada lado
 * ya tiene: la pantalla pasa su `Cliente` y la ruta su `ClienteExport`.
 */
export function filtrarClientes<T extends ClienteLista>(clientes: T[], filtros: FiltrosClientes): T[] {
  const q = (filtros.q || '').trim().toLowerCase()
  const tipo = filtros.tipo || ''
  const nivel = filtros.nivel || ''

  return clientes.filter(c => {
    if (q) {
      const campos = [c.marca_negocio, c.razon_social, c.full_name, c.email, c.rfc]
      if (!campos.some(v => (v || '').toLowerCase().includes(q))) return false
    }
    if (tipo && c.tipo_consumidor !== tipo) return false
    // Un cliente sin nivel es publico: es el default de la columna y lo que
    // pinta la tabla.
    if (nivel && (c.nivel_precio || 'publico') !== nivel) return false
    return true
  })
}

/**
 * Registra el loader que resuelve los imports sin extension de src/lib.
 *
 *   node --import ./scripts/resolver-ts.mjs <script>
 *
 * Next resuelve "./roles" a "./roles.ts" por su cuenta; node no, asi que un
 * script suelto que importe crear-pedido.ts se cae en el primer import. Esto
 * reintenta con las extensiones en vez de obligar a reescribir src/lib.
 */
import { register } from 'node:module'
register('./loader-ts.mjs', import.meta.url)

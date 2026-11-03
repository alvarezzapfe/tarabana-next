import { redirect } from 'next/navigation'

/** Consolidada en Configuración como pestaña "Taproom" (1.C). */
export default function TaproomRedirect() {
  redirect('/admin/configuracion?tab=taproom')
}

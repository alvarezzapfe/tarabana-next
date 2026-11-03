import { redirect } from 'next/navigation'

/** Consolidada en Configuración como pestaña "Actividad" (1.C). */
export default function ActividadRedirect() {
  redirect('/admin/configuracion?tab=actividad')
}

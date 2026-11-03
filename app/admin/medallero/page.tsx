import { redirect } from 'next/navigation'

/** Consolidada en Configuración como pestaña "Medallero" (1.C). */
export default function MedalleroRedirect() {
  redirect('/admin/configuracion?tab=medallero')
}

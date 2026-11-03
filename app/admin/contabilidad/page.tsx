import { redirect } from 'next/navigation'

/** Consolidada en Finanzas como pestana "Contabilidad" (1.C). */
export default function ContabilidadRedirect() {
  redirect('/admin/finanzas?tab=contabilidad')
}

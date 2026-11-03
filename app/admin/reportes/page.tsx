import { redirect } from 'next/navigation'

/** Consolidada en Finanzas como pestana "Reportes" (1.C). */
export default function ReportesRedirect() {
  redirect('/admin/finanzas?tab=reportes')
}

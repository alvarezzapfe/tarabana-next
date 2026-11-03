import { redirect } from 'next/navigation'

/** Consolidada en Comercial como pestana "Comisiones" (1.C). */
export default function ComisionesRedirect() {
  redirect('/admin/comercial?tab=comisiones')
}

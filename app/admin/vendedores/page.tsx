import { redirect } from 'next/navigation'

/** Consolidada en Comercial como pestana "Vendedores" (1.C). */
export default function VendedoresRedirect() {
  redirect('/admin/comercial?tab=vendedores')
}

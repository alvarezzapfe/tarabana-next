import { redirect } from 'next/navigation'

/** Consolidada en Pedidos como pestana "Por cobrar" (1.C). */
export default function CobranzaRedirect() {
  redirect('/admin/pedidos?tab=por-cobrar')
}

import { redirect } from 'next/navigation'

/** Consolidada en Clientes como pestana "Puntos de venta" (1.C). */
export default function PuntosVentaRedirect() {
  redirect('/admin/clientes?tab=puntos-venta')
}

import { redirect } from 'next/navigation'

/** Renombrada a Equipo (1.C). */
export default function UsuariosNuevoRedirect() {
  redirect('/admin/equipo/nuevo')
}

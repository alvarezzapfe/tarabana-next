import { createServerSupabaseClient } from '../../src/lib/supabase-server'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import EncuentranosClient from './EncuentranosClient'
import type { PuntoVenta } from '../../src/lib/types/puntoVenta'

export default async function EncuentranosPage() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('puntos_venta')
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true })

  return (
    <main style={{ background: 'var(--cream)', color: 'var(--ink)' }}>
      <Navbar />
      <EncuentranosClient puntos={(data || []) as PuntoVenta[]} />
      <Footer />
    </main>
  )
}

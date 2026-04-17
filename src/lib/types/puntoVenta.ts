export type TipoPuntoVenta = 'bar' | 'restaurante' | 'tienda' | 'evento'

export interface PuntoVenta {
  id: string
  nombre: string
  tipo: TipoPuntoVenta
  direccion: string
  ciudad: string
  zona: string | null
  estado: string
  lat: number | null
  lng: number | null
  imagen_url: string | null
  telefono: string | null
  instagram: string | null
  horario: string | null
  notas: string | null
  activo: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  orden: number
  created_at: string
  updated_at: string
}

export const TIPO_LABELS: Record<TipoPuntoVenta, string> = {
  bar: 'Bar',
  restaurante: 'Restaurante',
  tienda: 'Tienda',
  evento: 'Evento',
}

export const TIPO_COLORS: Record<TipoPuntoVenta, string> = {
  bar: '#C8720A',
  restaurante: '#6B4F3A',
  tienda: '#4CAF50',
  evento: '#F0A030',
}

export type TipoPrecio = 'mayorista' | 'minorista'

export interface ProductoPrompt {
  nombre: string
  estilo: string
  abv: number | null
  stock_caja12: number
  stock_caja24: number
  stock_barril_pet: number
  stock_barril_acero: number
  precio_caja12_publico: number | null
  precio_caja12_taproom: number | null
  precio_caja24_publico: number | null
  precio_caja24_taproom: number | null
  precio_barril_pet_publico: number | null
  precio_barril_pet_taproom: number | null
  precio_barril_acero_publico: number | null
  precio_barril_acero_taproom: number | null
  precio_publico: number | null
  precio_taproom: number | null
}

interface PromptOptions {
  productos: ProductoPrompt[]
  tipoPrecio: TipoPrecio
  nombreCliente?: string
  notas?: string
}

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-MX')
}

function today(): string {
  return new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' })
}

function totalStock(p: ProductoPrompt): number {
  return (p.stock_caja12 || 0) + (p.stock_caja24 || 0) + (p.stock_barril_pet || 0) + (p.stock_barril_acero || 0)
}

function buildProductBlock(p: ProductoPrompt, tipoPrecio: TipoPrecio, single: boolean): string {
  const lines: string[] = []

  // Header
  const abvStr = p.abv ? ` · ${p.abv}% ABV` : ''
  if (single) {
    lines.push(`Te comparto la disponibilidad de ${p.nombre.toUpperCase()} al ${today()}:`)
  } else {
    lines.push(`— ${p.nombre.toUpperCase()} · ${p.estilo}${abvStr}`)
  }

  // Prices — only units with stock > 0 AND price defined
  const priceKey = tipoPrecio === 'mayorista' ? 'publico' : 'taproom'
  const priceParts: string[] = []

  const c12Price = (p as any)[`precio_caja12_${priceKey}`] || (tipoPrecio === 'mayorista' ? p.precio_publico : p.precio_taproom)
  const c24Price = (p as any)[`precio_caja24_${priceKey}`]
  const bpPrice = (p as any)[`precio_barril_pet_${priceKey}`]
  const baPrice = (p as any)[`precio_barril_acero_${priceKey}`]

  if ((p.stock_caja12 || 0) > 0 && c12Price) priceParts.push(`Caja 12: ${fmt(c12Price)}`)
  if ((p.stock_caja24 || 0) > 0 && c24Price) priceParts.push(`Caja 24: ${fmt(c24Price)}`)
  if ((p.stock_barril_pet || 0) > 0 && bpPrice) priceParts.push(`Barril PET 20L: ${fmt(bpPrice)}`)
  if ((p.stock_barril_acero || 0) > 0 && baPrice) priceParts.push(`Barril Acero 20L: ${fmt(baPrice)}`)

  if (priceParts.length > 0) {
    lines.push(priceParts.join(' · '))
  }

  // Stock
  const stockParts: string[] = []
  if ((p.stock_caja12 || 0) > 0) stockParts.push(`${p.stock_caja12} cajas 12`)
  if ((p.stock_caja24 || 0) > 0) stockParts.push(`${p.stock_caja24} cajas 24`)
  if ((p.stock_barril_pet || 0) > 0) stockParts.push(`${p.stock_barril_pet} barriles PET`)
  if ((p.stock_barril_acero || 0) > 0) stockParts.push(`${p.stock_barril_acero} barriles acero`)

  if (stockParts.length > 0) {
    lines.push(`Disponible: ${stockParts.join(', ')}`)
  }

  return lines.join('\n')
}

export function generateWhatsAppPrompt(options: PromptOptions): string {
  const { productos, tipoPrecio, nombreCliente, notas } = options

  // Filter out products with zero total stock
  const withStock = productos.filter(p => totalStock(p) > 0)

  if (withStock.length === 0) return 'Sin productos con stock disponible.'

  const lines: string[] = []

  // Greeting
  const saludo = nombreCliente?.trim()
    ? `¡Hola ${nombreCliente.trim()}! 👋`
    : '¡Hola! 👋'
  lines.push(saludo)
  lines.push('')

  // Product blocks
  const single = withStock.length === 1
  withStock.forEach((p, i) => {
    lines.push(buildProductBlock(p, tipoPrecio, single))
    if (!single && i < withStock.length - 1) lines.push('')
  })

  lines.push('')

  // Notes
  if (notas?.trim()) {
    lines.push(notas.trim())
    lines.push('')
  }

  // Closing
  if (tipoPrecio === 'mayorista') {
    lines.push('Precios mayorista, IVA incluido. Entrega en CDMX y área metro.')
  } else {
    lines.push('Precios al público, IVA incluido. Pasa por El Caracol (Tamaulipas 224, Condesa) o te la llevamos.')
  }
  lines.push('')
  lines.push('Para confirmar tu pedido solo responde a este mensaje. 🍺')

  return lines.join('\n')
}

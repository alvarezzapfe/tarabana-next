import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../src/lib/roles'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel, ImageRun } from 'docx'
import { readFileSync } from 'fs'
import { join } from 'path'

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

const UNIDAD_LABEL: Record<string, string> = {
  caja24: 'Caja 24 latas', caja12: 'Caja 12 latas', barril_pet: 'Barril 20L PET',
  barril_acero: 'Barril 20L Acero', mix24: 'Caja mixta 24 latas', lata: 'Lata',
}

const noBorder = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } }
const thinBorder = { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }, left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }, right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  const isStaff = canWrite(profile?.role)

  // Load pedido with all related data
  const { data: pedido } = await service.from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(full_name, email, phone, rfc, razon_social, calle, num_ext, num_int, colonia, municipio, estado, cp, referencias, direccion_entrega), pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre, estilo))')
    .eq('id', id).single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Auth: staff can access any, client only their own
  if (!isStaff && pedido.cliente_id !== user.id) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { data: saldo } = await service.from('pedidos_saldo').select('*').eq('id', id).single()
  const { data: pagos } = await service.from('pagos').select('*').eq('pedido_id', id).is('cancelado_at', null).order('fecha_pago')

  const cliente = pedido.profiles as any
  const items = (pedido.pedido_items || []) as any[]
  const shortId = id.slice(-6).toUpperCase()

  // Build address string
  let direccion = ''
  if (cliente?.calle) {
    const parts = [
      [cliente.calle, cliente.num_ext, cliente.num_int ? `Int. ${cliente.num_int}` : ''].filter(Boolean).join(' '),
      cliente.colonia, cliente.municipio,
      [cliente.estado, cliente.cp].filter(Boolean).join(' '),
    ].filter(Boolean)
    direccion = parts.join(', ')
    if (cliente.referencias) direccion += `\n${cliente.referencias}`
  } else if (cliente?.direccion_entrega) {
    direccion = cliente.direccion_entrega
  }

  // Load logo
  let logoData: Buffer | null = null
  try {
    logoData = readFileSync(join(process.cwd(), 'public', 'logo-negro.png'))
  } catch { /* logo optional */ }

  // ── Build document ──
  const children: any[] = []

  // Header with logo
  if (logoData) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: logoData, transformation: { width: 80, height: 80 }, type: 'png' })],
      spacing: { after: 100 },
    }))
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Compania Cervecera Tierra Mojada S.A.P.I. de C.V.', size: 20, bold: true })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Pedido #${shortId}`, size: 28, bold: true })], spacing: { before: 200 } }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fmtDate(pedido.created_at), size: 20, color: '666666' })], spacing: { after: 400 } }))

  // Client info
  children.push(new Paragraph({ children: [new TextRun({ text: 'DATOS DEL CLIENTE', bold: true, size: 18, color: '666666' })], spacing: { after: 100 } }))

  const infoRows: [string, string][] = [
    ['Nombre', cliente?.full_name || cliente?.razon_social || '--'],
  ]
  if (cliente?.razon_social && cliente?.full_name !== cliente?.razon_social) infoRows.push(['Razon social', cliente.razon_social])
  if (cliente?.rfc) infoRows.push(['RFC', cliente.rfc])
  if (cliente?.email) infoRows.push(['Correo', cliente.email])
  if (cliente?.phone) infoRows.push(['Telefono', cliente.phone])
  if (direccion) infoRows.push(['Direccion de entrega', direccion])

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: infoRows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: noBorder, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, color: '666666' })] })] }),
        new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: noBorder, children: [new Paragraph({ children: [new TextRun({ text: value, size: 18 })] })] }),
      ],
    })),
  }))

  children.push(new Paragraph({ text: '', spacing: { after: 300 } }))

  // Products table
  children.push(new Paragraph({ children: [new TextRun({ text: 'PRODUCTOS', bold: true, size: 18, color: '666666' })], spacing: { after: 100 } }))

  const headerRow = new TableRow({
    children: ['Producto', 'Presentacion', 'Cant.', 'P. Unitario', 'Importe'].map((h, i) => new TableCell({
      borders: thinBorder, shading: { fill: 'F3F4F6' },
      width: { size: [40, 20, 10, 15, 15][i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({ alignment: i >= 3 ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: h, bold: true, size: 16, color: '666666' })] })],
    })),
  })

  const productRows = items.map((item: any) => {
    const nombre = item.unidad === 'mix24' && item.metadata?.estilos
      ? `Mix: ${(item.metadata.estilos as any[]).map((e: any) => `${e.nombre} x${e.latas || e.cantidad_latas || '?'}`).join(', ')}`
      : item.productos?.nombre || '--'
    const importe = (item.cantidad || 0) * (item.precio_unitario || 0)
    return new TableRow({
      children: [
        new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [new TextRun({ text: nombre, size: 18 })] })] }),
        new TableCell({ borders: thinBorder, children: [new Paragraph({ children: [new TextRun({ text: UNIDAD_LABEL[item.unidad] || item.unidad, size: 18 })] })] }),
        new TableCell({ borders: thinBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(item.cantidad), size: 18, bold: true })] })] }),
        new TableCell({ borders: thinBorder, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(item.precio_unitario || 0), size: 18 })] })] }),
        new TableCell({ borders: thinBorder, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(importe), size: 18, bold: true })] })] }),
      ],
    })
  })

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...productRows] }))
  children.push(new Paragraph({ text: '', spacing: { after: 200 } }))

  // Desglose
  const descMonto = pedido.descuento_tipo === 'porcentaje' ? Math.round((pedido.total || 0) * (pedido.descuento_valor || 0) / 100) : (pedido.descuento_valor || 0)
  const desgloseRows: [string, string, boolean?][] = [
    ['Subtotal', fmt(pedido.total || 0)],
  ]
  if (pedido.descuento_valor > 0) {
    desgloseRows.push([`Descuento${pedido.descuento_motivo ? ' (' + pedido.descuento_motivo + ')' : ''}`, '-' + fmt(descMonto)])
  }
  if (pedido.costo_envio > 0) {
    desgloseRows.push([`Envio${pedido.paqueteria ? ' (' + pedido.paqueteria + ')' : ''}${pedido.guia_envio ? ' Guia: ' + pedido.guia_envio : ''}`, fmt(pedido.costo_envio)])
  }
  desgloseRows.push(['TOTAL', fmt((pedido.total || 0) - descMonto + (pedido.costo_envio || 0)), true])
  desgloseRows.push(['Pagado', fmt(saldo?.pagado || 0)])
  desgloseRows.push(['Saldo pendiente', fmt(saldo?.saldo || 0), true])

  children.push(new Table({
    width: { size: 50, type: WidthType.PERCENTAGE },
    rows: desgloseRows.map(([label, value, bold]) => new TableRow({
      children: [
        new TableCell({ borders: noBorder, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label, size: 18, bold: !!bold, color: bold ? '000000' : '666666' })] })] }),
        new TableCell({ borders: noBorder, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: value, size: 18, bold: !!bold })] })] }),
      ],
    })),
  }))

  children.push(new Paragraph({ text: '', spacing: { after: 300 } }))

  // Conditions
  children.push(new Paragraph({ children: [new TextRun({ text: 'CONDICIONES', bold: true, size: 18, color: '666666' })], spacing: { after: 100 } }))
  const condLabel = pedido.condiciones_pago === '15_dias' ? '15 dias' : pedido.condiciones_pago === '30_dias' ? '30 dias' : 'Contado'
  children.push(new Paragraph({ children: [new TextRun({ text: `Condiciones de pago: ${condLabel}`, size: 18 })] }))
  if (pedido.fecha_vencimiento) {
    children.push(new Paragraph({ children: [new TextRun({ text: `Fecha de vencimiento: ${fmtDate(pedido.fecha_vencimiento)}`, size: 18 })] }))
  }
  if (!pedido.envio_cotizado_at && pedido.costo_envio === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'El costo de envio se cotiza por separado.', size: 18, italics: true, color: '999999' })], spacing: { before: 100 } }))
  }
  if (pedido.notas) {
    children.push(new Paragraph({ children: [new TextRun({ text: `Notas: ${pedido.notas}`, size: 18, italics: true })], spacing: { before: 100 } }))
  }

  children.push(new Paragraph({ text: '', spacing: { after: 400 } }))

  // Footer
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tarabana — Compania Cervecera Tierra Mojada', size: 16, color: '999999' })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'hola@tarabana.mx · tarabana.mx', size: 16, color: '999999' })] }))

  const doc = new Document({
    sections: [{ children }],
  })

  const buffer = await Packer.toBuffer(doc)
  const uint8 = new Uint8Array(buffer)

  return new NextResponse(uint8, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Pedido-${shortId}.docx"`,
    },
  })
}

import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { IVA_TASA_DEFAULT, etiquetaTasa } from '../../../../../src/lib/iva'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel, ImageRun } from 'docx'
import { readFileSync } from 'fs'
import { join } from 'path'
import { nombreLegible } from '../../../../../src/lib/metricas'

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
  const esVendedor = isVendedor(profile?.role)

  // Load pedido with all related data
  const { data: pedido } = await service.from('pedidos')
    .select('*, profiles!pedidos_cliente_id_fkey(full_name, email, phone, rfc, razon_social, marca_negocio, calle, num_ext, num_int, colonia, municipio, estado, cp, referencias, direccion_entrega), pedido_items(cantidad, precio_unitario, unidad, metadata, incluye_iva, productos(nombre, estilo))')
    .eq('id', id).single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Auth: staff can access any, client only their own
  // Esta ruta carga el pedido con el service client, que salta RLS, asi que
  // el control de acceso es este check y no las policies. El vendedor puede
  // imprimir la orden de sus propios pedidos.
  let esSuPedido = false
  if (esVendedor && pedido.vendedor_id) {
    const { data: ficha } = await service
      .from('vendedores')
      .select('id')
      .eq('profile_id', user.id)
      .eq('activo', true)
      .maybeSingle()
    esSuPedido = !!ficha && ficha.id === pedido.vendedor_id
  }

  if (!isStaff && !esSuPedido && pedido.cliente_id !== user.id) {
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

  // El nombre comercial primero, igual que en el resto del panel: la orden la
  // recibe el negocio. Esta linea tenia la precedencia al reves que
  // `nombreLegible` y la orden salia con un nombre distinto al de la tabla.
  const nombreDelCliente = nombreLegible({
    id: '',
    full_name: cliente?.full_name ?? null,
    email: cliente?.email ?? null,
    razon_social: cliente?.razon_social ?? null,
    marca_negocio: cliente?.marca_negocio ?? null,
  })

  const infoRows: [string, string][] = [['Nombre', nombreDelCliente]]
  // La razon social solo si dice algo distinto del nombre de arriba.
  if (cliente?.razon_social && cliente.razon_social.trim().toLowerCase() !== nombreDelCliente.trim().toLowerCase()) {
    infoRows.push(['Razon social', cliente.razon_social])
  }
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

  // La columna de IVA aparece solo cuando el pedido viene MEZCLADO. Con todo
  // gravado o nada gravado, una columna de "Si" identicos no dice nada y el
  // renglon de IVA de abajo ya lo explica; con mezcla, en cambio, es la unica
  // forma de que el cliente sepa sobre que se le cobro el impuesto.
  const gravadas = items.filter((i: any) => i.incluye_iva).length
  const mezclaIva = gravadas > 0 && gravadas < items.length

  const columnas = mezclaIva
    ? ['Producto', 'Presentacion', 'Cant.', 'P. Unitario', 'Importe', 'IVA']
    : ['Producto', 'Presentacion', 'Cant.', 'P. Unitario', 'Importe']
  const anchos = mezclaIva ? [36, 18, 9, 14, 14, 9] : [40, 20, 10, 15, 15]
  const alineadaDerecha = (i: number) => i >= 3 && i <= 4

  const headerRow = new TableRow({
    children: columnas.map((h, i) => new TableCell({
      borders: thinBorder, shading: { fill: 'F3F4F6' },
      width: { size: anchos[i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        alignment: alineadaDerecha(i) ? AlignmentType.RIGHT : (i === 5 ? AlignmentType.CENTER : AlignmentType.LEFT),
        children: [new TextRun({ text: h, bold: true, size: 16, color: '666666' })],
      })],
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
        ...(mezclaIva
          ? [new TableCell({
              borders: thinBorder,
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: item.incluye_iva ? 'Si' : '--', size: 18 })],
              })],
            })]
          : []),
      ],
    })
  })

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...productRows] }))
  children.push(new Paragraph({ text: '', spacing: { after: 200 } }))

  // ── Desglose ──────────────────────────────────────────────
  //
  // Los montos salen de `pedidos_saldo` y no se recalculan aqui. Este
  // documento es lo que ve el cliente, asi que tiene que decir exactamente lo
  // que el sistema le va a cobrar: la vista redondea el descuento porcentual
  // con round(total * pct / 100, 2) y el IVA con round(base * tasa, 2), y
  // reimplementarlo da diferencias de centavos contra el saldo que despues se
  // persigue en cobranza.
  //
  // El calculo local queda solo de respaldo para un pedido CANCELADO, que la
  // vista excluye y por eso llega sin fila.
  const descLocal = pedido.descuento_tipo === 'porcentaje'
    ? Math.round((pedido.total || 0) * (pedido.descuento_valor || 0)) / 100
    : (pedido.descuento_valor || 0)
  const descMonto = saldo ? Number(saldo.descuento_monto) || 0 : descLocal
  const ivaMonto = saldo ? Number(saldo.iva_monto) || 0 : 0
  const baseGravable = saldo ? Number(saldo.base_gravable) || 0 : 0
  const ajuste = saldo ? Number(saldo.ajuste) || 0 : Number(pedido.ajuste) || 0
  const totalCobrar = saldo
    ? Number(saldo.total_con_envio) || 0
    : (pedido.total || 0) - descLocal + (pedido.costo_envio || 0)

  const desgloseRows: [string, string, boolean?][] = [
    ['Subtotal', fmt(pedido.total || 0)],
  ]
  if (descMonto > 0) {
    desgloseRows.push([`Descuento${pedido.descuento_motivo ? ' (' + pedido.descuento_motivo + ')' : ''}`, '-' + fmt(descMonto)])
  }
  if (pedido.costo_envio > 0) {
    desgloseRows.push([`Envio${pedido.paqueteria ? ' (' + pedido.paqueteria + ')' : ''}${pedido.guia_envio ? ' Guia: ' + pedido.guia_envio : ''}`, fmt(pedido.costo_envio)])
  }
  // El renglon de IVA solo cuando lo hay: los precios de lista son sin IVA y
  // un "IVA $0.00" en un pedido que no lo lleva invita a preguntar por que.
  if (ivaMonto > 0) {
    // La base gravable se imprime cuando NO es todo el pedido. Es lo que
    // vuelve verificable un total con IVA parcial: sin ella, el cliente ve un
    // impuesto que no cuadra con ningun numero de la hoja.
    if (Math.abs(baseGravable - ((pedido.total || 0) - descMonto + (pedido.costo_envio || 0))) > 0.005) {
      desgloseRows.push(['Base gravable', fmt(baseGravable)])
    }
    desgloseRows.push([`IVA (${etiquetaTasa(Number(pedido.iva_tasa) || IVA_TASA_DEFAULT)})`, fmt(ivaMonto)])
  }

  // El ajuste con su MOTIVO en la etiqueta: es un renglon que mueve el total
  // sin corresponder a ninguna partida, y el cliente tiene derecho a leer por
  // que. El signo va adelante del peso porque puede ir en los dos sentidos.
  if (ajuste !== 0) {
    const etiquetaAjuste = pedido.ajuste_motivo
      ? `Ajuste (${pedido.ajuste_motivo})`
      : 'Ajuste'
    desgloseRows.push([etiquetaAjuste, `${ajuste < 0 ? '-' : '+'}${fmt(Math.abs(ajuste))}`])
  }
  desgloseRows.push(['TOTAL', fmt(totalCobrar), true])
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

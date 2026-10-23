/**
 * Builds a real PDF of an invoice in the browser and downloads it, so it can
 * be sent to the client on WhatsApp or email. The standard PDF fonts have no
 * naira sign, so amounts are written "NGN 1,000,000.00".
 */
import type { InvoiceDetail } from '../../services/finance'
import { dateLabel } from './format'

const ngn = (kobo: number) => `NGN ${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function downloadInvoicePdf(inv: InvoiceDetail) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const blue = rgb(0.17, 0.27, 0.72)
  const ink = rgb(0.08, 0.09, 0.11)
  const grey = rgb(0.38, 0.4, 0.46)
  const W = 595
  const M = 48
  let y = 842 - M

  const text = (s: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const f = o.b ? bold : font
    const size = o.size ?? 10.5
    // Only characters the standard font can draw.
    const clean = s.replace(/[^\x20-\x7E]/g, (c) => (c === '—' || c === '–' ? '-' : c === '₦' ? 'NGN ' : ''))
    const width = f.widthOfTextAtSize(clean, size)
    page.drawText(clean, { x: o.right ? x - width : x, y: yy, size, font: f, color: o.color ?? ink })
  }
  const line = (yy: number, color = rgb(0.86, 0.87, 0.9), thick = 1) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: thick, color })

  // Header
  text('TARMAC SECURITY LTD', M, y, { size: 16, b: true, color: blue })
  text('INVOICE', W - M, y, { size: 22, b: true, right: true })
  y -= 16
  text('10 Domkat Bali Road, Jos, Plateau State', M, y, { color: grey })
  text(inv.number, W - M, y, { right: true, color: grey })
  y -= 14
  text(`For ${inv.periodLabel}`, W - M, y, { right: true, color: grey })
  y -= 14
  text(`Due ${dateLabel(inv.dueDate)}`, W - M, y, { right: true, b: true })
  y -= 14
  line(y, blue, 2)

  // Bill to
  y -= 26
  text('BILL TO', M, y, { size: 9, b: true, color: grey })
  y -= 15
  const c = inv.client
  text(c?.name ?? inv.clientName, M, y, { size: 12, b: true })
  for (const extra of [c?.address, c?.contactName ? `Attn: ${c.contactName}` : null, c?.phone, c?.email].filter(Boolean) as string[]) {
    y -= 14
    text(extra, M, y, { color: grey })
  }

  // Lines
  y -= 30
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: blue })
  text('Description', M + 8, y, { b: true, color: rgb(1, 1, 1) })
  text('Qty', 360, y, { b: true, color: rgb(1, 1, 1), right: true })
  text('Price', 450, y, { b: true, color: rgb(1, 1, 1), right: true })
  text('Amount', W - M - 8, y, { b: true, color: rgb(1, 1, 1), right: true })
  y -= 26
  for (const l of inv.lines) {
    text(l.description.slice(0, 60), M + 8, y)
    text(String(l.quantity), 360, y, { right: true })
    text(ngn(l.unitKobo), 450, y, { right: true })
    text(ngn(Math.round(l.quantity * l.unitKobo)), W - M - 8, y, { right: true })
    y -= 8
    line(y)
    y -= 16
  }

  // Totals
  y -= 6
  const row = (label: string, value: string, b = false) => {
    text(label, 360, y, { b })
    text(value, W - M - 8, y, { right: true, b, size: b ? 12 : 10.5 })
    y -= 18
  }
  if (inv.vatKobo > 0) {
    row('Before VAT', ngn(inv.subtotalKobo))
    row('VAT (7.5%)', ngn(inv.vatKobo))
  }
  row('Total', ngn(inv.totalKobo), true)
  if (inv.paidKobo > 0) {
    row('Paid', ngn(inv.paidKobo))
    row('Balance to pay', ngn(inv.balanceKobo), true)
  }

  // Where to pay
  if (c?.payAccountNumber) {
    y -= 16
    page.drawRectangle({ x: M, y: y - 62, width: W - 2 * M, height: 78, borderColor: blue, borderWidth: 1.5 })
    text('Please pay by bank transfer into:', M + 14, y - 4, { color: grey })
    text(c.payAccountNumber, M + 14, y - 28, { size: 20, b: true })
    text(`${c.payBankName ?? ''}  -  ${c.payAccountName ?? ''}`, M + 14, y - 48)
    y -= 90
  }
  if (inv.notes) {
    y -= 10
    text(inv.notes.slice(0, 110), M, y, { color: grey })
  }
  text('Thank you for choosing Tarmac Security.', M, M, { color: grey, size: 9 })

  const bytes = await doc.save()
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${inv.number} ${inv.clientName}.pdf`.replace(/[\\/:*?"<>|]/g, '')
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Vendor business review (QBR) PDF: company letterhead with logo, key numbers with rings,
// manufacturer mix, purchase orders, parts and (optionally) proposals.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { savePdf } from '../nativeDownload'

const INK = [24, 32, 44], MUTED = [100, 112, 128], LINE = [222, 228, 236], PANEL = [246, 248, 251]
const GREEN = '#22C55E', VIOLET = '#8B5CF6', ORANGE = '#E07A42'
const SERIES = ['#3B82F6', '#E07A42', '#14B8A6', '#8B5CF6', '#F59E0B', '#DB2777', '#6366F1', '#64748B']

const money = (n) => `$${Math.round(n || 0).toLocaleString('en-US')}`
const short = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `$${Math.round(n / 1e3)}k` : money(n)
const hexToRgb = (hex) => {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [200, 98, 42]
}

/** Load the logo through a canvas so any image type (PNG, JPG, WebP, SVG) becomes a PNG with its real proportions. */
async function loadLogo(url) {
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    const obj = URL.createObjectURL(blob)
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = obj })
    const w = img.naturalWidth || 600, h = img.naturalHeight || 200
    const scale = Math.min(1, 1200 / w)
    const c = document.createElement('canvas')
    c.width = Math.round(w * scale); c.height = Math.round(h * scale)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(obj)
    return { data: c.toDataURL('image/png'), ratio: w / h }
  } catch { return null }
}

/** Donut or ring as a PNG. segments: [{ value, color }]; center: [big, small] text. */
function donutPng(segments, { size = 360, thickness = 0.2, center = [], track = '#E8EDF3' } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = size / 2, lw = size * thickness, rad = r - lw / 2 - 2
  g.lineWidth = lw
  g.strokeStyle = track
  g.beginPath(); g.arc(r, r, rad, 0, Math.PI * 2); g.stroke()
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  if (total > 0) {
    let a = -Math.PI / 2
    const gap = segments.filter(s => s.value > 0).length > 1 ? 0.025 : 0
    segments.forEach(s => {
      if (s.value <= 0) return
      const sweep = (s.value / total) * Math.PI * 2
      g.strokeStyle = s.color
      g.lineCap = segments.length === 1 ? 'round' : 'butt'
      g.beginPath(); g.arc(r, r, rad, a + gap / 2, a + Math.max(sweep - gap / 2, gap / 2 + 0.001)); g.stroke()
      a += sweep
    })
  }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#18202C'
  if (center[0]) { g.font = `bold ${Math.round(size * (center[1] ? 0.15 : 0.19))}px Helvetica, Arial, sans-serif`; g.fillText(center[0], r, center[1] ? r - size * 0.05 : r) }
  if (center[1]) { g.fillStyle = '#64748B'; g.font = `${Math.round(size * 0.075)}px Helvetica, Arial, sans-serif`; g.fillText(center[1], r, r + size * 0.1) }
  return c.toDataURL('image/png')
}
const ringPng = (pct, color, label) => donutPng(
  [{ value: Math.max(0, Math.min(100, pct)), color }, { value: Math.max(0, 100 - Math.min(100, pct)), color: '#E8EDF3' }],
  { size: 200, thickness: 0.16, center: [label] })

/**
 * data: { profile, vendor, periodLabel, rangeText, stats, poStats, pos, include: { pos, parts, proposals } }
 */
export async function exportVendorReport({ profile, vendor, periodLabel, rangeText, stats, poStats, pos, include }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 16
  const accent = hexToRgb(profile?.primary_color || '#C8622A')
  const company = profile?.company_name || ''
  const vendorName = vendor?.vendor_name || 'Vendor'

  // ── Letterhead ──
  const logo = await loadLogo(profile?.logo_url)
  if (logo) {
    const h = 16, w = Math.min(64, h * logo.ratio)
    doc.addImage(logo.data, 'PNG', M, 12, w, w / logo.ratio)
  } else if (company) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK); doc.text(company, M, 22)
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED)
  doc.text('VENDOR BUSINESS REVIEW', W - M, 15, { align: 'right' })
  doc.text(`Prepared ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, W - M, 20, { align: 'right' })
  if (company) doc.text(`by ${company}`, W - M, 25, { align: 'right' })
  doc.setDrawColor(...accent); doc.setLineWidth(0.8); doc.line(M, 33, W - M, 33)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK)
  doc.text(vendorName, M, 46)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...MUTED)
  doc.text(`${periodLabel}${rangeText ? `  ·  ${rangeText}` : ''}`, M, 53)
  const contact = [vendor?.contact_name, vendor?.contact_email, vendor?.account_number ? `Account ${vendor.account_number}` : null].filter(Boolean).join('   ·   ')
  if (contact) { doc.setFontSize(9); doc.text(contact, M, 59) }

  // ── Key numbers (2 rows × 3) ──
  const q = stats.q, w = stats.w
  const wonPct = q.rev > 0 ? w.rev / q.rev * 100 : 0
  const margin = w.rev > 0 ? (w.rev - w.cost) / w.rev * 100 : null
  const winRate = stats.won + stats.lost > 0 ? stats.won / (stats.won + stats.lost) * 100 : null
  const tiles = [
    { label: 'Quoted', value: money(q.rev), sub: `${stats.quotedN} proposals · ${Math.round(q.qty).toLocaleString()} units` },
    { label: 'Won', value: money(w.rev), sub: `${Math.round(wonPct)}% of quoted`, ring: [wonPct, GREEN, `${Math.round(wonPct)}%`] },
    { label: 'Product purchased (won)', value: money(w.cost), sub: `${Math.round(w.qty).toLocaleString()} units at our cost` },
    { label: 'Margin on won items', value: margin == null ? '—' : `${margin.toFixed(1)}%`, sub: 'revenue less product cost', ring: margin == null ? null : [margin, VIOLET, `${Math.round(margin)}%`] },
    { label: 'Deal win rate', value: winRate == null ? '—' : `${Math.round(winRate)}%`, sub: `${stats.won} won · ${stats.lost} lost`, ring: winRate == null ? null : [winRate, ORANGE, `${Math.round(winRate)}%`] },
    { label: 'Purchase orders', value: money(poStats.total), sub: `${pos.length} POs · ${poStats.open.length} open` },
  ]
  const gx = 4, tw = (W - M * 2 - gx * 2) / 3, th = 26
  let y = 66
  tiles.forEach((t, i) => {
    const x = M + (i % 3) * (tw + gx), ty = y + Math.floor(i / 3) * (th + gx)
    doc.setFillColor(...PANEL); doc.setDrawColor(...LINE); doc.setLineWidth(0.2)
    doc.roundedRect(x, ty, tw, th, 2.5, 2.5, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(t.label.toUpperCase(), x + 4, ty + 7)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK)
    doc.text(t.value, x + 4, ty + 16)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(t.sub, t.ring ? tw - 26 : tw - 8)[0], x + 4, ty + 22)
    if (t.ring) doc.addImage(ringPng(t.ring[0], t.ring[1], t.ring[2]), 'PNG', x + tw - 21, ty + 4, 18, 18)
  })
  y += th * 2 + gx + 10

  const heading = (text, yy) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK); doc.text(text, M, yy)
  }
  const table = (opts) => autoTable(doc, {
    margin: { left: M, right: M, top: 20, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, lineColor: LINE, lineWidth: 0 },
    headStyles: { fillColor: [255, 255, 255], textColor: MUTED, fontStyle: 'bold', fontSize: 7.5, lineWidth: { bottom: 0.3 }, lineColor: accent },
    bodyStyles: { lineWidth: { bottom: 0.1 } },
    alternateRowStyles: { fillColor: [251, 252, 254] },
    ...opts,
    // Header cells follow their column's alignment (numbers right-aligned)
    didParseCell: (d) => {
      const cs = opts.columnStyles?.[d.column.index]
      if (d.section === 'head' && cs?.halign) d.cell.styles.halign = cs.halign
      opts.didParseCell?.(d)
    },
  })

  // ── Manufacturer mix ──
  if (stats.mfrs.length) {
    heading('Manufacturer mix', y)
    const segs = stats.mfrs.slice(0, 7).map((m, i) => ({ value: m.value, color: SERIES[i % SERIES.length] }))
    doc.addImage(donutPng(segs, { center: [short(q.rev), 'quoted'] }), 'PNG', M, y + 4, 46, 46)
    table({
      startY: y + 4, margin: { left: M + 54, right: M, bottom: 18 }, tableWidth: W - M * 2 - 54,
      head: [['', 'Manufacturer', 'Quoted', 'Won', 'Won %']],
      body: stats.mfrs.slice(0, 12).map((m, i) => ['', m.label, money(m.value), money(m.won), m.value ? `${Math.round(m.won / m.value * 100)}%` : '—']),
      columnStyles: { 0: { cellWidth: 5 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didDrawCell: (d) => {
        if (d.section === 'body' && d.column.index === 0 && d.row.index < 7) {
          doc.setFillColor(...hexToRgb(SERIES[d.row.index % SERIES.length]))
          doc.circle(d.cell.x + 2.2, d.cell.y + d.cell.height / 2, 1.3, 'F')
        }
      },
    })
    y = Math.max(y + 54, doc.lastAutoTable.finalY + 10)
  }

  const ensure = (need) => { if (y + need > H - 22) { doc.addPage(); y = 22 } }

  // ── Purchase orders ──
  if (include.pos && pos.length) {
    ensure(40)
    heading('Purchase orders', y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text(poStats.segs.map(s => `${s.label}: ${s.value}`).join('    ·    '), M, y + 6)
    table({
      startY: y + 9,
      head: [['PO #', 'Date', 'Status', 'Amount']],
      body: pos.slice(0, 40).map(p => [p.po_number || '—', p.created_at ? new Date(p.created_at).toLocaleDateString('en-US') : '—', p.status || '—', money(p.total_amount)]),
      columnStyles: { 3: { halign: 'right' } },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── Parts ──
  if (include.parts && stats.parts.length) {
    ensure(30)
    heading(`Top parts${stats.parts.length > 40 ? ' (top 40 by quoted value)' : ''}`, y)
    table({
      startY: y + 4,
      head: [['Part', 'SKU', 'Manufacturer', 'Qty quoted', 'Qty won', 'Quoted', 'Won']],
      body: stats.parts.slice(0, 40).map(p => [p.name, p.sku || '—', p.mfr || '—', p.qty.toLocaleString(), p.wonQty ? p.wonQty.toLocaleString() : '—', money(p.rev), p.wonRev ? money(p.wonRev) : '—']),
      columnStyles: { 0: { cellWidth: 52 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── Proposals (client names; off by default) ──
  if (include.proposals && stats.props.length) {
    ensure(30)
    heading('Proposals', y)
    table({
      startY: y + 4,
      head: [['Proposal', 'Client', 'Status', 'Date', 'Vendor value']],
      body: stats.props.slice(0, 60).map(p => [p.proposal_name || 'Untitled', p.company || '—', p.status, new Date(p.created_at).toLocaleDateString('en-US'), money(p.rev)]),
      columnStyles: { 4: { halign: 'right' } },
    })
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, H - 13, W - M, H - 13)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(`${vendorName} business review${company ? `  ·  Prepared by ${company}` : ''}  ·  Confidential`, M, H - 8)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: 'right' })
  }

  const safe = (s) => (s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
  await savePdf(doc, `${safe(company) || 'ForgePt'}_${safe(vendorName)}_Business_Review_${safe(periodLabel)}.pdf`)
}

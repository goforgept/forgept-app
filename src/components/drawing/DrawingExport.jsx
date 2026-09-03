import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { getCategorySVG } from './useCategoryIcons'
import { PATHWAY_DEFS } from './SymbolPicker'
import { APP_BASE_URL } from '../../config'
import { savePdf, nativeDownload } from '../../nativeDownload'
import PDFWorkerConstructor from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

// Convert SVG string to PNG base64 for jsPDF
const svgToPng = (svgString, size = 20) => new Promise(resolve => {
  const canvas  = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx     = canvas.getContext('2d')
  const img     = new Image()
  const blob    = new Blob([svgString], { type: 'image/svg+xml' })
  const url     = URL.createObjectURL(blob)
  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size)
    URL.revokeObjectURL(url)
    resolve(canvas.toDataURL('image/png'))
  }
  img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
  img.src = url
})

// Cache rendered icons
const iconCache = {}
const getIconPng = async (category, color, size = 16) => {
  const key = `${category}_${color}_${size}`
  if (iconCache[key]) return iconCache[key]
  const svg = getCategorySVG(category, color)
  const png = await svgToPng(svg, size)
  iconCache[key] = png
  return png
}

// ─── Label placement helpers ──────────────────────────────────────────────────
// fs is in points; all spatial coords are in mm. 1pt = 0.353mm.
const ptToMm = (pt) => pt * 0.353
const mkLabelBox = (cx, cy, text, fsMm) => {
  const w = text.length * fsMm * 0.65 + fsMm
  const h = fsMm * 1.1
  return { x1: cx - w / 2, y1: cy - h, x2: cx + w / 2, y2: cy }
}
const boxesOverlap = (a, b) =>
  !(a.x2 + 0.5 < b.x1 || b.x2 + 0.5 < a.x1 || a.y2 + 0.5 < b.y1 || b.y2 + 0.5 < a.y1)
const conditionLabel = (c) => c === 'existing' ? 'Existing' : c === 'replace' ? 'Replace' : c === 'demo' ? 'Demo' : 'New'

const hexToRgbArr = (hex) => {
  const n = parseInt((hex || '#0F1C2E').replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const PATHWAY_DEFS_MAP = Object.fromEntries((PATHWAY_DEFS || []).map(d => [d.type, d]))

// Draw a polyline on a jsPDF page using normalized {x,y} points (0–1 relative to image bounds)
const drawPolylineOnPDF = (pdf, points, imgX, imgY, imgW, imgH, color, lineWidthMm, dashMm) => {
  if (!points || points.length < 2) return
  const [r, g, b] = hexToRgbArr(color || '#3b82f6')
  pdf.setDrawColor(r, g, b)
  pdf.setLineWidth(lineWidthMm || 0.5)
  if (dashMm && dashMm.length) pdf.setLineDashPattern(dashMm, 0)
  else pdf.setLineDashPattern([], 0)
  for (let i = 1; i < points.length; i++) {
    const x1 = imgX + points[i-1].x * imgW
    const y1 = imgY + points[i-1].y * imgH
    const x2 = imgX + points[i].x * imgW
    const y2 = imgY + points[i].y * imgH
    if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) pdf.line(x1, y1, x2, y2)
  }
  pdf.setLineDashPattern([], 0)
}

const loadOrgLogoFromProfile = async (orgProfile) => {
  if (!orgProfile?.logo_url) return null
  try {
    const resp = await fetch(orgProfile.logo_url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const img = new Image()
    img.src = dataUrl
    await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
    if (img.naturalWidth === 0) return null
    return img
  } catch {
    return null
  }
}

// Maps device categories to higher-level system groups for schedule grouping
const DEVICE_SYSTEM_GROUPS = [
  { label: 'Security Systems',      categories: ['Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera','Thermal Camera','Access Control Reader','Access Controller','Door Contact','Motion Sensor','Glass Break','Panic Button','Siren','Alarm Panel','Video Intercom','Intercom'] },
  { label: 'Low Voltage / AV',      categories: ['TV Display','Projector','Speaker','Ceiling Speaker','Subwoofer','Amplifier','AV Receiver','Matrix Switch','Video Wall','Digital Signage','Control Processor','Keypad','Touch Panel','Display Mount'] },
  { label: 'Network / IT',          categories: ['Switch','Managed Switch','Router','Wireless AP','Firewall','UPS','Patch Panel','Server','Rack Server','Media Converter','SFP Module'] },
  { label: 'Infrastructure',        categories: ['Rack','Rack Enclosure','Cable Management','Power Strip','PDU','J-Hook','Conduit','Back Box','Junction Box','Low Voltage Bracket'] },
]
const getDeviceSystemGroup = (category) => {
  for (const g of DEVICE_SYSTEM_GROUPS) {
    if (g.categories.some(c => c.toLowerCase() === (category || '').toLowerCase())) return g.label
  }
  return 'Other'
}

const drawDocCoverPage = (pdf, orgProfile, { eyebrow, title, subtitle, meta = [], logoImg }) => {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const [r, g, b] = hexToRgbArr(orgProfile?.primary_color)
  const margin = 14

  pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, pageW, pageH, 'F')
  pdf.setFillColor(r, g, b); pdf.rect(0, 0, 5, pageH, 'F')

  let logoBottom = 36
  if (logoImg) {
    try {
      const maxW = 80, maxH = 40
      const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
      pdf.addImage(logoImg, 'PNG', margin, 20, logoImg.naturalWidth * ratio, logoImg.naturalHeight * ratio)
      logoBottom = 20 + logoImg.naturalHeight * ratio + 4
    } catch { /* ignore */ }
  } else if (orgProfile?.company_name) {
    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30)
    pdf.text(orgProfile.company_name, margin, 32)
    logoBottom = 38
  }

  const midY = pageH * 0.44
  pdf.setDrawColor(r, g, b); pdf.setLineWidth(0.6); pdf.line(margin, midY, pageW - margin, midY); pdf.setLineWidth(0.2)
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(r, g, b)
  pdf.setCharSpace(2); pdf.text((eyebrow || '').toUpperCase(), margin, midY - 36); pdf.setCharSpace(0)
  pdf.setFontSize(24); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(20, 20, 20)
  pdf.text(pdf.splitTextToSize(title || '', pageW - margin * 2 - 5), margin, midY - 25)
  if (subtitle) {
    pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30)
    pdf.text(subtitle, margin, midY + 14)
  }
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(90, 100, 110)
  meta.forEach((line, i) => pdf.text(line, margin, midY + (subtitle ? 24 : 14) + i * 7))
}

// Draws device icons, FOV overlays, cable runs, and pathways onto a rendered floor plan page
const drawSheetOnPDFStandalone = async (pdf, sheet, imgData, imgX, imgY, imgW, imgH, placementsBySheet, showFOV = true, cableRunsBySheet = {}, pathwaysBySheet = {}, showCables = true, showPathways = true) => {
  pdf.setFillColor(255, 255, 255); pdf.rect(imgX, imgY, imgW, imgH, 'F')
  let imgNaturalW = null
  if (imgData) {
    try {
      let format = 'PNG'
      if (imgData.includes('data:image/jpeg') || imgData.includes('data:image/jpg')) format = 'JPEG'
      else if (imgData.includes('data:image/webp')) format = 'WEBP'
      const base64 = imgData.split(',')[1]
      const tempImg = await new Promise(resolve => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(img); img.src = imgData
      })
      const naturalW = tempImg.naturalWidth || imgW
      const naturalH = tempImg.naturalHeight || imgH
      imgNaturalW = naturalW
      const ratio = Math.min(imgW / naturalW, imgH / naturalH)
      const drawW = naturalW * ratio, drawH = naturalH * ratio
      const drawX = imgX + (imgW - drawW) / 2, drawY = imgY + (imgH - drawH) / 2
      pdf.addImage(base64, format, drawX, drawY, drawW, drawH, undefined, 'FAST')
      imgX = drawX; imgY = drawY; imgW = drawW; imgH = drawH
    } catch (err) { console.warn('Image add failed:', err.message) }
  }
  // Draw cable runs under device icons
  if (showCables) {
    for (const run of (cableRunsBySheet[sheet.id] || [])) {
      drawPolylineOnPDF(pdf, run.points, imgX, imgY, imgW, imgH, run.color || '#3b82f6', 0.5, [3, 1.5])
    }
  }
  // Draw pathways under device icons
  if (showPathways) {
    for (const pw of (pathwaysBySheet[sheet.id] || [])) {
      const def = PATHWAY_DEFS_MAP[pw.pathway_type] || PATHWAY_DEFS[0]
      const dashMm = (def?.dash || []).length ? def.dash.map(d => d * 0.3) : []
      drawPolylineOnPDF(pdf, pw.points, imgX, imgY, imgW, imgH, def?.color || '#4a90d9', 0.8, dashMm)
    }
  }
  const sheetPlacements = placementsBySheet[sheet.id] || []
  const placedLabels = []
  for (const p of sheetPlacements) {
    const px = imgX + p.x * imgW, py = imgY + p.y * imgH
    if (!isFinite(px) || !isFinite(py)) continue
    const col = p.marker_color || '#C8622A'
    const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16)
    const fovCategories = ['Dome Camera','Bullet Camera','PTZ Camera','Motion Sensor','Multi-Lens Camera','Fisheye Camera']
    const category = p.global_products?.category || ''
    if (showFOV && fovCategories.includes(category) && isFinite(px) && isFinite(py)) {
      const fovAngle = p.fov_angle || p.global_products?.specs?.fov_angle || (category === 'PTZ Camera' ? 360 : 90)
      const rangeInFeet = p.fov_range || p.global_products?.specs?.ir_range || 30
      const fallbackMM = Math.min(imgW, imgH) * 0.08
      const computed = imgNaturalW && sheet.scale_ratio ? (imgW / (imgNaturalW * sheet.scale_ratio)) * rangeInFeet : null
      const rangeInMM = (computed && isFinite(computed) && computed > 0) ? computed : fallbackMM
      pdf.saveGraphicsState()
      pdf.setGState(pdf.GState({ opacity: 0.12, 'stroke-opacity': 0.4 }))
      pdf.setFillColor(r, g, b); pdf.setDrawColor(r, g, b); pdf.setLineWidth(0.3)
      if (category === 'PTZ Camera' || fovAngle >= 355) {
        pdf.circle(px, py, rangeInMM, 'FD')
      } else {
        const startAngle = ((p.rotation || 0) - fovAngle / 2) * Math.PI / 180
        const endAngle = ((p.rotation || 0) + fovAngle / 2) * Math.PI / 180
        const steps = Math.max(16, Math.floor(fovAngle / 5))
        const pts = [[px, py]]
        for (let i = 0; i <= steps; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / steps)
          pts.push([px + Math.cos(angle) * rangeInMM, py + Math.sin(angle) * rangeInMM])
        }
        pts.push([px, py])
        const deltas = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]])
        if (deltas.every(d => isFinite(d[0]) && isFinite(d[1]))) pdf.lines(deltas, pts[0][0], pts[0][1], [1,1], 'FD')
      }
      pdf.restoreGraphicsState()
    }
    const symbolSizeMM = imgNaturalW ? Math.max((p.symbol_size || 32) * (imgW / imgNaturalW), 2) : 4
    const iconSize = symbolSizeMM * 0.65
    pdf.setFillColor(r, g, b); pdf.circle(px, py, symbolSizeMM / 2, 'F')
    const iconPng = await getIconPng(p.global_products?.category || 'default', '#ffffff', 32)
    if (iconPng) pdf.addImage(iconPng, 'PNG', px - iconSize/2, py - iconSize/2, iconSize, iconSize)
    if (p.site_condition && p.site_condition !== 'new') {
      const badgeR = Math.max(symbolSizeMM * 0.24, 1.2)
      const bx = px + symbolSizeMM * 0.28, by = py - symbolSizeMM * 0.52
      const badgeCol = p.site_condition === 'existing' ? [34,197,94] : p.site_condition === 'demo' ? [168,85,247] : [239,68,68]
      const letter = p.site_condition === 'existing' ? 'E' : p.site_condition === 'demo' ? 'D' : 'R'
      pdf.setFillColor(...badgeCol); pdf.setDrawColor(255,255,255); pdf.setLineWidth(0.4); pdf.circle(bx, by, badgeR, 'FD')
      pdf.setTextColor(255,255,255); pdf.setFontSize(Math.max(badgeR*3.5,4)); pdf.setFont('helvetica','bold')
      pdf.text(letter, bx, by + badgeR * 0.38, { align: 'center' })
    }
    if (p.device_address) {
      const fs = Math.max(symbolSizeMM * 0.7, 3), fsMm = ptToMm(fs), rad = symbolSizeMM / 2, gap = rad + 0.5
      const label = p.device_address
      const candidates = [[px, py + gap + fsMm],[px, py - gap],[px + gap, py + fsMm * 0.4],[px - gap, py + fsMm * 0.4]]
      let lx = candidates[0][0], ly = candidates[0][1]
      for (const [cx, cy] of candidates) {
        const box = mkLabelBox(cx, cy, label, fsMm)
        if (!placedLabels.some(b => boxesOverlap(box, b))) { lx = cx; ly = cy; placedLabels.push(box); break }
      }
      if (!placedLabels.some(b => boxesOverlap(mkLabelBox(lx, ly, label, fsMm), b))) placedLabels.push(mkLabelBox(lx, ly, label, fsMm))
      pdf.setTextColor(r, g, b); pdf.setFontSize(fs); pdf.setFont('helvetica', 'bold')
      pdf.text(label, lx, ly, { align: 'center' })
    }
  }
}

const getFloorPlanImageFromR2 = async (sheetId, sheets) => {
  const sheet = sheets.find(s => s.id === sheetId)
  if (!sheet || ['blank', 'pending'].includes(sheet.storage_path)) return null
  try {
    const { getR2Url } = await import('../../r2')
    const signedUrl = await getR2Url(sheet.storage_path, 3600)
    if (!signedUrl) return null
    if (sheet.storage_path.toLowerCase().endsWith('.pdf')) {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerPort) pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorkerConstructor()
      const arrayBuf = await (await fetch(signedUrl)).arrayBuffer()
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuf }).promise
      const page = await pdfDoc.getPage(sheet.page_number || 1)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width; canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      return canvas.toDataURL('image/png')
    } else {
      const blob = await (await fetch(signedUrl)).blob()
      return await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob) })
    }
  } catch { return null }
}

// Exported so ProposalDetail can call it for the bundle download
export async function generateShopDrawingsPdf({ sheets, placements, cableRuns, verticalRises, pathways = [], orgProfile, proposal, exportFOV = true, exportCables = true, exportPathways = true }) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const titleBlockH = 18
  const [brandR, brandG, brandB] = hexToRgbArr(orgProfile?.primary_color)
  const brandHex = orgProfile?.primary_color || '#0F1C2E'
  const preparedBy = orgProfile?.company_name || orgProfile?.organizations?.title_block_engineer || ''

  const placementsBySheet = {}
  placements.forEach(p => {
    if (!placementsBySheet[p.drawing_sheet_id]) placementsBySheet[p.drawing_sheet_id] = []
    placementsBySheet[p.drawing_sheet_id].push(p)
  })

  const cableRunsBySheet = {}
  cableRuns.forEach(r => {
    if (!cableRunsBySheet[r.drawing_sheet_id]) cableRunsBySheet[r.drawing_sheet_id] = []
    cableRunsBySheet[r.drawing_sheet_id].push(r)
  })

  const pathwaysBySheet = {}
  pathways.forEach(pw => {
    if (!pathwaysBySheet[pw.drawing_sheet_id]) pathwaysBySheet[pw.drawing_sheet_id] = []
    pathwaysBySheet[pw.drawing_sheet_id].push(pw)
  })

  const cableByType = Object.create(null)
  cableRuns.forEach(r => {
    const t = r.cable_type || 'Unknown'
    if (!cableByType[t]) cableByType[t] = { footage: 0, total_footage: 0, runs: 0 }
    cableByType[t].footage += r.footage || 0; cableByType[t].total_footage += r.total_footage || 0; cableByType[t].runs += 1
  })
  verticalRises.forEach(r => {
    const t = r.cable_type || 'Unknown'
    if (!cableByType[t]) cableByType[t] = { footage: 0, total_footage: 0, runs: 0 }
    cableByType[t].total_footage += r.total_footage || 0
  })
  pathways.forEach(pw => {
    const cables = (pw.cable_types || []).map(c => typeof c === 'string' ? { type: c, qty: 1 } : c)
    cables.forEach(({ type, qty = 1 }) => {
      if (!type) return
      if (!cableByType[type]) cableByType[type] = { footage: 0, total_footage: 0, runs: 0 }
      const ft = Math.round((pw.total_footage || 0) * qty)
      cableByType[type].footage += ft
      cableByType[type].total_footage += ft
    })
  })

  const usedCategories = [...new Set(placements.map(p => p.global_products?.category).filter(Boolean))].sort()

  const drawTitleBlock = (sheetName, sheetNum) => {
    pdf.setDrawColor(210,210,210); pdf.setLineWidth(0.3)
    pdf.rect(margin, pageH - titleBlockH - margin, pageW - margin*2, titleBlockH)
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(brandR, brandG, brandB)
    pdf.text(preparedBy, margin+2, pageH - titleBlockH - margin+6)
    pdf.setTextColor(30,30,30); pdf.setFontSize(7); pdf.setFont('helvetica','normal')
    pdf.text(proposal?.proposal_name || '', margin+2, pageH - titleBlockH - margin+11)
    pdf.text(proposal?.company || '', margin+2, pageH - titleBlockH - margin+15)
    const org = orgProfile?.organizations
    if (org?.title_block_engineer) pdf.text(`Engineer: ${org.title_block_engineer}`, pageW/2, pageH - titleBlockH - margin+6, { align: 'center' })
    if (org?.title_block_license) pdf.text(`License: ${org.title_block_license}`, pageW/2, pageH - titleBlockH - margin+11, { align: 'center' })
    if (org?.title_block_scale) pdf.text(`Scale: ${org.title_block_scale}`, pageW/2, pageH - titleBlockH - margin+15, { align: 'center' })
    pdf.setFont('helvetica','bold'); pdf.text(sheetName, pageW - margin-2, pageH - titleBlockH - margin+6, { align: 'right' })
    pdf.setFont('helvetica','normal')
    pdf.text(`Sheet ${sheetNum} of ${sheets.length + 3}`, pageW - margin-2, pageH - titleBlockH - margin+11, { align: 'right' })
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageW - margin-2, pageH - titleBlockH - margin+15, { align: 'right' })
  }

  const logoImg = await loadOrgLogoFromProfile(orgProfile)

  // Cover
  drawDocCoverPage(pdf, orgProfile, {
    eyebrow: 'Shop Drawings',
    title: proposal?.proposal_name || 'Shop Drawings',
    subtitle: proposal?.company || '',
    meta: [`Prepared by: ${preparedBy}`, `Date: ${new Date().toLocaleDateString()}   ·   Total Sheets: ${sheets.length}`],
    logoImg,
  })
  drawTitleBlock('Title Sheet', 1)

  // Legend
  pdf.addPage(); pdf.setFillColor(255,255,255); pdf.rect(0,0,pageW,pageH,'F')
  pdf.setTextColor(brandR, brandG, brandB); pdf.setFontSize(14); pdf.setFont('helvetica','bold')
  pdf.text('SYMBOL LEGEND', margin, margin+8)
  let lx = margin, ly = margin+18, col = 0
  const colW = 60, perRow = Math.floor((pageW - margin*2) / colW)
  for (const category of usedCategories) {
    const legendIcon = await getIconPng(category, brandHex, 32)
    if (legendIcon) pdf.addImage(legendIcon, 'PNG', lx, ly-2, 7, 7)
    else { pdf.setFillColor(brandR, brandG, brandB); pdf.circle(lx+3.5, ly+3, 3.5, 'F') }
    pdf.setTextColor(30,30,30); pdf.setFontSize(8); pdf.setFont('helvetica','bold')
    pdf.text(category, lx+11, ly+4)
    pdf.setFont('helvetica','normal'); pdf.setTextColor(90,100,110)
    pdf.text(`Count: ${placements.filter(p => p.global_products?.category === category).length}`, lx+11, ly+9)
    col++
    if (col >= perRow) { col = 0; lx = margin; ly += 16 } else lx += colW
  }

  // Cable & pathway type legend
  const usedCableTypes = [...new Set(cableRuns.map(r => r.cable_type).filter(Boolean))]
  const usedPathwayTypes = [...new Set(pathways.map(pw => pw.pathway_type).filter(Boolean))]
  if (usedCableTypes.length > 0 || usedPathwayTypes.length > 0) {
    if (col > 0) { lx = margin; ly += 16; col = 0 }
    ly += 4
    pdf.setDrawColor(200,210,220); pdf.setLineWidth(0.2); pdf.line(margin, ly, pageW-margin, ly)
    ly += 6
    pdf.setTextColor(brandR, brandG, brandB); pdf.setFontSize(9); pdf.setFont('helvetica','bold')
    pdf.text('CABLE & PATHWAY TYPES', margin, ly)
    ly += 8; lx = margin; col = 0
    for (const cType of usedCableTypes) {
      const runColor = cableRuns.find(r => r.cable_type === cType)?.color || '#3b82f6'
      const [cr, cg, cb] = hexToRgbArr(runColor)
      pdf.setDrawColor(cr, cg, cb); pdf.setLineWidth(0.6); pdf.setLineDashPattern([3, 1.5], 0)
      pdf.line(lx, ly+1.5, lx+14, ly+1.5)
      pdf.setLineDashPattern([], 0)
      pdf.setTextColor(30,30,30); pdf.setFontSize(8); pdf.setFont('helvetica','bold')
      pdf.text(cType, lx+17, ly+4)
      pdf.setFont('helvetica','normal'); pdf.setTextColor(90,100,110)
      pdf.text(`${cableRuns.filter(r => r.cable_type === cType).length} run(s)`, lx+17, ly+9)
      col++
      if (col >= perRow) { col = 0; lx = margin; ly += 16 } else lx += colW
    }
    for (const pType of usedPathwayTypes) {
      const def = PATHWAY_DEFS_MAP[pType] || PATHWAY_DEFS[0]
      const [pr, pg, pb] = hexToRgbArr(def?.color || '#4a90d9')
      const dashMm = (def?.dash || []).length ? def.dash.map(d => d * 0.3) : []
      pdf.setDrawColor(pr, pg, pb); pdf.setLineWidth(0.9)
      if (dashMm.length) pdf.setLineDashPattern(dashMm, 0)
      else pdf.setLineDashPattern([], 0)
      pdf.line(lx, ly+1.5, lx+14, ly+1.5)
      pdf.setLineDashPattern([], 0)
      pdf.setTextColor(30,30,30); pdf.setFontSize(8); pdf.setFont('helvetica','bold')
      pdf.text(def?.label || pType, lx+17, ly+4)
      pdf.setFont('helvetica','normal'); pdf.setTextColor(90,100,110)
      pdf.text(`${pathways.filter(pw => pw.pathway_type === pType).length} pathway(s)`, lx+17, ly+9)
      col++
      if (col >= perRow) { col = 0; lx = margin; ly += 16 } else lx += colW
    }
  }
  drawTitleBlock('Legend', 2)

  // Device + Cable schedule page
  const schedTableStyle = { theme: 'grid', styles: { fontSize: 7, cellPadding: 2, textColor: [40,40,40], fillColor: [255,255,255], lineColor: [200,200,200] }, headStyles: { fillColor: [brandR, brandG, brandB], textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 }, alternateRowStyles: { fillColor: [245,247,250] } }
  pdf.addPage(); pdf.setFillColor(255,255,255); pdf.rect(0,0,pageW,pageH,'F')
  pdf.setTextColor(brandR, brandG, brandB); pdf.setFontSize(11); pdf.setFont('helvetica','bold')
  pdf.text('DEVICE SCHEDULE', margin, margin+8)
  const scheduleRows = placements.map((p, idx) => {
    const gp = p.global_products, sheet = sheets.find(s => s.id === p.drawing_sheet_id)
    return [idx+1, p.device_address||'—', p.part_number_override||gp?.part_number||'—', p.description_override||gp?.name||'—', p.manufacturer_override||gp?.manufacturer||'—', gp?.category||'—', p.quantity||1, conditionLabel(p.site_condition), sheet?.name||'—', p.runs_to_label||'—']
  })
  autoTable(pdf, { ...schedTableStyle, startY: margin+12, margin: { left: margin, right: margin, bottom: titleBlockH+margin+5 }, head: [['#','Address','Part Number','Description','Manufacturer','Category','Qty','Condition','Sheet','Runs To']], body: scheduleRows })

  // Cable schedule — inline below device schedule, same style
  const cableRows = Object.entries(cableByType).map(([type, data]) => [type, data.runs || '—', `${Math.round(data.footage)}ft`, `${Math.round(data.total_footage)}ft`])
  if (cableRows.length > 0) {
    const cableY = pdf.lastAutoTable.finalY + 8
    pdf.setTextColor(brandR, brandG, brandB); pdf.setFontSize(10); pdf.setFont('helvetica','bold')
    pdf.text('CABLE SCHEDULE', margin, cableY)
    autoTable(pdf, { ...schedTableStyle, startY: cableY+4, margin: { left: margin, right: margin, bottom: titleBlockH+margin+5 }, head: [['Cable Type','Runs','Measured Footage','Total w/ Waste']], body: cableRows })
  }

  // Pathway schedule — inline below cable schedule
  if (pathways.length > 0) {
    const pwY = pdf.lastAutoTable.finalY + 8
    pdf.setTextColor(brandR, brandG, brandB); pdf.setFontSize(10); pdf.setFont('helvetica','bold')
    pdf.text('PATHWAY SCHEDULE', margin, pwY)
    const pwRows = pathways.map(pw => {
      const def = PATHWAY_DEFS_MAP[pw.pathway_type] || PATHWAY_DEFS[0]
      const sheet = sheets.find(s => s.id === pw.drawing_sheet_id)
      const cables = (pw.cable_types || []).map(c => typeof c === 'string' ? c : `${c.qty > 1 ? c.qty + '× ' : ''}${c.type}`).join(', ') || '—'
      return [def?.label || pw.pathway_type || '—', sheet?.name || '—', `${pw.total_footage || 0}ft`, cables]
    })
    autoTable(pdf, { ...schedTableStyle, startY: pwY+4, margin: { left: margin, right: margin, bottom: titleBlockH+margin+5 }, head: [['Type','Sheet','Footage','Cable Types']], body: pwRows })
  }

  // Vertical rises — inline below pathway schedule
  if (verticalRises.length > 0) {
    const riseY = pdf.lastAutoTable.finalY + 8
    pdf.setTextColor(brandR, brandG, brandB); pdf.setFontSize(10); pdf.setFont('helvetica','bold')
    pdf.text('VERTICAL RISES', margin, riseY)
    const riseRows = verticalRises.map(r => { const from = sheets.find(s => s.id === r.from_sheet_id), to = sheets.find(s => s.id === r.to_sheet_id); return [from?.name||'—', to?.name||'—', r.label||'—', r.cable_type||'—', `${r.rise_height}ft`, r.quantity, `${Math.round(r.total_footage)}ft`] })
    autoTable(pdf, { ...schedTableStyle, startY: riseY+4, margin: { left: margin, right: margin, bottom: titleBlockH+margin+5 }, head: [['From','To','Label','Cable','Height','Qty','Total']], body: riseRows })
  }

  drawTitleBlock('Schedules', 3)

  // Floor plan sheets
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i]
    pdf.addPage(); pdf.setFillColor(255,255,255); pdf.rect(0,0,pageW,pageH,'F')
    pdf.setFillColor(26,45,69); pdf.rect(0,0,pageW,10,'F')
    pdf.setTextColor(255,255,255); pdf.setFontSize(8); pdf.setFont('helvetica','bold')
    pdf.text(sheet.name, margin, 7)
    const imgY = 12, imgH = pageH - imgY - titleBlockH - margin - 5, imgW = pageW - margin*2
    const imgData = await getFloorPlanImageFromR2(sheet.id, sheets)
    await drawSheetOnPDFStandalone(pdf, sheet, imgData, margin, imgY, imgW, imgH, placementsBySheet, exportFOV, cableRunsBySheet, pathwaysBySheet, exportCables, exportPathways)
    drawTitleBlock(sheet.name, i+4)
  }

  return pdf
}

// ─── DrawingExport ────────────────────────────────────────────────────────────
// Export tab — Client Overview, Shop Drawings, As-Builts, CSV BOM
export default function DrawingExport({ proposalId, orgId, sheets, proposal, stageRefs }) {
  const [activeExport,  setActiveExport]  = useState('client')
  const [placements,    setPlacements]    = useState([])
  const [cableRuns,     setCableRuns]     = useState([])
  const [pathways,      setPathways]      = useState([])
  const [verticalRises, setVerticalRises] = useState([])
  const [components,    setComponents]    = useState([])
  const [orgProfile,    setOrgProfile]    = useState(null)
  const [rooms,          setRooms]          = useState([])
  const [rackList,       setRackList]       = useState([])
  const [rackItemsData,  setRackItemsData]  = useState([])
  const [rackComponents,     setRackComponents]     = useState([])
  const [rackItemComponents, setRackItemComponents] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [generating,    setGenerating]    = useState(false)
  const [sharing,       setSharing]       = useState(false)
  const [exportFOV,      setExportFOV]      = useState(true)
  const [exportCables,   setExportCables]   = useState(true)
  const [exportPathways, setExportPathways] = useState(true)
  // Construction Drawing settings
  const [archDwgPrefix,    setArchDwgPrefix]    = useState('E')
  const [archScale,        setArchScale]        = useState('NTS')
  const [archPrelim,       setArchPrelim]       = useState(true)
  const [archFontScale,       setArchFontScale]       = useState(3.0)
  const [archIncludeCover,    setArchIncludeCover]    = useState(true)
  const [archIncludeSchedule, setArchIncludeSchedule] = useState(true)
  const [archSheetSettings, setArchSheetSettings] = useState({})  // { [id]: { label?, drawingNum? } }
  const [archPageList,      setArchPageList]      = useState([])  // ordered: { type:'sheet'|'notes', id }
  const [archRevisions,     setArchRevisions]     = useState([])  // { id, rev, date, description, by }
  const [archScope,         setArchScope]         = useState('')  // "Drawings For" bullet list
  const [archSettingsOpen,  setArchSettingsOpen]  = useState(false)

  const archStorageKey = `arch_settings_${proposalId}`

  // Load persisted arch settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(archStorageKey)
      if (saved) {
        const s = JSON.parse(saved)
        if (s.archDwgPrefix    !== undefined) setArchDwgPrefix(s.archDwgPrefix)
        if (s.archScale        !== undefined) setArchScale(s.archScale)
        if (s.archPrelim       !== undefined) setArchPrelim(s.archPrelim)
        if (s.archFontScale    !== undefined) setArchFontScale(s.archFontScale)
        if (s.archIncludeCover !== undefined) setArchIncludeCover(s.archIncludeCover)
        if (s.archIncludeSchedule !== undefined) setArchIncludeSchedule(s.archIncludeSchedule)
        if (s.archSheetSettings !== undefined) setArchSheetSettings(s.archSheetSettings)
        if (s.archPageList?.length > 0)       setArchPageList(s.archPageList)
        if (s.archRevisions    !== undefined) setArchRevisions(s.archRevisions)
        if (s.archScope        !== undefined) setArchScope(s.archScope)
      }
    } catch { /* ignore corrupt storage */ }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Persist arch settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(archStorageKey, JSON.stringify({
        archDwgPrefix, archScale, archPrelim, archFontScale,
        archIncludeCover, archIncludeSchedule,
        archSheetSettings, archPageList, archRevisions, archScope,
      }))
    } catch { /* ignore quota errors */ }
  }, [archDwgPrefix, archScale, archPrelim, archFontScale, archIncludeCover, archIncludeSchedule, archSheetSettings, archPageList, archRevisions, archScope])  // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise page list from Designer sheets (runs once when sheets first load and nothing is persisted)
  useEffect(() => {
    if (sheets.length > 0 && archPageList.length === 0)
      setArchPageList(sheets.map(s => ({ type: 'sheet', id: s.id })))
  }, [sheets])  // eslint-disable-line react-hooks/exhaustive-deps

  const updateSheetSetting = (id, key, val) =>
    setArchSheetSettings(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }))

  const [expandedNotes, setExpandedNotes] = useState(null)  // id of notes page currently open in editor

  const addNotesPage = () => {
    const id = `notes-${Date.now()}`
    setArchPageList(prev => [...prev, { type: 'notes', id }])
    // Start with one blank section
    setArchSheetSettings(prev => ({
      ...prev,
      [id]: { ...prev[id], sections: [{ id: `s-${Date.now()}`, heading: '', body: '' }] }
    }))
    setExpandedNotes(id)
  }

  const addSection = (pageId) => {
    setArchSheetSettings(prev => ({
      ...prev,
      [pageId]: {
        ...prev[pageId],
        sections: [...(prev[pageId]?.sections || []), { id: `s-${Date.now()}`, heading: '', body: '' }]
      }
    }))
  }

  const updateSection = (pageId, secId, key, val) => {
    setArchSheetSettings(prev => ({
      ...prev,
      [pageId]: {
        ...prev[pageId],
        sections: (prev[pageId]?.sections || []).map(s => s.id === secId ? { ...s, [key]: val } : s)
      }
    }))
  }

  const removeSection = (pageId, secId) => {
    setArchSheetSettings(prev => ({
      ...prev,
      [pageId]: {
        ...prev[pageId],
        sections: (prev[pageId]?.sections || []).filter(s => s.id !== secId)
      }
    }))
  }

  const movePage = (idx, dir) =>
    setArchPageList(prev => {
      const next = [...prev]
      const t = idx + dir
      if (t < 0 || t >= next.length) return prev
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return next
    })

  const removePage = (id) =>
    setArchPageList(prev => prev.filter(p => p.id !== id))

  const addRevision = () =>
    setArchRevisions(prev => [...prev, {
      id: `rev-${Date.now()}`,
      rev: String(prev.length + 1),
      date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
      description: '',
      by: orgProfile?.full_name || '',
    }])
  const updateRevision = (id, key, val) =>
    setArchRevisions(prev => prev.map(r => r.id === id ? { ...r, [key]: val } : r))
  const removeRevision = (id) =>
    setArchRevisions(prev => prev.filter(r => r.id !== id))

  const getSheetLabel  = (item, sheet) =>
    archSheetSettings[item.id]?.label ?? (item.type === 'notes' ? 'GENERAL NOTES' : (sheet?.name ?? ''))
  const getSheetDwgNum = (item, i) =>
    archSheetSettings[item.id]?.drawingNum || `${archDwgPrefix}${i + 1}.0`
  const [packages,      setPackages]      = useState([])
  const [copiedId,      setCopiedId]      = useState(null)
  const [shareExpiry,   setShareExpiry]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
  })
  const [sharePin,      setSharePin]      = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const sheetIds = sheets.map(s => s.id)
      if (!sheetIds.length) { setLoading(false); return }

      const [
        { data: placementData },
        { data: cableData },
        { data: riseData },
        { data: compData },
        { data: profileData },
        { data: pathwayData },
      ] = await Promise.all([
        supabase.from('drawing_placements')
          .select('*, global_products(id, name, part_number, manufacturer, category, specs, accessories)')
          .in('drawing_sheet_id', sheetIds)
          .order('created_at', { ascending: true }),
        supabase.from('cable_runs').select('*').in('drawing_sheet_id', sheetIds),
        supabase.from('vertical_rises').select('*').eq('proposal_id', proposalId),
        supabase.from('placement_components')
          .select('*, drawing_placements!inner(drawing_sheet_id)')
          .in('drawing_placements.drawing_sheet_id', sheetIds),
        supabase.auth.getUser().then(({ data: { user } }) =>
          supabase.from('profiles')
            .select('full_name, company_name, logo_url, primary_color, phone, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, organizations(title_block_engineer, title_block_license, title_block_scale)')
            .eq('id', user.id)
            .single()
        ),
        supabase.from('drawing_pathways').select('*').in('drawing_sheet_id', sheetIds),
      ])

      // Sort by sheet order first, then by placement creation time within each sheet
      const sorted = (placementData || []).sort((a, b) => {
        const sheetOrderA = sheetIds.indexOf(a.drawing_sheet_id)
        const sheetOrderB = sheetIds.indexOf(b.drawing_sheet_id)
        if (sheetOrderA !== sheetOrderB) return sheetOrderA - sheetOrderB
        return new Date(a.created_at) - new Date(b.created_at)
      })
      setPlacements(sorted)
      setCableRuns(cableData || [])
      setPathways(pathwayData || [])
      setVerticalRises(riseData || [])

      // Load existing share links
      const { data: pkgData } = await supabase
        .from('drawing_packages')
        .select('id, share_token, share_expires_at, share_pin, created_at, client_approved, client_approved_by, client_approved_at')
        .eq('proposal_id', proposalId)
        .not('share_token', 'is', null)
        .order('created_at', { ascending: false })
      setPackages(pkgData || [])

      // Aggregate components by type+name+part_number
      const compMap = Object.create(null)
      ;(compData || []).forEach(c => {
        const key = `${c.component_type}|${c.name || ''}|${c.part_number || ''}`
        if (!compMap[key]) compMap[key] = { ...c, quantity: 0 }
        compMap[key].quantity += c.quantity || 1
      })
      setComponents(Object.values(compMap))
      setOrgProfile(profileData)

      // Rooms / racks / rack items
      const { data: roomData } = await supabase
        .from('rooms').select('*').eq('proposal_id', proposalId).order('sort_order,created_at')
      setRooms(roomData || [])

      if (roomData?.length) {
        const { data: rackData } = await supabase
          .from('racks').select('*').in('room_id', roomData.map(r => r.id)).order('sort_order,created_at')
        setRackList(rackData || [])
        if (rackData?.length) {
          const rackIds = rackData.map(r => r.id)
          const [{ data: riData }, { data: rcData }] = await Promise.all([
            supabase.from('rack_items')
              .select('*, global_products(name, part_number, manufacturer, category)')
              .in('rack_id', rackIds)
              .order('u_start'),
            supabase.from('rack_components')
              .select('*')
              .in('rack_id', rackIds)
              .order('created_at'),
          ])
          setRackItemsData(riData || [])
          setRackComponents(rcData || [])

          if (riData?.length) {
            const riIds = riData.map(ri => ri.id)
            const { data: ricData } = await supabase
              .from('rack_item_components')
              .select('*')
              .in('rack_item_id', riIds)
              .order('created_at')
            setRackItemComponents(ricData || [])
          }
        }
      }
    } catch (err) {
      console.error('Export data load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [sheets, proposalId, orgId])

  useEffect(() => { loadData() }, [loadData])

  // ── Get unique categories used across all sheets ────────────────────────────
  const usedCategories = [...new Set(
    placements.map(p => p.global_products?.category).filter(Boolean)
  )].sort()

  // ── Placements per sheet ────────────────────────────────────────────────────
  const placementsBySheet = {}
  placements.forEach(p => {
    if (!placementsBySheet[p.drawing_sheet_id]) placementsBySheet[p.drawing_sheet_id] = []
    placementsBySheet[p.drawing_sheet_id].push(p)
  })

  // ── Cable summary ──────────────────────────────────────────────────────────
  const cableByType = Object.create(null)
  cableRuns.forEach(r => {
    const t = r.cable_type || 'Unknown'
    if (!cableByType[t]) cableByType[t] = { footage: 0, total_footage: 0, runs: 0 }
    cableByType[t].footage       += r.footage       || 0
    cableByType[t].total_footage += r.total_footage || 0
    cableByType[t].runs          += 1
  })
  verticalRises.forEach(r => {
    const t = r.cable_type || 'Unknown'
    if (!cableByType[t]) cableByType[t] = { footage: 0, total_footage: 0, runs: 0 }
    cableByType[t].total_footage += r.total_footage || 0
  })

  // ── Render sheet to image via Konva stage capture ──────────────────────────
  const getFloorPlanImage = async (sheetId) => {
    const sheet = sheets.find(s => s.id === sheetId)
    if (!sheet || ['blank', 'pending'].includes(sheet.storage_path)) return null
    try {
      const { getR2Url } = await import('../../r2')
      const signedUrl = await getR2Url(sheet.storage_path, 3600)
      if (!signedUrl) return null

      const isPDF = sheet.storage_path.toLowerCase().endsWith('.pdf')

      if (isPDF) {
        // Render PDF page to canvas using pdfjs
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerPort) pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorkerConstructor()

        const response  = await fetch(signedUrl)
        const arrayBuf  = await response.arrayBuffer()
        const pdfDoc    = await pdfjsLib.getDocument({ data: arrayBuf }).promise
        const pageNum   = sheet.page_number || 1
        const page      = await pdfDoc.getPage(pageNum)
        const viewport  = page.getViewport({ scale: 2 })
        const canvas    = document.createElement('canvas')
        canvas.width    = viewport.width
        canvas.height   = viewport.height
        const ctx       = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise
        return canvas.toDataURL('image/png')
      } else {
        // Regular image
        const response = await fetch(signedUrl)
        const blob     = await response.blob()
        const reader   = new FileReader()
        return await new Promise(resolve => {
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        })
      }
    } catch (err) {
      console.error('getFloorPlanImage failed:', err)
      return null
    }
  }

  const drawSheetOnPDF = async (pdf, sheet, imgData, imgX, imgY, imgW, imgH, showFOV = true) => {
    // Background
    pdf.setFillColor(255, 255, 255)
    pdf.rect(imgX, imgY, imgW, imgH, 'F')
    // Floor plan image — preserve aspect ratio
    let imgNaturalW = null
    if (imgData) {
      try {
        let format = 'PNG'
        if (imgData.includes('data:image/jpeg') || imgData.includes('data:image/jpg')) format = 'JPEG'
        else if (imgData.includes('data:image/webp')) format = 'WEBP'
        const base64 = imgData.split(',')[1]

        const tempImg = await new Promise(resolve => {
          const img = new Image()
          img.onload  = () => resolve(img)
          img.onerror = () => resolve(img)
          img.src = imgData
        })
        const naturalW = tempImg.naturalWidth  || imgW
        const naturalH = tempImg.naturalHeight || imgH
        imgNaturalW = naturalW
        const ratio    = Math.min(imgW / naturalW, imgH / naturalH)
        const drawW    = naturalW * ratio
        const drawH    = naturalH * ratio
        const drawX    = imgX + (imgW - drawW) / 2
        const drawY    = imgY + (imgH - drawH) / 2

        pdf.addImage(base64, format, drawX, drawY, drawW, drawH, undefined, 'FAST')

        // Update effective image bounds for device placement
        imgX = drawX
        imgY = drawY
        imgW = drawW
        imgH = drawH
      } catch (err) {
        console.warn('Image add failed, skipping:', err.message)
      }
    }

    // Cable runs (drawn below devices)
    if (exportCables) {
      for (const run of cableRuns.filter(r => r.drawing_sheet_id === sheet.id)) {
        drawPolylineOnPDF(pdf, run.points, imgX, imgY, imgW, imgH, run.color || '#3b82f6', 0.5, [3, 1.5])
      }
    }
    // Pathways (drawn below devices)
    if (exportPathways) {
      for (const pw of pathways.filter(p => p.drawing_sheet_id === sheet.id)) {
        const def = PATHWAY_DEFS_MAP[pw.pathway_type] || PATHWAY_DEFS[0]
        const dashMm = (def?.dash || []).length ? def.dash.map(d => d * 0.3) : []
        drawPolylineOnPDF(pdf, pw.points, imgX, imgY, imgW, imgH, def?.color || '#4a90d9', 0.8, dashMm)
      }
    }

    // Device markers + FOV
    const sheetPlacements = placementsBySheet[sheet.id] || []
    const placedLabels = []
    for (const p of sheetPlacements) {
      const px  = imgX + p.x * imgW
      const py  = imgY + p.y * imgH
      if (!isFinite(px) || !isFinite(py)) continue
      const col = p.marker_color || '#C8622A'
      const r   = parseInt(col.slice(1,3),16)
      const g   = parseInt(col.slice(3,5),16)
      const b   = parseInt(col.slice(5,7),16)

      // FOV cone — mirrors canvas rendering in DrawingSheet
      const fovCategories = ['Dome Camera','Bullet Camera','PTZ Camera','Motion Sensor','Multi-Lens Camera','Fisheye Camera']
      const category = p.global_products?.category || ''
      if (showFOV && fovCategories.includes(category) && isFinite(px) && isFinite(py)) {
        const fovAngle    = p.fov_angle || p.global_products?.specs?.fov_angle || (category === 'PTZ Camera' ? 360 : 90)
        const rangeInFeet = p.fov_range || p.global_products?.specs?.ir_range || 30
        const fallbackMM  = Math.min(imgW, imgH) * 0.08
        const computed    = imgNaturalW && sheet.scale_ratio
          ? (imgW / (imgNaturalW * sheet.scale_ratio)) * rangeInFeet
          : null
        const rangeInMM   = (computed && isFinite(computed) && computed > 0) ? computed : fallbackMM
        pdf.saveGraphicsState()
        pdf.setGState(pdf.GState({ opacity: 0.12, 'stroke-opacity': 0.4 }))
        pdf.setFillColor(r, g, b)
        pdf.setDrawColor(r, g, b)
        pdf.setLineWidth(0.3)

        if (category === 'PTZ Camera' || fovAngle >= 355) {
          pdf.circle(px, py, rangeInMM, 'FD')
        } else {
          const startAngle = ((p.rotation || 0) - fovAngle / 2) * Math.PI / 180
          const endAngle   = ((p.rotation || 0) + fovAngle / 2) * Math.PI / 180
          const steps      = Math.max(16, Math.floor(fovAngle / 5))
          const pts = [[px, py]]
          for (let i = 0; i <= steps; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i / steps)
            pts.push([px + Math.cos(angle) * rangeInMM, py + Math.sin(angle) * rangeInMM])
          }
          pts.push([px, py])
          const deltas = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]])
          if (deltas.every(d => isFinite(d[0]) && isFinite(d[1]))) {
            pdf.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'FD')
          }
        }
        pdf.restoreGraphicsState()
      }

      // Device icon — size proportional to floor plan image, matching canvas marker scale
      const symbolSizeMM = imgNaturalW
        ? Math.max((p.symbol_size || 32) * (imgW / imgNaturalW), 2)
        : 4
      const iconSize = symbolSizeMM * 0.65
      pdf.setFillColor(r, g, b)
      pdf.circle(px, py, symbolSizeMM / 2, 'F')
      const iconPng = await getIconPng(p.global_products?.category || 'default', '#ffffff', 32)
      if (iconPng) {
        pdf.addImage(iconPng, 'PNG', px - iconSize/2, py - iconSize/2, iconSize, iconSize)
      }

      // Site condition badge (E/R/D) — top-right of marker, matches canvas rendering
      if (p.site_condition && p.site_condition !== 'new') {
        const badgeR   = Math.max(symbolSizeMM * 0.24, 1.2)
        const bx       = px + symbolSizeMM * 0.28
        const by       = py - symbolSizeMM * 0.52
        const badgeCol = p.site_condition === 'existing' ? [34, 197, 94]
                       : p.site_condition === 'demo'     ? [168, 85, 247]
                       : [239, 68, 68]
        const letter   = p.site_condition === 'existing' ? 'E'
                       : p.site_condition === 'demo'     ? 'D' : 'R'
        pdf.setFillColor(...badgeCol)
        pdf.setDrawColor(255, 255, 255)
        pdf.setLineWidth(0.4)
        pdf.circle(bx, by, badgeR, 'FD')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(Math.max(badgeR * 3.5, 4))
        pdf.setFont('helvetica', 'bold')
        pdf.text(letter, bx, by + badgeR * 0.38, { align: 'center' })
      }

      // Device label — try below, then above, right, left; fall back to below if all overlap
      if (p.device_address) {
        const fs    = Math.max(symbolSizeMM * 0.7, 3)   // points — for setFontSize only
        const fsMm  = ptToMm(fs)                         // mm — for all spatial math
        const rad   = symbolSizeMM / 2
        const gap   = rad + 0.5                          // 0.5mm clearance from circle edge
        const label = p.device_address

        const candidates = [
          [px,            py + gap + fsMm],    // below
          [px,            py - gap],            // above
          [px + gap,      py + fsMm * 0.4],    // right
          [px - gap,      py + fsMm * 0.4],    // left
        ]

        let lx = candidates[0][0], ly = candidates[0][1]
        for (const [cx, cy] of candidates) {
          const box = mkLabelBox(cx, cy, label, fsMm)
          if (!placedLabels.some(b => boxesOverlap(box, b))) {
            lx = cx; ly = cy
            placedLabels.push(box)
            break
          }
        }
        // Always record so subsequent labels don't overlap this one
        if (!placedLabels.some(b => boxesOverlap(mkLabelBox(lx, ly, label, fsMm), b))) {
          placedLabels.push(mkLabelBox(lx, ly, label, fsMm))
        }

        pdf.setTextColor(r, g, b)
        pdf.setFontSize(fs)
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, lx, ly, { align: 'center' })
      }
    }
  }

  // ── Load org logo safely (fetch → dataURL avoids CORS/tainted-canvas issues)
  const loadOrgLogo = async () => {
    if (!orgProfile?.logo_url) return null
    try {
      const resp = await fetch(orgProfile.logo_url)
      if (!resp.ok) return null
      const blob = await resp.blob()
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const img = new Image()
      img.src = dataUrl
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      if (img.naturalWidth === 0) return null
      return img
    } catch {
      return null
    }
  }

  const drawDocCover = (pdf, opts) => drawDocCoverPage(pdf, orgProfile, opts)

  // ── DORI Report PDF ────────────────────────────────────────────────────────
  const handleDoriExport = async () => {
    const CAMERA_CATS = ['Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera']
    const THRESHOLDS  = [
      { label: 'Detection',      ppm: 25  },
      { label: 'Observation',    ppm: 62  },
      { label: 'Recognition',    ppm: 125 },
      { label: 'Identification', ppm: 250 },
    ]

    const cameras = placements.filter(p => CAMERA_CATS.includes(p.global_products?.category))
    if (!cameras.length) { alert('No cameras found on this project.'); return }

    const { default: jsPDF }     = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const pdf      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW    = pdf.internal.pageSize.getWidth()
    const pageH    = pdf.internal.pageSize.getHeight()
    const margin   = 14
    const orgName  = orgProfile?.company_name || ''
    const projName = proposal?.name || proposal?.address || 'Project'

    // Title block
    pdf.setFillColor(15, 28, 46)
    pdf.rect(0, 0, pageW, 18, 'F')
    pdf.setTextColor(200, 98, 42)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('DORI ANALYSIS REPORT', margin, 11)
    pdf.setTextColor(180, 180, 180)
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${orgName}  ·  ${projName}`, pageW - margin, 11, { align: 'right' })

    // Subtitle legend
    pdf.setFontSize(7)
    pdf.setTextColor(120, 130, 145)
    pdf.text('Per IEC 62676-4  ·  All distances in feet  ·  Based on 16:9 sensor aspect ratio', margin, 16)

    // Build table rows
    const rows = cameras.map((p, idx) => {
      const gp      = p.global_products
      const sheet   = sheets.find(s => s.id === p.drawing_sheet_id)
      const hfov    = p.fov_angle || gp?.specs?.fov_angle || null
      const mpText  = `${gp?.name || ''} ${gp?.specs?.mp || ''}`.toLowerCase()
      const mpMatch = mpText.match(/(\d+(?:\.\d+)?)\s*mp/)
      const mp      = mpMatch ? parseFloat(mpMatch[1]) : 2
      const resH    = Math.round(Math.sqrt(mp * 1_000_000 * 16 / 9))

      const dori = hfov && hfov < 180 && resH
        ? THRESHOLDS.map(t => {
            const rad    = hfov * Math.PI / 180
            const meters = resH / (t.ppm * 2 * Math.tan(rad / 2))
            return Math.round(meters * 3.28084)
          })
        : [null, null, null, null]

      return [
        idx + 1,
        p.device_address || '—',
        sheet?.name || '—',
        p.description_override || gp?.name || '—',
        hfov != null ? `${hfov}°` : '—',
        `${mp} MP`,
        dori[0] != null ? `${dori[0]} ft` : '—',
        dori[1] != null ? `${dori[1]} ft` : '—',
        dori[2] != null ? `${dori[2]} ft` : '—',
        dori[3] != null ? `${dori[3]} ft` : '—',
      ]
    })

    autoTable(pdf, {
      startY:    22,
      margin:    { left: margin, right: margin },
      head:      [['#', 'Address', 'Sheet', 'Model', 'HFoV', 'Resolution', 'Detection', 'Observation', 'Recognition', 'Identification']],
      body:      rows,
      styles:    { fontSize: 7.5, cellPadding: 3, font: 'helvetica', textColor: [220, 220, 220], fillColor: [26, 45, 69] },
      headStyles:{ fillColor: [15, 28, 46], textColor: [200, 98, 42], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [22, 35, 56] },
      columnStyles: {
        0:  { cellWidth: 8,  halign: 'center' },
        1:  { cellWidth: 20, fontStyle: 'bold' },
        2:  { cellWidth: 30 },
        3:  { cellWidth: 55 },
        4:  { cellWidth: 14, halign: 'center' },
        5:  { cellWidth: 20, halign: 'center' },
        6:  { cellWidth: 22, halign: 'right', textColor: [74, 222, 128] },
        7:  { cellWidth: 22, halign: 'right', textColor: [96, 165, 250] },
        8:  { cellWidth: 22, halign: 'right', textColor: [250, 204, 21] },
        9:  { cellWidth: 22, halign: 'right', textColor: [248, 113, 113] },
      },
      didDrawPage: (d) => {
        // Footer
        pdf.setFillColor(15, 28, 46)
        pdf.rect(0, pageH - 8, pageW, 8, 'F')
        pdf.setTextColor(100, 110, 125)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        pdf.text('D=25 PPM  ·  O=62 PPM  ·  R=125 PPM  ·  I=250 PPM', margin, pageH - 2.5)
        pdf.text(`Page ${d.pageNumber}`, pageW - margin, pageH - 2.5, { align: 'right' })
      },
    })

    await savePdf(pdf, `DORI-Report-${projName.replace(/\s+/g, '-')}.pdf`)
  }

  // ── CSV BOM Export ─────────────────────────────────────────────────────────
  const handleCSVExport = async () => {
    const rows = []

    // Header
    rows.push(['Device Address', 'Part Number', 'Name', 'Manufacturer', 'Category', 'Qty', 'Notes'])

    // Devices — New and Replace only (Existing/Demo excluded from BOM)
    const deviceMap = {}
    placements.filter(p => !p.site_condition || p.site_condition === 'new' || p.site_condition === 'replace').forEach(p => {
      const gp  = p.global_products
      const key = p.part_number_override || gp?.part_number || 'unknown'
      if (!deviceMap[key]) {
        deviceMap[key] = {
          part_number:  p.part_number_override  || gp?.part_number  || '',
          name:         p.description_override  || gp?.name         || '',
          manufacturer: p.manufacturer_override || gp?.manufacturer || '',
          category:     gp?.category || '',
          qty:          0,
          addresses:    [],
        }
      }
      deviceMap[key].qty += p.quantity || 1
      if (p.device_address) deviceMap[key].addresses.push(p.device_address)
    })

    Object.values(deviceMap).forEach(d => {
      rows.push([
        d.addresses.join(', '),
        d.part_number,
        d.name,
        d.manufacturer,
        d.category,
        d.qty,
        '',
      ])
    })

    // Components
    if (components.length > 0) {
      rows.push([])
      rows.push(['COMPONENTS & HARDWARE', '', '', '', '', '', ''])
      rows.push(['Type', 'Part Number', 'Name', 'Manufacturer', 'Qty', 'Notes', ''])
      components.forEach(c => {
        rows.push([c.component_type, c.part_number || '', c.name || '', c.manufacturer || '', c.quantity || 1, c.notes || '', ''])
      })
    }

    // Cable summary
    rows.push([])
    rows.push(['CABLE SUMMARY', '', '', '', '', '', ''])
    rows.push(['Cable Type', 'Runs', 'Measured (ft)', 'With Waste (ft)', '', '', ''])
    Object.entries(cableByType).forEach(([type, data]) => {
      rows.push([type, data.runs || '', Math.round(data.footage) || '—', Math.round(data.total_footage) || '—', '', '', ''])
    })

    // Vertical rises
    if (verticalRises.length > 0) {
      rows.push([])
      rows.push(['VERTICAL RISES', '', '', '', '', '', '', ''])
      rows.push(['From', 'To', 'Label', 'Cable Type', 'Height (ft)', 'Qty', 'Total (ft)', ''])
      verticalRises.forEach(r => {
        const fromSheet = sheets.find(s => s.id === r.from_sheet_id)
        const toSheet   = sheets.find(s => s.id === r.to_sheet_id)
        rows.push([
          fromSheet?.name || '',
          toSheet?.name || '',
          r.label || '',
          r.cable_type,
          r.rise_height,
          r.quantity,
          Math.round(r.total_footage),
          '',
        ])
      })
    }

    // Convert to CSV
    const csv = rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    await nativeDownload(`${proposal?.proposal_name || 'Drawing'}_BOM.csv`, blob, 'text/csv')
  }

  // ── Client Overview PDF ────────────────────────────────────────────────────
  const handleClientOverview = async () => {
    setGenerating(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 10

      const logoImg = await loadOrgLogo()

      // ── Cover page ───────────────────────────────────────────────────────
      drawDocCover(pdf, {
        eyebrow: 'Customer Overview',
        title: proposal?.proposal_name || 'Floor Plan Drawing',
        subtitle: proposal?.company || '',
        meta: [
          `Date: ${new Date().toLocaleDateString()}`,
          `Sheets: ${sheets.length}   ·   Devices: ${placements.length}`,
        ],
        logoImg,
      })

      // ── Legend page ──────────────────────────────────────────────────────
      pdf.addPage()
      pdf.setFillColor(255, 255, 255)
      pdf.rect(0, 0, pageW, pageH, 'F')

      const [lr, lg, lb] = hexToRgbArr(orgProfile?.primary_color)
      pdf.setFillColor(lr, lg, lb)
      pdf.rect(0, 0, pageW, 10, 'F')
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold')
      pdf.text('SYMBOL LEGEND', margin, 7)
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'normal')
      pdf.text(`${orgProfile?.company_name || ''}  ·  ${proposal?.proposal_name || ''}`, pageW - margin, 7, { align: 'right' })

      let lx = margin
      // Draw legend items
      const colW   = 55
      const rowH   = 14
      const perRow = Math.floor((pageW - margin * 2) / colW)
      let col = 0

      for (const category of usedCategories) {
        // Category icon
        const legendIcon = await getIconPng(category, '#C8622A', 32)
        if (legendIcon) {
          pdf.addImage(legendIcon, 'PNG', lx, ly - 2, 8, 8)
        } else {
          pdf.setFillColor(200, 98, 42)
          pdf.circle(lx + 4, ly + 3, 4, 'F')
        }

        // Category name
        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.text(category, lx + 12, ly + 5)

        // Count
        const count = placements.filter(p => p.global_products?.category === category).length
        pdf.setTextColor(90, 100, 110)
        pdf.text(`(${count})`, lx + 12, ly + 10)

        col++
        if (col >= perRow) {
          col = 0
          lx  = margin
          ly += rowH
        } else {
          lx += colW
        }
      }

      // Site condition key
      const condKeyY = ly + (col > 0 ? rowH : 0) + 10
      pdf.setTextColor(200, 98, 42)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SITE CONDITIONS', margin, condKeyY)
      const condItems = [
        { label: 'New',      color: [200, 98, 42], letter: null },
        { label: 'Existing', color: [34, 197, 94],  letter: 'E' },
        { label: 'Replace',  color: [239, 68, 68],  letter: 'R' },
        { label: 'Demo',     color: [168, 85, 247],  letter: 'D' },
      ]
      let ckx = margin
      condItems.forEach(({ label, color, letter }) => {
        pdf.setFillColor(...color)
        pdf.setDrawColor(255, 255, 255)
        pdf.setLineWidth(0.3)
        pdf.circle(ckx + 3, condKeyY + 6, 3, letter ? 'FD' : 'F')
        if (letter) {
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(5)
          pdf.setFont('helvetica', 'bold')
          pdf.text(letter, ckx + 3, condKeyY + 7.1, { align: 'center' })
        }
        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.text(label, ckx + 8, condKeyY + 7.5)
        ckx += 30
      })

      // Cable summary on legend page
      if (Object.keys(cableByType).length > 0) {
        const cableY = Math.max(condKeyY + 20, pageH - 60)
        pdf.setTextColor(200, 98, 42)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.text('CABLE SUMMARY', margin, cableY)

        let cy = cableY + 8
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        Object.entries(cableByType).forEach(([type, data]) => {
          pdf.setTextColor(30, 30, 30)
          pdf.text(type, margin, cy)
          pdf.setTextColor(90, 100, 110)
          pdf.text(`${Math.round(data.total_footage)}ft (with waste)`, margin + 50, cy)
          cy += 6
        })
      }

      // ── One page per sheet ───────────────────────────────────────────────
      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i]
        pdf.addPage()

        // Page background
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageW, pageH, 'F')

        // Header bar
        pdf.setFillColor(245, 246, 248)
        pdf.rect(0, 0, pageW, 12, 'F')
        pdf.setDrawColor(210, 210, 210)
        pdf.setLineWidth(0.3)
        pdf.line(0, 12, pageW, 12)

        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.text(sheet.name, margin, 8)

        pdf.setTextColor(90, 100, 110)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`${orgProfile?.company_name || ''} · ${proposal?.proposal_name || ''}`, pageW - margin, 8, { align: 'right' })

        // Floor plan image area — preserve aspect ratio
        const titleBlockH = 18
        const imgY        = 14
        const maxImgH     = pageH - imgY - titleBlockH - 2
        const maxImgW     = pageW - margin * 2

        // Draw floor plan maintaining aspect ratio
        const imgData = await getFloorPlanImage(sheet.id)
        await drawSheetOnPDF(pdf, sheet, imgData, margin, imgY, maxImgW, maxImgH, exportFOV)

        // Title block footer
        const tbY = pageH - titleBlockH
        pdf.setFillColor(245, 246, 248)
        pdf.rect(0, tbY, pageW, titleBlockH, 'F')
        pdf.setDrawColor(210, 210, 210)
        pdf.setLineWidth(0.3)
        pdf.line(0, tbY, pageW, tbY)

        // Left — company name
        pdf.setTextColor(200, 98, 42)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.text(orgProfile?.company_name || '', margin, tbY + 6)

        // Center — proposal name + sheet name
        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text(proposal?.proposal_name || '', pageW / 2, tbY + 5, { align: 'center' })
        pdf.setTextColor(90, 100, 110)
        pdf.text(sheet.name, pageW / 2, tbY + 11, { align: 'center' })

        // Right — sheet number + date
        pdf.setTextColor(90, 100, 110)
        pdf.setFontSize(7)
        pdf.text(`Sheet ${i + 1} of ${sheets.length}`, pageW - margin, tbY + 5, { align: 'right' })
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageW - margin, tbY + 11, { align: 'right' })
      }

      await savePdf(pdf, `${proposal?.proposal_name || 'Drawing'}_Client_Overview.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('PDF generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Shop Drawing PDF ───────────────────────────────────────────────────────
  const handleShopDrawing = async () => {
    setGenerating(true)
    try {
      const pdf = await generateShopDrawingsPdf({ sheets, placements, cableRuns, verticalRises, pathways, orgProfile, proposal, exportFOV, exportCables, exportPathways })
      await savePdf(pdf, `${proposal?.proposal_name || 'Drawing'}_Shop_Drawings.pdf`)
    } catch (err) {
      console.error('Shop drawing failed:', err)
      alert('PDF generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }


  // ── As-Built PDF ───────────────────────────────────────────────────────────
  const handleAsBuilt = async () => {
    setGenerating(true)
    try {
      const { default: jsPDF }     = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

      const pageW  = pdf.internal.pageSize.getWidth()
      const pageH  = pdf.internal.pageSize.getHeight()
      const margin = 10

      const logoImg = await loadOrgLogo()

      // ── Cover page ───────────────────────────────────────────────────────
      drawDocCover(pdf, {
        eyebrow: 'As-Built Drawings',
        title: proposal?.proposal_name || 'As-Built Drawings',
        subtitle: proposal?.company || '',
        meta: [`As-Built Date: ${new Date().toLocaleDateString()}`],
        logoImg,
      })

      // As-built device schedule
      pdf.addPage()
      pdf.setFillColor(255,255,255)
      pdf.rect(0,0,pageW,pageH,'F')
      pdf.setTextColor(200,98,42)
      pdf.setFontSize(12)
      pdf.setFont('helvetica','bold')
      pdf.text('AS-BUILT DEVICE SCHEDULE', margin, margin+8)

      const asBuiltRows = placements.map((p, idx) => {
        const gp    = p.global_products
        const sheet = sheets.find(s => s.id === p.drawing_sheet_id)
        return [
          idx + 1,
          p.device_address    || '—',
          p.part_number_override || gp?.part_number || '—',
          p.description_override || gp?.name        || '—',
          p.manufacturer_override || gp?.manufacturer || '—',
          conditionLabel(p.site_condition),
          sheet?.name         || '—',
          p.serial_number     || '—',
          p.ip_address        || '—',
          p.mac_address       || '—',
          p.switch_name       || '—',
          p.switch_port       || '—',
          p.patch_panel_label || '—',
          p.runs_to_label     || '—',
        ]
      })

      autoTable(pdf, {
        startY:     margin + 14,
        margin:     { left: margin, right: margin, bottom: margin + 5 },
        head:       [['#', 'Address', 'Part #', 'Description', 'Manufacturer', 'Condition', 'Sheet', 'Serial', 'IP', 'MAC', 'Switch', 'Port', 'Patch Panel', 'Runs To']],
        body:       asBuiltRows,
        theme:      'grid',
        styles:     { fontSize: 6, cellPadding: 1.5, textColor: [30,30,30], fillColor: [255,255,255], lineColor: [210,210,210] },
        headStyles: { fillColor: [245,246,248], textColor: [200,98,42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248,249,250] },
      })

      await savePdf(pdf, `${proposal?.proposal_name || 'Drawing'}_As_Built.pdf`)
    } catch (err) {
      console.error('As-built failed:', err)
      alert('PDF generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Share helpers ───────────────────────────────────────────────────────────
  const handleShare = async () => {
    setSharing(true)
    try {
      const token   = crypto.randomUUID()
      const expires = shareExpiry ? new Date(shareExpiry + 'T23:59:59').toISOString() : null
      const { data, error } = await supabase
        .from('drawing_packages')
        .insert({
          org_id:           orgId,
          proposal_id:      proposalId,
          package_type:     'client_overview',
          revision:         'Rev 0',
          status:           'submitted',
          share_token:      token,
          shared_at:        new Date().toISOString(),
          share_expires_at: expires,
          share_pin:        sharePin.trim() || null,
        })
        .select('id, share_token, share_expires_at, share_pin, created_at, client_approved, client_approved_by, client_approved_at')
        .single()
      if (!error && data) {
        setPackages(prev => [data, ...prev])
        setSharePin('')
      }
    } catch (err) { console.error('Share failed:', err) }
    finally { setSharing(false) }
  }

  const handleCopyLink = (token, id) => {
    const link = `${APP_BASE_URL}/designer/review/${token}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this link? The client will no longer be able to access it.')) return
    await supabase.from('drawing_packages').update({ share_token: null }).eq('id', id)
    setPackages(prev => prev.filter(p => p.id !== id))
  }

  // ── Rack Schedule PDF ──────────────────────────────────────────────────────
  const handleRackSchedule = async () => {
    setGenerating(true)
    try {
      const { default: jsPDF }     = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

      const pageW  = pdf.internal.pageSize.getWidth()
      const pageH  = pdf.internal.pageSize.getHeight()
      const margin = 12

      const hexToRgb = (hex) => {
        const n = parseInt(hex.replace('#', ''), 16)
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      }

      const ROOM_COLORS = { mdf: '#C8622A', idf: '#3b82f6', headend: '#10b981', electrical: '#f59e0b', server: '#a855f7', closet: '#06b6d4', av: '#8b5cf6', other: '#64748b' }
      const ROOM_LABELS = { mdf: 'MDF', idf: 'IDF', headend: 'Headend', electrical: 'Electrical Room', server: 'Server Room', closet: 'Wiring Closet', av: 'AV Rack Room', other: 'Other' }
      const RACK_LABELS = { four_post: '4-Post Open Frame', two_post: '2-Post Open Frame', enclosed: 'Enclosed Cabinet', open_frame: 'Open Frame', wall_mount: 'Wall Mount', shelf: 'Shelf / Surface' }
      const RACK_HAS_U  = { four_post: true, two_post: true, enclosed: true, open_frame: true, wall_mount: false, shelf: false }

      const logoImg = await loadOrgLogo()

      // ── Cover page ───────────────────────────────────────────────────────
      drawDocCover(pdf, {
        eyebrow: 'Rack Schedule',
        title: proposal?.proposal_name || 'Rack Schedule',
        subtitle: proposal?.company || '',
        meta: [
          `Date: ${new Date().toLocaleDateString()}`,
          `${rooms.length} room${rooms.length !== 1 ? 's' : ''}  ·  ${rackList.length} rack${rackList.length !== 1 ? 's' : ''}  ·  ${rackItemsData.length} device${rackItemsData.length !== 1 ? 's' : ''}`,
        ],
        logoImg,
      })

      // ── One page per room ────────────────────────────────────────────────
      for (const room of rooms) {
        const roomRacks = rackList.filter(r => r.room_id === room.id)
        if (!roomRacks.length) continue

        pdf.addPage()
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageW, pageH, 'F')

        // Room color header bar
        const col = ROOM_COLORS[room.room_type] || '#64748b'
        const [r, g, b] = hexToRgb(col)
        pdf.setFillColor(r, g, b)
        pdf.rect(0, 0, pageW, 14, 'F')
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
        pdf.text(room.name, margin, 9)
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(230, 230, 230)
        pdf.text(ROOM_LABELS[room.room_type] || room.room_type, pageW - margin, 6, { align: 'right' })
        pdf.setFontSize(7); pdf.setTextColor(255, 255, 255, 0.8)
        pdf.text(`${orgProfile?.company_name || ''} · ${proposal?.proposal_name || ''}`, pageW - margin, 11.5, { align: 'right' })

        let currentY = 20

        for (const rack of roomRacks) {
          const rItems    = rackItemsData.filter(i => i.rack_id === rack.id)
          const isUBased  = RACK_HAS_U[rack.rack_type] !== false
          const rackLabel = RACK_LABELS[rack.rack_type] || rack.rack_type

          // Rack subheader
          pdf.setFillColor(26, 45, 69)
          pdf.rect(margin - 2, currentY - 2, pageW - margin * 2 + 4, 9, 'F')
          pdf.setTextColor(200, 98, 42); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold')
          pdf.text(rack.name, margin, currentY + 4)
          pdf.setTextColor(138, 154, 176); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
          const rackMeta = `${rackLabel}${rack.total_u ? ` · ${rack.total_u}U` : ''}`
          pdf.text(rackMeta, pageW - margin, currentY + 4, { align: 'right' })
          currentY += 12

          if (rItems.length === 0) {
            pdf.setTextColor(150, 150, 150); pdf.setFontSize(8); pdf.setFont('helvetica', 'italic')
            pdf.text('(empty)', margin, currentY + 3)
            currentY += 10
            continue
          }

          const head = isUBased
            ? [['U', 'Label / Device', 'Category', 'Manufacturer', 'Part Number', 'Qty', 'Notes']]
            : [['#', 'Label / Device', 'Category', 'Manufacturer', 'Part Number', 'Qty', 'Notes']]

          const body = rItems.map((item, idx) => {
            const gp = item.global_products
            const uLabel = isUBased
              ? (item.u_size > 1 ? `${item.u_start}–${item.u_start + item.u_size - 1}` : String(item.u_start))
              : String(idx + 1)
            return [
              uLabel,
              item.label || gp?.name || item.model || '—',
              item.category || gp?.category || '—',
              item.manufacturer || gp?.manufacturer || '—',
              item.part_number || gp?.part_number || '—',
              String(item.quantity || 1),
              item.notes || '',
            ]
          })

          autoTable(pdf, {
            startY: currentY,
            margin: { left: margin, right: margin, bottom: 15 },
            head,
            body,
            theme: 'grid',
            styles:     { fontSize: 7.5, cellPadding: 2, textColor: [40, 40, 40], fillColor: [255, 255, 255], lineColor: [200, 200, 200] },
            headStyles: { fillColor: [26, 45, 69], textColor: [200, 98, 42], fontStyle: 'bold', fontSize: 7.5 },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            columnStyles: {
              0: { cellWidth: isUBased ? 14 : 10 },
              5: { cellWidth: 10, halign: 'center' },
              6: { cellWidth: 28 },
            },
          })

          currentY = pdf.lastAutoTable.finalY + 6

          // Rack accessories & item-level components (SFP modules, etc.)
          const rComps = rackComponents.filter(c => c.rack_id === rack.id)
          // Gather all item components for this rack's items
          const rackItemIds = rItems.map(i => i.id)
          const riComps = rackItemComponents.filter(c => rackItemIds.includes(c.rack_item_id))
          const allComps = [
            ...rComps.map(c => ({ ...c, _source: 'rack' })),
            ...riComps.map(c => ({ ...c, _source: 'item' })),
          ]

          if (allComps.length > 0) {
            pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(138, 154, 176)
            pdf.text('ACCESSORIES & COMPONENTS', margin, currentY + 3)
            currentY += 7
            autoTable(pdf, {
              startY: currentY,
              margin: { left: margin, right: margin, bottom: 15 },
              head: [['Type', 'Name / Description', 'Part Number', 'Manufacturer', 'Qty', 'Notes']],
              body: allComps.map(c => [
                c.component_type || '—',
                c.name || '—',
                c.part_number || '—',
                c.manufacturer || '—',
                String(c.quantity || 1),
                c.notes || '',
              ]),
              theme: 'grid',
              styles:     { fontSize: 7, cellPadding: 1.5, textColor: [60, 80, 100], fillColor: [248, 250, 255], lineColor: [200, 215, 230] },
              headStyles: { fillColor: [42, 61, 85], textColor: [138, 154, 176], fontStyle: 'bold', fontSize: 7 },
              columnStyles: { 4: { cellWidth: 10, halign: 'center' }, 5: { cellWidth: 28 } },
            })
            currentY = pdf.lastAutoTable.finalY + 10
          } else {
            currentY += 4
          }

          if (currentY > pageH - 35) {
            pdf.addPage()
            pdf.setFillColor(255, 255, 255)
            pdf.rect(0, 0, pageW, pageH, 'F')
            currentY = margin
          }
        }
      }

      // Page footers — dark title bar on every page
      const total = pdf.internal.getNumberOfPages()
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i)
        pdf.setFillColor(26, 45, 69)
        pdf.rect(0, pageH - 10, pageW, 10, 'F')
        pdf.setDrawColor(42, 61, 85); pdf.setLineWidth(0.3)
        pdf.line(0, pageH - 10, pageW, pageH - 10)
        pdf.setFontSize(7); pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(200, 98, 42)
        pdf.text(orgProfile?.company_name || '', margin, pageH - 4)
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(255, 255, 255)
        pdf.text(proposal?.proposal_name || '', pageW / 2, pageH - 4, { align: 'center' })
        pdf.setTextColor(138, 154, 176)
        pdf.text(`Rack Schedule · Page ${i} of ${total}`, pageW - margin, pageH - 4, { align: 'right' })
      }

      await savePdf(pdf, `${proposal?.proposal_name || 'Drawing'}_Rack_Schedule.pdf`)
    } catch (err) {
      console.error('Rack schedule failed:', err)
      alert('PDF generation failed: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Architect / Construction Drawing PDF ─────────────────────────────────
  const handleArchDrawing = async () => {
    setGenerating(true)
    try {
      const { default: jsPDF } = await import('jspdf')

      // 24×36 Arch D, landscape: pageW=914.4 pageH=609.6
      const pdf    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [609.6, 914.4] })
      const pageW  = pdf.internal.pageSize.getWidth()
      const pageH  = pdf.internal.pageSize.getHeight()
      const brandHex = orgProfile?.primary_color || '#C8622A'
      const [r, g, b] = hexToRgbArr(brandHex)
      const logoImg   = await loadOrgLogo()

      // Resolve project address from client or location record
      let projectAddress = ''
      if (proposal?.location_id) {
        const { data: loc } = await supabase.from('client_locations')
          .select('site_name, address, city, state, zip').eq('id', proposal.location_id).single()
        if (loc) projectAddress = [loc.site_name, loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')
      } else if (proposal?.client_id) {
        const { data: cli } = await supabase.from('clients')
          .select('address, city, state, zip').eq('id', proposal.client_id).single()
        if (cli) projectAddress = [cli.address, cli.city, cli.state, cli.zip].filter(Boolean).join(', ')
      }

      // Layout constants
      const outerM = 7     // outer border margin
      const innerM = 13    // inner border (drawing frame)
      const tbW    = 120   // title block width (right-side vertical panel, ~4.7" on 36" page)
      const tbX    = pageW - outerM - tbW  // left edge of title block
      const tbTop  = outerM
      const tbBot  = pageH - outerM
      const tbH    = tbBot - tbTop   // ≈595.6mm full height
      const pad    = 10

      // Drawing area sits left of the title block, inside the inner border
      const drawX  = innerM
      const drawY  = innerM
      const drawW  = tbX - innerM - 1
      const drawH  = pageH - innerM * 2

      // Title block section heights — simplified reference style
      const logoH      = 60   // org logo
      const contactH   = 48   // address / phone lines
      const clientH    = 60   // client name
      const projH      = 100  // project name (large)
      const scopeH     = 90   // "Drawings For" scope list
      const stampH     = 28   // preliminary stamp (optional)
      const dwgNumH    = 55   // large drawing number at bottom
      const revHeaderH = 18   // "REVISIONS" bar
      const revColH    = 14   // column label row
      const fixedH = logoH + contactH + clientH + projH + scopeH + (archPrelim ? stampH : 0) + dwgNumH + revHeaderH + revColH
      const revRowH    = Math.max(16, (tbH - fixedH) / 6)
      const numRevRows = Math.max(0, Math.floor((tbH - fixedH) / revRowH))

      const { default: autoTable } = await import('jspdf-autotable')
      const fs = (n) => n * archFontScale   // scaled font size helper

      const drawSep = (y, thick = false) => {
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(thick ? 1.8 : 0.6)
        pdf.line(tbX, y, pageW - outerM, y)
      }

      // Draw the outer/inner borders for any arch page (does not draw title block)
      const drawArchBorders = () => {
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageW, pageH, 'F')
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(2.8)
        pdf.rect(outerM, outerM, pageW - outerM * 2, pageH - outerM * 2)
        pdf.setLineWidth(1.0)
        pdf.rect(innerM, innerM, drawW - 0.5, drawH)
      }

      // Draw the right-side title block — simplified reference style
      const drawArchTitleBlock = (sheetLabel, drawingNum, sheetIndex, totalPages) => {
        pdf.setFillColor(255, 255, 255)
        pdf.rect(tbX, tbTop, tbW, tbH, 'F')
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(2.0)
        pdf.line(tbX, tbTop, tbX, tbBot)

        let ty = tbTop

        // ── Org logo ──
        if (logoImg) {
          try {
            const maxW = tbW - pad * 2, maxH = logoH - 8
            const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
            const lw = logoImg.naturalWidth * ratio
            const lh = logoImg.naturalHeight * ratio
            pdf.addImage(logoImg, 'PNG', tbX + (tbW - lw) / 2, ty + 4, lw, lh)
          } catch { /* ignore */ }
        } else {
          pdf.setTextColor(r, g, b); pdf.setFontSize(fs(9)); pdf.setFont('helvetica', 'bold')
          const cLines = pdf.splitTextToSize(orgProfile?.company_name || '', tbW - pad * 2)
          cLines.slice(0, 2).forEach((l, li) => pdf.text(l, tbX + tbW / 2, ty + 20 + li * 14, { align: 'center' }))
        }
        ty += logoH; drawSep(ty, true)

        // ── Contact info ──
        const addr1 = orgProfile?.bill_to_address || ''
        const addr2 = [orgProfile?.bill_to_city, orgProfile?.bill_to_state, orgProfile?.bill_to_zip].filter(Boolean).join(', ')
        const phone = orgProfile?.phone || ''
        const contactLines = [orgProfile?.company_name, addr1, addr2, phone].filter(Boolean)
        pdf.setFontSize(fs(5.5)); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(50, 55, 65)
        const lineStep = (contactH - 6) / Math.max(contactLines.length, 1)
        contactLines.forEach((line, li) => pdf.text(line, tbX + tbW / 2, ty + 8 + li * lineStep, { align: 'center' }))
        ty += contactH; drawSep(ty, true)

        // ── Client name ──
        ty += 4
        pdf.setTextColor(100, 110, 120); pdf.setFontSize(fs(5)); pdf.setFont('helvetica', 'normal')
        pdf.text('CLIENT', tbX + pad, ty + 6)
        pdf.setTextColor(10, 10, 10); pdf.setFontSize(fs(8)); pdf.setFont('helvetica', 'bold')
        pdf.splitTextToSize(proposal?.company || '', tbW - pad * 2).slice(0, 3)
          .forEach((l, li) => pdf.text(l, tbX + pad, ty + 18 + li * 14))
        ty += clientH; drawSep(ty, true)

        // ── Project name + address ──
        ty += 4
        pdf.setTextColor(100, 110, 120); pdf.setFontSize(fs(5)); pdf.setFont('helvetica', 'normal')
        pdf.text('PROJECT', tbX + pad, ty + 6)
        pdf.setTextColor(10, 10, 10); pdf.setFontSize(fs(9.5)); pdf.setFont('helvetica', 'bold')
        pdf.splitTextToSize((proposal?.proposal_name || '').toUpperCase(), tbW - pad * 2).slice(0, 3)
          .forEach((l, li) => pdf.text(l, tbX + pad, ty + 20 + li * 17))
        if (projectAddress) {
          pdf.setFontSize(fs(5.5)); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 90, 100)
          pdf.splitTextToSize(projectAddress, tbW - pad * 2).slice(0, 2)
            .forEach((l, li) => pdf.text(l, tbX + pad, ty + projH - 18 + li * 10))
        }
        ty += projH; drawSep(ty, true)

        // ── Scope — "Drawings For" ──
        ty += 4
        pdf.setTextColor(55, 65, 75); pdf.setFontSize(fs(6)); pdf.setFont('helvetica', 'bold')
        pdf.text('Drawings For', tbX + pad, ty + 9)
        if (archScope) {
          const scopeLines = archScope.split('\n').filter(l => l.trim())
          pdf.setFontSize(fs(5.5)); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 35, 45)
          scopeLines.forEach((line, li) => pdf.text(`  ${line.trim()}`, tbX + pad, ty + 20 + li * 11))
        }
        ty += scopeH; drawSep(ty, true)

        // ── Preliminary stamp (optional) ──
        if (archPrelim) {
          pdf.setFillColor(255, 248, 245)
          pdf.rect(tbX + 4, ty + 2, tbW - 8, stampH - 4)
          pdf.setDrawColor(190, 60, 40); pdf.setLineWidth(1.2)
          pdf.rect(tbX + 6, ty + 4, tbW - 12, stampH - 8)
          pdf.setTextColor(190, 60, 40); pdf.setFontSize(fs(6)); pdf.setFont('helvetica', 'bold')
          pdf.text('PRELIMINARY', tbX + tbW / 2, ty + 14, { align: 'center' })
          pdf.text('NOT FOR CONSTRUCTION', tbX + tbW / 2, ty + 24, { align: 'center' })
          ty += stampH; drawSep(ty, true)
        }

        // ── Revision table ──
        pdf.setFillColor(r, g, b); pdf.rect(tbX, ty, tbW, revHeaderH, 'F')
        pdf.setTextColor(255, 255, 255); pdf.setFontSize(fs(6.5)); pdf.setFont('helvetica', 'bold')
        pdf.text('REVISIONS', tbX + pad, ty + 12)
        ty += revHeaderH

        const dateW = 34, descW = tbW - dateW
        // Column headers
        pdf.setDrawColor(160, 168, 178); pdf.setLineWidth(0.5)
        pdf.line(tbX + dateW, ty, tbX + dateW, tbBot - dwgNumH - 6)
        pdf.setTextColor(55, 65, 75); pdf.setFontSize(fs(5)); pdf.setFont('helvetica', 'bold')
        pdf.text('DATE', tbX + pad, ty + 9)
        pdf.text('REVISION VERSION', tbX + dateW + pad, ty + 9)
        ty += revColH
        pdf.setDrawColor(160, 168, 178); pdf.setLineWidth(0.5)
        pdf.line(tbX, ty, pageW - outerM, ty)

        for (let ri = 0; ri < numRevRows; ri++) {
          const ry = ty + ri * revRowH
          if (ry + revRowH >= tbBot - dwgNumH - 6) break
          if (ri > 0) {
            pdf.setDrawColor(215, 218, 222); pdf.setLineWidth(0.4)
            pdf.line(tbX, ry, pageW - outerM, ry)
          }
          const rev = archRevisions[ri]
          if (rev) {
            pdf.setTextColor(15, 15, 15); pdf.setFontSize(fs(5.5)); pdf.setFont('helvetica', 'normal')
            pdf.text(rev.date || '', tbX + pad, ry + revRowH * 0.65)
            pdf.text(rev.description || '', tbX + dateW + pad, ry + revRowH * 0.65)
          }
        }

        // ── Drawing number — large at bottom ──
        const dnY = tbBot - dwgNumH
        drawSep(dnY, true)
        // Sheet label small above
        pdf.setTextColor(100, 110, 120); pdf.setFontSize(fs(5)); pdf.setFont('helvetica', 'normal')
        pdf.text(sheetLabel ? sheetLabel.toUpperCase() : '', tbX + tbW / 2, dnY + 10, { align: 'center' })
        // Drawing number large
        pdf.setTextColor(10, 10, 10); pdf.setFontSize(fs(16)); pdf.setFont('helvetica', 'bold')
        pdf.text(drawingNum || '', tbX + tbW / 2, dnY + dwgNumH - 10, { align: 'center' })
      }

      const pageList   = archPageList.length > 0 ? archPageList : sheets.map(s => ({ type: 'sheet', id: s.id }))
      const usedCategories = [...new Set(placements.map(p => p.global_products?.category).filter(Boolean))].sort()
      // Tally total page count for SHEET X OF Y
      const coverPages  = archIncludeCover ? 1 : 0
      const schedPages  = archIncludeSchedule && placements.length > 0 ? 1 : 0
      const legendPages = usedCategories.length > 0 ? 1 : 0
      const totalPages  = coverPages + schedPages + legendPages + pageList.length

      // ── COVER PAGE ──────────────────────────────────────────────────────────
      if (archIncludeCover) {
        drawArchBorders()
        // Drawing area: large project cover content
        const cx = drawX + 6
        // Brand bar
        pdf.setFillColor(r, g, b)
        pdf.rect(drawX, drawY, 6, drawH, 'F')
        // Logo
        if (logoImg) {
          try {
            const maxW = 160, maxH = 60
            const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
            const lw = logoImg.naturalWidth * ratio
            const lh = logoImg.naturalHeight * ratio
            pdf.addImage(logoImg, 'PNG', cx + 8, drawY + 16, lw, lh)
          } catch { /* ignore */ }
        } else {
          pdf.setTextColor(r, g, b); pdf.setFontSize(fs(22)); pdf.setFont('helvetica', 'bold')
          pdf.text(orgProfile?.company_name || '', cx + 8, drawY + 40)
        }
        // Horizontal rule
        const midY = drawY + drawH * 0.42
        pdf.setDrawColor(r, g, b); pdf.setLineWidth(2.0)
        pdf.line(cx + 8, midY, drawX + drawW - 8, midY)
        // Eyebrow
        pdf.setTextColor(r, g, b); pdf.setFontSize(fs(8)); pdf.setFont('helvetica', 'bold')
        pdf.setCharSpace(2); pdf.text('CONSTRUCTION DOCUMENT SET', cx + 8, midY - 55); pdf.setCharSpace(0)
        // Project name
        pdf.setTextColor(15, 15, 15); pdf.setFontSize(fs(26)); pdf.setFont('helvetica', 'bold')
        const titleLines = pdf.splitTextToSize(proposal?.proposal_name || 'PROJECT', drawW - 40)
        titleLines.slice(0, 2).forEach((l, li) => pdf.text(l, cx + 8, midY - 14 + li * 36))
        // Client
        pdf.setFontSize(fs(14)); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 50, 60)
        pdf.text(proposal?.company || '', cx + 8, midY + 40)
        // Meta row
        pdf.setFontSize(fs(8)); pdf.setTextColor(90, 100, 110)
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        pdf.text(`Date: ${dateStr}`, cx + 8, midY + 65)
        pdf.text(`Sheets: ${totalPages}`, cx + 8, midY + 88)
        drawArchTitleBlock('COVER SHEET', 'C-001', null, totalPages)
      }

      // ── DEVICE SCHEDULE PAGE ─────────────────────────────────────────────────
      if (archIncludeSchedule && placements.length > 0) {
        if (archIncludeCover) pdf.addPage()
        drawArchBorders()

        const schedTableStyle = {
          theme: 'grid',
          styles: { fontSize: fs(7), cellPadding: fs(2), textColor: [40, 40, 40], fillColor: [255,255,255], lineColor: [200,200,200], lineWidth: 0.5 },
          headStyles: { fillColor: [r, g, b], textColor: [255,255,255], fontStyle: 'bold', fontSize: fs(7) },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: drawX + 2, right: outerM + tbW + 4, top: drawY + 2, bottom: outerM + 4 },
        }

        pdf.setTextColor(r, g, b); pdf.setFontSize(fs(12)); pdf.setFont('helvetica', 'bold')
        pdf.text('DEVICE SCHEDULE', drawX + 4, drawY + 22)
        pdf.setDrawColor(r, g, b); pdf.setLineWidth(1.5)
        pdf.line(drawX + 4, drawY + 26, drawX + drawW - 4, drawY + 26)

        const scheduleRows = placements.map((p, idx) => {
          const gp  = p.global_products
          const sht = sheets.find(s => s.id === p.drawing_sheet_id)
          return [
            idx + 1,
            p.device_address || '—',
            p.part_number_override || gp?.part_number || '—',
            p.description_override || gp?.name || '—',
            p.manufacturer_override || gp?.manufacturer || '—',
            gp?.category || '—',
            p.quantity || 1,
            sht?.name || '—',
          ]
        })
        autoTable(pdf, {
          ...schedTableStyle,
          startY: drawY + 32,
          head: [['#', 'Address', 'Part Number', 'Description', 'Manufacturer', 'Category', 'Qty', 'Sheet']],
          body: scheduleRows,
        })

        drawArchTitleBlock('DEVICE SCHEDULE', 'S-001', coverPages + 1, totalPages)
      }

      // ── SYMBOL LEGEND + DRAWING INDEX PAGE ───────────────────────────────────
      if (usedCategories.length > 0 || pageList.length > 0) {
        if (archIncludeCover || (archIncludeSchedule && placements.length > 0)) pdf.addPage()
        drawArchBorders()

        // Split drawing area: left 58% legend, right 42% drawing index
        const legAreaW = Math.round(drawW * 0.58)
        const idxAreaX = drawX + legAreaW + 10
        const idxAreaW = drawW - legAreaW - 14

        // ── LEFT: Symbol legend ──
        pdf.setTextColor(r, g, b); pdf.setFontSize(fs(12)); pdf.setFont('helvetica', 'bold')
        pdf.text('SYMBOL LEGEND', drawX + 4, drawY + 22)
        pdf.setDrawColor(r, g, b); pdf.setLineWidth(1.5)
        pdf.line(drawX + 4, drawY + 26, drawX + legAreaW - 4, drawY + 26)

        const legColW = (legAreaW - 8) / 2
        const rowH    = 55
        let legCol = 0, ly = drawY + 42

        for (const category of usedCategories) {
          const icon  = await getIconPng(category, brandHex, 64)
          const count = placements.filter(p => p.global_products?.category === category).length
          const cardX = drawX + 4 + legCol * legColW
          const cardY = ly
          if (icon) pdf.addImage(icon, 'PNG', cardX + 2, cardY + 2, 30, 30)
          else { pdf.setFillColor(r, g, b); pdf.circle(cardX + 17, cardY + 17, 12, 'F') }
          pdf.setTextColor(20, 20, 20); pdf.setFontSize(fs(7.5)); pdf.setFont('helvetica', 'bold')
          const catLines = pdf.splitTextToSize(category, legColW - 42)
          catLines.slice(0, 2).forEach((l, li2) => pdf.text(l, cardX + 38, cardY + 12 + li2 * 11))
          pdf.setFontSize(fs(6)); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(90, 100, 110)
          pdf.text(`Count: ${count}`, cardX + 38, cardY + 34)
          pdf.setDrawColor(220, 222, 226); pdf.setLineWidth(0.4)
          pdf.line(cardX, cardY + rowH - 2, cardX + legColW - 4, cardY + rowH - 2)
          legCol++
          if (legCol >= 2) { legCol = 0; ly += rowH }
        }

        // Vertical divider
        pdf.setDrawColor(200, 205, 210); pdf.setLineWidth(0.6)
        pdf.line(idxAreaX - 6, drawY + 4, idxAreaX - 6, drawY + drawH - 4)

        // ── RIGHT: Drawing index ──
        pdf.setTextColor(r, g, b); pdf.setFontSize(fs(12)); pdf.setFont('helvetica', 'bold')
        pdf.text('DRAWING INDEX', idxAreaX, drawY + 22)
        pdf.setDrawColor(r, g, b); pdf.setLineWidth(1.5)
        pdf.line(idxAreaX, drawY + 26, idxAreaX + idxAreaW - 4, drawY + 26)

        // Build full index: cover + schedule + legend + floor plan sheets
        const indexEntries = []
        if (archIncludeCover)                                    indexEntries.push({ num: 'C-001', lbl: 'COVER SHEET' })
        if (archIncludeSchedule && placements.length > 0)        indexEntries.push({ num: 'S-001', lbl: 'DEVICE SCHEDULE' })
        if (usedCategories.length > 0)                           indexEntries.push({ num: 'L-001', lbl: 'SYMBOL LEGEND' })
        pageList.forEach((item, pi) => {
          const s   = item.type === 'sheet' ? sheets.find(x => x.id === item.id) : null
          const lbl = archSheetSettings[item.id]?.label ?? (item.type === 'notes' ? 'GENERAL NOTES' : (s?.name ?? ''))
          const num = archSheetSettings[item.id]?.drawingNum || `${archDwgPrefix}${pi + 1}.0`
          indexEntries.push({ num, lbl })
        })

        const idxRowH = 18
        indexEntries.forEach((entry, ei) => {
          const iy = drawY + 42 + ei * idxRowH
          if (iy + idxRowH > drawY + drawH - 4) return
          if (ei > 0) {
            pdf.setDrawColor(230, 232, 235); pdf.setLineWidth(0.3)
            pdf.line(idxAreaX, iy, idxAreaX + idxAreaW - 4, iy)
          }
          pdf.setTextColor(r, g, b); pdf.setFontSize(fs(5.5)); pdf.setFont('helvetica', 'bold')
          pdf.text(entry.num, idxAreaX, iy + 11)
          pdf.setTextColor(20, 20, 20); pdf.setFontSize(fs(6.5)); pdf.setFont('helvetica', 'normal')
          const lblLines = pdf.splitTextToSize(entry.lbl, idxAreaW - 36)
          pdf.text(lblLines[0] || '', idxAreaX + 30, iy + 11)
        })

        drawArchTitleBlock('SYMBOL LEGEND', 'L-001', coverPages + schedPages + 1, totalPages)
      }

      for (let i = 0; i < pageList.length; i++) {
        if (i > 0 || archIncludeCover || archIncludeSchedule || legendPages > 0) pdf.addPage()
        const item       = pageList[i]
        const sheet      = item.type === 'sheet' ? sheets.find(s => s.id === item.id) : null
        const drawingNum = getSheetDwgNum(item, i)
        const sheetLabel = getSheetLabel(item, sheet)
        const isBlank    = item.type === 'notes' || !sheet?.storage_path || ['blank', 'pending'].includes(sheet.storage_path)
        const pageNum    = coverPages + schedPages + legendPages + i + 1

        drawArchBorders()

        // ── FLOOR PLAN or NOTES PAGE ─────────────────────────────────────────
        if (isBlank) {
          // General notes page — title + ruled lines
          // Page heading
          pdf.setTextColor(r, g, b)
          pdf.setFontSize(fs(13))
          pdf.setFont('helvetica', 'bold')
          pdf.text(sheetLabel.toUpperCase() || 'GENERAL NOTES', drawX + 6, drawY + 30)
          pdf.setDrawColor(r, g, b)
          pdf.setLineWidth(1.8)
          pdf.line(drawX + 6, drawY + 40, drawX + drawW - 6, drawY + 40)

          // Render text sections — two-column layout
          const sections = archSheetSettings[item.id]?.sections || []
          if (sections.length > 0) {
            const colGap  = 8
            const colW    = (drawW - 12 - colGap) / 2
            const col1X   = drawX + 6
            const col2X   = col1X + colW + colGap
            const bodyFontSize = fs(7.5)
            const headFontSize = fs(8.5)
            const lineH   = bodyFontSize * 0.45 + 1.2  // mm per line
            const headH   = headFontSize * 0.45 + 4
            let cy        = [drawY + 50, drawY + 50]  // current y per column
            let col       = 0

            sections.forEach(sec => {
              const cx    = col === 0 ? col1X : col2X
              const maxW  = colW
              const bodyLines = sec.body
                ? pdf.setFontSize(bodyFontSize) || pdf.splitTextToSize(sec.body, maxW)
                : []
              const blockH = (sec.heading ? headH : 0) + bodyLines.length * lineH + 4

              // Overflow to next column
              if (cy[col] + blockH > drawY + drawH - 8 && col === 0) col = 1

              const bx = col === 0 ? col1X : col2X
              let by = cy[col]

              if (sec.heading) {
                pdf.setTextColor(r, g, b)
                pdf.setFontSize(headFontSize)
                pdf.setFont('helvetica', 'bold')
                pdf.text(sec.heading.toUpperCase(), bx, by + headH - 3)
                pdf.setDrawColor(r, g, b)
                pdf.setLineWidth(0.8)
                pdf.line(bx, by + headH - 1, bx + colW, by + headH - 1)
                by += headH + 1
              }

              if (bodyLines.length > 0) {
                pdf.setTextColor(20, 25, 30)
                pdf.setFontSize(bodyFontSize)
                pdf.setFont('helvetica', 'normal')
                bodyLines.forEach((line, li) => {
                  pdf.text(line, bx, by + li * lineH)
                })
                by += bodyLines.length * lineH
              }

              cy[col] = by + 5
              // Move to next column when current one is getting full
              if (col === 0 && cy[0] > drawY + drawH * 0.5) col = 1
            })
          }
        } else {
          // Render floor plan with device symbols
          const imgData = await getFloorPlanImage(sheet.id)
          await drawSheetOnPDF(pdf, sheet, imgData, drawX, drawY, drawW, drawH, exportFOV)

          // Render text annotations on top of the floor plan
          const { data: sheetAnnotations } = await supabase
            .from('drawing_annotations')
            .select('*').eq('drawing_sheet_id', sheet.id).eq('annotation_type', 'text')
          for (const ann of (sheetAnnotations || [])) {
            if (!ann.points?.[0] || !ann.label) continue
            const tx = drawX + ann.points[0].x * drawW
            const ty = drawY + ann.points[0].y * drawH
            const ptSize = (ann.font_size || 14) * 0.352778   // pt → mm
            const annCol = hexToRgbArr(ann.color || '#111827')
            pdf.setTextColor(...annCol)
            pdf.setFontSize(fs(ann.font_size || 14))
            pdf.setFont('helvetica', 'normal')
            const annW = (ann.points[0].width ?? 0.3) * drawW
            const lines = pdf.splitTextToSize(ann.label, annW)
            lines.forEach((line, li) => pdf.text(line, tx, ty + li * ptSize * 1.4))
          }

          // Drawing number + title label at bottom-left of drawing area
          pdf.setFillColor(255, 255, 255)
          pdf.rect(drawX + 2, drawY + drawH - 28, 320, 26, 'F')
          pdf.setTextColor(10, 10, 10)
          pdf.setFontSize(fs(8))
          pdf.setFont('helvetica', 'bold')
          pdf.text(`${drawingNum}   ${sheetLabel.toUpperCase()}`, drawX + 8, drawY + drawH - 8)

        }

        drawArchTitleBlock(sheetLabel, drawingNum, pageNum, totalPages)
      }

      await savePdf(pdf, `${proposal?.proposal_name || 'Drawing'}_Construction_Drawings.pdf`)
    } catch (err) {
      console.error('Arch drawing failed:', err)
      alert('PDF generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const exports = [
    {
      id:          'arch',
      label:       'Construction Drawing',
      description: 'CAD-style 24×36 drawing set with title block, revision table, drawing number, and border. One sheet per floor plan.',
      icon:        '📏',
      action:      handleArchDrawing,
    },
    {
      id:          'client',
      label:       'Client Overview',
      description: 'One page per floor plan with device markers. Clean presentation for client review.',
      icon:        '📋',
      action:      handleClientOverview,
    },
    {
      id:          'shop',
      label:       'Shop Drawings',
      description: 'Full drawing package with title sheet, legend, device schedule, floor plans, and cable schedule.',
      icon:        '📐',
      action:      handleShopDrawing,
    },
    {
      id:          'asbuilt',
      label:       'As-Built Package',
      description: 'Complete as-built documentation including IP addresses, MAC addresses, switch ports, and serial numbers.',
      icon:        '🔧',
      action:      handleAsBuilt,
    },
    {
      id:          'csv',
      label:       'CSV BOM Export',
      description: 'Spreadsheet export of all devices, components, cable footage, and vertical rises.',
      icon:        '📊',
      action:      handleCSVExport,
    },
    {
      id:          'dori',
      label:       'DORI Analysis Report',
      description: `IEC 62676-4 detection/observation/recognition/identification distances for all cameras. ${placements.filter(p => ['Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera'].includes(p.global_products?.category)).length} camera${placements.filter(p => ['Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera'].includes(p.global_products?.category)).length !== 1 ? 's' : ''}.`,
      icon:        '🎯',
      action:      handleDoriExport,
      disabled:    placements.filter(p => ['Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera'].includes(p.global_products?.category)).length === 0,
    },
    {
      id:          'racks',
      label:       'Rack Schedule',
      description: `Room-by-room rack diagram schedule with U positions, device labels, part numbers, and notes. ${rooms.length} room${rooms.length !== 1 ? 's' : ''}, ${rackItemsData.length} device${rackItemsData.length !== 1 ? 's' : ''}.`,
      icon:        '🗄️',
      action:      handleRackSchedule,
      disabled:    rooms.length === 0,
    },
  ]

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <svg className="w-6 h-6 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-white font-bold text-lg mb-1">Export</h2>
      <p className="text-[#8A9AB0] text-sm mb-6">
        {placements.length} devices · {cableRuns.length} cable runs · {pathways.length} pathways · {sheets.length} sheets
      </p>

      {/* Export options */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-4">
        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide self-center">Drawing Options</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={exportFOV} onChange={e => setExportFOV(e.target.checked)}
            className="accent-[#C8622A] w-3.5 h-3.5" />
          <span className="text-white text-xs">Include FOV overlays</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={exportCables} onChange={e => setExportCables(e.target.checked)}
            className="accent-[#C8622A] w-3.5 h-3.5" />
          <span className="text-white text-xs">Include cable runs</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={exportPathways} onChange={e => setExportPathways(e.target.checked)}
            className="accent-[#C8622A] w-3.5 h-3.5" />
          <span className="text-white text-xs">Include pathways</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {exports.map(exp => (
          <div key={exp.id} className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0F1C2E] flex items-center justify-center text-2xl flex-shrink-0">
                  {exp.icon}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{exp.label}</p>
                  <p className="text-[#8A9AB0] text-xs mt-0.5">{exp.description}</p>
                </div>
              </div>
              <button
                onClick={exp.action}
                disabled={generating || (exp.disabled ?? sheets.length === 0)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  generating || (exp.disabled ?? sheets.length === 0)
                    ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                    : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
                }`}>
                {generating ? 'Generating...' : 'Export'}
              </button>
            </div>

            {/* Construction Drawing inline settings */}
            {exp.id === 'arch' && (
              <div className="border-t border-[#2a3d55] bg-[#0F1C2E]">
                {/* Collapsible toggle header */}
                <button
                  onClick={() => setArchSettingsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-[#1a2d45] transition-colors"
                >
                  <span className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Drawing Settings</span>
                  <span className="text-[#8A9AB0] text-xs">{archSettingsOpen ? '▲' : '▼'}</span>
                </button>

              {archSettingsOpen && (
              <div className="px-5 pb-4 space-y-3 border-t border-[#2a3d55]">
                {/* Global options row */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 items-center pt-3">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide sr-only">Options</p>

                  <label className="flex items-center gap-1.5">
                    <span className="text-[#8A9AB0] text-xs">Dwg # Prefix</span>
                    <input
                      type="text"
                      value={archDwgPrefix}
                      onChange={e => setArchDwgPrefix(e.target.value.toUpperCase().slice(0, 4))}
                      className="w-12 bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs text-center focus:outline-none focus:border-[#C8622A]"
                      placeholder="E"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="text-[#8A9AB0] text-xs">Scale</span>
                    <input
                      type="text"
                      value={archScale}
                      onChange={e => setArchScale(e.target.value.slice(0, 20))}
                      className="w-28 bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-[#C8622A]"
                      placeholder="NTS"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="text-[#8A9AB0] text-xs">Font size</span>
                    <select
                      value={archFontScale}
                      onChange={e => setArchFontScale(parseFloat(e.target.value))}
                      className="bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-[#C8622A]"
                    >
                      <option value={2.5}>Small</option>
                      <option value={3.0}>Medium</option>
                      <option value={3.5}>Large</option>
                      <option value={4.0}>X-Large</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={archPrelim} onChange={e => setArchPrelim(e.target.checked)}
                      className="accent-[#C8622A] w-3.5 h-3.5" />
                    <span className="text-[#8A9AB0] text-xs">Preliminary stamp</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={archIncludeCover} onChange={e => setArchIncludeCover(e.target.checked)}
                      className="accent-[#C8622A] w-3.5 h-3.5" />
                    <span className="text-[#8A9AB0] text-xs">Cover page</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={archIncludeSchedule} onChange={e => setArchIncludeSchedule(e.target.checked)}
                      className="accent-[#C8622A] w-3.5 h-3.5" />
                    <span className="text-[#8A9AB0] text-xs">Device schedule</span>
                  </label>
                </div>

                {/* Drawings For scope */}
                <div>
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">Drawings For</p>
                  <textarea
                    value={archScope}
                    onChange={e => setArchScope(e.target.value)}
                    rows={3}
                    placeholder={"Low Voltage Systems\nFire Alarm\nAccess Control"}
                    className="w-full bg-[#1a2d45] border border-[#2a3d55] rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#C8622A] resize-y font-mono leading-relaxed"
                  />
                  <p className="text-[#4a5a6a] text-[10px] mt-0.5">One item per line — appears in title block scope section</p>
                </div>

                {/* Ordered page list */}
                {archPageList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Page Order &amp; Labels</p>
                      <button
                        onClick={addNotesPage}
                        className="text-xs text-[#C8622A] hover:text-white border border-[#C8622A] rounded px-2 py-0.5 transition-colors"
                      >
                        + Add Notes Page
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {archPageList.map((item, si) => {
                        const sheet = item.type === 'sheet' ? sheets.find(s => s.id === item.id) : null
                        const defaultLabel  = item.type === 'notes' ? 'GENERAL NOTES' : (sheet?.name ?? '')
                        const defaultDwgNum = `${archDwgPrefix}${si + 1}.0`
                        const sections = archSheetSettings[item.id]?.sections || []
                        const isOpen   = expandedNotes === item.id
                        return (
                          <div key={item.id} className="flex flex-col gap-0">
                            {/* Row */}
                            <div className="flex items-center gap-1.5">
                              {/* Reorder buttons */}
                              <div className="flex flex-col gap-px flex-shrink-0">
                                <button onClick={() => movePage(si, -1)} disabled={si === 0}
                                  className="text-[#8A9AB0] hover:text-white disabled:opacity-25 leading-none text-[9px] px-0.5">▲</button>
                                <button onClick={() => movePage(si, 1)} disabled={si === archPageList.length - 1}
                                  className="text-[#8A9AB0] hover:text-white disabled:opacity-25 leading-none text-[9px] px-0.5">▼</button>
                              </div>
                              <span className="text-[#8A9AB0] text-xs w-4 text-right flex-shrink-0">{si + 1}.</span>
                              <input type="text"
                                value={archSheetSettings[item.id]?.drawingNum ?? defaultDwgNum}
                                onChange={e => updateSheetSetting(item.id, 'drawingNum', e.target.value)}
                                className="w-16 bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs text-center focus:outline-none focus:border-[#C8622A]"
                                placeholder={defaultDwgNum}
                              />
                              <input type="text"
                                value={archSheetSettings[item.id]?.label ?? defaultLabel}
                                onChange={e => updateSheetSetting(item.id, 'label', e.target.value)}
                                className="flex-1 bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-[#C8622A]"
                                placeholder={defaultLabel || 'Drawing title'}
                              />
                              {item.type === 'notes' && (
                                <>
                                  <button
                                    onClick={() => setExpandedNotes(isOpen ? null : item.id)}
                                    className="text-[10px] border rounded px-1.5 py-0.5 flex-shrink-0 transition-colors text-[#C8622A] border-[#C8622A] hover:bg-[#C8622A] hover:text-white"
                                  >{isOpen ? 'Done' : 'Edit'}</button>
                                  <button onClick={() => removePage(item.id)}
                                    className="text-[#8A9AB0] hover:text-red-400 text-xs flex-shrink-0">✕</button>
                                </>
                              )}
                            </div>

                            {/* Notes section editor */}
                            {item.type === 'notes' && isOpen && (
                              <div className="mt-2 ml-10 bg-[#1a2d45] border border-[#2a3d55] rounded-lg p-3 space-y-3">
                                {sections.map((sec, sIdx) => (
                                  <div key={sec.id} className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[#8A9AB0] text-[10px] flex-shrink-0">Section {sIdx + 1}</span>
                                      <input
                                        type="text"
                                        value={sec.heading}
                                        onChange={e => updateSection(item.id, sec.id, 'heading', e.target.value)}
                                        placeholder="Section heading (e.g. GENERAL CONDITIONS)"
                                        className="flex-1 bg-[#0F1C2E] border border-[#2a3d55] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#C8622A] font-semibold"
                                      />
                                      <button onClick={() => removeSection(item.id, sec.id)}
                                        className="text-[#8A9AB0] hover:text-red-400 text-xs flex-shrink-0">✕</button>
                                    </div>
                                    <textarea
                                      value={sec.body}
                                      onChange={e => updateSection(item.id, sec.id, 'body', e.target.value)}
                                      placeholder="Type notes here. Use numbered lists (1. Item), bullets (• Item), or plain paragraphs."
                                      rows={5}
                                      className="w-full bg-[#0F1C2E] border border-[#2a3d55] rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#C8622A] resize-y font-mono leading-relaxed"
                                    />
                                  </div>
                                ))}
                                <button
                                  onClick={() => addSection(item.id)}
                                  className="text-xs text-[#8A9AB0] hover:text-white border border-dashed border-[#2a3d55] hover:border-[#8A9AB0] rounded px-3 py-1 w-full transition-colors"
                                >+ Add Section</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Revisions editor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Revisions</p>
                    <button
                      onClick={addRevision}
                      className="text-xs text-[#C8622A] hover:text-white border border-[#C8622A] rounded px-2 py-0.5 transition-colors"
                    >+ Add Rev</button>
                  </div>
                  {archRevisions.length === 0 ? (
                    <p className="text-[#4a5a6a] text-xs italic">No revisions — add one to populate the revision block.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Header */}
                      <div className="grid grid-cols-[40px_90px_1fr_80px_24px] gap-1.5 px-1">
                        {['Rev', 'Date', 'Description', 'By', ''].map(h => (
                          <span key={h} className="text-[#4a5a6a] text-[10px] font-semibold uppercase">{h}</span>
                        ))}
                      </div>
                      {archRevisions.map(rev => (
                        <div key={rev.id} className="grid grid-cols-[40px_90px_1fr_80px_24px] gap-1.5 items-center">
                          <input
                            value={rev.rev}
                            onChange={e => updateRevision(rev.id, 'rev', e.target.value)}
                            className="bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs text-center focus:outline-none focus:border-[#C8622A]"
                          />
                          <input
                            value={rev.date}
                            onChange={e => updateRevision(rev.id, 'date', e.target.value)}
                            className="bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                          <input
                            value={rev.description}
                            onChange={e => updateRevision(rev.id, 'description', e.target.value)}
                            placeholder="Description of change"
                            className="bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                          <input
                            value={rev.by}
                            onChange={e => updateRevision(rev.id, 'by', e.target.value)}
                            placeholder="Initials"
                            className="bg-[#1a2d45] border border-[#2a3d55] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                          <button onClick={() => removeRevision(rev.id)}
                            className="text-[#8A9AB0] hover:text-red-400 text-xs text-center">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
              )}
              </div>
            )}
          </div>
        ))}
      </div>

      {sheets.length === 0 && (
        <p className="text-[#8A9AB0] text-xs text-center mt-4">
          Add floor plan sheets before exporting.
        </p>
      )}

      {/* Share for client review */}
      <div className="border-t border-[#2a3d55] pt-6 mt-2 space-y-4">

        {/* Active links */}
        {packages.length > 0 && (
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2a3d55]">
              <p className="text-white font-semibold text-sm">Active Review Links</p>
            </div>
            <div className="divide-y divide-[#2a3d55]">
              {packages.map(pkg => {
                const expired = pkg.share_expires_at && new Date(pkg.share_expires_at) < new Date()
                const link    = `${APP_BASE_URL}/designer/review/${pkg.share_token}`
                return (
                  <div key={pkg.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {pkg.client_approved && (
                          <span className="text-xs bg-green-900/40 text-green-400 border border-green-800/40 px-2 py-0.5 rounded-full font-semibold">Approved</span>
                        )}
                        {expired && (
                          <span className="text-xs bg-red-900/30 text-red-400 border border-red-800/30 px-2 py-0.5 rounded-full font-semibold">Expired</span>
                        )}
                        {pkg.share_pin && (
                          <span className="text-xs bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] px-2 py-0.5 rounded-full flex items-center gap-1">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                            PIN protected
                          </span>
                        )}
                        {pkg.client_approved_by && (
                          <span className="text-xs text-[#8A9AB0]">by {pkg.client_approved_by}</span>
                        )}
                      </div>
                      <p className="text-[#4a5a6a] text-xs mt-1 truncate">{link}</p>
                      {pkg.share_expires_at && (
                        <p className="text-[#4a5a6a] text-xs mt-0.5">
                          {expired ? 'Expired' : 'Expires'} {new Date(pkg.share_expires_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleCopyLink(pkg.share_token, pkg.id)}
                      className="text-xs font-semibold text-[#C8622A] hover:text-white transition-colors flex-shrink-0 px-2 py-1">
                      {copiedId === pkg.id ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={() => handleRevoke(pkg.id)}
                      className="text-xs text-[#4a5a6a] hover:text-red-400 transition-colors flex-shrink-0">
                      Revoke
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Create new link */}
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#0F1C2E] flex items-center justify-center text-xl flex-shrink-0">🔗</div>
            <div>
              <p className="text-white font-semibold text-sm">Create Review Link</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">Client can view the design, add notes, and approve.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Expiration Date</label>
                <input type="date" value={shareExpiry} onChange={e => setShareExpiry(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">PIN Code <span className="text-[#4a5a6a]">(optional)</span></label>
                <input type="text" value={sharePin} onChange={e => setSharePin(e.target.value)}
                  placeholder="e.g. 4821"
                  maxLength={12}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]" />
              </div>
            </div>
            {sharePin.trim() && (
              <p className="text-xs text-yellow-400/80">Client will be required to enter this PIN before viewing the design.</p>
            )}
            <button onClick={handleShare} disabled={sharing || sheets.length === 0}
              className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                sharing || sheets.length === 0
                  ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                  : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
              }`}>
              {sharing ? 'Generating…' : 'Generate Link'}
            </button>
          </div>
        </div>
      </div>

      {generating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-8 text-center">
            <svg className="w-8 h-8 animate-spin text-[#C8622A] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-white font-semibold">Generating PDF...</p>
            <p className="text-[#8A9AB0] text-xs mt-1">This may take a moment for large drawings</p>
          </div>
        </div>
      )}
    </div>
  )
}
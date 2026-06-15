import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { getCategorySVG } from './useCategoryIcons'

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

// ─── DrawingExport ────────────────────────────────────────────────────────────
// Export tab — Client Overview, Shop Drawings, As-Builts, CSV BOM
export default function DrawingExport({ proposalId, orgId, sheets, proposal, stageRefs }) {
  const [activeExport,  setActiveExport]  = useState('client')
  const [placements,    setPlacements]    = useState([])
  const [cableRuns,     setCableRuns]     = useState([])
  const [verticalRises, setVerticalRises] = useState([])
  const [components,    setComponents]    = useState([])
  const [orgProfile,    setOrgProfile]    = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [generating,    setGenerating]    = useState(false)
  const [shareLink,     setShareLink]     = useState(null)
  const [sharing,       setSharing]       = useState(false)
  const [shareCopied,   setShareCopied]   = useState(false)
  const [exportFOV,     setExportFOV]     = useState(true)

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
        supabase.from('profiles')
          .select('company_name, logo_url, primary_color, organizations(title_block_engineer, title_block_license, title_block_scale)')
          .eq('org_id', orgId)
          .limit(1)
          .single(),
      ])

      // Sort by sheet order first, then by placement creation time within each sheet
      const sorted = (placementData || []).sort((a, b) => {
        const sheetOrderA = sheetIds.indexOf(a.drawing_sheet_id)
        const sheetOrderB = sheetIds.indexOf(b.drawing_sheet_id)
        if (sheetOrderA !== sheetOrderB) return sheetOrderA - sheetOrderB
        return new Date(a.created_at) - new Date(b.created_at)
      })
      setPlacements(sorted)
      setCableRuns(cableData         || [])
      setVerticalRises(riseData      || [])
      // Aggregate components by type+name+part_number
      const compMap = {}
      ;(compData || []).forEach(c => {
        const key = `${c.component_type}|${c.name || ''}|${c.part_number || ''}`
        if (!compMap[key]) compMap[key] = { ...c, quantity: 0 }
        compMap[key].quantity += c.quantity || 1
      })
      setComponents(Object.values(compMap))
      setOrgProfile(profileData)
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
  const cableByType = {}
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
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
        ).toString()

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

  // ── Load org logo safely (CORS-safe, falls back to null) ──────────────────
  const loadOrgLogo = async () => {
    if (!orgProfile?.logo_url) return null
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = orgProfile.logo_url
    await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
    if (img.naturalWidth === 0) return null
    return img
  }

  // ── CSV BOM Export ─────────────────────────────────────────────────────────
  const handleCSVExport = () => {
    const rows = []

    // Header
    rows.push(['Device Address', 'Part Number', 'Name', 'Manufacturer', 'Category', 'Qty', 'Notes'])

    // Devices — aggregated by part number across all sheets
    const deviceMap = {}
    placements.forEach(p => {
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
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${proposal?.proposal_name || 'Drawing'}_BOM.csv`
    a.click()
    URL.revokeObjectURL(url)
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

      // ── Legend page ──────────────────────────────────────────────────────
      // Title
      pdf.setFillColor(255, 255, 255)
      pdf.rect(0, 0, pageW, pageH, 'F')

      // Company logo or name
      if (logoImg) {
        try {
          const maxW = 50, maxH = 18
          const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
          pdf.addImage(logoImg, 'PNG', margin, 8, logoImg.naturalWidth * ratio, logoImg.naturalHeight * ratio)
        } catch {
          pdf.setTextColor(30, 30, 30); pdf.setFontSize(22); pdf.setFont('helvetica', 'bold')
          pdf.text(orgProfile?.company_name || 'ForgePt', margin, 20)
        }
      } else {
        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(22)
        pdf.setFont('helvetica', 'bold')
        pdf.text(orgProfile?.company_name || 'ForgePt', margin, 20)
      }

      // Project name
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(200, 98, 42)
      pdf.text(proposal?.proposal_name || 'Floor Plan Drawing', margin, 30)

      // Client
      if (proposal?.company) {
        pdf.setTextColor(90, 100, 110)
        pdf.setFontSize(10)
        pdf.text(`Client: ${proposal.company}`, margin, 38)
      }

      // Date
      pdf.setTextColor(90, 100, 110)
      pdf.setFontSize(9)
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, 44)
      pdf.text(`Sheets: ${sheets.length}`, margin + 40, 44)
      pdf.text(`Devices: ${placements.length}`, margin + 80, 44)

      // Legend title
      pdf.setTextColor(200, 98, 42)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SYMBOL LEGEND', margin, 58)

      // Draw legend items
      let lx = margin
      let ly = 65
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

      // Cable summary on legend page
      if (Object.keys(cableByType).length > 0) {
        const cableY = Math.max(ly + rowH + 10, pageH - 60)
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
        pdf.setFillColor(26, 45, 69)
        pdf.rect(0, 0, pageW, 12, 'F')

        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.text(sheet.name, margin, 8)

        pdf.setTextColor(138, 154, 176)
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

        // Title block footer — same style as shop drawings
        const tbY = pageH - titleBlockH
        pdf.setFillColor(26, 45, 69)
        pdf.rect(0, tbY, pageW, titleBlockH, 'F')
        pdf.setDrawColor(42, 61, 85)
        pdf.setLineWidth(0.3)
        pdf.line(0, tbY, pageW, tbY)

        // Left — company name
        pdf.setTextColor(200, 98, 42)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.text(orgProfile?.company_name || '', margin, tbY + 6)

        // Center — proposal name + sheet name
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text(proposal?.proposal_name || '', pageW / 2, tbY + 5, { align: 'center' })
        pdf.setTextColor(138, 154, 176)
        pdf.text(sheet.name, pageW / 2, tbY + 11, { align: 'center' })

        // Right — sheet number + date
        pdf.setTextColor(138, 154, 176)
        pdf.setFontSize(7)
        pdf.text(`Sheet ${i + 1} of ${sheets.length}`, pageW - margin, tbY + 5, { align: 'right' })
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageW - margin, tbY + 11, { align: 'right' })
      }

      pdf.save(`${proposal?.proposal_name || 'Drawing'}_Client_Overview.pdf`)
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
      const { default: jsPDF }      = await import('jspdf')
      const { default: autoTable }  = await import('jspdf-autotable')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

      const pageW  = pdf.internal.pageSize.getWidth()
      const pageH  = pdf.internal.pageSize.getHeight()
      const margin = 10
      const titleBlockH = 18

      const drawTitleBlock = (sheetName, sheetNum) => {
        // Title block border
        pdf.setDrawColor(42, 61, 85)
        pdf.setLineWidth(0.3)
        pdf.rect(margin, pageH - titleBlockH - margin, pageW - margin * 2, titleBlockH)

        // Company
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(200, 98, 42)
        pdf.text(orgProfile?.company_name || 'ForgePt', margin + 2, pageH - titleBlockH - margin + 6)

        // Project
        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text(proposal?.proposal_name || '', margin + 2, pageH - titleBlockH - margin + 11)
        pdf.text(proposal?.company || '', margin + 2, pageH - titleBlockH - margin + 15)

        // Engineer
        const org = orgProfile?.organizations
        if (org?.title_block_engineer) {
          pdf.text(`Engineer: ${org.title_block_engineer}`, pageW / 2, pageH - titleBlockH - margin + 6, { align: 'center' })
        }
        if (org?.title_block_license) {
          pdf.text(`License: ${org.title_block_license}`, pageW / 2, pageH - titleBlockH - margin + 11, { align: 'center' })
        }
        if (org?.title_block_scale) {
          pdf.text(`Scale: ${org.title_block_scale}`, pageW / 2, pageH - titleBlockH - margin + 15, { align: 'center' })
        }

        // Sheet info
        pdf.setFont('helvetica', 'bold')
        pdf.text(sheetName, pageW - margin - 2, pageH - titleBlockH - margin + 6, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        pdf.text(`Sheet ${sheetNum} of ${sheets.length + 3}`, pageW - margin - 2, pageH - titleBlockH - margin + 11, { align: 'right' })
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageW - margin - 2, pageH - titleBlockH - margin + 15, { align: 'right' })
      }

      const logoImg = await loadOrgLogo()

      // ── Title sheet ──────────────────────────────────────────────────────
      pdf.setFillColor(255, 255, 255)
      pdf.rect(0, 0, pageW, pageH, 'F')

      // Logo or company name top-left
      if (logoImg) {
        try {
          const maxW = 55, maxH = 22
          const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
          pdf.addImage(logoImg, 'PNG', margin, margin, logoImg.naturalWidth * ratio, logoImg.naturalHeight * ratio)
        } catch {
          pdf.setTextColor(200, 98, 42); pdf.setFontSize(12); pdf.setFont('helvetica', 'bold')
          pdf.text(orgProfile?.company_name || '', margin, margin + 8)
        }
      } else if (orgProfile?.company_name) {
        pdf.setTextColor(200, 98, 42); pdf.setFontSize(12); pdf.setFont('helvetica', 'bold')
        pdf.text(orgProfile.company_name, margin, margin + 8)
      }

      pdf.setTextColor(200, 98, 42)
      pdf.setFontSize(28)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SHOP DRAWINGS', pageW / 2, 40, { align: 'center' })

      pdf.setTextColor(30, 30, 30)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'normal')
      pdf.text(proposal?.proposal_name || '', pageW / 2, 55, { align: 'center' })

      pdf.setTextColor(90, 100, 110)
      pdf.setFontSize(11)
      pdf.text(proposal?.company || '', pageW / 2, 65, { align: 'center' })
      pdf.text(`Prepared by: ${orgProfile?.company_name || ''}`, pageW / 2, 75, { align: 'center' })
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageW / 2, 83, { align: 'center' })
      pdf.text(`Total Sheets: ${sheets.length}`, pageW / 2, 91, { align: 'center' })

      drawTitleBlock('Title Sheet', 1)

      // ── Legend sheet ─────────────────────────────────────────────────────
      pdf.addPage()
      pdf.setFillColor(255, 255, 255)
      pdf.rect(0, 0, pageW, pageH, 'F')

      pdf.setTextColor(200, 98, 42)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SYMBOL LEGEND', margin, margin + 8)

      let lx = margin
      let ly = margin + 18
      const colW   = 60
      const perRow = Math.floor((pageW - margin * 2) / colW)
      let col = 0

      for (const category of usedCategories) {
        const legendIcon = await getIconPng(category, '#C8622A', 32)
        if (legendIcon) {
          pdf.addImage(legendIcon, 'PNG', lx, ly - 2, 7, 7)
        } else {
          pdf.setFillColor(200, 98, 42)
          pdf.circle(lx + 3.5, ly + 3, 3.5, 'F')
        }
        pdf.setTextColor(30, 30, 30)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.text(category, lx + 11, ly + 4)
        const count = placements.filter(p => p.global_products?.category === category).length
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(90, 100, 110)
        pdf.text(`Count: ${count}`, lx + 11, ly + 9)
        col++
        if (col >= perRow) { col = 0; lx = margin; ly += 16 }
        else lx += colW
      }

      drawTitleBlock('Legend', 2)

      // ── Device schedule sheet ────────────────────────────────────────────
      pdf.addPage()
      pdf.setFillColor(255, 255, 255)
      pdf.rect(0, 0, pageW, pageH, 'F')

      pdf.setTextColor(200, 98, 42)
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text('DEVICE SCHEDULE', margin, margin + 8)

      const scheduleRows = placements.map((p, idx) => {
        const gp     = p.global_products
        const sheet  = sheets.find(s => s.id === p.drawing_sheet_id)
        return [
          idx + 1,
          p.device_address || '—',
          p.part_number_override || gp?.part_number || '—',
          p.description_override || gp?.name || '—',
          p.manufacturer_override || gp?.manufacturer || '—',
          gp?.category || '—',
          p.quantity || 1,
          sheet?.name || '—',
          p.runs_to_label || '—',
        ]
      })

      autoTable(pdf, {
        startY:     margin + 14,
        margin:     { left: margin, right: margin, bottom: titleBlockH + margin + 5 },
        head:       [['#', 'Address', 'Part Number', 'Description', 'Manufacturer', 'Category', 'Qty', 'Sheet', 'Runs To']],
        body:       scheduleRows,
        theme:      'grid',
        styles:     { fontSize: 7, cellPadding: 2, textColor: [40, 40, 40], fillColor: [255, 255, 255], lineColor: [200, 200, 200] },
        headStyles: { fillColor: [26, 45, 69], textColor: [200, 98, 42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      })

      drawTitleBlock('Device Schedule', 3)

      // ── Floor plan sheets ────────────────────────────────────────────────
      for (let i = 0; i < sheets.length; i++) {
        const sheet  = sheets[i]
        pdf.addPage()
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageW, pageH, 'F')

        // Header
        pdf.setFillColor(26, 45, 69)
        pdf.rect(0, 0, pageW, 10, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.text(sheet.name, margin, 7)

        // Image area
        const imgY = 12
        const imgH = pageH - imgY - titleBlockH - margin - 5
        const imgW = pageW - margin * 2

        const imgData = await getFloorPlanImage(sheet.id)
        await drawSheetOnPDF(pdf, sheet, imgData, margin, imgY, imgW, imgH, exportFOV)

        drawTitleBlock(sheet.name, i + 4)
      }

      // ── Cable schedule ───────────────────────────────────────────────────
      if (cableRuns.length > 0 || verticalRises.length > 0) {
        pdf.addPage()
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageW, pageH, 'F')

        pdf.setTextColor(200, 98, 42)
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text('CABLE SCHEDULE', margin, margin + 8)

        const cableRows = Object.entries(cableByType).map(([type, data]) => [
          type,
          data.runs || '—',
          `${Math.round(data.footage)}ft`,
          `${Math.round(data.total_footage)}ft`,
        ])

        autoTable(pdf, {
          startY:     margin + 14,
          margin:     { left: margin, right: margin, bottom: titleBlockH + margin + 5 },
          head:       [['Cable Type', 'Runs', 'Measured', 'With Waste']],
          body:       cableRows,
          theme:      'grid',
          styles:     { fontSize: 8, cellPadding: 3, textColor: [255,255,255], fillColor: [15,28,46], lineColor: [42,61,85] },
          headStyles: { fillColor: [26,45,69], textColor: [200,98,42], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [20,35,55] },
        })

        if (verticalRises.length > 0) {
          const riseY = pdf.lastAutoTable.finalY + 10
          pdf.setTextColor(200,98,42)
          pdf.setFontSize(10)
          pdf.text('VERTICAL RISES', margin, riseY)

          const riseRows = verticalRises.map(r => {
            const from = sheets.find(s => s.id === r.from_sheet_id)
            const to   = sheets.find(s => s.id === r.to_sheet_id)
            return [from?.name || '—', to?.name || '—', r.label || '—', r.cable_type, `${r.rise_height}ft`, r.quantity, `${Math.round(r.total_footage)}ft`]
          })

          autoTable(pdf, {
            startY:     riseY + 4,
            margin:     { left: margin, right: margin, bottom: titleBlockH + margin + 5 },
            head:       [['From', 'To', 'Label', 'Cable', 'Height', 'Qty', 'Total']],
            body:       riseRows,
            theme:      'grid',
            styles:     { fontSize: 8, cellPadding: 3, textColor: [255,255,255], fillColor: [15,28,46], lineColor: [42,61,85] },
            headStyles: { fillColor: [26,45,69], textColor: [200,98,42], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [20,35,55] },
          })
        }

        drawTitleBlock('Cable Schedule', sheets.length + 4)
      }

      pdf.save(`${proposal?.proposal_name || 'Drawing'}_Shop_Drawings.pdf`)
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

      // Title
      pdf.setFillColor(15,28,46)
      pdf.rect(0,0,pageW,pageH,'F')

      // Logo or company name top-left
      if (logoImg) {
        try {
          const maxW = 55, maxH = 22
          const ratio = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight)
          pdf.addImage(logoImg, 'PNG', margin, margin, logoImg.naturalWidth * ratio, logoImg.naturalHeight * ratio)
        } catch {
          pdf.setTextColor(200,98,42); pdf.setFontSize(12); pdf.setFont('helvetica','bold')
          pdf.text(orgProfile?.company_name || '', margin, margin + 8)
        }
      } else if (orgProfile?.company_name) {
        pdf.setTextColor(200,98,42); pdf.setFontSize(12); pdf.setFont('helvetica','bold')
        pdf.text(orgProfile.company_name, margin, margin + 8)
      }

      pdf.setTextColor(200,98,42)
      pdf.setFontSize(28)
      pdf.setFont('helvetica','bold')
      pdf.text('AS-BUILT DRAWINGS', pageW/2, 40, { align: 'center' })
      pdf.setTextColor(255,255,255)
      pdf.setFontSize(14)
      pdf.setFont('helvetica','normal')
      pdf.text(proposal?.proposal_name || '', pageW/2, 54, { align: 'center' })
      pdf.setTextColor(138,154,176)
      pdf.setFontSize(10)
      pdf.text(proposal?.company || '', pageW/2, 63, { align: 'center' })
      pdf.text(`As-Built Date: ${new Date().toLocaleDateString()}`, pageW/2, 71, { align: 'center' })

      // As-built device schedule
      pdf.addPage()
      pdf.setFillColor(15,28,46)
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
        head:       [['#', 'Address', 'Part #', 'Description', 'Manufacturer', 'Sheet', 'Serial', 'IP', 'MAC', 'Switch', 'Port', 'Patch Panel', 'Runs To']],
        body:       asBuiltRows,
        theme:      'grid',
        styles:     { fontSize: 6, cellPadding: 1.5, textColor: [255,255,255], fillColor: [15,28,46], lineColor: [42,61,85] },
        headStyles: { fillColor: [26,45,69], textColor: [200,98,42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [20,35,55] },
      })

      pdf.save(`${proposal?.proposal_name || 'Drawing'}_As_Built.pdf`)
    } catch (err) {
      console.error('As-built failed:', err)
      alert('PDF generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    setSharing(true)
    try {
      const token    = crypto.randomUUID()
      const expires  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

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
          share_expires_at: expires.toISOString(),
        })
        .select('share_token')
        .single()

      if (!error && data) {
        const link = `${window.location.origin}/designer/review/${data.share_token}`
        setShareLink(link)
      }
    } catch (err) {
      console.error('Share failed:', err)
    } finally {
      setSharing(false)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const exports = [
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
        {placements.length} devices · {cableRuns.length} cable runs · {sheets.length} sheets
      </p>

      {/* Export options */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-4">
        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide self-center">Drawing Options</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={exportFOV} onChange={e => setExportFOV(e.target.checked)}
            className="accent-[#C8622A] w-3.5 h-3.5" />
          <span className="text-white text-xs">Include FOV overlays</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {exports.map(exp => (
          <div key={exp.id}
            className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-5 flex items-center justify-between gap-4">
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
              disabled={generating || sheets.length === 0}
              className={`flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                generating || sheets.length === 0
                  ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                  : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
              }`}>
              {generating ? 'Generating...' : 'Export'}
            </button>
          </div>
        ))}
      </div>

      {sheets.length === 0 && (
        <p className="text-[#8A9AB0] text-xs text-center mt-4">
          Add floor plan sheets before exporting.
        </p>
      )}

      {/* Share for client review */}
      <div className="border-t border-[#2a3d55] pt-6 mt-2">
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0F1C2E] flex items-center justify-center text-2xl flex-shrink-0">
                🔗
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Share for Client Review</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">
                  Generate a link your client can use to view the design and approve it.
                  Link expires in 30 days.
                </p>
              </div>
            </div>
            {!shareLink && (
              <button
                onClick={handleShare}
                disabled={sharing || sheets.length === 0}
                className={`flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  sharing || sheets.length === 0
                    ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                    : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
                }`}>
                {sharing ? 'Generating...' : 'Generate Link'}
              </button>
            )}
          </div>

          {shareLink && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 bg-[#0F1C2E] border border-[#2a3d55] rounded-lg px-3 py-2">
                <span className="text-[#8A9AB0] text-xs flex-1 truncate">{shareLink}</span>
                <button onClick={handleCopyLink}
                  className="text-xs font-semibold text-[#C8622A] hover:text-white transition-colors flex-shrink-0">
                  {shareCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[#4a5a6a] text-xs">
                This link is valid for 30 days. Your client can view the design and approve it without logging in.
              </p>
              <button onClick={() => { setShareLink(null) }}
                className="text-xs text-[#8A9AB0] hover:text-white transition-colors">
                Generate new link
              </button>
            </div>
          )}
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
import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Circle, Group, Text, Rect, Shape, Line } from 'react-konva'
import { supabase } from '../../supabase'
import { useCategoryIcons } from './useCategoryIcons'
import { PATHWAY_DEFS } from './SymbolPicker'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const LABEL_PREFIXES = {
  'Dome Camera':             'CAM',
  'Bullet Camera':           'CAM',
  'PTZ Camera':              'PTZ',
  'Turret Camera':           'CAM',
  'Multi-Lens Camera':       'CAM',
  'Fisheye Camera':          'CAM',
  'LPR Camera':              'LPR',
  'Cabinet System':          'CAB',
  'Cabinet Solar System':    'SOL',
  'Video Encoder':           'ENC',
  'Access Reader':       'RDR',
  'Access Control Door': 'DR',
  'Controller':          'CTRL',
  'Motion Sensor':       'MS',
  'Sensor':              'SEN',
  'Intercom':            'INT',
  'NVR':                 'NVR',
  'Speaker':             'SPK',
  'Display':             'DISP',
  'Network':             'SW',
  'Wireless Lock':       'WL',
  'Data Drop':           'DD',
  'Patch Panel':         'PP',
  'UPS':                 'UPS',
  'Rack':                'RACK',
  'FACP':                'FA',
  'Smoke Detector':      'SMK',
  'Heat Detector':       'HEAT',
  'Horn Strobe':         'HS',
  'Horn':                'HRN',
  'Strobe':              'STR',
  'Bell':                'BEL',
  'Pull Station':        'PS',
  'Duct Detector':       'DD',
  'CO Detector':         'CO',
  'Beam Detector':       'BM',
  'Annunciator':         'ANN',
  'Monitor Module':      'MM',
  'Control Module':      'CM',
  'Door Holder':         'DH',
  'Air Sampling':        'ASD',
  'Suppression Panel':   'SUP',
  'Guard Tour':          'GT',
  'Panel':               'PNL',
  'Amplifier':           'AMP',
  'DSP':                 'DSP',
  'Switcher':            'SWTCH',
  'Thermostat':          'THERM',
  'Point to Point':      'P2P',
  'Power Box':           'PWR',
}

const getNextLabel = async (category, sheetIds) => {
  const prefix = LABEL_PREFIXES[category]
  if (!prefix) return null

  const { data } = await supabase
    .from('drawing_placements')
    .select('device_address')
    .in('drawing_sheet_id', sheetIds)
    .not('device_address', 'is', null)
    .like('device_address', `${prefix}-%`)

  if (!data || data.length === 0) return `${prefix}-01`

  const nums = data
    .map(p => parseInt((p.device_address || '').replace(`${prefix}-`, '')) || 0)
    .filter(n => !isNaN(n))

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}-${String(next).padStart(2, '0')}`
}

export default function DrawingSheet({ sheet, orgId, selectedSymbol, onPlacementChange, onPlacementSelect, updatedPlacement, onCableSelect, editingCableId, onEditingCableDone, updatedCable, deletedCableId, copiedPlacement: externalCopied, onCopyPlacement, onStageReady, allSheetIds, showLabels, onToggleLabels, placementsRefreshKey, openPlacementId, onPlacementsChange, activeTool, onPathwaySelect, deletedPathwayId, rooms, onRoomClick, onRoomPlace, onRoomMove }) {
  const containerRef = useRef(null)
  const stageRef     = useRef(null)

  useEffect(() => {
    if (stageRef.current) onStageReady?.(stageRef.current)
  }, [stageRef.current])
  const isPanning    = useRef(false)
  const lastPointer  = useRef(null)
  const lastDist     = useRef(0)
  const canvasWRef   = useRef(1200)
  const canvasHRef   = useRef(900)
  const positionRef  = useRef({ x: 0, y: 0 })
  const scaleRef     = useRef(1)
  const placementsRef = useRef([])

  const [bgImage,    setBgImage]    = useState(null)
  const [imageSize,  setImageSize]  = useState({ w: 1200, h: 900 })
  const [stageSize,  setStageSize]  = useState({ w: 800, h: 600 })
  const [scale,      setScale]      = useState(1)
  const [position,   setPosition]   = useState({ x: 0, y: 0 })
  const [placements, setPlacements] = useState([])
  const [selectedId,  setSelectedId]  = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set()) // multiselect
  const [selectionBox, setSelectionBox] = useState(null) // drag selection box
  const selectionBoxRef = useRef(null)
  const isSelecting = useRef(false)
  const selectionStart = useRef(null)
  const [hoveredId,  setHoveredId]  = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [placing,    setPlacing]    = useState(false)

  const { getIcon, ready: iconsReady } = useCategoryIcons('white', 40)
  const [showFOV,        setShowFOV]        = useState(true)
  const [draggingFOV,    setDraggingFOV]    = useState(null) // {rotation, fov_angle, fov_range} while handle is dragged
  const cableMode      = activeTool?.type === 'cable'
  const cableType      = activeTool?.cableType || 'Cat6'
  const pathwayMode    = activeTool?.type === 'pathway'
  const pathwayType    = activeTool?.pathwayType || 'EMT'
  const roomMode       = activeTool?.type === 'room'
  const [cableRuns,      setCableRuns]      = useState([])
  const [activeCable,    setActiveCable]    = useState(null)
  const [activePoints,   setActivePoints]   = useState([])
  const [selectedCable,     setSelectedCable]     = useState(null)
  const [showCableRuns,  setShowCableRuns]  = useState(true)
  const [pathways,           setPathways]           = useState([])
  const [activePathwayPoints, setActivePathwayPoints] = useState([])
  const [selectedPathwayId,  setSelectedPathwayId]  = useState(null)
  const [editingPathwayId,   setEditingPathwayId]   = useState(null)
  const [hoveredPathwayWpt,  setHoveredPathwayWpt]  = useState(null) // {pathwayId, pointIndex}
  const [showPathways,       setShowPathways]       = useState(true)
  const [wasteFactor,    setWasteFactor]    = useState(10)
  const [editingCable,   setEditingCable]   = useState(null) // cable id being edited
  const [dragPoint,      setDragPoint]      = useState(null) // {cableId, pointIndex}
  const [hoveredWaypoint,  setHoveredWaypoint]  = useState(null)
  const [industryFilter,   setIndustryFilter]   = useState([])
  const [showLayerMenu,    setShowLayerMenu]    = useState(false)
  const copiedPlacement    = externalCopied
  const setCopiedPlacement = onCopyPlacement || (() => {})
  const [contextMenu,     setContextMenu]     = useState(null) // {x, y, placementId}

  
  const snapRadius = 20 // pixels — snap to device marker within this distance

  const [showScaleModal,  setShowScaleModal]  = useState(false)
  const [scaleMethod,     setScaleMethod]     = useState('manual')
  const [manualScale,     setManualScale]     = useState('')
  const [realDistance,    setRealDistance]    = useState('')
  const [pointA,          setPointA]          = useState(null)
  const [pointB,          setPointB]          = useState(null)
  const [applyToAll,      setApplyToAll]      = useState(true)
  const getScaleLabel = (ratio) => {
    if (!ratio) return null
    const feetPerInch = Math.round(ratio * 96 * 10) / 10
    return `1" = ${feetPerInch}ft`
  }

  const [bgRotation,      setBgRotation]      = useState(sheet.bg_rotation ?? 0)
  const rawBgImageRef = useRef(null) // unrotated original

  // Local copy of scale_ratio so it updates immediately after calibration
  // without waiting for the parent to re-fetch the sheet from the DB.
  const [scaleRatio,      setScaleRatio]      = useState(sheet.scale_ratio ?? null)
  const [calibratedScale, setCalibratedScale] = useState(
    getScaleLabel(sheet.scale_ratio)
  )

  useEffect(() => {
    setScaleRatio(sheet.scale_ratio ?? null)
    setCalibratedScale(getScaleLabel(sheet.scale_ratio))
  }, [sheet.scale_ratio, sheet.id])
  const [pickingPoint,    setPickingPoint]    = useState(null) // 'A' | 'B' | null

  // ── Measure container ──────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setStageSize({ w: containerRef.current.offsetWidth, h: containerRef.current.offsetHeight })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Load floor plan ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sheet?.storage_path) return
    if (sheet.storage_path === 'pending') return
    if (sheet.storage_path === 'blank') { setLoading(false); return }
    loadFloorPlan()
  }, [sheet?.storage_path])

  const [loadStep, setLoadStep] = useState('')

  const loadFloorPlan = async () => {
    setLoading(true)
    setError(null)
    setLoadStep('Connecting…')

    const run = async () => {
      setLoadStep('Getting file URL…')
      const { getR2Url } = await import('../../r2')
      const signedUrl = await getR2Url(sheet.storage_path, 3600)
      if (!signedUrl) {
        throw new Error('File not found in storage. Try re-uploading this sheet.')
      }
      if (sheet.storage_path.toLowerCase().endsWith('.pdf')) {
        setLoadStep('Loading PDF…')
        await renderPDF(signedUrl, sheet.page_number || 1)
      } else {
        setLoadStep('Loading image…')
        await loadImageFromUrl(signedUrl)
      }
    }

    try {
      await Promise.race([
        run(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out at step: "${loadStep}" — check your connection and try again.`)), 25000)
        ),
      ])
    } catch (err) {
      console.warn('Floor plan load failed:', err)
      setError(`Floor plan failed to load: ${err.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
      setLoadStep('')
    }
  }

  const renderPDF = async (url, pageNum = 1) => {
    // Polyfill URL.parse for iOS < 18 — pdfjs-dist uses it internally
    if (!URL.parse) {
      URL.parse = (u, base) => { try { return new URL(u, base) } catch { return null } }
    }

    const pdfjsLib = await import('pdfjs-dist')
    // Use the Vite-hashed asset URL — more reliable than new URL(import.meta.url) on iOS
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

    // Wrap getDocument in a 30s timeout — iOS can hang indefinitely if the worker fails
    const loadingTask = pdfjsLib.getDocument({ url, useWorkerFetch: false })
    const pdf = await Promise.race([
      loadingTask.promise,
      new Promise((_, reject) =>
        setTimeout(() => { loadingTask.destroy?.(); reject(new Error('PDF load timed out — try a smaller file or re-upload.')) }, 30000)
      ),
    ])

    const page     = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    // Cap at 4096px on either side — iOS Safari canvas memory limit
    const renderScale = Math.min(3, 3600 / viewport.width, 4096 / viewport.height)
    const scaled   = page.getViewport({ scale: renderScale })
    const canvas   = document.createElement('canvas')
    canvas.width   = Math.floor(scaled.width)
    canvas.height  = Math.floor(scaled.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context unavailable — the floor plan may be too large for this device.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: scaled }).promise
    await loadImageFromUrl(canvas.toDataURL('image/png'))
    return pdf.numPages
  }

  const applyBgRotation = (img, degrees) => {
    if (!degrees || degrees % 360 === 0) return img
    const canvas = document.createElement('canvas')
    const ctx    = canvas.getContext('2d')
    const srcW   = img.naturalWidth  || img.width
    const srcH   = img.naturalHeight || img.height
    const swap   = degrees === 90 || degrees === 270
    canvas.width  = swap ? srcH : srcW
    canvas.height = swap ? srcW : srcH
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(img, -srcW / 2, -srcH / 2)
    return canvas // Konva accepts HTMLCanvasElement directly
  }

  const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      rawBgImageRef.current = img
      const rot     = sheet.bg_rotation ?? 0
      const rotated = applyBgRotation(img, rot)
      setBgImage(rotated)
      setImageSize({ w: rotated.width || img.naturalWidth, h: rotated.height || img.naturalHeight })
      fitToStage(rotated.width || img.naturalWidth, rotated.height || img.naturalHeight)
      resolve()
    }
    img.onerror = reject
    img.src = url
  })

  const fitToStage = useCallback((imgW, imgH) => {
    if (!containerRef.current) return
    const sw = containerRef.current.offsetWidth
    const sh = containerRef.current.offsetHeight
    const fit = Math.min(sw / imgW, sh / imgH) * 0.92
    setScale(fit)
    setPosition({ x: (sw - imgW * fit) / 2, y: (sh - imgH * fit) / 2 })
  }, [])

  // ── Load placements ────────────────────────────────────────────────────────
  const loadPlacements = useCallback(async () => {
    const { data } = await supabase
      .from('drawing_placements')
      .select('*, global_products(id, name, part_number, manufacturer, category, industry, specs, accessories)')
      .eq('drawing_sheet_id', sheet.id)
      .order('created_at')
    if (data) {
      setPlacements(data)
      onPlacementsChange?.(data)
    }
  }, [sheet.id])

  useEffect(() => { loadPlacements() }, [loadPlacements, placementsRefreshKey ?? 0])
  useEffect(() => { onPlacementsChange?.(placements) }, [placements])

  const loadCableRuns = useCallback(async () => {
    const { data } = await supabase
      .from('cable_runs')
      .select('*')
      .eq('drawing_sheet_id', sheet.id)
      .order('created_at')
    if (data) setCableRuns(data)
  }, [sheet.id])

  useEffect(() => { loadCableRuns() }, [loadCableRuns])

  const loadPathways = useCallback(async () => {
    const { data } = await supabase
      .from('drawing_pathways')
      .select('*')
      .eq('drawing_sheet_id', sheet.id)
      .order('created_at')
    if (data) setPathways(data)
  }, [sheet.id])

  useEffect(() => { loadPathways() }, [loadPathways])

  useEffect(() => {
    if (editingCableId) {
      setEditingCable(editingCableId)
      setSelectedCable(editingCableId)
    }
  }, [editingCableId])

  // Delete selected cable with Delete/Backspace key
  useEffect(() => {
    const handleKeyDown = async (e) => {
      const tag = document.activeElement?.tagName
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isInput) return

        // Delete selected cable — then stop
        if (selectedCable) {
          await supabase.from('cable_runs').delete().eq('id', selectedCable)
          setCableRuns(prev => prev.filter(r => r.id !== selectedCable))
          setSelectedCable(null)
          return
        }

        // Delete selected pathway — then stop
        if (selectedPathwayId) {
          await supabase.from('drawing_pathways').delete().eq('id', selectedPathwayId)
          setPathways(prev => prev.filter(p => p.id !== selectedPathwayId))
          setSelectedPathwayId(null)
          onPathwaySelect?.(null)
          return
        }
      }

      // Delete selected placement
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedIds.size > 0) {
          for (const id of selectedIds) {
            await supabase.from('drawing_placements').delete().eq('id', id)
          }
          setPlacements(prev => prev.filter(p => !selectedIds.has(p.id)))
          setSelectedIds(new Set())
        } else if (selectedId) {
          await supabase.from('drawing_placements').delete().eq('id', selectedId)
          setPlacements(prev => prev.filter(p => p.id !== selectedId))
          setSelectedId(null)
        }
        onPlacementSelect?.(null)
        onPlacementChange?.()
      }

      // Copy placement
      if ((e.key === 'c' || e.key === 'C') && (e.metaKey || e.ctrlKey) && selectedId && !isInput) {
        const p = placements.find(p => p.id === selectedId)
        if (p) setCopiedPlacement(p)
      }

      // Paste placement
      if ((e.key === 'v' || e.key === 'V') && (e.metaKey || e.ctrlKey) && copiedPlacement && !isInput) {
        e.preventDefault()
        const offset = 0.03
        const { data, error } = await supabase
          .from('drawing_placements')
          .insert({
            org_id:              copiedPlacement.org_id,
            drawing_sheet_id:    sheet.id,
            global_product_id:   copiedPlacement.global_product_id,
            product_id:          copiedPlacement.product_id,
            x:                   Math.min(copiedPlacement.x + offset, 0.99),
            y:                   Math.min(copiedPlacement.y + offset, 0.99),
            device_address:      await getNextLabel(copiedPlacement.global_products?.category, allSheetIds || [sheet.id]),
            rotation:            copiedPlacement.rotation,
            quantity:            copiedPlacement.quantity,
            symbol_size:         copiedPlacement.symbol_size,
            marker_color:        copiedPlacement.marker_color,
            part_number_override:  copiedPlacement.part_number_override,
            manufacturer_override: copiedPlacement.manufacturer_override,
            description_override:  copiedPlacement.description_override,
            notes:               copiedPlacement.notes,
            fov_angle:           copiedPlacement.fov_angle,
            fov_range:           copiedPlacement.fov_range,
            source:              'manual',
          })
          .select('*, global_products(id, name, part_number, manufacturer, category, industry, specs, accessories)')
          .single()
        if (!error && data) {
          // Copy components from source placement
          const { data: sourceComps } = await supabase
            .from('placement_components')
            .select('*')
            .eq('placement_id', copiedPlacement.id)
          if (sourceComps?.length > 0) {
            await supabase.from('placement_components').insert(
              sourceComps.map(c => ({
                org_id:         c.org_id,
                placement_id:   data.id,
                component_type: c.component_type,
                name:           c.name,
                part_number:    c.part_number,
                manufacturer:   c.manufacturer,
                quantity:       c.quantity,
                notes:          c.notes,
              }))
            )
          }
          setPlacements(prev => [...prev, data])
          setSelectedId(data.id)
          onPlacementSelect?.(data)
          onPlacementChange?.()
          setCopiedPlacement({ ...copiedPlacement, x: Math.min(copiedPlacement.x + offset, 0.99), y: Math.min(copiedPlacement.y + offset, 0.99) })
        }
      }

      // Escape
      if (e.key === 'Escape') {
        setActivePoints([])
        setActivePathwayPoints([])
        setEditingCable(null)
        setEditingPathwayId(null)
        setContextMenu(null)
        onEditingCableDone?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCable, selectedPathwayId, selectedId, copiedPlacement, cableMode, pathwayMode, placements, editingPathwayId])

  useEffect(() => {
    if (!updatedPlacement) return
    setPlacements(prev =>
      prev.map(p => p.id === updatedPlacement.id ? { ...p, ...updatedPlacement } : p)
    )
  }, [updatedPlacement])

  // Reset FOV drag state when selection changes
  useEffect(() => { setDraggingFOV(null) }, [selectedId])

  useEffect(() => {
    if (!updatedCable) return
    setCableRuns(prev =>
      prev.map(r => r.id === updatedCable.id ? { ...r, ...updatedCable } : r)
    )
  }, [updatedCable])

  useEffect(() => {
    if (!deletedCableId) return
    setCableRuns(prev => prev.filter(r => r.id !== deletedCableId))
  }, [deletedCableId])

  useEffect(() => {
    if (!deletedPathwayId) return
    setPathways(prev => prev.filter(p => p.id !== deletedPathwayId))
    setSelectedPathwayId(null)
  }, [deletedPathwayId])

  // ── Realtime ───────────────────────────────────────────────────────────────
  // Track which placement is open in the panel — realtime events for that row
  // are suppressed while the panel owns its form state.
  const suppressRealtimeFor = useRef(openPlacementId)
  useEffect(() => { suppressRealtimeFor.current = openPlacementId }, [openPlacementId])

  useEffect(() => {
    const channel = supabase
      .channel(`placements_${sheet.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'drawing_placements',
        filter: `drawing_sheet_id=eq.${sheet.id}`,
      }, (payload) => {
        const changedId = payload.new?.id || payload.old?.id
        // Skip reload if the changed row is the one currently open in the panel —
        // the panel owns that row's state while it's open.
        if (changedId && changedId === suppressRealtimeFor.current) return
        loadPlacements()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [sheet.id, loadPlacements])

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault()
    const stage   = stageRef.current
    const pointer = stage.getPointerPosition()
    const factor  = e.evt.deltaY < 0 ? 1.12 : 0.9
    const newScale = Math.min(Math.max(scale * factor, 0.05), 15)
    const mouseX  = (pointer.x - position.x) / scale
    const mouseY  = (pointer.y - position.y) / scale
    setScale(newScale)
    setPosition({ x: pointer.x - mouseX * newScale, y: pointer.y - mouseY * newScale })
  }, [scale, position])

  // ── Pan ────────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    const isOnBackground = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name())
    // Middle mouse OR left mouse when no symbol selected = pan or selection box
    if (e.evt.button === 1 || (e.evt.button === 0 && !selectedSymbol)) {
      if (e.evt.shiftKey && isOnBackground) {
        // Shift+drag = selection box
        const pointer = stageRef.current.getPointerPosition()
        selectionStart.current = pointer
        isSelecting.current = true
        setSelectionBox({ x: pointer.x, y: pointer.y, w: 0, h: 0 })
      } else {
        isPanning.current = true
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        e.evt.preventDefault()
      }
    }
  }, [selectedSymbol])

  const handleMouseMove = useCallback((e) => {
    if (isSelecting.current && selectionStart.current) {
      const pointer = stageRef.current.getPointerPosition()
      const box = {
          x: Math.min(pointer.x, selectionStart.current.x),
          y: Math.min(pointer.y, selectionStart.current.y),
          w: Math.abs(pointer.x - selectionStart.current.x),
          h: Math.abs(pointer.y - selectionStart.current.y),
        }
        selectionBoxRef.current = box
        setSelectionBox(box)
      return
    }
    if (!isPanning.current || !lastPointer.current) return
    const dx = e.evt.clientX - lastPointer.current.x
    const dy = e.evt.clientY - lastPointer.current.y
    lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    if (isSelecting.current) {
      const box = selectionBoxRef.current
      if (box) {
        const selected = new Set()
        const cW = canvasWRef.current
        const cH = canvasHRef.current
        const pos = positionRef.current
        const sc  = scaleRef.current
        placementsRef.current.forEach(p => {
          const px = pos.x + p.x * cW * sc
          const py = pos.y + p.y * cH * sc
          if (px >= box.x && px <= box.x + box.w &&
              py >= box.y && py <= box.y + box.h) {
            selected.add(p.id)
          }
        })
        if (selected.size > 0) {
          setSelectedIds(selected)
          setSelectedId(null)
          onPlacementSelect?.(null)
        }
      }
    }
    isSelecting.current = false
    selectionStart.current = null
    setSelectionBox(null)
  }, [])

  // ── Pinch zoom ─────────────────────────────────────────────────────────────
  const lastTouchPos = useRef(null)

  const touchPanStarted = useRef(false) // true once finger has moved enough to be a pan (not a tap)

  const handleTouchStart = useCallback((e) => {
    const t = e.evt.touches
    if (t.length === 2) {
      lastDist.current = Math.sqrt((t[0].clientX - t[1].clientX) ** 2 + (t[0].clientY - t[1].clientY) ** 2)
      lastTouchPos.current = null
      touchPanStarted.current = false
    } else if (t.length === 1) {
      lastTouchPos.current = { x: t[0].clientX, y: t[0].clientY }
      touchPanStarted.current = false
    }
  }, [])

  const handleTouchMove = useCallback((e) => {
    const t = e.evt.touches
    if (t.length === 2) {
      // Pinch zoom
      const dist = Math.sqrt((t[0].clientX - t[1].clientX) ** 2 + (t[0].clientY - t[1].clientY) ** 2)
      if (lastDist.current) {
        const scaleBy = dist / lastDist.current
        setScale(s => Math.min(Math.max(s * scaleBy, 0.05), 15))
      }
      lastDist.current = dist
      lastTouchPos.current = null
    } else if (t.length === 1 && lastTouchPos.current) {
      const dx = t[0].clientX - lastTouchPos.current.x
      const dy = t[0].clientY - lastTouchPos.current.y
      // Only start panning after moving >6px so stationary taps don't drift the canvas
      if (!touchPanStarted.current) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        touchPanStarted.current = true
      }
      setPosition(p => ({ x: p.x + dx, y: p.y + dy }))
      lastTouchPos.current = { x: t[0].clientX, y: t[0].clientY }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    lastDist.current = 0
    lastTouchPos.current = null
    touchPanStarted.current = false
  }, [])

  // ── Canvas dimensions ──────────────────────────────────────────────────────
  const isBlank = sheet.storage_path === 'blank'
  const canvasW = isBlank ? Math.max(stageSize.w, 1200) : imageSize.w
  const canvasH = isBlank ? Math.max(stageSize.h, 900) : imageSize.h
  canvasWRef.current   = canvasW
  canvasHRef.current   = canvasH
  positionRef.current  = position
  scaleRef.current     = scale
  placementsRef.current = placements

  // ── Snap to nearest placement marker ──────────────────────────────────────
  const snapToPlacement = useCallback((px, py) => {
    let nearest = null
    let minDist = snapRadius
    placements.forEach(p => {
      const mx   = position.x + p.x * canvasW * scale
      const my   = position.y + p.y * canvasH * scale
      const dist = Math.sqrt((px - mx) ** 2 + (py - my) ** 2)
      if (dist < minDist) { minDist = dist; nearest = p }
    })
    if (nearest) {
      return {
        x: Math.round(nearest.x * 10000) / 10000,
        y: Math.round(nearest.y * 10000) / 10000,
        snapped: true,
        placement: nearest,
      }
    }
    return {
      x: Math.round(((px - position.x) / scale / canvasW) * 10000) / 10000,
      y: Math.round(((py - position.y) / scale / canvasH) * 10000) / 10000,
      snapped: false,
      placement: null,
    }
  }, [placements, position, canvasW, canvasH, scale])

  // ── Finish cable/pathway drawing (double-click on desktop, double-tap on tablet) ──
  const handleFinishDraw = useCallback(async () => {
    if (cableMode && activePoints.length >= 2) {
      let pixels = 0
      for (let i = 1; i < activePoints.length; i++) {
        const dx = (activePoints[i].x - activePoints[i-1].x) * imageSize.w
        const dy = (activePoints[i].y - activePoints[i-1].y) * imageSize.h
        pixels += Math.sqrt(dx*dx + dy*dy)
      }
      const footage = scaleRatio ? Math.round(pixels * scaleRatio) : 0
      const totalFootage = Math.round(footage * (1 + wasteFactor / 100))
      const firstPoint = activePoints[0]
      const lastPoint  = activePoints[activePoints.length - 1]
      const { data, error } = await supabase.from('cable_runs').insert({
        org_id:             orgId,
        drawing_sheet_id:   sheet.id,
        proposal_id:        sheet.proposal_id,
        cable_type:         cableType,
        points:             activePoints,
        footage,
        waste_factor:       wasteFactor,
        total_footage:      totalFootage,
        from_placement_id:  firstPoint?.placement_id || null,
        to_placement_id:    lastPoint?.placement_id  || null,
      }).select().single()
      if (!error && data) {
        setCableRuns(prev => [...prev, data])
        onPlacementChange?.()
      }
      setActivePoints([])
    }
    if (pathwayMode && activePathwayPoints.length >= 2) {
      let pwPixels = 0
      for (let i = 1; i < activePathwayPoints.length; i++) {
        const dx = (activePathwayPoints[i].x - activePathwayPoints[i-1].x) * imageSize.w
        const dy = (activePathwayPoints[i].y - activePathwayPoints[i-1].y) * imageSize.h
        pwPixels += Math.sqrt(dx*dx + dy*dy)
      }
      const pwFootage = scaleRatio ? Math.round(pwPixels * scaleRatio) : 0
      const { data, error } = await supabase.from('drawing_pathways').insert({
        org_id:           orgId,
        drawing_sheet_id: sheet.id,
        pathway_type:     pathwayType,
        points:           activePathwayPoints,
        cable_types:      [],
        total_footage:    pwFootage,
      }).select().single()
      if (!error && data) setPathways(prev => [...prev, data])
      setActivePathwayPoints([])
    }
  }, [cableMode, pathwayMode, activePoints, activePathwayPoints, imageSize, scaleRatio, wasteFactor, cableType, pathwayType, orgId, sheet, onPlacementChange])

  // ── Click to place ─────────────────────────────────────────────────────────
  const handleStageClick = useCallback(async (e) => {
    const onBg = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name())
    if (!onBg) return

    // Handle two-point calibration picking
    if (pickingPoint) {
      const pointer = stageRef.current.getPointerPosition()
      const x = (pointer.x - position.x) / scale
      const y = (pointer.y - position.y) / scale
      if (pickingPoint === 'A') {
        setPointA({ x, y })
        setPickingPoint('B')
      } else {
        setPointB({ x, y })
        setPickingPoint(null)
        setShowScaleModal(true)
      }
      return
    }

    // Room placement mode
    if (roomMode) {
      const onBgClick = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name())
      if (!onBgClick) return
      const pointer = stageRef.current.getPointerPosition()
      const x = Math.min(Math.max((pointer.x - position.x) / scale / canvasW, 0.01), 0.99)
      const y = Math.min(Math.max((pointer.y - position.y) / scale / canvasH, 0.01), 0.99)
      onRoomPlace?.({ x, y, drawing_sheet_id: sheet.id })
      return
    }

    // Cable drawing mode — only add points on background clicks
    if (cableMode) {
      const onBgClick = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name())
      if (!onBgClick) return
      const pointer = stageRef.current.getPointerPosition()
      const snapped = snapToPlacement(pointer.x, pointer.y)

      if (activePoints.length === 0 && snapped.placement) {
        setActivePoints([{ x: snapped.x, y: snapped.y, placement_id: snapped.placement.id }])
      } else {
        setActivePoints(prev => [...prev, { x: snapped.x, y: snapped.y, placement_id: snapped.placement?.id || null }])
      }
      return
    }

    // Pathway drawing mode
    if (pathwayMode) {
      const onBgClick = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name())
      if (!onBgClick) return
      const pointer = stageRef.current.getPointerPosition()
      const nx = Math.min(Math.max((pointer.x - position.x) / scale / canvasW, 0.01), 0.99)
      const ny = Math.min(Math.max((pointer.y - position.y) / scale / canvasH, 0.01), 0.99)
      setActivePathwayPoints(prev => [...prev, { x: nx, y: ny }])
      return
    }

    if (!selectedSymbol || placing) {
      setSelectedId(null)
      onPlacementSelect?.(null)
      return
    }
    setPlacing(true)
    const pointer = stageRef.current.getPointerPosition()
    const imgX = (pointer.x - position.x) / scale
    const imgY = (pointer.y - position.y) / scale
    const x = Math.min(Math.max(imgX / canvasW, 0.01), 0.99)
    const y = Math.min(Math.max(imgY / canvasH, 0.01), 0.99)
    try {
      const { data: catalogMatch } = await supabase
        .from('products').select('id')
        .eq('org_id', orgId).eq('part_number', selectedSymbol.part_number)
        .maybeSingle()
      const { data: placement, error } = await supabase
        .from('drawing_placements')
        .insert({
          org_id: orgId, drawing_sheet_id: sheet.id,
          global_product_id: selectedSymbol.id, product_id: catalogMatch?.id || null,
          x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000,
          rotation: 0, quantity: 1, symbol_size: 32, source: 'manual',
          device_address: await getNextLabel(selectedSymbol.category, allSheetIds || [sheet.id]),
        })
        .select('*, global_products(id, name, part_number, manufacturer, category, industry, specs, accessories)')
        .single()
      if (error) throw error
      setPlacements(prev => [...prev, placement])
      onPlacementChange?.()
      await supabase.from('drawing_sheets').update({ last_activity_at: new Date().toISOString() }).eq('id', sheet.id)
    } catch (err) {
      console.error('Failed to place device:', err)
    } finally {
      setTimeout(() => setPlacing(false), 150)
    }
  }, [selectedSymbol, placing, position, scale, canvasW, canvasH, sheet, orgId, onPlacementChange, onPlacementSelect])

  // ── Delete / Rotate / Drag ─────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    await supabase.from('drawing_placements').delete().eq('id', id)
    setPlacements(prev => prev.filter(p => p.id !== id))
    setSelectedId(null)
    onPlacementSelect?.(null)
    onPlacementChange?.()
  }, [onPlacementChange, onPlacementSelect])

  const handleRotate = useCallback(async (id) => {
    const p = placements.find(p => p.id === id)
    if (!p) return
    const newRot = (p.rotation + 90) % 360
    await supabase.from('drawing_placements').update({ rotation: newRot }).eq('id', id)
    setPlacements(prev => prev.map(p => p.id === id ? { ...p, rotation: newRot } : p))
  }, [placements])

  const handleDragEnd = useCallback(async (id, e) => {
    const node = e.target
    const x = Math.min(Math.max((node.x() - position.x) / scale / canvasW, 0.01), 0.99)
    const y = Math.min(Math.max((node.y() - position.y) / scale / canvasH, 0.01), 0.99)
    const rx = Math.round(x * 10000) / 10000
    const ry = Math.round(y * 10000) / 10000
    await supabase.from('drawing_placements').update({ x: rx, y: ry }).eq('id', id)
    setPlacements(prev => prev.map(p => p.id === id ? { ...p, x: rx, y: ry } : p))
    onPlacementChange?.()
  }, [position, scale, canvasW, canvasH, onPlacementChange])

  // ── Zoom controls ──────────────────────────────────────────────────────────
  const zoomIn  = () => setScale(s => Math.min(s * 1.2, 15))
  const zoomOut = () => setScale(s => Math.max(s * 0.8, 0.05))
  const zoomFit = () => bgImage ? fitToStage(imageSize.w, imageSize.h) : (setScale(1), setPosition({ x: 0, y: 0 }))

  const rotateBg = async () => {
    if (!rawBgImageRef.current) return
    if (placements.length > 0 && !window.confirm('Rotating the floor plan will shift any devices already placed. Continue?')) return
    const newRot = ((bgRotation + 90) % 360)
    setBgRotation(newRot)
    const rotated = applyBgRotation(rawBgImageRef.current, newRot)
    const w = rotated.width, h = rotated.height
    setBgImage(rotated)
    setImageSize({ w, h })
    fitToStage(w, h)
    await supabase.from('drawing_sheets').update({ bg_rotation: newRot }).eq('id', sheet.id)
  }

  // ── Save scale calibration ─────────────────────────────────────────────────
  const handleSetScale = async () => {
    let ratio = null

    if (scaleMethod === 'manual') {
      const feetPerInch = parseFloat(manualScale)
      if (!feetPerInch || feetPerInch <= 0) { alert('Please enter a valid scale.'); return }
      // Store as feet per pixel using image width
      // Assume standard 96 DPI for screen rendering
      ratio = feetPerInch / 96
    } else {
      if (!pointA || !pointB || !realDistance) { alert('Please pick two points and enter the real distance.'); return }
      const dx       = pointB.x - pointA.x
      const dy       = pointB.y - pointA.y
      const pixelDist = Math.sqrt(dx * dx + dy * dy)
      ratio = parseFloat(realDistance) / pixelDist
      if (!ratio || ratio <= 0) { alert('Invalid calibration.'); return }
    }

    setScaleRatio(ratio)
    setCalibratedScale(getScaleLabel(ratio))
    if (applyToAll) {
      // Update all sheets on this proposal
      const { data: sheets } = await supabase
        .from('drawing_sheets')
        .select('id')
        .eq('proposal_id', sheet.proposal_id)
      if (sheets) {
        await Promise.all(sheets.map(s =>
          supabase.from('drawing_sheets').update({ scale_ratio: ratio, scale_calibrated: true }).eq('id', s.id)
        ))
      }
    } else {
      await supabase.from('drawing_sheets')
        .update({ scale_ratio: ratio, scale_calibrated: true })
        .eq('id', sheet.id)
    }

    // Recalculate footage for all existing cable runs on this sheet
    const { data: existingRuns } = await supabase
      .from('cable_runs')
      .select('*')
      .eq('drawing_sheet_id', sheet.id)

    if (existingRuns?.length > 0 && imageSize.w && imageSize.h) {
      const { w: imgW, h: imgH } = imageSize
      for (const run of existingRuns) {
        if (!run.points || run.points.length < 2) continue
        let pixels = 0
        for (let i = 1; i < run.points.length; i++) {
          const dx = (run.points[i].x - run.points[i-1].x) * imgW
          const dy = (run.points[i].y - run.points[i-1].y) * imgH
          pixels += Math.sqrt(dx*dx + dy*dy)
        }
        const footage      = Math.round(pixels * ratio)
        const totalFootage = Math.round(footage * (1 + (run.waste_factor || 10) / 100))
        await supabase.from('cable_runs')
          .update({ footage, total_footage: totalFootage })
          .eq('id', run.id)
      }
      // Reload cable runs to update canvas
      const { data: updatedRuns } = await supabase
        .from('cable_runs').select('*').eq('drawing_sheet_id', sheet.id)
      if (updatedRuns) setCableRuns(updatedRuns)
    }

    setShowScaleModal(false)
    setManualScale('')
    setRealDistance('')
    setPointA(null)
    setPointB(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0 text-xs">
        <div className="text-[#8A9AB0]">
          {selectedSymbol
            ? <span className="flex items-center gap-1.5 text-[#C8622A] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#C8622A] animate-pulse inline-block"/>
                Placing: {selectedSymbol.name} — click to place
              </span>
            : cableMode
            ? <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block"/>
                Cable mode: {cableType} — click to add points · Double-click to finish
                {activePoints.length > 0 && <span className="ml-2 text-blue-300">({activePoints.length} points)</span>}
              </span>
            : pathwayMode
            ? (() => {
                const def = PATHWAY_DEFS.find(d => d.type === pathwayType)
                return (
                  <span className="flex items-center gap-1.5 font-medium" style={{ color: def?.color }}>
                    <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ backgroundColor: def?.color }}/>
                    Pathway: {def?.label} — click to add points · Double-click to finish
                    {activePathwayPoints.length > 0 && <span className="ml-2" style={{ color: def?.color + 'aa' }}>({activePathwayPoints.length} points)</span>}
                  </span>
                )
              })()
            : roomMode
            ? <span className="flex items-center gap-1.5 font-medium" style={{ color: '#34d399' }}>
                <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: '#34d399' }}/>
                Room mode — click on the floor plan to place a room marker
              </span>
            : editingCable
            ? <span className="flex items-center gap-1.5 text-green-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"/>
                Edit mode — click line to add point · drag dots to move · double-click dot to delete · Esc to finish
              </span>
            : <span>Select a symbol · Scroll to zoom · Drag to pan · Drag markers to move</span>
          }
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-blue-400 font-semibold text-xs">{selectedIds.size} selected</span>
              <button onClick={async () => {
                if (!window.confirm(`Delete ${selectedIds.size} devices?`)) return
                for (const id of selectedIds) {
                  await supabase.from('drawing_placements').delete().eq('id', id)
                }
                setPlacements(prev => prev.filter(p => !selectedIds.has(p.id)))
                setSelectedIds(new Set())
                onPlacementChange?.()
              }} className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-0.5 border border-red-400/30 rounded">
                Delete All
              </button>
              <button onClick={() => {
                setSelectedIds(new Set())
                setSelectedId(null)
              }} className="text-xs text-[#8A9AB0] hover:text-white transition-colors">
                Clear
              </button>
            </div>
          ) : (
            <span className="text-[#8A9AB0]">{placements.length} device{placements.length !== 1 ? 's' : ''} · {cableRuns.length} run{cableRuns.length !== 1 ? 's' : ''}</span>
          )}
          <button
            onClick={() => setShowFOV(s => !s)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${
              showFOV
                ? 'border-[#C8622A]/40 bg-[#C8622A]/10 text-[#C8622A]'
                : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'
            }`}
            title="Toggle FOV overlays"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            FOV
          </button>
          <button
            onClick={() => {
              const next = !showLabels
              if (onToggleLabels) onToggleLabels(next)
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${
              showLabels
                ? 'border-[#C8622A]/40 bg-[#C8622A]/10 text-[#C8622A]'
                : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'
            }`}
            title="Toggle device labels"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 8V5a2 2 0 012-2z"/>
            </svg>
            Labels
          </button>
          {/* Layers dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayerMenu(s => !s)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${
                showLayerMenu || !showCableRuns || !showPathways || industryFilter.length > 0
                  ? 'border-[#C8622A]/40 bg-[#C8622A]/10 text-[#C8622A]'
                  : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'
              }`}>
              Layers
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showLayerMenu ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}/>
              </svg>
            </button>
            {showLayerMenu && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-[#0F1C2E] border border-[#2a3d55] rounded-lg p-3 min-w-[140px] shadow-xl">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Overlays</p>
                {[
                  { id: 'cables',   label: 'Cables',   isLayer: true },
                  { id: 'pathways', label: 'Pathways', isLayer: true },
                ].map(f => {
                  const isChecked = f.id === 'cables' ? showCableRuns : showPathways
                  const toggle = () => f.id === 'cables' ? setShowCableRuns(s => !s) : setShowPathways(s => !s)
                  return (
                    <label key={f.id} onClick={toggle} className="flex items-center gap-2 cursor-pointer select-none group mb-1.5">
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'border-[#C8622A] bg-[#C8622A]' : 'border-[#4a5568] group-hover:border-[#8A9AB0]'}`}>
                        {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                      </span>
                      <span className={`text-xs ${isChecked ? 'text-white' : 'text-[#8A9AB0] group-hover:text-white'}`}>{f.label}</span>
                    </label>
                  )
                })}
                <div className="border-t border-[#2a3d55] my-2"/>
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Industries</p>
                {[
                  { id: 'security',    label: 'Security' },
                  { id: 'av',          label: 'AV' },
                  { id: 'fire_alarm',  label: 'Fire Alarm' },
                  { id: 'low_voltage', label: 'Low Voltage' },
                  { id: 'hvac',        label: 'HVAC' },
                  { id: 'das',         label: 'DAS' },
                ].map(f => {
                  const isChecked = industryFilter.includes(f.id)
                  const toggle = () => setIndustryFilter(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])
                  return (
                    <label key={f.id} onClick={toggle} className="flex items-center gap-2 cursor-pointer select-none group mb-1.5">
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'border-[#C8622A] bg-[#C8622A]' : 'border-[#4a5568] group-hover:border-[#8A9AB0]'}`}>
                        {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                      </span>
                      <span className={`text-xs ${isChecked ? 'text-white' : 'text-[#8A9AB0] group-hover:text-white'}`}>{f.label}</span>
                    </label>
                  )
                })}
                {industryFilter.length > 0 && (
                  <button onClick={() => setIndustryFilter([])} className="mt-1 text-xs text-[#8A9AB0] hover:text-white transition-colors">
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {(cableMode || pathwayMode) && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${
              cableMode ? 'border-blue-400 bg-blue-500/10 text-blue-300' : 'border-[#4a90d9] bg-[#4a90d9]/10 text-[#4a90d9]'
            }`}>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              {cableMode ? cableType : activeTool?.pathwayType}
            </div>
          )}

          <button
            onClick={() => setShowScaleModal(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${
              calibratedScale
                ? 'border-green-700 bg-green-900/20 text-green-400'
                : 'border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A]'
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
            </svg>
            {calibratedScale || 'Set Scale'}
          </button>
          {bgImage && !isBlank && (
            <button onClick={rotateBg} title="Rotate floor plan 90°"
              className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded-lg hover:bg-[#0F1C2E] transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          )}
          <div className="flex items-center gap-0.5 bg-[#0F1C2E] rounded-lg p-0.5">
            <button onClick={zoomOut} className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/></svg>
            </button>
            <span className="text-[#8A9AB0] w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            </button>
            <button onClick={zoomFit} className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded transition-colors" title="Fit">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      {/* Scale-not-set banner */}
      {!scaleRatio && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-900/30 border-b border-yellow-700/50 flex-shrink-0">
          <span className="text-yellow-400 text-xs">
            No scale set — FOV distances are estimates. Calibrate for accurate measurements.
          </span>
          <button
            onClick={() => setShowScaleModal(true)}
            className="text-xs font-medium text-yellow-300 hover:text-white underline underline-offset-2 ml-3 flex-shrink-0"
          >
            Set Scale
          </button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-hidden bg-[#060f1c] relative"
        style={{ cursor: pickingPoint ? 'crosshair' : selectedSymbol ? 'crosshair' : 'grab' }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
        onDrop={async (e) => {
          e.preventDefault()
          try {
            const symbol = JSON.parse(e.dataTransfer.getData('application/json'))
            if (!symbol) return
            const rect  = containerRef.current.getBoundingClientRect()
            const dropX = e.clientX - rect.left
            const dropY = e.clientY - rect.top
            const imgX  = (dropX - position.x) / scale
            const imgY  = (dropY - position.y) / scale
            const x     = Math.min(Math.max(imgX / canvasW, 0.01), 0.99)
            const y     = Math.min(Math.max(imgY / canvasH, 0.01), 0.99)
            const { data: catalogMatch } = await supabase
              .from('products').select('id')
              .eq('org_id', orgId).eq('part_number', symbol.part_number)
              .maybeSingle()
            const { data: placement, error } = await supabase
              .from('drawing_placements')
              .insert({
                org_id: orgId, drawing_sheet_id: sheet.id,
                global_product_id: symbol.id, product_id: catalogMatch?.id || null,
                x: Math.round(x * 10000) / 10000,
                y: Math.round(y * 10000) / 10000,
                rotation: 0, quantity: 1, symbol_size: 32, source: 'manual',
                device_address: await getNextLabel(symbol.category, allSheetIds || [sheet.id]),
              })
              .select('*, global_products(id, name, part_number, manufacturer, category, industry, specs, accessories)')
              .single()
            if (!error && placement) {
              setPlacements(prev => [...prev, placement])
              setSelectedId(placement.id)
              onPlacementSelect?.(placement)
              onPlacementChange?.()
              await supabase.from('drawing_sheets')
                .update({ last_activity_at: new Date().toISOString() })
                .eq('id', sheet.id)
            }
          } catch (err) {
            console.error('Drop failed:', err)
          }
        }}>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060f1c] z-10">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <span className="text-[#8A9AB0] text-sm">{loadStep || 'Loading floor plan…'}</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <p className="text-red-400 text-sm mb-2">{error}</p>
              <button onClick={loadFloorPlan} className="text-xs text-[#C8622A] underline">Try again</button>
            </div>
          </div>
        )}

        {!loading && !error && stageSize.w > 0 && (
          <Stage ref={stageRef} width={stageSize.w} height={stageSize.h} style={{ background: '#ffffff' }}
            onWheel={handleWheel} onMouseDown={(e) => { if (e.evt.button === 2) return; handleMouseDown(e) }} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            onClick={(e) => {
              if (e.evt.button === 2) return // ignore right-click
              setContextMenu(null)
              handleStageClick(e)
            }}
            onTap={(e) => { handleStageClick(e); setContextMenu(null) }}
            onContextMenu={(e) => {
              e.evt.preventDefault()
              const pointer = stageRef.current.getPointerPosition()
              const rect    = containerRef.current.getBoundingClientRect()
              const targetName = e.target.name?.() || ''
              if (['bg-image', 'bg-blank', ''].includes(targetName) || e.target === stageRef.current) {
                setContextMenu({ x: pointer.x, y: pointer.y, clientX: rect.left + pointer.x, clientY: rect.top + pointer.y, placement: null })
              }
            }}
            onDblClick={handleFinishDraw}
            onDblTap={handleFinishDraw}>

            <Layer>
              {bgImage && !isBlank ? (
                <KonvaImage name="bg-image" image={bgImage}
                  x={position.x} y={position.y} width={canvasW * scale} height={canvasH * scale} listening={true}/>
              ) : (
                <Rect name="bg-blank" x={position.x} y={position.y}
                  width={canvasW * scale} height={canvasH * scale}
                  fill="#1a1a2e" stroke="#2a3d55" strokeWidth={1} listening={true}/>
              )}
            </Layer>

           {/* FOV overlay layer — interactive handles on selected camera */}
            {showFOV && (
              <Layer>
                {placements.map(placement => {
                  const product = placement.global_products
                  if (!product) return null
                  const category = product.category
                  const fovCategories = ['Dome Camera', 'Bullet Camera', 'PTZ Camera', 'Motion Sensor', 'Multi-Lens Camera', 'Fisheye Camera']
                  if (!fovCategories.includes(category)) return null

                  const isSelected = selectedId === placement.id
                  const drag       = isSelected ? draggingFOV : null
                  const col        = placement.marker_color || '#C8622A'

                  const rotation    = drag?.rotation    ?? placement.rotation    ?? 0
                  const fovAngle    = drag?.fov_angle   ?? placement.fov_angle   ?? product.specs?.fov_angle ?? (category === 'PTZ Camera' ? 360 : 90)
                  const rangeInFeet = drag?.fov_range   ?? placement.fov_range   ?? product.specs?.ir_range  ?? 30

                  // When no scale is set, use 4px per foot so dragging visibly changes length
                  const PX_PER_FT = 4
                  const range = scaleRatio
                    ? Math.min((rangeInFeet / scaleRatio) * scale, 3000)
                    : Math.min(rangeInFeet * PX_PER_FT * Math.min(scale, 1), 3000)
                  const px = position.x + placement.x * canvasW * scale
                  const py = position.y + placement.y * canvasH * scale

                  // Helper: screen px distance → feet
                  const pxToFt = (dist) => scaleRatio
                    ? Math.max(5, Math.round((dist / scale) * scaleRatio))
                    : Math.max(5, Math.round(dist / (PX_PER_FT * Math.min(scale, 1))))

                  // Commit drag values to DB and update local state
                  const commitFOV = async (updates) => {
                    const { error } = await supabase.from('drawing_placements').update(updates).eq('id', placement.id)
                    if (error) { console.error('commitFOV save failed:', error); return }
                    setPlacements(prev => prev.map(p => p.id === placement.id ? { ...p, ...updates } : p))
                    onPlacementSelect?.({ ...placement, ...updates })
                    setDraggingFOV(null)
                  }

                  // PTZ / full circle
                  if (category === 'PTZ Camera' || fovAngle >= 355) {
                    return (
                      <Group key={`fov_${placement.id}`}>
                        <Circle x={px} y={py} radius={range}
                          fill={`${col}14`} stroke={`${col}55`} strokeWidth={isSelected ? 1.5 : 1}
                          listening={false} />
                        {/* Range handle — drag south edge to resize */}
                        {isSelected && (
                          <Circle x={px} y={py + range} radius={7}
                            fill={col} stroke="white" strokeWidth={2}
                            draggable listening
                            onMouseEnter={() => { const s = stageRef.current; if (s) s.container().style.cursor = 'ns-resize' }}
                            onMouseLeave={() => { const s = stageRef.current; if (s) s.container().style.cursor = selectedSymbol ? 'crosshair' : 'grab' }}
                            onDragMove={(e) => {
                              e.cancelBubble = true
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              setDraggingFOV({ rotation, fov_angle: fovAngle, fov_range: pxToFt(Math.sqrt(dx*dx + dy*dy)) })
                            }}
                            onDragEnd={(e) => {
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              commitFOV({ fov_range: pxToFt(Math.sqrt(dx*dx + dy*dy)) })
                            }}
                          />
                        )}
                      </Group>
                    )
                  }

                  // Directional cone
                  const rotRad   = rotation * Math.PI / 180
                  const halfRad  = (fovAngle / 2) * Math.PI / 180
                  const sa = rotRad - halfRad
                  const ea = rotRad + halfRad
                  const steps = Math.max(16, Math.floor(fovAngle / 5))
                  const linePoints = [px, py]
                  for (let i = 0; i <= steps; i++) {
                    const a = sa + (ea - sa) * (i / steps)
                    linePoints.push(px + Math.cos(a) * range, py + Math.sin(a) * range)
                  }
                  linePoints.push(px, py)

                  // Handle positions
                  const dhx = px + Math.cos(rotRad) * range        // center-front (direction + range)
                  const dhy = py + Math.sin(rotRad) * range
                  const lhx = px + Math.cos(sa) * range            // left edge (angle)
                  const lhy = py + Math.sin(sa) * range
                  const rhx = px + Math.cos(ea) * range            // right edge (angle)
                  const rhy = py + Math.sin(ea) * range

                  return (
                    <Group key={`fov_${placement.id}`}>
                      {/* Cone fill */}
                      <Line points={linePoints}
                        fill={isSelected ? `${col}22` : `${col}1a`}
                        stroke={isSelected ? col : `${col}55`}
                        strokeWidth={isSelected ? 1.5 : 1}
                        closed={true} listening={false} />

                      {/* Interactive handles — only for selected camera */}
                      {isSelected && !cableMode && (
                        <>
                          {/* ── Direction + range handle (center-front of cone) ── */}
                          <Circle x={dhx} y={dhy} radius={7}
                            fill={col} stroke="white" strokeWidth={2.5}
                            draggable listening
                            onMouseEnter={() => { const s = stageRef.current; if (s) s.container().style.cursor = 'move' }}
                            onMouseLeave={() => { const s = stageRef.current; if (s) s.container().style.cursor = selectedSymbol ? 'crosshair' : 'grab' }}
                            onDragMove={(e) => {
                              e.cancelBubble = true
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              const newRot = ((Math.round(Math.atan2(dy, dx) * 180 / Math.PI) % 360) + 360) % 360
                              const newRange = pxToFt(Math.sqrt(dx*dx + dy*dy))
                              setDraggingFOV(prev => ({ fov_angle: fovAngle, ...(prev||{}), rotation: newRot, fov_range: newRange }))
                            }}
                            onDragEnd={(e) => {
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              const rot = ((Math.round(Math.atan2(dy, dx) * 180 / Math.PI) % 360) + 360) % 360
                              commitFOV({ rotation: rot, fov_range: pxToFt(Math.sqrt(dx*dx + dy*dy)) })
                            }}
                          />

                          {/* ── Left edge handle (FOV angle) ── */}
                          <Circle x={lhx} y={lhy} radius={5}
                            fill="white" stroke={col} strokeWidth={2}
                            draggable listening
                            onMouseEnter={() => { const s = stageRef.current; if (s) s.container().style.cursor = 'ew-resize' }}
                            onMouseLeave={() => { const s = stageRef.current; if (s) s.container().style.cursor = selectedSymbol ? 'crosshair' : 'grab' }}
                            onDragMove={(e) => {
                              e.cancelBubble = true
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              let diff = (Math.atan2(dy, dx) * 180 / Math.PI) - rotation
                              while (diff > 180) diff -= 360
                              while (diff < -180) diff += 360
                              const newAngle = Math.max(10, Math.min(350, Math.round(Math.abs(diff) * 2)))
                              setDraggingFOV(prev => ({ rotation, fov_range: rangeInFeet, ...(prev||{}), fov_angle: newAngle }))
                            }}
                            onDragEnd={(e) => {
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              let diff = (Math.atan2(dy, dx) * 180 / Math.PI) - rotation
                              while (diff > 180) diff -= 360
                              while (diff < -180) diff += 360
                              commitFOV({ fov_angle: Math.max(10, Math.min(350, Math.round(Math.abs(diff) * 2))) })
                            }}
                          />

                          {/* ── Right edge handle (FOV angle, mirrors left) ── */}
                          <Circle x={rhx} y={rhy} radius={5}
                            fill="white" stroke={col} strokeWidth={2}
                            draggable listening
                            onMouseEnter={() => { const s = stageRef.current; if (s) s.container().style.cursor = 'ew-resize' }}
                            onMouseLeave={() => { const s = stageRef.current; if (s) s.container().style.cursor = selectedSymbol ? 'crosshair' : 'grab' }}
                            onDragMove={(e) => {
                              e.cancelBubble = true
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              let diff = (Math.atan2(dy, dx) * 180 / Math.PI) - rotation
                              while (diff > 180) diff -= 360
                              while (diff < -180) diff += 360
                              const newAngle = Math.max(10, Math.min(350, Math.round(Math.abs(diff) * 2)))
                              setDraggingFOV(prev => ({ rotation, fov_range: rangeInFeet, ...(prev||{}), fov_angle: newAngle }))
                            }}
                            onDragEnd={(e) => {
                              const dx = e.target.x() - px, dy = e.target.y() - py
                              let diff = (Math.atan2(dy, dx) * 180 / Math.PI) - rotation
                              while (diff > 180) diff -= 360
                              while (diff < -180) diff += 360
                              commitFOV({ fov_angle: Math.max(10, Math.min(350, Math.round(Math.abs(diff) * 2))) })
                            }}
                          />
                        </>
                      )}
                    </Group>
                  )
                })}
              </Layer>
            )}


            {/* Pathway layer */}
            {showPathways && (
              <Layer>
                {pathways.map(pw => {
                  if (!pw.points || pw.points.length < 2) return null
                  const def       = PATHWAY_DEFS.find(d => d.type === pw.pathway_type) || PATHWAY_DEFS[0]
                  const pts       = pw.points.flatMap(p => [
                    position.x + p.x * canvasW * scale,
                    position.y + p.y * canvasH * scale,
                  ])
                  const isSelected = selectedPathwayId === pw.id
                  const isEditing  = editingPathwayId  === pw.id
                  const lineColor  = isEditing ? '#34d399' : isSelected ? '#ffffff' : def.color

                  // Midpoint label
                  const midIdx = Math.floor(pw.points.length / 2)
                  const lp1    = pw.points[Math.max(0, midIdx - 1)]
                  const lp2    = pw.points[midIdx] || lp1
                  const mx     = position.x + ((lp1.x + lp2.x) / 2) * canvasW * scale
                  const my     = position.y + ((lp1.y + lp2.y) / 2) * canvasH * scale
                  const ldx    = (lp2.x - lp1.x) * canvasW * scale
                  const ldy    = (lp2.y - lp1.y) * canvasH * scale
                  let angle    = Math.atan2(ldy, ldx) * 180 / Math.PI
                  if (angle > 90)  angle -= 180
                  if (angle < -90) angle += 180

                  // Normalize cable_types — supports both old string[] and new {type,qty}[] format
                  const cables      = (pw.cable_types || []).map(c => typeof c === 'string' ? { type: c, qty: 1 } : c)
                  const cableLabel  = cables.length ? ` · ${cables.map(c => c.qty > 1 ? `${c.qty}× ${c.type}` : c.type).join(', ')}` : ''
                  const footageText = pw.total_footage > 0 ? ` · ${pw.total_footage}ft` : ''
                  const labelText   = pw.label || def.label
                  const fullLabel   = `${labelText}${cableLabel}${footageText}`
                  const labelW      = Math.max(fullLabel.length * 5, 50)

                  return (
                    <Group key={pw.id}>
                      {/* Hit area */}
                      <Line points={pts} stroke="transparent" strokeWidth={20}
                        lineCap="round" lineJoin="round" listening={true}
                        onClick={(e) => {
                          e.cancelBubble = true
                          const newId = selectedPathwayId === pw.id ? null : pw.id
                          setSelectedPathwayId(newId)
                          setEditingPathwayId(null)
                          // Clear other selections so keyboard Delete only targets pathway
                          setSelectedCable(null)
                          setSelectedId(null)
                          setSelectedIds(new Set())
                          onPathwaySelect?.(newId ? pw : null)
                        }}
                        onDblClick={(e) => {
                          e.cancelBubble = true
                          setEditingPathwayId(pw.id)
                          setSelectedPathwayId(pw.id)
                          setSelectedCable(null)
                          setSelectedId(null)
                          setSelectedIds(new Set())
                          onPathwaySelect?.(pw)
                        }}
                      />

                      {/* Visible line — click to insert waypoint when editing */}
                      <Line points={pts}
                        stroke={lineColor}
                        strokeWidth={isEditing ? 8 : isSelected ? 5 : 3}
                        lineCap="round" lineJoin="round"
                        dash={isEditing ? [] : isSelected ? [] : def.dash}
                        listening={isEditing}
                        onClick={(e) => {
                          if (!isEditing) return
                          e.cancelBubble = true
                          const pointer = stageRef.current.getPointerPosition()
                          const nx = Math.round(((pointer.x - position.x) / scale / canvasW) * 10000) / 10000
                          const ny = Math.round(((pointer.y - position.y) / scale / canvasH) * 10000) / 10000

                          let minDist = Infinity, insertAt = pw.points.length - 1
                          for (let i = 0; i < pw.points.length - 1; i++) {
                            const ax = position.x + pw.points[i].x * canvasW * scale
                            const ay = position.y + pw.points[i].y * canvasH * scale
                            const bx = position.x + pw.points[i+1].x * canvasW * scale
                            const by = position.y + pw.points[i+1].y * canvasH * scale
                            const abx = bx - ax, aby = by - ay
                            const t = Math.max(0, Math.min(1, ((pointer.x - ax) * abx + (pointer.y - ay) * aby) / (abx*abx + aby*aby)))
                            const d = Math.sqrt((pointer.x - (ax + t*abx))**2 + (pointer.y - (ay + t*aby))**2)
                            if (d < minDist) { minDist = d; insertAt = i + 1 }
                          }
                          const newPoints = [...pw.points]
                          newPoints.splice(insertAt, 0, { x: nx, y: ny })
                          supabase.from('drawing_pathways').update({ points: newPoints }).eq('id', pw.id)
                          setPathways(prev => prev.map(p => p.id === pw.id ? { ...p, points: newPoints } : p))
                        }}
                      />

                      {/* Label */}
                      {showLabels !== false && (
                        <Group x={mx} y={my} rotation={angle} listening={false}>
                          <Rect x={-labelW/2} y={-9} width={labelW} height={13}
                            fill="#0F1C2E" opacity={0.8} cornerRadius={2}/>
                          <Text text={fullLabel} fontSize={7} fill={lineColor}
                            width={labelW} x={-labelW/2} y={-6} align="center"/>
                        </Group>
                      )}

                      {/* Waypoints when editing — draggable */}
                      {isEditing && pw.points.map((p, i) => {
                        const wx = position.x + p.x * canvasW * scale
                        const wy = position.y + p.y * canvasH * scale
                        const isHovWpt = hoveredPathwayWpt?.pathwayId === pw.id && hoveredPathwayWpt?.pointIndex === i
                        return (
                          <Circle key={i} x={wx} y={wy}
                            radius={isHovWpt ? 8 : 6}
                            fill={isHovWpt ? '#ef4444' : '#0F1C2E'}
                            stroke={isHovWpt ? '#ef4444' : '#34d399'}
                            strokeWidth={2}
                            draggable listening={true}
                            onMouseEnter={() => setHoveredPathwayWpt({ pathwayId: pw.id, pointIndex: i })}
                            onMouseLeave={() => setHoveredPathwayWpt(null)}
                            onDragMove={(e) => {
                              const nx = Math.min(Math.max((e.target.x() - position.x) / scale / canvasW, 0.01), 0.99)
                              const ny = Math.min(Math.max((e.target.y() - position.y) / scale / canvasH, 0.01), 0.99)
                              setPathways(prev => prev.map(r => {
                                if (r.id !== pw.id) return r
                                const newPts = [...r.points]
                                newPts[i] = { x: nx, y: ny }
                                return { ...r, points: newPts }
                              }))
                            }}
                            onDragEnd={async (e) => {
                              const nx = Math.round(Math.min(Math.max((e.target.x() - position.x) / scale / canvasW, 0.01), 0.99) * 10000) / 10000
                              const ny = Math.round(Math.min(Math.max((e.target.y() - position.y) / scale / canvasH, 0.01), 0.99) * 10000) / 10000
                              const updatedPoints = pw.points.map((pt, idx) => idx === i ? { x: nx, y: ny } : pt)
                              // Recalculate footage
                              let pixels = 0
                              for (let j = 1; j < updatedPoints.length; j++) {
                                const ddx = (updatedPoints[j].x - updatedPoints[j-1].x) * imageSize.w
                                const ddy = (updatedPoints[j].y - updatedPoints[j-1].y) * imageSize.h
                                pixels += Math.sqrt(ddx*ddx + ddy*ddy)
                              }
                              const total_footage = scaleRatio ? Math.round(pixels * scaleRatio) : 0
                              await supabase.from('drawing_pathways').update({ points: updatedPoints, total_footage }).eq('id', pw.id)
                              setPathways(prev => prev.map(r => r.id === pw.id ? { ...r, points: updatedPoints, total_footage } : r))
                              onPathwaySelect?.({ ...pw, points: updatedPoints, total_footage })
                            }}
                            onClick={(e) => { e.cancelBubble = true }}
                            onDblClick={(e) => {
                              e.cancelBubble = true
                              if (pw.points.length > 2) {
                                const updatedPoints = pw.points.filter((_, idx) => idx !== i)
                                supabase.from('drawing_pathways').update({ points: updatedPoints }).eq('id', pw.id)
                                setPathways(prev => prev.map(r => r.id === pw.id ? { ...r, points: updatedPoints } : r))
                              }
                            }}
                          />
                        )
                      })}

                      {/* Waypoints when selected but not editing — static dots */}
                      {isSelected && !isEditing && pw.points.map((p, i) => (
                        <Circle key={i}
                          x={position.x + p.x * canvasW * scale}
                          y={position.y + p.y * canvasH * scale}
                          radius={4} fill={def.color} stroke="#fff" strokeWidth={1.5}
                          listening={false}
                        />
                      ))}
                    </Group>
                  )
                })}

                {/* Active pathway being drawn */}
                {pathwayMode && activePathwayPoints.length > 0 && (() => {
                  const def = PATHWAY_DEFS.find(d => d.type === pathwayType) || PATHWAY_DEFS[0]
                  const pts = activePathwayPoints.flatMap(p => [
                    position.x + p.x * canvasW * scale,
                    position.y + p.y * canvasH * scale,
                  ])
                  return (
                    <Line points={pts}
                      stroke={def.color} strokeWidth={3}
                      lineCap="round" lineJoin="round"
                      dash={[6, 3]} opacity={0.7} listening={false}
                    />
                  )
                })()}

                {/* Active pathway waypoint dots */}
                {pathwayMode && activePathwayPoints.map((p, i) => {
                  const def = PATHWAY_DEFS.find(d => d.type === pathwayType) || PATHWAY_DEFS[0]
                  return (
                    <Circle key={i}
                      x={position.x + p.x * canvasW * scale}
                      y={position.y + p.y * canvasH * scale}
                      radius={4} fill={def.color} opacity={0.9} listening={false}
                    />
                  )
                })}
              </Layer>
            )}

            {/* Cable runs layer */}
            {showCableRuns && (
              <Layer>
                {cableRuns.map(run => {
                  if (!run.points || run.points.length < 2) return null
                  const pts = run.points.flatMap(p => [
                    position.x + p.x * canvasW * scale,
                    position.y + p.y * canvasH * scale,
                  ])
                  const isSelected  = selectedCable === run.id
                  const isEditing   = editingCable  === run.id

                  return (
                    <Group key={run.id}>
                      {/* Hit area */}
                      <Line points={pts} stroke="transparent" strokeWidth={20}
                        lineCap="round" lineJoin="round" listening={true}
                        onClick={(e) => {
                          e.cancelBubble = true
                          const newId = selectedCable === run.id ? null : run.id
                          setSelectedCable(newId)
                          setEditingCable(null)
                          onCableSelect?.(newId ? run : null)
                        }}
                        onDblClick={(e) => {
                          e.cancelBubble = true
                          setEditingCable(run.id)
                          setSelectedCable(run.id)
                          onCableSelect?.(run)
                        }}
                      />

                      {/* Visible line — click to add waypoint when editing */}
                      <Line points={pts}
                        stroke={isEditing ? '#34d399' : isSelected ? '#60a5fa' : (run.color || '#3b82f6')}
                        strokeWidth={isEditing ? 10 : isSelected ? (run.stroke_width || 2) + 1 : (run.stroke_width || 2)}
                        lineCap="round" lineJoin="round"
                        listening={isEditing} dash={isEditing ? [] : [8, 4]}
                        onClick={(e) => {
                          if (!isEditing) return
                          e.cancelBubble = true
                          const stage   = stageRef.current
                          const pointer = stage.getPointerPosition()
                          const nx = Math.round(((pointer.x - position.x) / scale / canvasW) * 10000) / 10000
                          const ny = Math.round(((pointer.y - position.y) / scale / canvasH) * 10000) / 10000

                          // Find nearest segment to insert between
                          let minDist  = Infinity
                          let insertAt = run.points.length - 1
                          for (let i = 0; i < run.points.length - 1; i++) {
                            const ax = position.x + run.points[i].x * canvasW * scale
                            const ay = position.y + run.points[i].y * canvasH * scale
                            const bx = position.x + run.points[i+1].x * canvasW * scale
                            const by = position.y + run.points[i+1].y * canvasH * scale
                            // Distance from point to segment
                            const abx = bx - ax, aby = by - ay
                            const t   = Math.max(0, Math.min(1, ((pointer.x - ax) * abx + (pointer.y - ay) * aby) / (abx*abx + aby*aby)))
                            const dx  = pointer.x - (ax + t * abx)
                            const dy  = pointer.y - (ay + t * aby)
                            const d   = Math.sqrt(dx*dx + dy*dy)
                            if (d < minDist) { minDist = d; insertAt = i + 1 }
                          }

                          const newPoints = [...run.points]
                          newPoints.splice(insertAt, 0, { x: nx, y: ny, placement_id: null })
                          supabase.from('cable_runs').update({ points: newPoints }).eq('id', run.id)
                          setCableRuns(prev => prev.map(r =>
                            r.id === run.id ? { ...r, points: newPoints } : r
                          ))
                        }}
                      />

                      {/* Waypoint dots — shown when editing */}
                      {isEditing && run.points.map((p, i) => {
                        const wx = position.x + p.x * canvasW * scale
                        const wy = position.y + p.y * canvasH * scale
                        return (
                          <Circle key={i} x={wx} y={wy}
                            radius={hoveredWaypoint?.cableId === run.id && hoveredWaypoint?.pointIndex === i ? 8 : 6}
                            fill={hoveredWaypoint?.cableId === run.id && hoveredWaypoint?.pointIndex === i ? '#ef4444' : dragPoint?.pointIndex === i ? '#34d399' : '#0F1C2E'}
                            stroke={hoveredWaypoint?.cableId === run.id && hoveredWaypoint?.pointIndex === i ? '#ef4444' : '#34d399'}
                            strokeWidth={2}
                            draggable listening={true}
                            onMouseEnter={() => setHoveredWaypoint({ cableId: run.id, pointIndex: i })}
                            onMouseLeave={() => setHoveredWaypoint(null)}
                            onDragMove={(e) => {
                              const nx = Math.min(Math.max((e.target.x() - position.x) / scale / canvasW, 0.01), 0.99)
                              const ny = Math.min(Math.max((e.target.y() - position.y) / scale / canvasH, 0.01), 0.99)
                              setCableRuns(prev => prev.map(r => {
                                if (r.id !== run.id) return r
                                const newPts = [...r.points]
                                newPts[i] = { ...newPts[i], x: nx, y: ny }
                                return { ...r, points: newPts }
                              }))
                            }}
                            onDragEnd={async (e) => {
                              const nx = Math.round(Math.min(Math.max((e.target.x() - position.x) / scale / canvasW, 0.01), 0.99) * 10000) / 10000
                              const ny = Math.round(Math.min(Math.max((e.target.y() - position.y) / scale / canvasH, 0.01), 0.99) * 10000) / 10000
                              const updatedPoints = run.points.map((pt, idx) =>
                                idx === i ? { ...pt, x: nx, y: ny } : pt
                              )
                              // Recalculate footage
                              let pixels = 0
                              for (let j = 1; j < updatedPoints.length; j++) {
                                const dx = (updatedPoints[j].x - updatedPoints[j-1].x) * imageSize.w
                                const dy = (updatedPoints[j].y - updatedPoints[j-1].y) * imageSize.h
                                pixels += Math.sqrt(dx*dx + dy*dy)
                              }
                              const footage      = scaleRatio ? Math.round(pixels * scaleRatio) : 0
                              const totalFootage = Math.round(footage * (1 + (run.waste_factor || 10) / 100))
                              await supabase.from('cable_runs').update({
                                points: updatedPoints, footage, total_footage: totalFootage
                              }).eq('id', run.id)
                              setCableRuns(prev => prev.map(r =>
                                r.id === run.id ? { ...r, points: updatedPoints, footage, total_footage: totalFootage } : r
                              ))
                              onCableSelect?.({ ...run, points: updatedPoints, footage, total_footage: totalFootage })
                            }}
                            onClick={(e) => {
                              e.cancelBubble = true
                              // Single click just selects the point — do nothing
                            }}
                            onDblClick={(e) => {
                              e.cancelBubble = true
                              // Double-click deletes waypoint if more than 2 remain
                              if (run.points.length > 2) {
                                const updatedPoints = run.points.filter((_, idx) => idx !== i)
                                supabase.from('cable_runs').update({ points: updatedPoints }).eq('id', run.id)
                                setCableRuns(prev => prev.map(r =>
                                  r.id === run.id ? { ...r, points: updatedPoints } : r
                                ))
                              }
                            }}
                          />
                        )
                      })}

                      {/* Label along cable — rotated to follow cable direction */}
                      {showLabels !== false && (run.total_footage > 0 || run.label || run.cable_type) && (() => {
                        // Find true midpoint along the cable path
                        let totalLen = 0
                        const segs = []
                        for (let si = 1; si < run.points.length; si++) {
                          const sdx = (run.points[si].x - run.points[si-1].x) * canvasW * scale
                          const sdy = (run.points[si].y - run.points[si-1].y) * canvasH * scale
                          const len = Math.sqrt(sdx*sdx + sdy*sdy)
                          segs.push({ len, i: si })
                          totalLen += len
                        }
                        let halfLen = totalLen / 2
                        let midIdx  = 1
                        for (const seg of segs) {
                          if (halfLen <= seg.len) { midIdx = seg.i; break }
                          halfLen -= seg.len
                        }
                        const p1   = run.points[Math.max(0, midIdx - 1)]
                        const p2   = run.points[midIdx]
                        const t    = halfLen / Math.max(1, segs[midIdx-1]?.len || 1)
                        const mx   = position.x + (p1.x + (p2.x - p1.x) * t) * canvasW * scale
                        const my   = position.y + (p1.y + (p2.y - p1.y) * t) * canvasH * scale
                        const dx   = (p2.x - p1.x) * canvasW * scale
                        const dy   = (p2.y - p1.y) * canvasH * scale
                        let angle  = Math.atan2(dy, dx) * 180 / Math.PI

                        // Keep text readable — flip if upside down
                        if (angle > 90)  angle -= 180
                        if (angle < -90) angle += 180

                        const footageText = run.total_footage > 0 ? ` · ${run.total_footage}ft` : ' · (set scale)'
                        const labelText   = run.label
                          ? `${run.label} · ${run.cable_type}${footageText}`
                          : `${run.cable_type}${footageText}`
                        const w = Math.max(labelText.length * 5, 60)

                        return (
                          <Group x={mx} y={my} rotation={angle} listening={false}>
                            <Rect x={-w/2} y={-9} width={w} height={13}
                              fill="#0F1C2E" opacity={0.8} cornerRadius={2}/>
                            <Text text={labelText}
                              fontSize={7} fill={isEditing ? '#34d399' : (run.color || '#60a5fa')}
                              width={w} x={-w/2} y={-6} align="center"/>
                          </Group>
                        )
                      })()}
                    </Group>
                  )
                })}

                {/* Active cable being drawn */}
                {cableMode && activePoints.length > 0 && (() => {
                  const pts = activePoints.flatMap(p => [
                    position.x + p.x * canvasW * scale,
                    position.y + p.y * canvasH * scale,
                  ])
                  return (
                    <Line
                      points={pts}
                      stroke="#60a5fa"
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      dash={[6, 3]}
                      listening={false}
                    />
                  )
                })()}

                {/* Waypoint dots on active cable */}
                {cableMode && activePoints.map((p, i) => (
                  <Circle
                    key={i}
                    x={position.x + p.x * canvasW * scale}
                    y={position.y + p.y * canvasH * scale}
                    radius={4}
                    fill="#3b82f6"
                    stroke="#60a5fa"
                    strokeWidth={1}
                    listening={false}
                  />
                ))}
              </Layer>
            )}

            {/* Selection box layer */}
            {selectionBox && (
              <Layer listening={false}>
                <Rect
                  x={selectionBox.x} y={selectionBox.y}
                  width={selectionBox.w} height={selectionBox.h}
                  fill="rgba(59,130,246,0.1)"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dash={[4, 4]}
                />
              </Layer>
            )}

            <Layer>
              {iconsReady && placements.map(placement => {
                const product = placement.global_products
                if (!product) return null
                const isSelected = selectedId === placement.id || selectedIds.has(placement.id)
                const isHovered  = hoveredId  === placement.id
                const markerSize = Math.max((placement.symbol_size || 32) * Math.min(scale, 1.5), 14)
                const px = position.x + placement.x * canvasW * scale
                const py = position.y + placement.y * canvasH * scale
                return (
                  <PlacementMarker key={placement.id} placement={placement} product={product}
                    icon={getIcon(product.category)} x={px} y={py} size={markerSize}
                    isSelected={isSelected} isHovered={isHovered}
                    cableMode={cableMode} pathwayMode={pathwayMode}
                    showLabels={showLabels}
                    opacity={industryFilter.length === 0 || industryFilter.includes(placement.global_products?.industry) ? 1 : 0.15}
                    markerColor={placement.marker_color || '#C8622A'}
                    onContextMenu={(e) => {
                      const pointer = stageRef.current.getPointerPosition()
                      const rect    = containerRef.current.getBoundingClientRect()
                      setContextMenu({ x: pointer.x, y: pointer.y, clientX: rect.left + pointer.x, clientY: rect.top + pointer.y, placement })
                      setSelectedId(placement.id)
                      onPlacementSelect?.(placement)
                    }}
                    onCableSnap={() => {
                      setActivePoints(prev => [...prev, {
                        x: placement.x,
                        y: placement.y,
                        placement_id: placement.id
                      }])
                    }}
                    onPathwaySnap={() => {
                      setActivePathwayPoints(prev => [...prev, {
                        x: placement.x,
                        y: placement.y,
                      }])
                    }}
                    onSelect={() => {
                      if (window.event?.shiftKey) {
                        // Shift+click — add/remove from multiselect
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(placement.id)) next.delete(placement.id)
                          else next.add(placement.id)
                          return next
                        })
                        setSelectedId(null)
                        onPlacementSelect?.(null)
                      } else {
                        // Normal click — single select
                        setSelectedIds(new Set())
                        const newId = selectedId === placement.id ? null : placement.id
                        setSelectedId(newId)
                        onPlacementSelect?.(newId ? placement : null)
                      }
                    }}
                    onHoverStart={() => setHoveredId(placement.id)}
                    onHoverEnd={() => setHoveredId(null)}
                    onDelete={() => handleDelete(placement.id)}
                    onRotate={() => handleRotate(placement.id)}
                    onDragEnd={(e) => handleDragEnd(placement.id, e)}
                  />
                )
              })}

              {/* ── Room markers ── */}
              {(rooms || []).filter(r => r.drawing_sheet_id === sheet.id && r.x != null).map(room => {
                const ROOM_COLORS = { mdf: '#C8622A', idf: '#3b82f6', headend: '#10b981', electrical: '#f59e0b', server: '#a855f7', closet: '#06b6d4', av: '#8b5cf6', other: '#64748b' }
                const ROOM_ABBREV = { mdf: 'MDF', idf: 'IDF', headend: 'HE', electrical: 'ELEC', server: 'SRV', closet: 'WC', av: 'AV', other: '...' }
                const col   = ROOM_COLORS[room.room_type] || '#64748b'
                const abbr  = ROOM_ABBREV[room.room_type] || '?'
                const px    = position.x + room.x * canvasW * scale
                const py    = position.y + room.y * canvasH * scale
                const W = 130, H = 30, BADGE = 34

                return (
                  <Group
                    key={room.id}
                    x={px} y={py}
                    draggable={!roomMode}
                    onDragEnd={e => {
                      const nx = Math.min(Math.max((e.target.x() - position.x) / scale / canvasW, 0.01), 0.99)
                      const ny = Math.min(Math.max((e.target.y() - position.y) / scale / canvasH, 0.01), 0.99)
                      onRoomMove?.(room.id, nx, ny)
                    }}
                    onClick={e => { e.cancelBubble = true; onRoomClick?.(room) }}
                    onTap={e => { e.cancelBubble = true; onRoomClick?.(room) }}
                  >
                    {/* Shadow */}
                    <Rect x={2} y={2} width={W} height={H} fill="rgba(0,0,0,0.4)" cornerRadius={5} listening={false} />
                    {/* Main body */}
                    <Rect x={0} y={0} width={W} height={H} fill="#0d1927" stroke={col} strokeWidth={1.5} cornerRadius={5} />
                    {/* Type badge */}
                    <Rect x={0} y={0} width={BADGE} height={H} fill={col + '33'} cornerRadius={[5, 0, 0, 5]} listening={false} />
                    <Text x={0} y={0} width={BADGE} height={H} text={abbr} fontSize={9} fontStyle="bold" fill={col} align="center" verticalAlign="middle" listening={false} />
                    {/* Name */}
                    <Text x={BADGE + 5} y={0} width={W - BADGE - 8} height={H} text={room.name} fontSize={11} fontStyle="bold" fill="#ffffff" verticalAlign="middle" listening={false} />
                    {/* Rack count dot */}
                    <Circle x={W - 8} y={H / 2} radius={3} fill={col} listening={false} />
                  </Group>
                )
              })}
            </Layer>
          </Stage>
        )}

        {!loading && !error && placements.length === 0 && !selectedSymbol && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <p className="text-[#2a3d55] text-xs">Select a symbol from the left panel to start placing devices</p>
          </div>
        )}

    

      {/* Context menu — fixed position outside Konva canvas */}
      {contextMenu && <ContextMenu
        contextMenu={contextMenu}
        copiedPlacement={copiedPlacement}
        onCopy={() => { setCopiedPlacement(contextMenu.placement); setContextMenu(null) }}
        onPaste={async () => {
          const p     = copiedPlacement
          const dropX = (contextMenu.x - position.x) / scale / canvasW
          const dropY = (contextMenu.y - position.y) / scale / canvasH
          const x     = Math.min(Math.max(dropX, 0.01), 0.99)
          const y     = Math.min(Math.max(dropY, 0.01), 0.99)
          const { data, error } = await supabase
            .from('drawing_placements')
            .insert({
              org_id: p.org_id, drawing_sheet_id: sheet.id,
              global_product_id: p.global_product_id, product_id: p.product_id,
              x, y, rotation: p.rotation, quantity: p.quantity,
              symbol_size: p.symbol_size, marker_color: p.marker_color,
              part_number_override: p.part_number_override,
              manufacturer_override: p.manufacturer_override,
              description_override: p.description_override,
              device_address: await getNextLabel(p.global_products?.category, allSheetIds || [sheet.id]),
              notes: p.notes, fov_angle: p.fov_angle, fov_range: p.fov_range,
              source: 'manual',
            })
            .select('*, global_products(id, name, part_number, manufacturer, category, industry, specs, accessories)')
            .single()
          if (!error && data) {
            // Copy components from source placement
            const { data: sourceComps } = await supabase
              .from('placement_components')
              .select('*')
              .eq('placement_id', p.id)
            if (sourceComps?.length > 0) {
              await supabase.from('placement_components').insert(
                sourceComps.map(c => ({
                  org_id:         c.org_id,
                  placement_id:   data.id,
                  component_type: c.component_type,
                  name:           c.name,
                  part_number:    c.part_number,
                  manufacturer:   c.manufacturer,
                  quantity:       c.quantity,
                  notes:          c.notes,
                }))
              )
            }
            setPlacements(prev => [...prev, data])
            setSelectedId(data.id)
            onPlacementSelect?.(data)
            onPlacementChange?.()
            setCopiedPlacement(p)
          }
          setContextMenu(null)
        }}
        onRotate={() => { setContextMenu(null); handleRotate(contextMenu.placement?.id) }}
        onDelete={() => { handleDelete(contextMenu.placement?.id); setContextMenu(null) }}
        onClose={() => setContextMenu(null)}
      />}

      {sheet.status === 'approved' && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-green-900/20 border-t border-green-800/30 text-xs text-green-400 flex-shrink-0">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
          Approved — edit and re-approve to update the BOM.
        </div>
      )}

      {/* ── Scale calibration modal ── */}
      {showScaleModal && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C8622A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
              </svg>
              Scale Calibration
            </h3>

            {/* Method selector */}
            <div className="flex gap-2 mb-4">
              {['manual', 'twopoint'].map(m => (
                <button key={m} onClick={() => setScaleMethod(m)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    scaleMethod === m
                      ? 'border-[#C8622A] bg-[#C8622A]/10 text-[#C8622A]'
                      : 'border-[#2a3d55] text-[#8A9AB0] hover:text-white'
                  }`}>
                  {m === 'manual' ? 'Manual Ratio' : 'Two Point'}
                </button>
              ))}
            </div>

            {/* Manual method */}
            {scaleMethod === 'manual' && (
              <div className="space-y-3">
                <p className="text-[#8A9AB0] text-xs">
                  Find the scale printed on your floor plan (e.g. 1" = 20') and enter it below.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[#8A9AB0] text-xs whitespace-nowrap">1 inch =</span>
                  <input type="number" placeholder="20" value={manualScale}
                    onChange={e => setManualScale(e.target.value)}
                    className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                  <span className="text-[#8A9AB0] text-xs">feet</span>
                </div>
              </div>
            )}

            {/* Two point method */}
            {scaleMethod === 'twopoint' && (
              <div className="space-y-3">
                <p className="text-[#8A9AB0] text-xs">
                  Click two points on the drawing whose real-world distance you know (e.g. a room that's 20ft wide).
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => { setShowScaleModal(false); setPickingPoint('A') }}
                    className={`w-full py-2 text-xs rounded-lg border transition-colors ${
                      pointA
                        ? 'border-green-700 bg-green-900/20 text-green-400'
                        : 'border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A]'
                    }`}>
                    {pointA ? '✓ Point A set' : 'Click to set Point A'}
                  </button>
                  <button
                    onClick={() => { if (pointA) { setShowScaleModal(false); setPickingPoint('B') } }}
                    disabled={!pointA}
                    className={`w-full py-2 text-xs rounded-lg border transition-colors ${
                      pointB
                        ? 'border-green-700 bg-green-900/20 text-green-400'
                        : pointA
                        ? 'border-[#2a3d55] text-[#8A9AB0] hover:border-[#C8622A] hover:text-[#C8622A]'
                        : 'border-[#2a3d55] text-[#4a5a6a] cursor-not-allowed'
                    }`}>
                    {pointB ? '✓ Point B set' : 'Click to set Point B'}
                  </button>
                </div>
                {pointA && pointB && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#8A9AB0] text-xs whitespace-nowrap">Real distance:</span>
                    <input type="number" placeholder="20" value={realDistance}
                      onChange={e => setRealDistance(e.target.value)}
                      className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                    <span className="text-[#8A9AB0] text-xs">feet</span>
                  </div>
                )}
              </div>
            )}

            {/* Apply to all */}
            <label className="flex items-center gap-2 mt-4 cursor-pointer">
              <input type="checkbox" checked={applyToAll}
                onChange={e => setApplyToAll(e.target.checked)}
                className="accent-[#C8622A]" />
              <span className="text-[#8A9AB0] text-xs">Apply to all sheets in this project</span>
            </label>

            {/* Buttons */}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowScaleModal(false); setPointA(null); setPointB(null) }}
                className="flex-1 py-2 text-sm font-medium rounded-lg border border-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleSetScale}
                className="flex-1 py-2 text-sm font-semibold rounded-lg bg-[#C8622A] text-white hover:bg-[#b5571f] transition-colors">
                Set Scale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two point picking hint */}
      {pickingPoint && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#C8622A] text-white text-xs px-4 py-2 rounded-lg shadow-lg z-40 pointer-events-none">
          Click Point {pickingPoint} on the drawing
        </div>
      )}
    </div>
  </div>
  )
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────
function ContextMenu({ contextMenu, copiedPlacement, onCopy, onPaste, onRotate, onDelete, onClose }) {
  const hasPl = !!contextMenu.placement

  const Item = ({ label, color, onClick }) => (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a3d55] transition-colors ${color || 'text-[#c8d8e8]'}`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] bg-[#1a2d45] border border-[#2a3d55] rounded-lg shadow-2xl py-1 min-w-[140px]"
        style={{ left: contextMenu.clientX, top: contextMenu.clientY }}
      >
        {hasPl && <Item label="Copy"   onClick={onCopy} />}
        {hasPl && <Item label="Rotate" onClick={onRotate} />}
        {copiedPlacement && <Item label="Paste here" onClick={onPaste} />}
        {hasPl && (
          <>
            <div className="border-t border-[#2a3d55] my-1" />
            <Item label="Delete" color="text-red-400" onClick={onDelete} />
          </>
        )}
        {!hasPl && !copiedPlacement && (
          <span className="px-3 py-1.5 text-xs text-[#4a5a6a] block">No actions</span>
        )}
      </div>
    </>
  )
}

// ─── PlacementMarker ──────────────────────────────────────────────────────────
function PlacementMarker({ placement, product, icon, x, y, size, isSelected, isHovered,
  cableMode, pathwayMode, showLabels, opacity, markerColor, onSelect, onCableSnap, onPathwaySnap, onContextMenu, onHoverStart, onHoverEnd, onDelete, onRotate, onDragEnd }) {
  const markerScale = isSelected ? 1.25 : isHovered ? 1.1 : 1
  const totalSize   = size * markerScale
  const iconSize    = totalSize * 0.65
  const btnSize     = Math.max(18, size * 0.55)
  const tooltipW    = Math.max(product.name.length * 6.5, 100)
  const drawingMode = cableMode || pathwayMode
  const snapHandler = cableMode ? onCableSnap : pathwayMode ? onPathwaySnap : onSelect

  return (
    <Group x={x} y={y}
      opacity={opacity ?? 1}
      draggable={!drawingMode}
      onClick={snapHandler}
      onTap={snapHandler}
      onContextMenu={(e) => { e.evt.preventDefault(); e.cancelBubble = true; onContextMenu?.(e) }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onDragEnd={drawingMode ? undefined : onDragEnd}>

      {/* Shadow */}
      <Circle x={2} y={3} radius={totalSize / 2} fill="rgba(0,0,0,0.35)" listening={false}/>

      {/* Circle */}
      <Circle radius={totalSize / 2}
        fill={cableMode && isHovered ? '#3b82f6' : pathwayMode && isHovered ? '#4a90d9' : markerColor}
        stroke={cableMode && isHovered ? '#60a5fa' : pathwayMode && isHovered ? '#7ab3e8' : isSelected ? '#ff8c42' : markerColor}
        strokeWidth={isSelected ? 3 : (cableMode || pathwayMode) && isHovered ? 3 : 1.5}
        shadowColor={isSelected ? '#C8622A' : 'transparent'} shadowBlur={isSelected ? 10 : 0} shadowOpacity={0.7}/>

      {/* Icon */}
      {icon && <KonvaImage image={icon} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} listening={false}/>}

      {/* Device address label below marker */}
      {placement.device_address && !isSelected && showLabels !== false && (
        <Text
          text={placement.device_address}
          fontSize={Math.max(9, totalSize * 0.28)}
          fill="white"
          fontStyle="bold"
          x={-totalSize}
          y={totalSize / 2 + 3}
          width={totalSize * 2}
          align="center"
          listening={false}
          shadowColor="black"
          shadowBlur={3}
          shadowOpacity={0.8}
        />
      )}

      {/* Hover tooltip */}
      {isHovered && !isSelected && (
        <Group x={totalSize / 2 + 6} y={-totalSize / 2} listening={false}>
          <Rect width={tooltipW} height={placement.runs_to_label ? 58 : 48} fill="#0F1C2E" stroke="#2a3d55" strokeWidth={1} cornerRadius={6}/>
          <Text text={placement.device_address ? `${placement.device_address} · ${product.name}` : product.name} fontSize={10} fontStyle="bold" fill="white" x={6} y={6} width={tooltipW - 12}/>
          <Text text={placement.part_number_override || product.part_number} fontSize={9} fill="#8A9AB0" fontFamily="monospace" x={6} y={20}/>
          <Text text={placement.manufacturer_override || product.manufacturer} fontSize={9} fill="#8A9AB0" x={6} y={32}/>
          {placement.runs_to_label && (
            <Text text={`→ ${placement.runs_to_label}`} fontSize={8} fill="#60a5fa" x={6} y={42}/>
          )}
        </Group>
      )}

      {/* Selected state */}
      {isSelected && (
        <Group>
          {/* Info above */}
          <Group x={-tooltipW / 2} y={-(totalSize / 2) - 58} listening={false}>
            <Rect width={tooltipW} height={50} fill="#C8622A" cornerRadius={6}/>
            <Text text={product.name} fontSize={10} fontStyle="bold" fill="white" x={6} y={6} width={tooltipW - 12}/>
            <Text text={product.part_number} fontSize={9} fill="rgba(255,255,255,0.85)" fontFamily="monospace" x={6} y={20}/>
            <Text text={`${product.manufacturer} · ${product.category}`} fontSize={8} fill="rgba(255,255,255,0.7)" x={6} y={33}/>
          </Group>

          {/* Buttons below */}
          <Group y={totalSize / 2 + 6}>
            <Group x={-(btnSize + 3)}
              onClick={(e) => { e.cancelBubble = true; onRotate() }}
              onTap={(e) => { e.cancelBubble = true; onRotate() }}>
              <Rect width={btnSize} height={btnSize} fill="#1a2d45" stroke="#2a3d55" strokeWidth={1} cornerRadius={4}/>
              <Text text="↻" fontSize={btnSize * 0.6} fill="#8A9AB0" width={btnSize} height={btnSize} align="center" verticalAlign="middle" listening={false}/>
            </Group>
            <Group x={3}
              onClick={(e) => { e.cancelBubble = true; onDelete() }}
              onTap={(e) => { e.cancelBubble = true; onDelete() }}>
              <Rect width={btnSize} height={btnSize} fill="#1a2d45" stroke="#7f1d1d" strokeWidth={1} cornerRadius={4}/>
              <Text text="✕" fontSize={btnSize * 0.45} fill="#f87171" width={btnSize} height={btnSize} align="center" verticalAlign="middle" listening={false}/>
            </Group>
          </Group>
        </Group>
      )}
    </Group>
  )
}
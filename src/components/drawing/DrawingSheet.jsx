import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Circle, Group, Text, Rect } from 'react-konva'
import { supabase } from '../../supabase'
import { useCategoryIcons } from './useCategoryIcons'

export default function DrawingSheet({ sheet, orgId, selectedSymbol, onPlacementChange, onPlacementSelect }) {
  const containerRef = useRef(null)
  const stageRef     = useRef(null)
  const isPanning    = useRef(false)
  const lastPointer  = useRef(null)
  const lastDist     = useRef(0)

  const [bgImage,    setBgImage]    = useState(null)
  const [imageSize,  setImageSize]  = useState({ w: 1200, h: 900 })
  const [stageSize,  setStageSize]  = useState({ w: 800, h: 600 })
  const [scale,      setScale]      = useState(1)
  const [position,   setPosition]   = useState({ x: 0, y: 0 })
  const [placements, setPlacements] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId,  setHoveredId]  = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [placing,    setPlacing]    = useState(false)

  const { getIcon, ready: iconsReady } = useCategoryIcons('white', 40)

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

  const loadFloorPlan = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.storage.from('floor-plans').createSignedUrl(sheet.storage_path, 3600)
      if (error) throw error
      if (sheet.storage_path.toLowerCase().endsWith('.pdf')) {
        await renderPDF(data.signedUrl)
      } else {
        await loadImageFromUrl(data.signedUrl)
      }
    } catch (err) {
      setError('Failed to load floor plan.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const renderPDF = async (url) => {
    const pdfjsLib  = await import('pdfjs-dist')
    const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.default
    const pdf      = await pdfjsLib.getDocument(url).promise
    const page     = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const scaled   = page.getViewport({ scale: Math.min(2, 1800 / viewport.width) })
    const canvas   = document.createElement('canvas')
    canvas.width   = scaled.width
    canvas.height  = scaled.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
    await loadImageFromUrl(canvas.toDataURL('image/png'))
  }

  const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setBgImage(img)
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight })
      fitToStage(img.naturalWidth, img.naturalHeight)
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
      .select('*, global_products(id, name, part_number, manufacturer, category)')
      .eq('drawing_sheet_id', sheet.id)
      .order('created_at')
    if (data) setPlacements(data)
  }, [sheet.id])

  useEffect(() => { loadPlacements() }, [loadPlacements])

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`placements_${sheet.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'drawing_placements',
        filter: `drawing_sheet_id=eq.${sheet.id}`,
      }, () => loadPlacements())
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
    if (e.evt.button === 1) {
      isPanning.current = true
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      e.evt.preventDefault()
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isPanning.current || !lastPointer.current) return
    const dx = e.evt.clientX - lastPointer.current.x
    const dy = e.evt.clientY - lastPointer.current.y
    lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => { isPanning.current = false }, [])

  // ── Pinch zoom ─────────────────────────────────────────────────────────────
  const handleTouchMove = useCallback((e) => {
    const t = e.evt.touches
    if (t.length !== 2) return
    const dist = Math.sqrt((t[0].clientX - t[1].clientX) ** 2 + (t[0].clientY - t[1].clientY) ** 2)
    if (lastDist.current) setScale(s => Math.min(Math.max(s * (dist / lastDist.current), 0.05), 15))
    lastDist.current = dist
  }, [])
  const handleTouchEnd = useCallback(() => { lastDist.current = 0 }, [])

  // ── Canvas dimensions ──────────────────────────────────────────────────────
  const isBlank = sheet.storage_path === 'blank'
  const canvasW = isBlank ? Math.max(stageSize.w, 1200) : imageSize.w
  const canvasH = isBlank ? Math.max(stageSize.h, 900) : imageSize.h

  // ── Click to place ─────────────────────────────────────────────────────────
  const handleStageClick = useCallback(async (e) => {
    const onBg = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name())
    if (!onBg) return
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
        })
        .select('*, global_products(id, name, part_number, manufacturer, category)')
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
            : <span>Select a symbol · Scroll to zoom · Middle-click to pan · Drag markers to move</span>
          }
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[#8A9AB0]">{placements.length} device{placements.length !== 1 ? 's' : ''}</span>
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
      <div ref={containerRef} className="flex-1 overflow-hidden bg-[#060f1c] relative"
        style={{ cursor: selectedSymbol ? 'crosshair' : 'default' }}>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060f1c] z-10">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <span className="text-[#8A9AB0] text-sm">Loading floor plan...</span>
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
          <Stage ref={stageRef} width={stageSize.w} height={stageSize.h}
            onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            onClick={handleStageClick} onTap={handleStageClick}>

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

            <Layer>
              {iconsReady && placements.map(placement => {
                const product = placement.global_products
                if (!product) return null
                const isSelected = selectedId === placement.id
                const isHovered  = hoveredId  === placement.id
                const markerSize = Math.max((placement.symbol_size || 32) * Math.min(scale, 1.5), 14)
                const px = position.x + placement.x * canvasW * scale
                const py = position.y + placement.y * canvasH * scale
                return (
                  <PlacementMarker key={placement.id} placement={placement} product={product}
                    icon={getIcon(product.category)} x={px} y={py} size={markerSize}
                    isSelected={isSelected} isHovered={isHovered}
                    onSelect={() => {
                      const newId = selectedId === placement.id ? null : placement.id
                      setSelectedId(newId)
                      onPlacementSelect?.(newId ? placement : null)
                    }}
                    onHoverStart={() => setHoveredId(placement.id)}
                    onHoverEnd={() => setHoveredId(null)}
                    onDelete={() => handleDelete(placement.id)}
                    onRotate={() => handleRotate(placement.id)}
                    onDragEnd={(e) => handleDragEnd(placement.id, e)}
                  />
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
      </div>

      {sheet.status === 'approved' && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-green-900/20 border-t border-green-800/30 text-xs text-green-400 flex-shrink-0">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
          Approved — edit and re-approve to update the BOM.
        </div>
      )}
    </div>
  )
}

// ─── PlacementMarker ──────────────────────────────────────────────────────────
function PlacementMarker({ placement, product, icon, x, y, size, isSelected, isHovered,
  onSelect, onHoverStart, onHoverEnd, onDelete, onRotate, onDragEnd }) {
  const markerScale = isSelected ? 1.25 : isHovered ? 1.1 : 1
  const totalSize   = size * markerScale
  const iconSize    = totalSize * 0.65
  const btnSize     = Math.max(18, size * 0.55)
  const tooltipW    = Math.max(product.name.length * 6.5, 100)

  return (
    <Group x={x} y={y} draggable onClick={onSelect} onTap={onSelect}
      onMouseEnter={onHoverStart} onMouseLeave={onHoverEnd} onDragEnd={onDragEnd}>

      {/* Shadow */}
      <Circle x={2} y={3} radius={totalSize / 2} fill="rgba(0,0,0,0.35)" listening={false}/>

      {/* Circle */}
      <Circle radius={totalSize / 2} fill="#C8622A"
        stroke={isSelected ? '#ff8c42' : '#b5571f'} strokeWidth={isSelected ? 3 : 1.5}
        shadowColor={isSelected ? '#C8622A' : 'transparent'} shadowBlur={isSelected ? 10 : 0} shadowOpacity={0.7}/>

      {/* Icon */}
      {icon && <KonvaImage image={icon} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} listening={false}/>}

      {/* Hover tooltip */}
      {isHovered && !isSelected && (
        <Group x={totalSize / 2 + 6} y={-totalSize / 2} listening={false}>
          <Rect width={tooltipW} height={48} fill="#0F1C2E" stroke="#2a3d55" strokeWidth={1} cornerRadius={6}/>
          <Text text={product.name} fontSize={10} fontStyle="bold" fill="white" x={6} y={6} width={tooltipW - 12}/>
          <Text text={product.part_number} fontSize={9} fill="#8A9AB0" fontFamily="monospace" x={6} y={20}/>
          <Text text={product.manufacturer} fontSize={9} fill="#8A9AB0" x={6} y={32}/>
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
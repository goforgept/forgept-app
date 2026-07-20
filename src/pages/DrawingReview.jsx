import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { Stage, Layer, Image as KonvaImage, Circle, Group, Text, Rect, Line } from 'react-konva'
import { useCategoryIcons } from '../components/drawing/useCategoryIcons'
import PDFWorkerConstructor from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

const FOV_CATEGORIES = ['Dome Camera', 'Bullet Camera', 'PTZ Camera', 'Motion Sensor', 'Multi-Lens Camera', 'Fisheye Camera']

// ── SheetCanvas ────────────────────────────────────────────────────────────────
function SheetCanvas({ sheet, placements, comments, addingNote, onCanvasClick, onNoteClick, selectedNoteId, shareToken }) {
  const containerRef = useRef(null)
  const stageRef     = useRef(null)
  const isPanning    = useRef(false)
  const lastPointer  = useRef(null)
  const lastDist     = useRef(0)
  const lastTouchPos = useRef(null)

  const [bgImage,   setBgImage]   = useState(null)
  const [imageSize, setImageSize] = useState({ w: 1200, h: 900 })
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 })
  const [scale,     setScale]     = useState(1)
  const [position,  setPosition]  = useState({ x: 0, y: 0 })
  const [loading,   setLoading]   = useState(true)

  const { getIcon, ready: iconsReady } = useCategoryIcons('white', 40)

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (containerRef.current)
        setStageSize({ w: containerRef.current.offsetWidth, h: containerRef.current.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Load floor plan
  useEffect(() => {
    if (!sheet?.storage_path || ['blank', 'pending'].includes(sheet.storage_path)) {
      setLoading(false); return
    }
    loadFloorPlan()
  }, [sheet?.storage_path])

  const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { setBgImage(img); setImageSize({ w: img.naturalWidth, h: img.naturalHeight }); fitToStage(img.naturalWidth, img.naturalHeight); resolve() }
    img.onerror = reject
    img.src = url
  })

  const loadFloorPlan = async () => {
    setLoading(true)
    try {
      const { getR2Url, getR2UrlPublic, BUCKETS } = await import('../r2')
      const url = shareToken
        ? await getR2UrlPublic(sheet.storage_path, shareToken, 3600, BUCKETS.FLOOR_PLANS)
        : await getR2Url(sheet.storage_path, 3600)
      if (!url) { setLoading(false); return }
      if (sheet.storage_path.toLowerCase().endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerPort) {
          pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorkerConstructor()
        }
        const buf    = await (await fetch(url)).arrayBuffer()
        const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise
        const page   = await pdfDoc.getPage(sheet.page_number || 1)
        const vp     = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width; canvas.height = vp.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        await loadImageFromUrl(canvas.toDataURL('image/png'))
      } else {
        await loadImageFromUrl(url)
      }
    } catch (err) { console.error('Floor plan load failed:', err) }
    finally { setLoading(false) }
  }

  const fitToStage = useCallback((imgW, imgH) => {
    if (!containerRef.current) return
    const sw = containerRef.current.offsetWidth
    const sh = containerRef.current.offsetHeight
    const fit = Math.min(sw / imgW, sh / imgH) * 0.92
    setScale(fit)
    setPosition({ x: (sw - imgW * fit) / 2, y: (sh - imgH * fit) / 2 })
  }, [])

  const canvasW = imageSize.w
  const canvasH = imageSize.h

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault()
    const stage   = stageRef.current
    const pointer = stage.getPointerPosition()
    const factor  = e.evt.deltaY < 0 ? 1.12 : 0.9
    const ns      = Math.min(Math.max(scale * factor, 0.05), 15)
    const mx      = (pointer.x - position.x) / scale
    const my      = (pointer.y - position.y) / scale
    setScale(ns)
    setPosition({ x: pointer.x - mx * ns, y: pointer.y - my * ns })
  }, [scale, position])

  const handleMouseDown = useCallback((e) => {
    if (e.evt.button === 1 || e.evt.button === 0) {
      isPanning.current = true
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isPanning.current || !lastPointer.current) return
    const dx = e.evt.clientX - lastPointer.current.x
    const dy = e.evt.clientY - lastPointer.current.y
    lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    setPosition(p => ({ x: p.x + dx, y: p.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => { isPanning.current = false }, [])

  const handleTouchStart = useCallback((e) => {
    const t = e.evt.touches
    if (t.length === 2) lastDist.current = Math.sqrt((t[0].clientX - t[1].clientX) ** 2 + (t[0].clientY - t[1].clientY) ** 2)
    else if (t.length === 1) lastTouchPos.current = { x: t[0].clientX, y: t[0].clientY }
  }, [])

  const handleTouchMove = useCallback((e) => {
    const t = e.evt.touches
    if (t.length === 2) {
      const dist = Math.sqrt((t[0].clientX - t[1].clientX) ** 2 + (t[0].clientY - t[1].clientY) ** 2)
      if (lastDist.current) setScale(s => Math.min(Math.max(s * dist / lastDist.current, 0.05), 15))
      lastDist.current = dist
    } else if (t.length === 1 && lastTouchPos.current) {
      const dx = t[0].clientX - lastTouchPos.current.x
      const dy = t[0].clientY - lastTouchPos.current.y
      setPosition(p => ({ x: p.x + dx, y: p.y + dy }))
      lastTouchPos.current = { x: t[0].clientX, y: t[0].clientY }
    }
  }, [])

  const handleTouchEnd = useCallback(() => { lastDist.current = 0; lastTouchPos.current = null }, [])

  const handleClick = useCallback((e) => {
    if (e.evt.button === 2) return
    const onBg = e.target === stageRef.current || ['bg-image', 'bg-blank'].includes(e.target.name?.() ?? '')
    if (!onBg || !addingNote) return
    const pointer = stageRef.current.getPointerPosition()
    const x = Math.min(Math.max((pointer.x - position.x) / scale / canvasW, 0.01), 0.99)
    const y = Math.min(Math.max((pointer.y - position.y) / scale / canvasH, 0.01), 0.99)
    onCanvasClick?.({ x, y })
  }, [addingNote, position, scale, canvasW, canvasH, onCanvasClick])

  const zoomIn  = () => setScale(s => Math.min(s * 1.2, 15))
  const zoomOut = () => setScale(s => Math.max(s * 0.8, 0.05))
  const zoomFit = () => bgImage ? fitToStage(imageSize.w, imageSize.h) : (setScale(1), setPosition({ x: 0, y: 0 }))

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0 text-xs">
        <span>
          {addingNote
            ? <span className="flex items-center gap-1.5 text-yellow-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />
                Click anywhere on the floor plan to pin a note
              </span>
            : <span className="text-[#8A9AB0]">Scroll to zoom · Drag to pan · {placements.length} device{placements.length !== 1 ? 's' : ''}</span>
          }
        </span>
        <div className="flex items-center gap-0.5 bg-[#0F1C2E] rounded-lg p-0.5">
          <button onClick={zoomOut} className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/></svg>
          </button>
          <span className="text-[#8A9AB0] w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          </button>
          <button onClick={zoomFit} title="Fit" className="w-7 h-7 flex items-center justify-center text-[#8A9AB0] hover:text-white rounded transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-[#060f1c] relative"
        style={{ cursor: addingNote ? 'crosshair' : 'grab' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        )}
        {!loading && stageSize.w > 0 && (
          <Stage ref={stageRef} width={stageSize.w} height={stageSize.h}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            onClick={handleClick} onTap={handleClick}>

            {/* Floor plan */}
            <Layer>
              {bgImage
                ? <KonvaImage name="bg-image" image={bgImage} x={position.x} y={position.y} width={canvasW * scale} height={canvasH * scale} listening={true} />
                : <Rect name="bg-blank" x={position.x} y={position.y} width={canvasW * scale} height={canvasH * scale} fill="#1a1a2e" stroke="#2a3d55" strokeWidth={1} listening={true} />
              }
            </Layer>

            {/* FOV overlays */}
            <Layer listening={false}>
              {placements.map(p => {
                const product = p.global_products
                if (!product || !FOV_CATEGORIES.includes(product.category)) return null
                const fovAngle    = p.fov_angle || product.specs?.fov_angle || (product.category === 'PTZ Camera' ? 360 : 90)
                const rangeInFeet = p.fov_range || product.specs?.ir_range || 30
                const range = sheet.scale_ratio
                  ? Math.min((rangeInFeet / sheet.scale_ratio) * scale, 3000)
                  : 150 * Math.min(scale, 1)
                const px  = position.x + p.x * canvasW * scale
                const py  = position.y + p.y * canvasH * scale
                const col = p.marker_color || '#C8622A'
                if (product.category === 'PTZ Camera' || fovAngle >= 355) {
                  return <Circle key={`fov_${p.id}`} x={px} y={py} radius={range} fill={col} opacity={0.08} stroke={col} strokeWidth={1} listening={false} />
                }
                const sa = ((p.rotation || 0) - fovAngle / 2) * Math.PI / 180
                const ea = ((p.rotation || 0) + fovAngle / 2) * Math.PI / 180
                const steps = Math.max(16, Math.floor(fovAngle / 5))
                const pts = [px, py]
                for (let i = 0; i <= steps; i++) {
                  const a = sa + (ea - sa) * (i / steps)
                  pts.push(px + Math.cos(a) * range, py + Math.sin(a) * range)
                }
                pts.push(px, py)
                return <Line key={`fov_${p.id}`} points={pts} fill={col} opacity={0.12} stroke={col} strokeWidth={1} closed={true} listening={false} />
              })}
            </Layer>

            {/* Device markers */}
            <Layer listening={false}>
              {iconsReady && placements.map(p => {
                const product = p.global_products
                if (!product) return null
                const markerSize = Math.max((p.symbol_size || 32) * Math.min(scale, 1.5), 14)
                const px   = position.x + p.x * canvasW * scale
                const py   = position.y + p.y * canvasH * scale
                const col  = p.marker_color || '#C8622A'
                const icon = getIcon(product.category)
                const iconSize = markerSize * 0.65
                const condColor = p.site_condition === 'existing' ? '#22c55e' : p.site_condition === 'demo' ? '#a855f7' : '#ef4444'
                const condLetter = p.site_condition === 'existing' ? 'E' : p.site_condition === 'demo' ? 'D' : 'R'
                return (
                  <Group key={p.id}>
                    <Circle x={px} y={py} radius={markerSize / 2} fill={col} />
                    {icon && <KonvaImage image={icon} x={px - iconSize / 2} y={py - iconSize / 2} width={iconSize} height={iconSize} />}
                    {p.site_condition && p.site_condition !== 'new' && (
                      <Group x={px + markerSize * 0.28} y={py - markerSize * 0.52}>
                        <Circle radius={markerSize * 0.24} fill={condColor} stroke="white" strokeWidth={1.5} />
                        <Text text={condLetter}
                          fontSize={Math.max(7, markerSize * 0.22)} fontStyle="bold" fill="white"
                          width={markerSize * 0.48} x={-markerSize * 0.24}
                          align="center" verticalAlign="middle" y={-markerSize * 0.19} />
                      </Group>
                    )}
                    {p.device_address && (
                      <Text text={p.device_address}
                        x={px - 40} y={py + markerSize / 2 + 2}
                        width={80} align="center"
                        fontSize={Math.max(markerSize * 0.4, 9)}
                        fill={col} fontStyle="bold" />
                    )}
                  </Group>
                )
              })}
            </Layer>

            {/* Note pins */}
            <Layer>
              {comments.map((c, idx) => {
                const px = position.x + c.x * canvasW * scale
                const py = position.y + c.y * canvasH * scale
                const r  = Math.max(10 * Math.min(scale, 1.5), 8)
                const isSelected = selectedNoteId === c.id
                return (
                  <Group key={c.id}
                    onClick={(e) => { e.cancelBubble = true; onNoteClick?.(c) }}
                    onTap={(e)   => { e.cancelBubble = true; onNoteClick?.(c) }}>
                    <Circle x={px} y={py - r} radius={r}
                      fill={isSelected ? '#f59e0b' : '#fbbf24'}
                      stroke="white" strokeWidth={2} />
                    <Text text={String(idx + 1)}
                      x={px - r} y={py - r * 2 + r * 0.15}
                      width={r * 2} align="center"
                      fontSize={Math.max(r * 0.9, 7)}
                      fill="white" fontStyle="bold" listening={false} />
                  </Group>
                )
              })}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  )
}

// ── DrawingReview ──────────────────────────────────────────────────────────────
export default function DrawingReview() {
  const { token } = useParams()

  const [pkg,           setPkg]           = useState(null)
  const [sheets,        setSheets]        = useState([])
  const [placements,    setPlacements]    = useState([])
  const [orgProfile,    setOrgProfile]    = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [approved,      setApproved]      = useState(false)

  const [activeSheetId, setActiveSheetId] = useState(null)
  const [comments,      setComments]      = useState([])
  const [addingNote,    setAddingNote]    = useState(false)
  const [pendingPos,    setPendingPos]    = useState(null)   // {x,y} waiting for text
  const [noteText,      setNoteText]      = useState('')
  const [authorName,    setAuthorName]    = useState('')
  const [selectedNote,  setSelectedNote]  = useState(null)
  const [savingNote,    setSavingNote]    = useState(false)
  const [approving,     setApproving]     = useState(false)
  const [approvalName,  setApprovalName]  = useState('')
  const [approvalTitle, setApprovalTitle] = useState('')
  const [showSchedule,  setShowSchedule]  = useState(true)
  const [pinVerified,   setPinVerified]   = useState(false)
  const [pinInput,      setPinInput]      = useState('')
  const [pinError,      setPinError]      = useState(false)

  useEffect(() => { load() }, [token])

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('get_drawing_review', { p_token: token })
      if (error || !data) { setError('This link is invalid or has expired.'); return }

      const pkgData = data.package
      if (!pkgData) { setError('This link is invalid or has expired.'); return }
      if (pkgData.share_expires_at && new Date(pkgData.share_expires_at) < new Date()) {
        setError('This review link has expired. Please contact the sender for a new link.'); return
      }

      const sheetData     = data.sheets     || []
      const placementData = data.placements || []
      const commentData   = data.comments   || []
      const profileData   = data.org        || null

      setPkg(pkgData)
      setApproved(pkgData.client_approved || false)

      const sheetIds = sheetData.map(s => s.id)
      if (sheetIds.length) setActiveSheetId(sheetIds[0])

      setSheets(sheetData)
      const sorted = placementData.sort((a, b) => {
        const ai = sheetIds.indexOf(a.drawing_sheet_id), bi = sheetIds.indexOf(b.drawing_sheet_id)
        if (ai !== bi) return ai - bi
        return new Date(a.created_at) - new Date(b.created_at)
      })
      setPlacements(sorted)
      setOrgProfile(profileData)
      setComments(commentData)
    } catch { setError('Failed to load drawing review.') }
    finally { setLoading(false) }
  }

  const handleCanvasClick = ({ x, y }) => {
    setPendingPos({ x, y })
    setAddingNote(false)
  }

  const handleSaveNote = async () => {
    if (!noteText.trim() || !pendingPos) return
    setSavingNote(true)
    try {
      const { data, error } = await supabase.from('drawing_review_comments').insert({
        share_token: token,
        sheet_id:    activeSheetId,
        x:           pendingPos.x,
        y:           pendingPos.y,
        comment:     noteText.trim(),
        author_name: authorName.trim() || null,
      }).select().single()
      if (!error && data) {
        setComments(prev => [...prev, data])
        setNoteText('')
        setPendingPos(null)
        setSelectedNote(data)
      }
    } finally { setSavingNote(false) }
  }

  const handleDeleteNote = async (id) => {
    await supabase.from('drawing_review_comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
    if (selectedNote?.id === id) setSelectedNote(null)
  }

  const handleApprove = async () => {
    if (!approvalName.trim()) return
    setApproving(true)
    try {
      const { error } = await supabase.from('drawing_packages').update({
        client_approved:       true,
        client_approved_at:    new Date().toISOString(),
        client_approved_by:    approvalName.trim(),
        client_approved_title: approvalTitle.trim(),
      }).eq('share_token', token)
      if (!error) setApproved(true)
    } catch { alert('Approval failed. Please try again.') }
    finally { setApproving(false) }
  }

  const activeSheet     = sheets.find(s => s.id === activeSheetId) || null
  const sheetPlacements = placements.filter(p => p.drawing_sheet_id === activeSheetId)
  const sheetComments   = comments.filter(c => c.sheet_id === activeSheetId)

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <span className="text-[#8A9AB0] text-sm">Loading drawing review…</span>
      </div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl p-8 max-w-md w-full text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-white font-bold text-lg mb-2">Link Unavailable</p>
        <p className="text-[#8A9AB0] text-sm">{error}</p>
      </div>
    </div>
  )

  // ── PIN gate ─────────────────────────────────────────────────────────────────
  if (pkg?.share_pin && !pinVerified) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-[#C8622A]/10 border border-[#C8622A]/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[#C8622A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <p className="text-white font-bold text-lg mb-1">{orgProfile?.company_name || 'Design Review'}</p>
        <p className="text-[#8A9AB0] text-sm mb-6">Enter the PIN provided by your integrator to view this design.</p>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Enter PIN"
          value={pinInput}
          onChange={e => { setPinInput(e.target.value); setPinError(false) }}
          onKeyDown={e => { if (e.key === 'Enter') {
            if (pinInput === pkg.share_pin) { setPinVerified(true) }
            else { setPinError(true); setPinInput('') }
          }}}
          className={`w-full text-center text-white text-xl font-bold tracking-widest bg-[#0F1C2E] border rounded-xl px-4 py-3 mb-3 focus:outline-none transition-colors ${
            pinError ? 'border-red-500 animate-shake' : 'border-[#2a3d55] focus:border-[#C8622A]'
          }`}
        />
        {pinError && <p className="text-red-400 text-sm mb-3">Incorrect PIN. Please try again.</p>}
        <button
          onClick={() => {
            if (pinInput === pkg.share_pin) { setPinVerified(true) }
            else { setPinError(true); setPinInput('') }
          }}
          disabled={!pinInput.trim()}
          className="w-full py-3 bg-[#C8622A] text-white font-bold rounded-xl hover:bg-[#b5571f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Continue
        </button>
      </div>
    </div>
  )

  // ── Approved ─────────────────────────────────────────────────────────────────
  if (approved) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-900/40 border border-green-800/40 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <p className="text-white font-bold text-lg mb-2">Design Approved</p>
        <p className="text-[#8A9AB0] text-sm">Thank you for reviewing and approving this design. Your integrator has been notified.</p>
        {pkg?.client_approved_at && (
          <p className="text-[#8A9AB0] text-xs mt-4">
            Approved {new Date(pkg.client_approved_at).toLocaleDateString()} by {pkg.client_approved_by}
          </p>
        )}
        {comments.length > 0 && (
          <p className="text-[#8A9AB0] text-xs mt-1">{comments.length} note{comments.length !== 1 ? 's' : ''} submitted with this review</p>
        )}
      </div>
    </div>
  )

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F1C2E] flex flex-col" style={{ height: '100vh' }}>

      {/* Header */}
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-5 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-base">
              {orgProfile?.company_name || 'ForgePt'}<span className="text-[#C8622A]">.</span>
            </h1>
            <p className="text-[#8A9AB0] text-xs mt-0.5">{pkg?.revision || 'Rev 0'} · Design Review</p>
          </div>
          <span className="text-xs bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30 px-3 py-1 rounded-full font-semibold">
            Pending Approval
          </span>
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#2a3d55] bg-[#1a2d45] flex-shrink-0 overflow-x-auto">
          {sheets.map(sheet => (
            <button key={sheet.id} onClick={() => { setActiveSheetId(sheet.id); setPendingPos(null); setAddingNote(false) }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeSheetId === sheet.id
                  ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/40'
                  : 'text-[#8A9AB0] hover:bg-[#0F1C2E] border border-transparent'
              }`}>
              {sheet.name}
              {comments.filter(c => c.sheet_id === sheet.id).length > 0 && (
                <span className="bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {comments.filter(c => c.sheet_id === sheet.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Canvas */}
        <div className="flex-1 overflow-hidden min-w-0">
          {activeSheet ? (
            <SheetCanvas
              sheet={activeSheet}
              placements={sheetPlacements}
              comments={sheetComments}
              addingNote={addingNote}
              onCanvasClick={handleCanvasClick}
              onNoteClick={(c) => setSelectedNote(prev => prev?.id === c.id ? null : c)}
              selectedNoteId={selectedNote?.id}
              shareToken={token}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#8A9AB0] text-sm">No floor plan</div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 border-l border-[#2a3d55] flex flex-col flex-shrink-0 bg-[#0F1C2E] overflow-hidden">

          {/* Notes section */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a3d55] flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-white text-sm font-semibold">Notes</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">{sheetComments.length} on this sheet</p>
              </div>
              <button
                onClick={() => { setAddingNote(a => !a); setPendingPos(null) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  addingNote
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                    : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white border border-[#2a3d55]'
                }`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                {addingNote ? 'Cancel' : 'Add Note'}
              </button>
            </div>

            {/* Pending note input */}
            {pendingPos && (
              <div className="px-4 py-3 border-b border-[#2a3d55] bg-yellow-500/5 flex-shrink-0">
                <p className="text-yellow-400 text-xs font-semibold mb-2">New note</p>
                <textarea
                  autoFocus
                  placeholder="Describe your note or question…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0F1C2E] text-white border border-yellow-500/40 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-yellow-400 placeholder-[#4a5a6a] resize-none"
                />
                {!authorName && (
                  <input
                    placeholder="Your name (optional)"
                    value={authorName}
                    onChange={e => setAuthorName(e.target.value)}
                    className="w-full mt-2 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"
                  />
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setPendingPos(null); setNoteText('') }}
                    className="flex-1 py-1.5 text-xs text-[#8A9AB0] border border-[#2a3d55] rounded-lg hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveNote} disabled={!noteText.trim() || savingNote}
                    className="flex-1 py-1.5 text-xs font-semibold bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                    {savingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              </div>
            )}

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sheetComments.length === 0 && !pendingPos && (
                <p className="text-[#4a5a6a] text-xs text-center py-6">
                  {addingNote ? 'Click on the floor plan to drop a pin' : 'No notes on this sheet yet'}
                </p>
              )}
              {sheetComments.map((c, idx) => {
                const isSelected = selectedNote?.id === c.id
                return (
                  <div key={c.id}
                    onClick={() => setSelectedNote(prev => prev?.id === c.id ? null : c)}
                    className={`rounded-lg p-3 border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-yellow-500/50 bg-yellow-500/10'
                        : 'border-[#2a3d55] bg-[#1a2d45] hover:border-yellow-500/30'
                    }`}>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-yellow-500 text-black text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs leading-snug">{c.comment}</p>
                        {c.author_name && <p className="text-[#8A9AB0] text-xs mt-1">{c.author_name}</p>}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(c.id) }}
                        className="text-[#4a5a6a] hover:text-red-400 transition-colors flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Approval section */}
          <div className="border-t border-[#2a3d55] flex-shrink-0 p-4 space-y-3">
            <p className="text-white text-sm font-semibold">Approve Design</p>
            <p className="text-[#8A9AB0] text-xs">Confirm device placement meets your requirements. Notes above will be sent with your approval.</p>
            <input placeholder="Your name *" value={approvalName} onChange={e => setApprovalName(e.target.value)} className={inputClass} />
            <input placeholder="Your title (optional)" value={approvalTitle} onChange={e => setApprovalTitle(e.target.value)} className={inputClass} />
            <button
              onClick={handleApprove}
              disabled={approving || !approvalName.trim()}
              className={`w-full py-2.5 text-sm font-bold rounded-lg transition-colors ${
                approving || !approvalName.trim()
                  ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                  : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
              }`}>
              {approving ? 'Submitting…' : 'Approve Design ✓'}
            </button>
          </div>
        </div>
      </div>

      {/* Device schedule — collapsible footer */}
      {placements.length > 0 && (
        <div className="border-t border-[#2a3d55] flex-shrink-0 bg-[#1a2d45]">
          <button onClick={() => setShowSchedule(s => !s)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold text-[#8A9AB0] hover:text-white transition-colors">
            <span>Device Schedule ({placements.length} devices)</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${showSchedule ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {showSchedule && (
            <div className="overflow-x-auto max-h-48 border-t border-[#2a3d55]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0F1C2E] text-[#C8622A] text-left sticky top-0">
                    {['#','Address','Condition','Part Number','Description','Manufacturer','Category','Sheet'].map(h => (
                      <th key={h} className="px-4 py-2 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {placements.map((p, idx) => {
                    const gp    = p.global_products
                    const sheet = sheets.find(s => s.id === p.drawing_sheet_id)
                    return (
                      <tr key={p.id} className={idx % 2 === 0 ? 'bg-[#1a2d45]' : 'bg-[#162338]'}>
                        <td className="px-4 py-2 text-[#8A9AB0]">{idx + 1}</td>
                        <td className="px-4 py-2 text-white font-medium whitespace-nowrap">{p.device_address || '—'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {p.site_condition === 'existing' && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-900/60 text-blue-300 border border-blue-700/50">Existing</span>}
                          {p.site_condition === 'replace' && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/60 text-amber-300 border border-amber-700/50">Replace</span>}
                          {p.site_condition === 'demo' && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/50">Demo</span>}
                          {(!p.site_condition || p.site_condition === 'new') && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-900/60 text-green-300 border border-green-700/50">New</span>}
                        </td>
                        <td className="px-4 py-2 text-[#8A9AB0] font-mono whitespace-nowrap">{p.part_number_override || gp?.part_number || '—'}</td>
                        <td className="px-4 py-2 text-white whitespace-nowrap">{p.description_override || gp?.name || '—'}</td>
                        <td className="px-4 py-2 text-[#8A9AB0] whitespace-nowrap">{p.manufacturer_override || gp?.manufacturer || '—'}</td>
                        <td className="px-4 py-2 text-[#8A9AB0] whitespace-nowrap">{gp?.category || '—'}</td>
                        <td className="px-4 py-2 text-[#8A9AB0] whitespace-nowrap">{sheet?.name || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

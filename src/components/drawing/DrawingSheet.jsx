import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../supabase'

export default function DrawingSheet({ sheet, orgId, selectedSymbol, onPlacementChange }) {
  const containerRef = useRef(null)
  const [imageUrl,   setImageUrl]   = useState(null)
  const [placements, setPlacements] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [hoveredId,  setHoveredId]  = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [placing,    setPlacing]    = useState(false)

  // Load signed URL
  useEffect(() => {
    if (!sheet?.storage_path || sheet.storage_path === 'pending') return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const isPDF = sheet.storage_path.toLowerCase().endsWith('.pdf')
        const { data, error } = await supabase.storage.from('floor-plans').createSignedUrl(sheet.storage_path, 3600)
        if (error) throw error
        if (isPDF) {
          await renderPDFPage(data.signedUrl)
        } else {
          setImageUrl(data.signedUrl)
        }
      } catch (err) {
        setError('Failed to load floor plan.')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sheet?.storage_path])

  const renderPDFPage = async (signedUrl) => {
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
      const pdf  = await pdfjsLib.getDocument(signedUrl).promise
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 1800 / viewport.width)
      const scaledViewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width  = scaledViewport.width
      canvas.height = scaledViewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise
      setImageUrl(canvas.toDataURL('image/png'))
    } catch (err) {
      throw new Error('PDF render failed: ' + err.message)
    }
  }

  const loadPlacements = useCallback(async () => {
    const { data, error } = await supabase
      .from('drawing_placements')
      .select('*, global_products(id, name, part_number, manufacturer, category)')
      .eq('drawing_sheet_id', sheet.id)
      .order('created_at')
    if (!error) setPlacements(data || [])
  }, [sheet.id])

  useEffect(() => { loadPlacements() }, [loadPlacements])

  const handleCanvasClick = async (e) => {
    if (!selectedSymbol) { setSelectedId(null); return }
    if (placing) return
    setPlacing(true)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 10000) / 10000
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 10000) / 10000
    try {
      const { data: catalogMatch } = await supabase
        .from('products').select('id').eq('org_id', orgId).eq('part_number', selectedSymbol.part_number).maybeSingle()
      const { data: placement, error } = await supabase
        .from('drawing_placements')
        .insert({ org_id: orgId, drawing_sheet_id: sheet.id, global_product_id: selectedSymbol.id, product_id: catalogMatch?.id || null, x, y, rotation: 0, quantity: 1 })
        .select('*, global_products(id, name, part_number, manufacturer, category)')
        .single()
      if (error) throw error
      setPlacements(prev => [...prev, placement])
      onPlacementChange?.()
    } catch (err) {
      console.error('Failed to place device:', err)
    } finally {
      setTimeout(() => setPlacing(false), 200)
    }
  }

  const handleDeletePlacement = async (placementId, e) => {
    e.stopPropagation()
    const { error } = await supabase.from('drawing_placements').delete().eq('id', placementId)
    if (!error) { setPlacements(prev => prev.filter(p => p.id !== placementId)); setSelectedId(null); onPlacementChange?.() }
  }

  const handleRotate = async (placementId, e) => {
    e.stopPropagation()
    const placement = placements.find(p => p.id === placementId)
    if (!placement) return
    const newRotation = (placement.rotation + 90) % 360
    const { error } = await supabase.from('drawing_placements').update({ rotation: newRotation }).eq('id', placementId)
    if (!error) setPlacements(prev => prev.map(p => p.id === placementId ? { ...p, rotation: newRotation } : p))
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <svg className="w-6 h-6 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <span className="text-sm text-[#8A9AB0]">Loading floor plan...</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex-1 flex items-center justify-center h-full">
      <p className="text-sm text-red-400 text-center max-w-xs">{error}</p>
    </div>
  )

  if (!imageUrl) return null

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3d55] bg-[#1a2d45] text-xs text-[#8A9AB0]">
        <div>
          {selectedSymbol
            ? <span className="flex items-center gap-1.5 text-[#C8622A] font-medium"><span className="w-2 h-2 rounded-full bg-[#C8622A] animate-pulse"/>Placing: {selectedSymbol.name}</span>
            : <span>Select a symbol from the left panel to place devices</span>
          }
        </div>
        <span>{placements.length} device{placements.length !== 1 ? 's' : ''} placed</span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#060f1c] p-4">
        <div className="relative inline-block select-none"
          style={{ cursor: selectedSymbol ? 'crosshair' : 'default', maxWidth: '100%' }}
          onClick={handleCanvasClick}>
          <img src={imageUrl} alt={sheet.name} className="block max-w-full rounded shadow-lg" draggable={false} />
          {placements.map(placement => (
            <PlacementMarker key={placement.id} placement={placement}
              isSelected={selectedId === placement.id}
              isHovered={hoveredId === placement.id}
              onSelect={(e) => { e.stopPropagation(); setSelectedId(prev => prev === placement.id ? null : placement.id) }}
              onDelete={(e) => handleDeletePlacement(placement.id, e)}
              onRotate={(e) => handleRotate(placement.id, e)}
              onHover={(val) => setHoveredId(val ? placement.id : null)} />
          ))}
        </div>
      </div>

      {/* Status bar */}
      {sheet.status === 'approved' && (
        <div className="px-3 py-2 bg-green-900/20 border-t border-green-800/30 text-xs text-green-400 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
          Approved — placements are in the BOM. You can still edit and re-approve.
        </div>
      )}
    </div>
  )
}

function PlacementMarker({ placement, isSelected, isHovered, onSelect, onDelete, onRotate, onHover }) {
  const product = placement.global_products
  if (!product) return null
  return (
    <div
      style={{ position: 'absolute', left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`, zIndex: isSelected ? 20 : isHovered ? 15 : 10 }}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onClick={onSelect}
    >
      {/* Marker */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
        isSelected ? 'bg-[#C8622A] border-[#b5571f] shadow-lg scale-125'
        : isHovered ? 'bg-[#C8622A]/80 border-[#C8622A] shadow-md scale-110'
        : 'bg-[#C8622A] border-[#b5571f] shadow'
      }`}>
        <DeviceIcon category={product.category} />
      </div>

      {/* Hover tooltip */}
      {isHovered && !isSelected && (
        <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}
          className="bg-[#0F1C2E] border border-[#2a3d55] text-white text-xs rounded-lg px-2 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
          <p className="font-medium">{product.name}</p>
          <p className="font-mono text-[#8A9AB0]">{product.part_number}</p>
          <p className="text-[#8A9AB0]">{product.manufacturer}</p>
        </div>
      )}

      {/* Selected tooltip */}
      {isSelected && (
        <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: `translateX(-50%) rotate(-${placement.rotation}deg)`, zIndex: 30 }}
          className="bg-[#C8622A] text-white text-xs rounded-lg px-2 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
          <p className="font-medium">{product.name}</p>
          <p className="font-mono opacity-80">{product.part_number}</p>
        </div>
      )}

      {/* Action buttons */}
      {isSelected && (
        <div style={{ position: 'absolute', top: '110%', left: '50%', transform: `translateX(-50%) rotate(-${placement.rotation}deg)`, zIndex: 30 }}
          className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
          <button onClick={onRotate} title="Rotate 90°"
            className="w-6 h-6 rounded-full bg-[#1a2d45] border border-[#2a3d55] shadow flex items-center justify-center hover:border-[#C8622A] transition-colors">
            <svg className="w-3 h-3 text-[#8A9AB0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button onClick={onDelete} title="Remove device"
            className="w-6 h-6 rounded-full bg-[#1a2d45] border border-red-800/40 shadow flex items-center justify-center hover:border-red-500 transition-colors">
            <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function DeviceIcon({ category }) {
  const props = { className: 'w-4 h-4 text-white', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }
  switch (category) {
    case 'Dome Camera':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 10a8 8 0 1016 0A8 8 0 004 10z"/></svg>
    case 'Bullet Camera':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a1 1 0 011-1h11a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"/></svg>
    case 'PTZ Camera':
      return <svg {...props}><circle cx="12" cy="12" r="3" strokeWidth={1.5}/><path strokeLinecap="round" strokeWidth={1.5} d="M12 5v2M12 17v2M5 12H3M21 12h-2M7.05 7.05L5.64 5.64M18.36 18.36l-1.41-1.41M18.36 5.64l-1.41 1.41M7.05 16.95L5.64 18.36"/></svg>
    case 'Access Reader':
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={1.5}/><path strokeLinecap="round" strokeWidth={1.5} d="M9 12h6M12 9v6"/></svg>
    case 'Speaker':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M9 8l-3 2H4a1 1 0 00-1 1v2a1 1 0 001 1h2l3 2V8z"/></svg>
    case 'Display':
      return <svg {...props}><rect x="2" y="4" width="20" height="14" rx="2" strokeWidth={1.5}/><path strokeLinecap="round" strokeWidth={1.5} d="M8 20h8M12 18v2"/></svg>
    case 'Network':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
    case 'Thermostat':
      return <svg {...props}><circle cx="12" cy="12" r="9" strokeWidth={1.5}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7v5l3 3"/></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="4" strokeWidth={1.5}/><path strokeLinecap="round" strokeWidth={1.5} d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
  }
}
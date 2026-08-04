import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export default function SignaturePad({ title = 'Customer Sign-off', onConfirm, onCancel }) {
  const canvasRef      = useRef(null)
  const isDrawing      = useRef(false)
  const lastPoint      = useRef(null)
  const [signerName, setSignerName] = useState('')
  const [hasDrawn,   setHasDrawn]   = useState(false)

  // Size canvas to match layout after mount
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr  = window.devicePixelRatio || 1
    canvas.width  = rect.width  * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    applyStyle(ctx)
  }, [])

  // Register non-passive touch listeners so preventDefault stops page scroll
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onTouchStart = (e) => { e.preventDefault(); startDraw(e) }
    const onTouchMove  = (e) => { e.preventDefault(); moveDraw(e) }
    const onTouchEnd   = () => stopDraw()
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false })
    canvas.addEventListener('touchend',   onTouchEnd)
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove',  onTouchMove)
      canvas.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

  const applyStyle = (ctx) => {
    ctx.strokeStyle = '#0F1C2E'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }

  const getPoint = (e) => {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const src    = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const startDraw = (e) => {
    isDrawing.current = true
    const pt = getPoint(e)
    lastPoint.current = pt
    const ctx = canvasRef.current.getContext('2d')
    applyStyle(ctx)
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y)
  }

  const moveDraw = (e) => {
    if (!isDrawing.current) return
    const pt  = getPoint(e)
    const ctx = canvasRef.current.getContext('2d')
    // Smooth by drawing to midpoint
    const mid = { x: (lastPoint.current.x + pt.x) / 2, y: (lastPoint.current.y + pt.y) / 2 }
    ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, mid.x, mid.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(mid.x, mid.y)
    lastPoint.current = pt
    setHasDrawn(true)
  }

  const stopDraw = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const ctx = canvasRef.current.getContext('2d')
    ctx.stroke()
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const confirm = () => {
    onConfirm(canvasRef.current.toDataURL('image/png'), signerName.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ touchAction: 'none' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Have the customer sign below, then confirm</p>
        </div>
        <button onClick={onCancel}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 transition-colors text-xl leading-none">
          ×
        </button>
      </div>

      {/* Signer name */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
          Customer printed name
        </label>
        <input
          type="text"
          value={signerName}
          onChange={e => setSignerName(e.target.value)}
          placeholder="First and last name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-500"
        />
      </div>

      {/* Signature label */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0 flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">Customer signature</span>
        {hasDrawn && (
          <button onClick={clear}
            className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 px-4 pb-3 min-h-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-xl border-2 border-dashed border-gray-300"
          style={{ cursor: 'crosshair', touchAction: 'none', display: 'block' }}
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
        />
      </div>

      {/* Actions */}
      <div className="px-4 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 safe-area-bottom">
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!hasDrawn}
            className="flex-[2] py-3.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#0F1C2E' }}>
            {hasDrawn ? 'Confirm Signature' : 'Sign above to continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

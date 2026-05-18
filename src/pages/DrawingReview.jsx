import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const FOV_CATEGORIES = ['Dome Camera','Bullet Camera','PTZ Camera','Motion Sensor','Multi-Lens Camera','Fisheye Camera']

// ── SheetViewer ────────────────────────────────────────────────────────────────
// Canvas overlay avoids SVG preserveAspectRatio alignment issues — the canvas is
// sized to exactly match the rendered image in CSS pixels, so coordinates are 1:1.
function SheetViewer({ sheet, placements }) {
  const [imgSrc,   setImgSrc]   = useState(null)
  const [naturalW, setNaturalW] = useState(null)
  const imgRef    = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!sheet.storage_path || ['blank','pending'].includes(sheet.storage_path)) return
    loadImage()
  }, [sheet.id])

  const loadImage = async () => {
    try {
      const { data } = await supabase.storage
        .from('floor-plans')
        .createSignedUrl(sheet.storage_path, 3600)
      if (!data?.signedUrl) return

      if (sheet.storage_path.toLowerCase().endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
        ).toString()
        const response = await fetch(data.signedUrl)
        const buf      = await response.arrayBuffer()
        const pdfDoc   = await pdfjsLib.getDocument({ data: buf }).promise
        const page     = await pdfDoc.getPage(sheet.page_number || 1)
        const vp       = page.getViewport({ scale: 2 })
        const canvas   = document.createElement('canvas')
        canvas.width   = vp.width
        canvas.height  = vp.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        setImgSrc(canvas.toDataURL('image/png'))
      } else {
        setImgSrc(data.signedUrl)
      }
    } catch (err) {
      console.error('Sheet image load failed:', err)
    }
  }

  const drawOverlay = useCallback(() => {
    const img    = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !naturalW) return

    const W   = img.offsetWidth
    const H   = img.offsetHeight
    if (!W || !H) return

    const dpr = window.devicePixelRatio || 1
    canvas.width        = W * dpr
    canvas.height       = H * dpr
    canvas.style.width  = `${W}px`
    canvas.style.height = `${H}px`

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    for (const p of placements) {
      const cx      = p.x * W
      const cy      = p.y * H
      const col     = p.marker_color || '#C8622A'
      const markerR = Math.max((p.symbol_size || 32) * (W / naturalW), 4)
      const category = p.global_products?.category || ''

      // FOV cone
      if (FOV_CATEGORIES.includes(category)) {
        const fovAngle    = p.fov_angle || p.global_products?.specs?.fov_angle || (category === 'PTZ Camera' ? 360 : 90)
        const rangeInFeet = p.fov_range || p.global_products?.specs?.ir_range || 30
        const range = sheet.scale_ratio
          ? Math.min((rangeInFeet / sheet.scale_ratio) * (W / naturalW), W * 0.35)
          : W * 0.08

        ctx.save()
        ctx.fillStyle   = col
        ctx.strokeStyle = col
        ctx.lineWidth   = 1

        if (category === 'PTZ Camera' || fovAngle >= 355) {
          ctx.globalAlpha = 0.08
          ctx.beginPath()
          ctx.arc(cx, cy, range, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 0.3
          ctx.stroke()
        } else {
          const startAngle = ((p.rotation || 0) - fovAngle / 2) * Math.PI / 180
          const endAngle   = ((p.rotation || 0) + fovAngle / 2) * Math.PI / 180
          ctx.globalAlpha = 0.12
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, range, startAngle, endAngle)
          ctx.closePath()
          ctx.fill()
          ctx.globalAlpha = 0.4
          ctx.stroke()
        }
        ctx.restore()
      }

      // Marker circle
      ctx.save()
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(cx, cy, markerR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Label
      if (p.device_address) {
        const fontSize = Math.max(markerR * 0.75, 8)
        ctx.save()
        ctx.fillStyle  = col
        ctx.font       = `bold ${fontSize}px sans-serif`
        ctx.textAlign  = 'center'
        ctx.fillText(p.device_address, cx, cy + markerR + fontSize * 0.9)
        ctx.restore()
      }
    }
  }, [placements, naturalW, sheet.scale_ratio])

  // Redraw whenever placements or image change
  useEffect(() => {
    if (naturalW) drawOverlay()
  }, [drawOverlay, naturalW])

  const handleImgLoad = (e) => {
    setNaturalW(e.target.naturalWidth)
  }

  // Redraw on resize
  useEffect(() => {
    if (!canvasRef.current) return
    const ro = new ResizeObserver(() => drawOverlay())
    if (imgRef.current) ro.observe(imgRef.current)
    return () => ro.disconnect()
  }, [drawOverlay])

  return (
    <div className="bg-[#0F1C2E] rounded-xl overflow-hidden border border-[#2a3d55]">
      <div className="bg-[#1a2d45] px-4 py-3 border-b border-[#2a3d55] flex items-center justify-between">
        <p className="text-white text-sm font-semibold">{sheet.name}</p>
        <p className="text-[#8A9AB0] text-xs">{placements.length} device{placements.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="relative bg-white">
        {imgSrc ? (
          <img
            ref={imgRef}
            src={imgSrc}
            alt={sheet.name}
            className="w-full block"
            onLoad={handleImgLoad}
          />
        ) : (
          <div className="h-64 flex items-center justify-center bg-[#0F1C2E]">
            <svg className="w-5 h-5 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
        />
      </div>
    </div>
  )
}

// ── DrawingReview ──────────────────────────────────────────────────────────────
export default function DrawingReview() {
  const { token } = useParams()

  const [pkg,          setPkg]          = useState(null)
  const [sheets,       setSheets]       = useState([])
  const [placements,   setPlacements]   = useState([])
  const [orgProfile,   setOrgProfile]   = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [approving,    setApproving]    = useState(false)
  const [approved,     setApproved]     = useState(false)
  const [approvalForm, setApprovalForm] = useState({ name: '', title: '' })

  useEffect(() => { load() }, [token])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: pkgData, error: pkgErr } = await supabase
        .from('drawing_packages')
        .select('*')
        .eq('share_token', token)
        .single()

      if (pkgErr || !pkgData) { setError('This link is invalid or has expired.'); return }
      if (pkgData.share_expires_at && new Date(pkgData.share_expires_at) < new Date()) {
        setError('This review link has expired. Please contact the sender for a new link.')
        return
      }

      setPkg(pkgData)
      setApproved(pkgData.client_approved || false)

      const { data: sheetData } = await supabase
        .from('drawing_sheets')
        .select('*')
        .eq('proposal_id', pkgData.proposal_id)
        .order('sort_order', { ascending: true })

      const sheetIds = (sheetData || []).map(s => s.id)

      const [{ data: placementData }, { data: profileData }] = await Promise.all([
        sheetIds.length
          ? supabase.from('drawing_placements')
              .select('*, global_products(id, name, part_number, manufacturer, category, specs)')
              .in('drawing_sheet_id', sheetIds)
          : Promise.resolve({ data: [] }),
        supabase.from('profiles')
          .select('company_name, logo_url, primary_color')
          .eq('org_id', pkgData.org_id)
          .limit(1)
          .single(),
      ])

      setSheets(sheetData || [])
      setPlacements(placementData || [])
      setOrgProfile(profileData)
    } catch {
      setError('Failed to load drawing review.')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!approvalForm.name.trim()) { alert('Please enter your name.'); return }
    setApproving(true)
    try {
      const { error } = await supabase
        .from('drawing_packages')
        .update({
          client_approved:       true,
          client_approved_at:    new Date().toISOString(),
          client_approved_by:    approvalForm.name.trim(),
          client_approved_title: approvalForm.title.trim(),
        })
        .eq('share_token', token)

      if (error) throw error
      setApproved(true)
    } catch {
      alert('Approval failed. Please try again.')
    } finally {
      setApproving(false)
    }
  }

  const placementsBySheet = {}
  placements.forEach(p => {
    if (!placementsBySheet[p.drawing_sheet_id]) placementsBySheet[p.drawing_sheet_id] = []
    placementsBySheet[p.drawing_sheet_id].push(p)
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <span className="text-[#8A9AB0] text-sm">Loading drawing review...</span>
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
        <p className="text-[#8A9AB0] text-sm">
          Thank you for reviewing and approving this design.
          Your integrator has been notified.
        </p>
        {pkg?.client_approved_at && (
          <p className="text-[#8A9AB0] text-xs mt-4">
            Approved on {new Date(pkg.client_approved_at).toLocaleDateString()} by {pkg.client_approved_by}
          </p>
        )}
      </div>
    </div>
  )

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F1C2E]">

      {/* Header */}
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg">
              {orgProfile?.company_name || 'ForgePt'}<span className="text-[#C8622A]">.</span>
            </h1>
            <p className="text-[#8A9AB0] text-xs mt-0.5">Design Review · {pkg?.revision || 'Rev 0'}</p>
          </div>
          <span className="text-xs bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30 px-3 py-1 rounded-full font-semibold">
            Awaiting Review
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Floor plan sheets */}
        {sheets.length > 0 ? (
          <div className="space-y-6">
            {sheets.map(sheet => (
              <SheetViewer
                key={sheet.id}
                sheet={sheet}
                placements={placementsBySheet[sheet.id] || []}
              />
            ))}
          </div>
        ) : (
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-8 text-center">
            <p className="text-[#8A9AB0] text-sm">No floor plan sheets found for this project.</p>
          </div>
        )}

        {/* Device schedule */}
        {placements.length > 0 && (
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a3d55]">
              <p className="text-[#C8622A] font-bold text-sm tracking-wide uppercase">Device Schedule</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">{placements.length} device{placements.length !== 1 ? 's' : ''} across {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0F1C2E] text-[#C8622A] text-left">
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Address</th>
                    <th className="px-4 py-3 font-semibold">Part Number</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Manufacturer</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Sheet</th>
                    <th className="px-4 py-3 font-semibold">Runs To</th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map((p, idx) => {
                    const gp    = p.global_products
                    const sheet = sheets.find(s => s.id === p.drawing_sheet_id)
                    return (
                      <tr key={p.id} className={idx % 2 === 0 ? 'bg-[#1a2d45]' : 'bg-[#162338]'}>
                        <td className="px-4 py-2.5 text-[#8A9AB0]">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-white font-medium">{p.device_address || '—'}</td>
                        <td className="px-4 py-2.5 text-[#8A9AB0] font-mono">{p.part_number_override || gp?.part_number || '—'}</td>
                        <td className="px-4 py-2.5 text-white">{p.description_override || gp?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-[#8A9AB0]">{p.manufacturer_override || gp?.manufacturer || '—'}</td>
                        <td className="px-4 py-2.5 text-[#8A9AB0]">{gp?.category || '—'}</td>
                        <td className="px-4 py-2.5 text-[#8A9AB0]">{p.quantity || 1}</td>
                        <td className="px-4 py-2.5 text-[#8A9AB0]">{sheet?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-[#8A9AB0]">{p.runs_to_label || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Approval section */}
        {!approved && (
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
            <h3 className="text-white font-bold text-base mb-2">Approve This Design</h3>
            <p className="text-[#8A9AB0] text-sm mb-4">
              By approving this design you confirm the device placement and coverage
              meets your requirements. This is not a legal contract — your integrator
              will follow up with a formal proposal.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Your Name *</label>
                <input
                  type="text"
                  placeholder="John Smith"
                  value={approvalForm.name}
                  onChange={e => setApprovalForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Your Title (optional)</label>
                <input
                  type="text"
                  placeholder="Facilities Manager"
                  value={approvalForm.title}
                  onChange={e => setApprovalForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
            </div>
            <button
              onClick={handleApprove}
              disabled={approving || !approvalForm.name.trim()}
              className={`w-full py-3 text-sm font-bold rounded-lg transition-colors ${
                approving || !approvalForm.name.trim()
                  ? 'bg-[#2a3d55] text-[#8A9AB0] cursor-not-allowed'
                  : 'bg-[#C8622A] text-white hover:bg-[#b5571f]'
              }`}
            >
              {approving ? 'Submitting...' : 'Approve Design ✓'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

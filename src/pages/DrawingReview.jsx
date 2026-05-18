import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const FOV_CATEGORIES = ['Dome Camera','Bullet Camera','PTZ Camera','Motion Sensor','Multi-Lens Camera','Fisheye Camera']

// ── SheetViewer ────────────────────────────────────────────────────────────────
// Renders one floor plan sheet with FOV cones + device markers via SVG overlay.
function SheetViewer({ sheet, placements }) {
  const [imgSrc, setImgSrc] = useState(null)
  const [dims,   setDims]   = useState(null)

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

  return (
    <div className="bg-[#0F1C2E] rounded-xl overflow-hidden border border-[#2a3d55]">
      <div className="bg-[#1a2d45] px-4 py-3 border-b border-[#2a3d55] flex items-center justify-between">
        <p className="text-white text-sm font-semibold">{sheet.name}</p>
        <p className="text-[#8A9AB0] text-xs">{placements.length} device{placements.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="relative bg-white">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={sheet.name}
            className="w-full block"
            onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          />
        ) : (
          <div className="h-64 flex items-center justify-center bg-[#0F1C2E]">
            <svg className="w-5 h-5 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        )}

        {dims && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {placements.map(p => {
              const cx       = p.x * dims.w
              const cy       = p.y * dims.h
              const col      = p.marker_color || '#C8622A'
              const markerR  = (p.symbol_size || 32) / 2
              const category = p.global_products?.category || ''
              const sw       = Math.max(dims.w * 0.0012, 1)

              let fovEl = null
              if (FOV_CATEGORIES.includes(category)) {
                const fovAngle    = p.fov_angle || p.global_products?.specs?.fov_angle || (category === 'PTZ Camera' ? 360 : 90)
                const rangeInFeet = p.fov_range || p.global_products?.specs?.ir_range || 30
                const range = sheet.scale_ratio
                  ? Math.min(rangeInFeet / sheet.scale_ratio, dims.w * 0.35)
                  : dims.w * 0.08

                if (category === 'PTZ Camera' || fovAngle >= 355) {
                  fovEl = (
                    <circle key={`fov_${p.id}`} cx={cx} cy={cy} r={range}
                      fill={col} fillOpacity={0.08}
                      stroke={col} strokeOpacity={0.3} strokeWidth={sw * 2} />
                  )
                } else {
                  const startAngle = ((p.rotation || 0) - fovAngle / 2) * Math.PI / 180
                  const endAngle   = ((p.rotation || 0) + fovAngle / 2) * Math.PI / 180
                  const x1 = cx + Math.cos(startAngle) * range
                  const y1 = cy + Math.sin(startAngle) * range
                  const x2 = cx + Math.cos(endAngle) * range
                  const y2 = cy + Math.sin(endAngle) * range
                  const largeArc = fovAngle > 180 ? 1 : 0
                  fovEl = (
                    <path key={`fov_${p.id}`}
                      d={`M ${cx} ${cy} L ${x1} ${y1} A ${range} ${range} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={col} fillOpacity={0.12}
                      stroke={col} strokeOpacity={0.4} strokeWidth={sw * 2} />
                  )
                }
              }

              return (
                <g key={p.id}>
                  {fovEl}
                  <circle cx={cx} cy={cy} r={markerR} fill={col} />
                  {p.device_address && (
                    <text
                      x={cx} y={cy + markerR + markerR * 0.7}
                      textAnchor="middle" fill={col}
                      fontSize={markerR * 0.75} fontWeight="bold"
                    >
                      {p.device_address}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
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
    } catch (err) {
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

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

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

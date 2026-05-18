import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

// ─── DrawingReview ────────────────────────────────────────────────────────────
// Public token-based read-only drawing review page.
// Accessible at /designer/review/:token — no auth required.
// Same pattern as SignProposal.jsx and RFQResponse.jsx
export default function DrawingReview() {
  const { token } = useParams()

  const [pkg,       setPkg]       = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [approving, setApproving] = useState(false)
  const [approved,  setApproved]  = useState(false)
  const [approvalForm, setApprovalForm] = useState({ name: '', title: '' })

  useEffect(() => {
    load()
  }, [token])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('drawing_packages')
        .select('*')
        .eq('share_token', token)
        .single()

      if (error || !data) { setError('This link is invalid or has expired.'); return }
      if (data.share_expires_at && new Date(data.share_expires_at) < new Date()) {
        setError('This review link has expired. Please contact the sender for a new link.')
        return
      }

      setPkg(data)
      setApproved(data.client_approved || false)
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
    } catch (err) {
      alert('Approval failed. Please try again.')
    } finally {
      setApproving(false)
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
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

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl p-8 max-w-md w-full text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-white font-bold text-lg mb-2">Link Unavailable</p>
        <p className="text-[#8A9AB0] text-sm">{error}</p>
      </div>
    </div>
  )

  // ── Approved confirmation ───────────────────────────────────────────────────
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

  // ── Main review page ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F1C2E]">

      {/* Header */}
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg">
              ForgePt<span className="text-[#C8622A]">.</span> Design Review
            </h1>
            <p className="text-[#8A9AB0] text-xs mt-0.5">
              Review your proposed system design
            </p>
          </div>
          <div className="text-right">
            <p className="text-[#8A9AB0] text-xs">Revision</p>
            <p className="text-white text-sm font-semibold">{pkg?.revision || 'Rev 0'}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Package info */}
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-lg">
                {pkg?.package_type === 'shop_drawing' ? 'Shop Drawing Package'
                  : pkg?.package_type === 'as_built' ? 'As-Built Package'
                  : 'Design Overview'}
              </p>
              <p className="text-[#8A9AB0] text-sm mt-1">
                Prepared for your review — floor plans and device placement
              </p>
            </div>
            <span className="text-xs bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30 px-3 py-1 rounded-full font-semibold">
              Awaiting Review
            </span>
          </div>
        </div>

        {/* Drawing preview — Bundle 6 will render actual floor plan images here */}
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-8 mb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0F1C2E] flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📐</span>
          </div>
          <p className="text-white font-semibold mb-2">Floor Plan Drawing</p>
          <p className="text-[#8A9AB0] text-sm">
            Your integrator will share the full floor plan drawings separately.
            Please review and approve the design scope below.
          </p>
        </div>

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
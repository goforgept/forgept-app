import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

// ─── DrawingToolSummary ───────────────────────────────────────────────────────
// Lightweight card that lives in ProposalDetail.
// Shows sheet count, device count, status.
// "Open in Designer" button navigates to /designer/:proposalId
//
// Props:
//   proposalId     — uuid
//   featureEnabled — boolean from organizations.feature_drawing_tool
export default function DrawingToolSummary({ proposalId, featureEnabled }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  if (!featureEnabled) return null

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Load sheets
        const { data: sheets } = await supabase
          .from('drawing_sheets')
          .select('id, name, status')
          .eq('proposal_id', proposalId)

        if (!sheets || sheets.length === 0) {
          setStats({ sheets: 0, devices: 0, status: null })
          setLoading(false)
          return
        }

        // Load device count across all sheets
        const { count } = await supabase
          .from('drawing_placements')
          .select('id', { count: 'exact', head: true })
          .in('drawing_sheet_id', sheets.map(s => s.id))

        // Determine overall status
        const allApproved = sheets.every(s => s.status === 'approved')
        const anyDraft    = sheets.some(s => s.status === 'draft')
        const status = sheets.length === 0
          ? null
          : allApproved
          ? 'approved'
          : anyDraft
          ? 'draft'
          : 'revised'

        setStats({
          sheets:  sheets.length,
          devices: count || 0,
          status,
        })
      } catch (err) {
        console.error(err)
        setStats({ sheets: 0, devices: 0, status: null })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [proposalId])

  const statusBadge = {
    approved: 'bg-green-900/40 text-green-400',
    draft:    'bg-yellow-900/40 text-yellow-400',
    revised:  'bg-blue-900/40 text-blue-400',
  }

  return (
    <div className="mt-6 bg-fp-card border border-fp-border rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-[#C8622A]/10 border border-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#C8622A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 6.75V15m6-6v8.25m.503-10.498l4.875 2.437c.381.19.622.58.622 1.006v4.163a1.5 1.5 0 01-.621 1.22l-4.875 3.046a1.5 1.5 0 01-1.627.023L4.5 13.5m15-5.25l-4.875-2.437" />
            </svg>
          </div>

          {/* Info */}
          <div>
            <p className="text-fp-text font-semibold text-sm">Floor Plan Designer</p>
            {loading ? (
              <p className="text-fp-muted text-xs mt-0.5">Loading...</p>
            ) : stats?.sheets === 0 ? (
              <p className="text-fp-muted text-xs mt-0.5">No floor plans uploaded yet</p>
            ) : (
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-fp-muted text-xs">
                  {stats.sheets} sheet{stats.sheets !== 1 ? 's' : ''}
                </span>
                <span className="text-fp-muted">·</span>
                <span className="text-fp-muted text-xs">
                  {stats.devices} device{stats.devices !== 1 ? 's' : ''} placed
                </span>
                {stats.status && (
                  <>
                    <span className="text-fp-muted">·</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[stats.status]}`}>
                      {stats.status}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Open button */}
        <button
          onClick={() => navigate(`/designer/${proposalId}`)}
          className="flex items-center gap-2 px-4 py-2 bg-fp-brand text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors"
        >
          {stats?.sheets === 0 ? 'Start Drawing' : 'Open in Designer'}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
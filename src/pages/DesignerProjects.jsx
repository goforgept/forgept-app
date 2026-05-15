import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

// ─── DesignerProjects ─────────────────────────────────────────────────────────
// Entry point for full ForgePt users accessing Designer from Sidebar.
// Shows all proposals that have drawing sheets, plus quick access to start
// a new drawing on any proposal.
export default function DesignerProjects({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, featureSla, featureMonitoring, featureDrawingTool, featureDesignerOnly, role, isSalesManager, isPM, isTechnician }) {
  const navigate = useNavigate()
  const [projects, setProjects]   = useState([])
  const [proposals, setProposals] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all') // 'all' | 'active' | 'draft' | 'approved'

  useEffect(() => {
    load()
  }, [])

  const handleNewProject = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()

      // Create a minimal proposal for designer-only users
      const { data: proposal, error } = await supabase
        .from('proposals')
        .insert({
          org_id:        profile.org_id,
          proposal_name: `Project ${new Date().toLocaleDateString()}`,
          status:        'Draft',
          user_id:       user.id,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Failed to create project:', error)
        return
      }
      if (proposal) navigate(`/designer/${proposal.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      // Load all drawing sheets with proposal info
      const { data: sheets } = await supabase
        .from('drawing_sheets')
        .select('id, name, status, proposal_id, sort_order, created_at, last_activity_at')
        .eq('org_id', profile.org_id)
        .order('last_activity_at', { ascending: false })

      // Load all proposals for this org (for "start new drawing" list)
      const { data: allProposals } = await supabase
        .from('proposals')
        .select('id, proposal_name, company, client_name, status, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })

      setProposals(allProposals || [])

      // Group sheets by proposal_id
      const grouped = {}
      ;(sheets || []).forEach(sheet => {
        const key = sheet.proposal_id || 'standalone'
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(sheet)
      })

      // Build project list with proposal metadata
      const projectList = await Promise.all(
        Object.entries(grouped).map(async ([proposalId, sheetList]) => {
          let proposalData = null
          if (proposalId !== 'standalone') {
            proposalData = allProposals?.find(p => p.id === proposalId)
          }

          // Get device count for this proposal's sheets
          const { count } = await supabase
            .from('drawing_placements')
            .select('id', { count: 'exact', head: true })
            .in('drawing_sheet_id', sheetList.map(s => s.id))

          const allApproved = sheetList.every(s => s.status === 'approved')
          const anyDraft    = sheetList.some(s => s.status === 'draft')

          return {
            proposalId,
            proposal: proposalData,
            sheets:   sheetList,
            devices:  count || 0,
            status:   allApproved ? 'approved' : anyDraft ? 'draft' : 'revised',
            lastActivity: sheetList[0]?.last_activity_at || sheetList[0]?.created_at,
          }
        })
      )

      // Sort by last activity
      projectList.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      setProjects(projectList)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Proposals without drawings yet
  const proposalsWithoutDrawings = proposals.filter(
    p => !projects.find(proj => proj.proposalId === p.id)
  )

  const filtered = projects.filter(p => {
    const name = p.proposal?.proposal_name || p.proposal?.company || 'Standalone Project'
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || p.status === filter
    return matchesSearch && matchesFilter
  })

  const statusBadge = {
    approved: 'bg-green-900/40 text-green-400',
    draft:    'bg-yellow-900/40 text-yellow-400',
    revised:  'bg-blue-900/40 text-blue-400',
  }

  const statusLabel = {
    approved: 'Approved',
    draft:    'Draft',
    revised:  'Revised',
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar
        isAdmin={isAdmin}
        featureProposals={featureProposals}
        featureCRM={featureCRM}
        featurePurchaseOrders={featurePurchaseOrders}
        featureInvoices={featureInvoices}
        featureSla={featureSla}
        featureMonitoring={featureMonitoring}
        featureDrawingTool={featureDrawingTool}
        featureDesignerOnly={featureDesignerOnly}
        role={role}
        isSalesManager={isSalesManager}
        isPM={isPM}
        isTechnician={isTechnician}
      />

      <div className="flex-1 p-6 overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold flex items-center gap-2">
              <span className="text-[#C8622A]">📐</span>
              ForgePt Designer
            </h1>
            <p className="text-[#8A9AB0] text-sm mt-1">
              Floor plan design and device takeoff tool
            </p>
          </div>
          <button onClick={handleNewProject}
            className="flex items-center gap-2 px-4 py-2 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            New Project
          </button>
        </div>

        {/* Search and filter */}
        <div className="flex items-center gap-3 mb-6">
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
          />
          <div className="flex items-center gap-1 bg-[#1a2d45] border border-[#2a3d55] rounded-lg p-1">
            {['all', 'draft', 'approved'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                  filter === f ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <span className="text-[#8A9AB0] text-sm">Loading projects...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Active drawing projects */}
            {filtered.length > 0 && (
              <div className="mb-8">
                <h2 className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">
                  Drawing Projects ({filtered.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map(project => (
                    <div
                      key={project.proposalId}
                      onClick={() => navigate(`/designer/${project.proposalId}`)}
                      className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-4 cursor-pointer hover:border-[#C8622A]/40 hover:bg-[#1a2d45]/80 transition-all group"
                    >
                      {/* Project name */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">
                            {project.proposal?.proposal_name || project.proposal?.company || 'Standalone Project'}
                          </p>
                          {project.proposal?.company && project.proposal?.proposal_name && (
                            <p className="text-[#8A9AB0] text-xs truncate mt-0.5">
                              {project.proposal.company}
                            </p>
                          )}
                        </div>
                        <span className={`ml-2 flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${statusBadge[project.status]}`}>
                          {statusLabel[project.status]}
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs text-[#8A9AB0] mb-3">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                          {project.sheets.length} sheet{project.sheets.length !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                          </svg>
                          {project.devices} device{project.devices !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Sheet list */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {project.sheets.slice(0, 3).map(sheet => (
                          <span key={sheet.id} className="text-xs bg-[#0F1C2E] text-[#8A9AB0] px-2 py-0.5 rounded border border-[#2a3d55]">
                            {sheet.name}
                          </span>
                        ))}
                        {project.sheets.length > 3 && (
                          <span className="text-xs text-[#8A9AB0]">
                            +{project.sheets.length - 3} more
                          </span>
                        )}
                      </div>

                      {/* Last activity */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8A9AB0]">
                          {project.lastActivity
                            ? `Updated ${new Date(project.lastActivity).toLocaleDateString()}`
                            : 'No activity yet'}
                        </span>
                        <span className="text-[#C8622A] text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Open
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                          </svg>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proposals without drawings */}
            {proposalsWithoutDrawings.length > 0 && (
              <div>
                <h2 className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">
                  Start a New Drawing
                </h2>
                <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium text-xs">Proposal</th>
                        <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium text-xs">Client</th>
                        <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium text-xs">Status</th>
                        <th className="px-4 py-3"/>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a3d55]/50">
                      {proposalsWithoutDrawings.slice(0, 10).map(proposal => (
                        <tr key={proposal.id} className="hover:bg-[#0F1C2E]/50 transition-colors">
                          <td className="px-4 py-3 text-white font-medium">
                            {proposal.proposal_name || '—'}
                          </td>
                          <td className="px-4 py-3 text-[#8A9AB0]">
                            {proposal.company || proposal.client_name || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-[#2a3d55] text-[#8A9AB0] px-2 py-0.5 rounded">
                              {proposal.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => navigate(`/designer/${proposal.id}`)}
                              className="text-xs text-[#C8622A] hover:text-white font-semibold transition-colors flex items-center gap-1 ml-auto"
                            >
                              Start Drawing
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state */}
            {filtered.length === 0 && proposalsWithoutDrawings.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#1a2d45] flex items-center justify-center mb-4">
                  <span className="text-3xl">📐</span>
                </div>
                <p className="text-white font-semibold text-lg">No drawings yet</p>
                <p className="text-[#8A9AB0] text-sm mt-2 max-w-sm">
                  Open a proposal and click "Open in Designer" to start your first floor plan drawing.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
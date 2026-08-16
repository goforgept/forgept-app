import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function SLDProjects({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, featureSla, featureMonitoring, featureDrawingTool, featureDesignerOnly, role, isSalesManager, isPM, isTechnician }) {
  const navigate = useNavigate()
  const [diagrams, setDiagrams] = useState([])
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

      const [{ data: sldData }, { data: proposalData }] = await Promise.all([
        supabase
          .from('sld_diagrams')
          .select(`
            id, name, proposal_id, created_at, updated_at,
            sld_sheets(id, name)
          `)
          .eq('org_id', profile.org_id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('proposals')
          .select('id, proposal_name, company, client_name, status')
          .eq('org_id', profile.org_id)
          .is('archived_at', null)
          .order('created_at', { ascending: false }),
      ])

      setDiagrams(sldData || [])
      setProposals(proposalData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleNew = async (proposalId = null) => {
    if (creating) return
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

      const proposal = proposalId ? proposals.find(p => p.id === proposalId) : null
      const name = proposal ? (proposal.proposal_name || proposal.company || 'Untitled') : 'New Diagram'

      const { data: diagram, error } = await supabase
        .from('sld_diagrams')
        .insert({ org_id: profile.org_id, proposal_id: proposalId, name })
        .select('id')
        .single()
      if (error) throw error

      // Create default first sheet
      await supabase.from('sld_sheets').insert({ diagram_id: diagram.id, name: 'Sheet 1', sort_order: 0 })

      navigate(`/sld/${diagram.id}`)
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const linkedIds = new Set(diagrams.map(d => d.proposal_id).filter(Boolean))
  const proposalsWithout = proposals.filter(p => !linkedIds.has(p.id))

  const filtered = diagrams.filter(d => {
    const proposal = proposals.find(p => p.id === d.proposal_id)
    const name = d.name || proposal?.proposal_name || proposal?.company || 'Untitled'
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="flex min-h-screen bg-fp-inset">
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
            <h1 className="text-fp-text text-2xl font-bold flex items-center gap-2">
              <span className="text-[#C8622A]">⚡</span>
              Single Line Diagrams
            </h1>
            <p className="text-fp-muted text-sm mt-1">
              Wiring and connection topology diagrams
            </p>
          </div>
          <button
            onClick={() => handleNew()}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-fp-brand text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            New Diagram
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search diagrams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <svg className="w-8 h-8 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        ) : (
          <>
            {/* Existing diagrams */}
            {filtered.length > 0 && (
              <div className="mb-8">
                <h2 className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">
                  Diagrams ({filtered.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map(diagram => {
                    const proposal = proposals.find(p => p.id === diagram.proposal_id)
                    return (
                      <div
                        key={diagram.id}
                        onClick={() => navigate(`/sld/${diagram.id}`)}
                        className="bg-fp-card border border-fp-border rounded-xl p-4 cursor-pointer hover:border-fp-brand/40 hover:bg-fp-card/80 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-fp-text font-semibold text-sm truncate">
                              {diagram.name}
                            </p>
                            {proposal && (
                              <p className="text-fp-muted text-xs truncate mt-0.5">
                                {proposal.proposal_name || proposal.company}
                              </p>
                            )}
                          </div>
                          <span className="ml-2 flex-shrink-0 w-8 h-8 rounded-lg bg-fp-inset flex items-center justify-center text-base">
                            ⚡
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-fp-muted mb-3">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                            {diagram.sld_sheets?.length || 0} sheet{(diagram.sld_sheets?.length || 0) !== 1 ? 's' : ''}
                          </span>
                          <span className="text-fp-muted">
                            {new Date(diagram.updated_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(diagram.sld_sheets || []).slice(0, 3).map(sheet => (
                            <span key={sheet.id} className="text-xs bg-fp-inset text-fp-muted px-2 py-0.5 rounded border border-fp-border">
                              {sheet.name}
                            </span>
                          ))}
                          {(diagram.sld_sheets?.length || 0) > 3 && (
                            <span className="text-xs text-fp-muted">+{diagram.sld_sheets.length - 3} more</span>
                          )}
                        </div>

                        <div className="flex items-center justify-end mt-3">
                          <span className="text-[#C8622A] text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            Open
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                            </svg>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Link to a proposal */}
            {proposalsWithout.length > 0 && (
              <div>
                <h2 className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">
                  Create Diagram for Proposal
                </h2>
                <div className="bg-fp-card border border-fp-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-fp-border">
                        <th className="text-left px-4 py-3 text-fp-muted font-medium text-xs">Proposal</th>
                        <th className="text-left px-4 py-3 text-fp-muted font-medium text-xs">Client</th>
                        <th className="text-left px-4 py-3 text-fp-muted font-medium text-xs">Status</th>
                        <th className="px-4 py-3"/>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fp-border/50">
                      {proposalsWithout.slice(0, 10).map(proposal => (
                        <tr key={proposal.id} className="hover:bg-fp-inset/50 transition-colors">
                          <td className="px-4 py-3 text-fp-text font-medium">{proposal.proposal_name || '—'}</td>
                          <td className="px-4 py-3 text-fp-muted">{proposal.company || proposal.client_name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-fp-inset text-fp-muted px-2 py-0.5 rounded">{proposal.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleNew(proposal.id)}
                              disabled={creating}
                              className="text-xs text-[#C8622A] hover:text-fp-text font-semibold transition-colors flex items-center gap-1 ml-auto disabled:opacity-50"
                            >
                              Create SLD
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
            {filtered.length === 0 && proposalsWithout.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-fp-card flex items-center justify-center mb-4">
                  <span className="text-3xl">⚡</span>
                </div>
                <p className="text-fp-text font-semibold text-lg">No diagrams yet</p>
                <p className="text-fp-muted text-sm mt-2 max-w-sm">
                  Create your first single line diagram to document wiring and device connections.
                </p>
                <button
                  onClick={() => handleNew()}
                  className="mt-4 px-4 py-2 bg-fp-brand text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors"
                >
                  New Diagram
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

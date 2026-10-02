import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { usePermissions } from '../hooks/usePermissions'

export default function Proposals({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilters, setStatusFilters] = useState(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [closingSoon, setClosingSoon] = useState(false)
  const [sortBy, setSortBy] = useState('newest')
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const navigate = useNavigate()
  const location = useLocation()
  const { canWrite, scope } = usePermissions()

  useEffect(() => {
    fetchOrgAndProposals()

    const params = new URLSearchParams(location.search)
    const status = params.get('status')
    const rep = params.get('rep')

    if (status === 'Won') setStatusFilters(new Set(['Won']))
    else if (status === 'active') setStatusFilters(new Set(['Draft', 'Sent']))
    if (rep) setSearch(rep)
  }, [])

  const fetchOrgAndProposals = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, id, org_role')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }

    let proposalsQuery = supabase
      .from('proposals')
      .select('id,proposal_name,company,client_name,client_id,rep_name,rep_email,industry,status,close_date,proposal_value,subtotal_value,total_gross_margin_percent,created_at,org_id,user_id,quote_number,archived_at,revision_number,is_current_revision,original_proposal_id')
      .eq('org_id', profile.org_id)
      .eq('is_current_revision', true)
      .order('created_at', { ascending: false })
    if (scope('proposals') === 'own') proposalsQuery = proposalsQuery.eq('user_id', profile.id)

    const [{ data, error }, { data: clientRows }] = await Promise.all([
      proposalsQuery,
      supabase.from('clients').select('id,client_type').eq('org_id', profile.org_id)
    ])

    // Build a quick id→client_type map; safe if client_type column doesn't exist yet
    const clientTypeMap = {}
    for (const c of (clientRows || [])) {
      if (c.id) clientTypeMap[c.id] = c.client_type || 'commercial'
    }

    if (!error) setProposals((data || []).map(p => ({ ...p, _clientType: clientTypeMap[p.client_id] || 'commercial' })))
    setLoading(false)
  }

  const archiveProposal = async (e, id) => {
    e.stopPropagation()
    await supabase.from('proposals').update({ archived_at: new Date().toISOString() }).eq('id', id)
    setProposals(prev => prev.map(p => p.id === id ? { ...p, archived_at: new Date().toISOString() } : p))
  }

  const restoreProposal = async (e, id) => {
    e.stopPropagation()
    await supabase.from('proposals').update({ archived_at: null }).eq('id', id)
    setProposals(prev => prev.map(p => p.id === id ? { ...p, archived_at: null } : p))
  }

  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const filtered = proposals
    .filter(p => showArchived ? !!p.archived_at : !p.archived_at)
    .filter(p => {
      if (showArchived) return true
      const isClosed = p.status === 'Won' || p.status === 'Lost'
      // Only apply the 60-day recency cutoff when not explicitly filtering to Won/Lost
      if (isClosed && !statusFilters.has(p.status)) {
        const refDate = new Date(p.close_date || p.created_at)
        if (refDate < sixtyDaysAgo) return false
      }
      if (statusFilters.size === 0) return true
      return statusFilters.has(p.status)
    })
    .filter(p => {
      const urlClosing = new URLSearchParams(location.search).get('closing') === '30'
      if (closingSoon || urlClosing) {
        if (!p.close_date) return false
        const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
        return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
      }
      return true
    })
    .filter(p => {
      if (clientTypeFilter === 'all') return true
      return (p._clientType || 'commercial') === clientTypeFilter
    })
    .filter(p => {
      if (!search) return true
      const s = search.toLowerCase()
      return (
        p.proposal_name?.toLowerCase().includes(s) ||
        p.company?.toLowerCase().includes(s) ||
        p.rep_name?.toLowerCase().includes(s) ||
        p.client_name?.toLowerCase().includes(s) ||
        p.quote_number?.toLowerCase().includes(s)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'close_date') {
        if (!a.close_date) return 1
        if (!b.close_date) return -1
        return new Date(a.close_date) - new Date(b.close_date)
      }
      if (sortBy === 'value') return (b.subtotal_value ?? b.proposal_value ?? 0) - (a.subtotal_value ?? a.proposal_value ?? 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const params = new URLSearchParams(location.search)
  const isClosingFilter = params.get('closing') === '30'

  const totalValue = filtered.reduce((sum, p) => sum + (p.subtotal_value ?? p.proposal_value ?? 0), 0)
  const wonValue = filtered.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.subtotal_value ?? p.proposal_value ?? 0), 0)
  const archivedCount = proposals.filter(p => !!p.archived_at).length

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 min-w-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">
              {showArchived ? 'Archived Proposals' : 'Proposals'}
            </h2>
            {isClosingFilter && (
              <p className="text-[#C8622A] text-sm mt-1">Showing proposals closing in 30 days</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-fp-muted text-sm">{filtered.length} of {proposals.length}</p>
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(v => !v)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  showArchived ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30' : 'bg-fp-card text-fp-muted hover:text-fp-text'
                }`}
              >
                {showArchived ? '← Active' : `Archive (${archivedCount})`}
              </button>
            )}
            {!showArchived && (
              <button
                onClick={() => canWrite('proposals') && navigate('/new')}
                disabled={!canWrite('proposals')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${canWrite('proposals') ? 'bg-fp-brand text-white hover:bg-[#b5571f]' : 'bg-fp-brand/40 text-white/50 cursor-not-allowed'}`}
              >
                + New Proposal
              </button>
            )}
          </div>
        </div>

        {!showArchived && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-fp-card rounded-xl p-4">
              <p className="text-fp-muted text-xs mb-1">Total Value</p>
              <p className="text-fp-text text-xl font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-fp-card rounded-xl p-4">
              <p className="text-fp-muted text-xs mb-1">Won Value</p>
              <p className="text-green-400 text-xl font-bold">${wonValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-fp-card rounded-xl p-4">
              <p className="text-fp-muted text-xs mb-1">Proposals Shown</p>
              <p className="text-fp-text text-xl font-bold">{filtered.length}</p>
            </div>
          </div>
        )}

        <div className="space-y-2 mb-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search by name, company, rep, quote #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-fp-card text-fp-muted border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            >
              <option value="newest">Newest First</option>
              <option value="close_date">Close Date ↑</option>
              <option value="value">Highest Value</option>
            </select>
          </div>
          {!showArchived && (
            <div className="flex gap-2">
              <div className="flex items-center gap-1 bg-fp-card border border-fp-border rounded-lg px-2 py-1">
                {[['all', 'All'], ['commercial', 'Commercial'], ['residential', 'Residential']].map(([val, label]) => (
                  <button key={val} onClick={() => setClientTypeFilter(val)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${clientTypeFilter === val ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[['Draft', 'bg-fp-border/40 text-fp-muted', 'bg-[#2a3d55] text-white border-[#2a3d55]'],
                  ['Sent', 'bg-blue-500/10 text-blue-400 border-blue-500/30', 'bg-blue-500/30 text-blue-300 border-blue-400'],
                  ['Won', 'bg-green-500/10 text-green-400 border-green-500/30', 'bg-green-500/30 text-green-300 border-green-400'],
                  ['Lost', 'bg-red-500/10 text-red-400 border-red-500/30', 'bg-red-500/30 text-red-300 border-red-400'],
                  ['Closing Soon', 'bg-fp-border/40 text-fp-muted', 'bg-orange-500/30 text-orange-300 border-orange-400'],
                ].map(([label, offCls, onCls]) => {
                  const isOn = label === 'Closing Soon' ? closingSoon : statusFilters.has(label)
                  return (
                    <button key={label} onClick={() => {
                      if (label === 'Closing Soon') {
                        setClosingSoon(v => !v)
                      } else {
                        setClosingSoon(false)
                        setStatusFilters(prev => {
                          const next = new Set(prev)
                          next.has(label) ? next.delete(label) : next.add(label)
                          return next
                        })
                      }
                    }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${isOn ? onCls : `border-fp-border ${offCls} hover:text-fp-text`}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-fp-muted">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-fp-muted">{showArchived ? 'No archived proposals.' : 'No proposals match your search.'}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((proposal) => (
              <div
                key={proposal.id}
                onClick={() => navigate(`/proposal/${proposal.id}`)}
                className="group bg-fp-card rounded-xl p-5 flex justify-between items-center cursor-pointer hover:bg-fp-hover transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-fp-text font-semibold">{proposal.proposal_name}</p>
                    {proposal.quote_number && (
                      <span className="text-fp-muted text-xs font-mono bg-fp-inset px-2 py-0.5 rounded">{proposal.quote_number}</span>
                    )}
                    {proposal.revision_number > 1 && (
                      <span className="text-blue-400 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-semibold">Rev {proposal.revision_number}</span>
                    )}
                    {proposal.archived_at && (
                      <span className="text-fp-muted text-xs bg-fp-inset px-2 py-0.5 rounded">Archived</span>
                    )}
                  </div>
                  <p className="text-fp-muted text-sm">{proposal.company} · {proposal.rep_name}</p>
                  <p className="text-fp-muted text-xs">{proposal.rep_email}</p>
                </div>
                <div className="flex items-center gap-4">
                  {(proposal.subtotal_value ?? proposal.proposal_value) > 0 && (
                    <p className="text-fp-text text-sm font-bold">${((proposal.subtotal_value ?? proposal.proposal_value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  )}
                  {proposal.total_gross_margin_percent && (
                    <p className="text-[#C8622A] text-sm font-semibold">{proposal.total_gross_margin_percent.toFixed(1)}%</p>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' :
                    proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
                    proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
                    'bg-fp-muted/20 text-fp-muted'
                  }`}>
                    {proposal.status}
                  </span>
                  <p className="text-fp-muted text-sm">{proposal.close_date}</p>
                  {proposal.archived_at ? (
                    <button
                      onClick={e => canWrite('proposals') && restoreProposal(e, proposal.id)}
                      disabled={!canWrite('proposals')}
                      className={`opacity-0 group-hover:opacity-100 text-xs transition-all ${canWrite('proposals') ? 'text-fp-muted hover:text-green-400' : 'text-fp-muted/40 cursor-not-allowed'}`}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={e => canWrite('proposals') && archiveProposal(e, proposal.id)}
                      disabled={!canWrite('proposals')}
                      className={`opacity-0 group-hover:opacity-100 text-xs transition-all ${canWrite('proposals') ? 'text-fp-muted hover:text-[#C8622A]' : 'text-fp-muted/40 cursor-not-allowed'}`}
                    >
                      Archive
                    </button>
                  )}
                  <span className="text-fp-muted">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

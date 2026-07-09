import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Proposals({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showArchived, setShowArchived] = useState(false)
  const [closingSoon, setClosingSoon] = useState(false)
  const [sortBy, setSortBy] = useState('newest')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    fetchOrgAndProposals()

    const params = new URLSearchParams(location.search)
    const status = params.get('status')
    const rep = params.get('rep')

    if (status === 'Won') setStatusFilter('Won')
    else if (status === 'active') setStatusFilter('Active')
    if (rep) setSearch(rep)
  }, [])

  const fetchOrgAndProposals = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }

    const { data, error } = await supabase
      .from('proposals')
      .select('id,proposal_name,company,client_name,client_id,rep_name,rep_email,industry,status,close_date,proposal_value,total_gross_margin_percent,created_at,org_id,user_id,quote_number,archived_at,revision_number,is_current_revision,original_proposal_id')
      .eq('org_id', profile.org_id)
      .eq('is_current_revision', true)
      .order('created_at', { ascending: false })

    if (!error) setProposals(data)
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
      if (isClosed) {
        const refDate = new Date(p.close_date || p.created_at)
        if (refDate < sixtyDaysAgo) return false
      }
      if (statusFilter === 'All') return true
      if (statusFilter === 'Active') return !isClosed
      return p.status === statusFilter
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
      if (sortBy === 'value') return (b.proposal_value || 0) - (a.proposal_value || 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const params = new URLSearchParams(location.search)
  const isClosingFilter = params.get('closing') === '30'

  const totalValue = filtered.reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const wonValue = filtered.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const archivedCount = proposals.filter(p => !!p.archived_at).length

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6">
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
                onClick={() => navigate('/new')}
                className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
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
            <div className="flex gap-2 flex-wrap">
              {['All', 'Active', 'Draft', 'Sent', 'Won', 'Lost'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    statusFilter === s ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => setClosingSoon(v => !v)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  closingSoon || isClosingFilter ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text'
                }`}
              >
                Closing Soon
              </button>
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
                  {proposal.proposal_value > 0 && (
                    <p className="text-fp-text text-sm font-bold">${(proposal.proposal_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                      onClick={e => restoreProposal(e, proposal.id)}
                      className="opacity-0 group-hover:opacity-100 text-fp-muted hover:text-green-400 text-xs transition-all"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={e => archiveProposal(e, proposal.id)}
                      className="opacity-0 group-hover:opacity-100 text-fp-muted hover:text-[#C8622A] text-xs transition-all"
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

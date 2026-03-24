import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Dashboard() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [orgId, setOrgId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchOrgAndProposals()
  }, [])

  const fetchOrgAndProposals = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)

    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (!error) setProposals(data)
    setLoading(false)
  }

  const markAsSent = async (proposalId) => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', proposalId)
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'Sent' } : p))
  }

  const filtered = proposals
    .filter(p => statusFilter === 'All' || p.status === statusFilter)
    .filter(p => {
      if (!search) return true
      const s = search.toLowerCase()
      return (
        p.proposal_name?.toLowerCase().includes(s) ||
        p.company?.toLowerCase().includes(s) ||
        p.client_name?.toLowerCase().includes(s)
      )
    })

  const activePipeline = proposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = proposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const closingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).length

  const avgMargin = proposals.filter(p => p.total_gross_margin_percent).length > 0
    ? (proposals.reduce((sum, p) => sum + (p.total_gross_margin_percent || 0), 0) / proposals.filter(p => p.total_gross_margin_percent).length).toFixed(1)
    : null

  // Labor forecast
  const laborQuoted = proposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)

  const laborWon = proposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)

  const laborClosingSoon = proposals
    .filter(p => {
      if (!p.close_date) return false
      const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
      return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
    })
    .reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)

  const hoursQuoted = proposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)

  const hoursWon = proposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)

  const hoursClosingSoon = proposals
    .filter(p => {
      if (!p.close_date) return false
      const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
      return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
    })
    .reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)

  // Proposals stuck in Draft for 3+ days
  const needsAttention = proposals.filter(p => {
    if (p.status !== 'Draft') return false
    const daysSinceCreated = Math.floor((new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24))
    return daysSinceCreated >= 3
  }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={false} featureProposals={true} featureCRM={true} />

      <div className="flex-1 p-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Active Pipeline</p>
            <p className="text-white text-2xl font-bold">${activePipeline.toLocaleString()}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Won Pipeline</p>
            <p className="text-green-400 text-2xl font-bold">${wonPipeline.toLocaleString()}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Avg Margin</p>
            <p className="text-[#C8622A] text-2xl font-bold">{avgMargin ? `${avgMargin}%` : '—'}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Closing in 30 Days</p>
            <p className="text-[#C8622A] text-2xl font-bold">{closingSoon}</p>
          </div>
        </div>

        {/* Needs Attention — only shows when there are stale drafts */}
        {!loading && needsAttention.length > 0 && (
          <div className="bg-[#1a2d45] border border-yellow-500/30 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <h3 className="text-yellow-400 font-bold text-sm">Needs Attention — {needsAttention.length} draft{needsAttention.length > 1 ? 's' : ''} not yet sent</h3>
            </div>
            <div className="space-y-2">
              {needsAttention.map(p => {
                const daysSince = Math.floor((new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24))
                return (
                  <div key={p.id} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/proposal/${p.id}`)}
                    >
                      <p className="text-white text-sm font-medium">{p.proposal_name}</p>
                      <p className="text-[#8A9AB0] text-xs">
                        {p.company} · Created {daysSince} day{daysSince !== 1 ? 's' : ''} ago
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <p className="text-white text-sm font-semibold">
                        ${(p.proposal_value || 0).toLocaleString()}
                      </p>
                      <button
                        onClick={() => markAsSent(p.id)}
                        className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors whitespace-nowrap"
                      >
                        Mark as Sent
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Labor Forecast */}
        {!loading && (laborQuoted > 0 || laborWon > 0) && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="mb-4">
              <h3 className="text-white font-bold text-lg">Labor Forecast</h3>
              <p className="text-[#8A9AB0] text-xs mt-0.5">Plan your crew and backlog</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">Total Labor Quoted</p>
                <p className="text-white text-xl font-bold">${laborQuoted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursQuoted.toLocaleString()} hrs</p>
                <p className="text-[#8A9AB0] text-xs">Active pipeline</p>
              </div>
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">Total Labor Won</p>
                <p className="text-green-400 text-xl font-bold">${laborWon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursWon.toLocaleString()} hrs</p>
                <p className="text-[#8A9AB0] text-xs">Confirmed backlog</p>
              </div>
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">Closing in 30 Days</p>
                <p className="text-[#C8622A] text-xl font-bold">${laborClosingSoon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursClosingSoon.toLocaleString()} hrs</p>
                <p className="text-[#8A9AB0] text-xs">Plan ahead</p>
              </div>
            </div>
          </div>
        )}

        {/* Proposals header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-2xl font-bold">Proposals</h2>
          <div className="flex items-center gap-4">
            <p className="text-[#8A9AB0] text-sm">{filtered.length} of {proposals.length}</p>
            <button
              onClick={() => navigate('/new')}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
              + New Proposal
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
          />
          <div className="flex gap-2">
            {['All', 'Draft', 'Sent', 'Won', 'Lost'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  statusFilter === s
                    ? 'bg-[#C8622A] text-white'
                    : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Proposal list */}
        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#8A9AB0]">No proposals yet. Click + New Proposal to get started.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((proposal) => (
              <div
                key={proposal.id}
                onClick={() => navigate(`/proposal/${proposal.id}`)}
                className="bg-[#1a2d45] rounded-xl p-5 flex justify-between items-center cursor-pointer hover:bg-[#1f3550] transition-colors"
              >
                <div>
                  <p className="text-white font-semibold">{proposal.proposal_name}</p>
                  <p className="text-[#8A9AB0] text-sm">{proposal.company} · {proposal.rep_name}</p>
                </div>
                <div className="flex items-center gap-4">
                  {proposal.total_gross_margin_percent && (
                    <p className="text-[#C8622A] text-sm font-semibold">{proposal.total_gross_margin_percent.toFixed(1)}%</p>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' :
                    proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
                    proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
                    'bg-[#8A9AB0]/20 text-[#8A9AB0]'
                  }`}>
                    {proposal.status}
                  </span>
                  <p className="text-[#8A9AB0] text-sm">{proposal.close_date}</p>
                  <span className="text-[#8A9AB0]">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
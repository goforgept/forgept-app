import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Proposals({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
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
      .select('id,proposal_name,company,client_name,client_id,rep_name,rep_email,industry,status,close_date,proposal_value,total_gross_margin_percent,created_at,org_id,user_id,quote_number')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (!error) setProposals(data)
    setLoading(false)
  }

  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const filtered = proposals
    .filter(p => {
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
      const params = new URLSearchParams(location.search)
      if (params.get('closing') === '30') {
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

  const params = new URLSearchParams(location.search)
  const isClosingFilter = params.get('closing') === '30'

  const totalValue = filtered.reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const wonValue = filtered.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-white text-2xl font-bold">Proposals</h2>
            {isClosingFilter && (
              <p className="text-[#C8622A] text-sm mt-1">Showing proposals closing in 30 days</p>
            )}
          </div>
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

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Total Value</p>
            <p className="text-white text-xl font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Won Value</p>
            <p className="text-green-400 text-xl font-bold">${wonValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Proposals Shown</p>
            <p className="text-white text-xl font-bold">{filtered.length}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, company, rep, quote #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
          />
          <div className="flex gap-2">
            {['All', 'Active', 'Draft', 'Sent', 'Won', 'Lost'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#8A9AB0]">No proposals match your search.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((proposal) => (
              <div
                key={proposal.id}
                onClick={() => navigate(`/proposal/${proposal.id}`)}
                className="bg-[#1a2d45] rounded-xl p-5 flex justify-between items-center cursor-pointer hover:bg-[#1f3550] transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">{proposal.proposal_name}</p>
                    {proposal.quote_number && (
                      <span className="text-[#8A9AB0] text-xs font-mono bg-[#2a3d55] px-2 py-0.5 rounded">{proposal.quote_number}</span>
                    )}
                  </div>
                  <p className="text-[#8A9AB0] text-sm">{proposal.company} · {proposal.rep_name}</p>
                  <p className="text-[#8A9AB0] text-xs">{proposal.rep_email}</p>
                </div>
                <div className="flex items-center gap-4">
                  {proposal.proposal_value > 0 && (
                    <p className="text-white text-sm font-bold">${(proposal.proposal_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  )}
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
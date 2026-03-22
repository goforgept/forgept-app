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

    // Read URL params from dashboard clicks
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
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (!error) setProposals(data)
    setLoading(false)
  }

  const filtered = proposals
    .filter(p => {
      if (statusFilter === 'All') return true
      if (statusFilter === 'Active') return p.status !== 'Won' && p.status !== 'Lost'
      return p.status === statusFilter
    })
    .filter(p => {
      // Check closing in 30 days filter
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
        p.client_name?.toLowerCase().includes(s)
      )
    })

  const params = new URLSearchParams(location.search)
  const isClosingFilter = params.get('closing') === '30'

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

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, company, rep..."
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
                  <p className="text-white font-semibold">{proposal.proposal_name}</p>
                  <p className="text-[#8A9AB0] text-sm">{proposal.company} · {proposal.rep_name}</p>
                  <p className="text-[#8A9AB0] text-xs">{proposal.rep_email}</p>
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

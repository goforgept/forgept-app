import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Proposals({ isAdmin }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const navigate = useNavigate()

  useEffect(() => {
    fetchProposals()
  }, [])

  const fetchProposals = async () => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setProposals(data)
    setLoading(false)
  }

  const filtered = proposals
    .filter(p => statusFilter === 'All' || p.status === statusFilter)
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

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
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

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, company, rep..."
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
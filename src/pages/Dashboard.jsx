import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Dashboard() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      {/* Header */}
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <button
          onClick={handleSignOut}
          className="text-[#8A9AB0] hover:text-white text-sm transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        <h2 className="text-white text-2xl font-bold mb-6">Proposals</h2>

        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : proposals.length === 0 ? (
          <p className="text-[#8A9AB0]">No proposals yet.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="bg-[#1a2d45] rounded-xl p-5 flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold">{proposal.proposal_name}</p>
                  <p className="text-[#8A9AB0] text-sm">{proposal.company} · {proposal.rep_name}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' :
                    proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
                    proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
                    'bg-[#8A9AB0]/20 text-[#8A9AB0]'
                  }`}>
                    {proposal.status}
                  </span>
                  <p className="text-[#8A9AB0] text-sm">{proposal.close_date}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

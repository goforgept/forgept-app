import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function ClientDetail({ isAdmin }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClient()
    fetchProposals()
  }, [])

  const fetchClient = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()
    setClient(data)
  }

  const fetchProposals = async () => {
    const { data } = await supabase
      .from('proposals')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    setProposals(data || [])
    setLoading(false)
  }

  const handleNewProposal = () => {
    navigate(`/new?clientId=${id}`)
  }

  const totalPipeline = proposals
    .filter(p => p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = proposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        {/* Client Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <button
                  onClick={() => navigate('/clients')}
                  className="text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  ← Clients
                </button>
              </div>
              <h2 className="text-white text-2xl font-bold">{client?.company}</h2>
              <p className="text-[#8A9AB0] mt-1">{client?.client_name} · {client?.email}</p>
              <p className="text-[#8A9AB0] text-sm">{client?.phone} · {client?.industry}</p>
            </div>
            <button
              onClick={handleNewProposal}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
              + New Proposal
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            <div>
              <p className="text-[#8A9AB0] text-xs">Total Proposals</p>
              <p className="text-white text-xl font-bold">{proposals.length}</p>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Total Pipeline</p>
              <p className="text-white text-xl font-bold">${fmt(totalPipeline)}</p>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Won Pipeline</p>
              <p className="text-green-400 text-xl font-bold">${fmt(wonPipeline)}</p>
            </div>
          </div>
        </div>

        {/* Proposals */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">Proposals ({proposals.length})</h3>
          {proposals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[#8A9AB0] mb-4">No proposals yet for this client.</p>
              <button
                onClick={handleNewProposal}
                className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
              >
                + Create First Proposal
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map(proposal => (
                <div
                  key={proposal.id}
                  onClick={() => navigate(`/proposal/${proposal.id}`)}
                  className="flex justify-between items-center bg-[#0F1C2E] rounded-lg p-4 cursor-pointer hover:bg-[#0a1628] transition-colors"
                >
                  <div>
                    <p className="text-white font-semibold">{proposal.proposal_name}</p>
                    <p className="text-[#8A9AB0] text-sm">{proposal.rep_name} · {proposal.industry}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {proposal.total_gross_margin_percent && (
                      <p className="text-[#C8622A] text-sm font-semibold">
                        {proposal.total_gross_margin_percent.toFixed(1)}%
                      </p>
                    )}
                    <p className="text-white text-sm font-semibold">
                      ${(proposal.proposal_value || 0).toLocaleString()}
                    </p>
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

        {/* Client Notes */}
        {client?.notes && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-3">Notes</h3>
            <p className="text-[#8A9AB0] text-sm">{client.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
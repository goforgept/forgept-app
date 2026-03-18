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
  const [editingClient, setEditingClient] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [savingClient, setSavingClient] = useState(false)
  const [activeTab, setActiveTab] = useState('proposals')

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
    setEditForm(data || {})
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

  const saveClient = async () => {
    setSavingClient(true)
    await supabase.from('clients').update({
      company: editForm.company,
      client_name: editForm.client_name,
      email: editForm.email,
      phone: editForm.phone,
      industry: editForm.industry,
      address: editForm.address,
      city: editForm.city,
      state: editForm.state,
      zip: editForm.zip,
      notes: editForm.notes,
    }).eq('id', id)
    await fetchClient()
    setEditingClient(false)
    setSavingClient(false)
  }

  const handleNewProposal = () => navigate(`/new?clientId=${id}`)

  const totalPipeline = proposals
    .filter(p => p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = proposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const winRate = proposals.length > 0
    ? Math.round((proposals.filter(p => p.status === 'Won').length / proposals.length) * 100)
    : 0

  const avgDeal = proposals.length > 0
    ? proposals.reduce((sum, p) => sum + (p.proposal_value || 0), 0) / proposals.length
    : 0

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'

  const fullAddress = [client?.address, client?.city, client?.state, client?.zip]
    .filter(Boolean).join(', ')

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-xl bg-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[#C8622A] text-xl font-bold">
                  {(client?.company || client?.client_name || '?')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => navigate('/clients')}
                    className="text-[#8A9AB0] hover:text-white text-xs transition-colors"
                  >
                    ← Clients
                  </button>
                </div>
                <h2 className="text-white text-2xl font-bold">{client?.company}</h2>
                <p className="text-[#8A9AB0] mt-0.5">{client?.client_name}</p>
                {fullAddress && (
                  <p className="text-[#8A9AB0] text-sm mt-0.5">{fullAddress}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingClient(true)}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
              >
                Edit Client
              </button>
              <button
                onClick={handleNewProposal}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
              >
                + New Proposal
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-5 gap-4 mt-6">
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Proposals</p>
              <p className="text-white text-xl font-bold">{proposals.length}</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Pipeline</p>
              <p className="text-white text-xl font-bold">${fmt(totalPipeline)}</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Won Revenue</p>
              <p className="text-green-400 text-xl font-bold">${fmt(wonPipeline)}</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Win Rate</p>
              <p className="text-white text-xl font-bold">{winRate}%</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Avg Deal</p>
              <p className="text-white text-xl font-bold">${fmt(avgDeal)}</p>
            </div>
          </div>
        </div>

        {/* Contact info strip */}
        <div className="bg-[#1a2d45] rounded-xl px-6 py-4 flex gap-8 flex-wrap">
          {client?.email && (
            <div className="flex items-center gap-2">
              <span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Email</span>
              <a href={`mailto:${client.email}`} className="text-[#C8622A] text-sm hover:underline">
                {client.email}
              </a>
            </div>
          )}
          {client?.phone && (
            <div className="flex items-center gap-2">
              <span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Phone</span>
              <a href={`tel:${client.phone}`} className="text-white text-sm hover:text-[#C8622A] transition-colors">
                {client.phone}
              </a>
            </div>
          )}
          {client?.industry && (
            <div className="flex items-center gap-2">
              <span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Industry</span>
              <span className="text-white text-sm">{client.industry}</span>
            </div>
          )}
          {fullAddress && (
            <div className="flex items-center gap-2">
              <span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Address</span>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`}
                target="_blank"
                rel="noreferrer"
                className="text-white text-sm hover:text-[#C8622A] transition-colors"
              >
                {fullAddress}
              </a>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {['proposals', 'notes'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                activeTab === t ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
              }`}
            >
              {t === 'proposals' ? `Proposals (${proposals.length})` : 'Notes'}
            </button>
          ))}
        </div>

        {/* Proposals tab */}
        {activeTab === 'proposals' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
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
                    className="flex justify-between items-center bg-[#0F1C2E] rounded-lg p-4 cursor-pointer hover:bg-[#0a1628] transition-colors group"
                  >
                    <div>
                      <p className="text-white font-semibold group-hover:text-[#C8622A] transition-colors">
                        {proposal.proposal_name}
                      </p>
                      <p className="text-[#8A9AB0] text-sm mt-0.5">
                        {proposal.rep_name} · {proposal.industry}
                        {proposal.close_date && ` · Close: ${proposal.close_date}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {proposal.total_gross_margin_percent != null && (
                        <div className="text-right">
                          <p className="text-[#8A9AB0] text-xs">Margin</p>
                          <p className="text-[#C8622A] text-sm font-semibold">
                            {proposal.total_gross_margin_percent.toFixed(1)}%
                          </p>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-[#8A9AB0] text-xs">Value</p>
                        <p className="text-white text-sm font-bold">
                          ${(proposal.proposal_value || 0).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' :
                        proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
                        proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
                        'bg-[#8A9AB0]/20 text-[#8A9AB0]'
                      }`}>
                        {proposal.status}
                      </span>
                      <span className="text-[#8A9AB0] group-hover:text-white transition-colors">→</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes tab */}
        {activeTab === 'notes' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Notes</h3>
              {!editingClient && (
                <button
                  onClick={() => setEditingClient(true)}
                  className="text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {client?.notes ? (
              <p className="text-[#8A9AB0] text-sm leading-relaxed whitespace-pre-wrap">{client.notes}</p>
            ) : (
              <p className="text-[#8A9AB0] text-sm italic">No notes yet. Click Edit Client to add notes.</p>
            )}
          </div>
        )}

      </div>

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">Edit Client</h3>
            <div className="space-y-4">

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Company</label>
                  <input
                    type="text"
                    value={editForm.company || ''}
                    onChange={e => setEditForm(p => ({ ...p, company: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Contact Name</label>
                  <input
                    type="text"
                    value={editForm.client_name || ''}
                    onChange={e => setEditForm(p => ({ ...p, client_name: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                  <input
                    type="email"
                    value={editForm.email || ''}
                    onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone || ''}
                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                  <select
                    value={editForm.industry || ''}
                    onChange={e => setEditForm(p => ({ ...p, industry: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  >
                    <option value="">Select industry</option>
                    {['Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security', 'General Contractor', 'Other'].map(i => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Address fields */}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                <input
                  type="text"
                  placeholder="123 Main St"
                  value={editForm.address || ''}
                  onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">City</label>
                  <input
                    type="text"
                    placeholder="Nashville"
                    value={editForm.city || ''}
                    onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">State</label>
                  <input
                    type="text"
                    placeholder="TN"
                    value={editForm.state || ''}
                    onChange={e => setEditForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label>
                  <input
                    type="text"
                    placeholder="37201"
                    value={editForm.zip || ''}
                    onChange={e => setEditForm(p => ({ ...p, zip: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Notes</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any notes about this client..."
                  rows={4}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingClient(false)}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveClient}
                  disabled={savingClient}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                >
                  {savingClient ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
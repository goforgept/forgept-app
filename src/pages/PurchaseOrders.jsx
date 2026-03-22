import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function PurchaseOrders({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const navigate = useNavigate()

  useEffect(() => {
    fetchPOs()
  }, [])

  const fetchPOs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }

    const { data } = await supabase
      .from('purchase_orders')
      .select('*, proposals(proposal_name, company)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    setPOs(data || [])
    setLoading(false)
  }

  const updateStatus = async (poId, status) => {
    await supabase
      .from('purchase_orders')
      .update({ status })
      .eq('id', poId)
    fetchPOs()
  }

  const filtered = pos.filter(p => statusFilter === 'All' || p.status === statusFilter)

  const totalSent = pos.reduce((sum, p) => sum + (p.total_amount || 0), 0)
  const totalReceived = pos
    .filter(p => p.status === 'Received')
    .reduce((sum, p) => sum + (p.total_amount || 0), 0)
  const pendingCount = pos.filter(p => p.status === 'Sent' || p.status === 'Partial').length

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">
        <h2 className="text-white text-2xl font-bold">Purchase Orders</h2>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Total PO Value</p>
            <p className="text-white text-2xl font-bold">
              ${totalSent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Received</p>
            <p className="text-green-400 text-2xl font-bold">
              ${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Pending</p>
            <p className="text-yellow-400 text-2xl font-bold">{pendingCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {['All', 'Sent', 'Partial', 'Received', 'Cancelled'].map(s => (
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

        {/* PO Table */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">All Purchase Orders ({filtered.length})</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-[#8A9AB0]">No purchase orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['PO Number', 'Vendor', 'Project', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(po => (
                    <tr key={po.id} className="border-b border-[#2a3d55]/30">
                      <td className="text-white py-3 pr-4 font-medium">{po.po_number}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{po.vendor_name}</td>
                      <td
                        className="text-[#8A9AB0] py-3 pr-4 cursor-pointer hover:text-white transition-colors"
                        onClick={() => navigate(`/proposal/${po.proposal_id}`)}
                      >
                        {po.proposals?.proposal_name || '—'}
                      </td>
                      <td className="text-white py-3 pr-4">
                        ${(po.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          po.status === 'Received' ? 'bg-green-500/20 text-green-400' :
                          po.status === 'Partial' ? 'bg-yellow-500/20 text-yellow-400' :
                          po.status === 'Cancelled' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="text-[#8A9AB0] py-3 pr-4">
                        {new Date(po.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <select
                          value={po.status}
                          onChange={e => updateStatus(po.id, e.target.value)}
                          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        >
                          {['Sent', 'Partial', 'Received', 'Cancelled'].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
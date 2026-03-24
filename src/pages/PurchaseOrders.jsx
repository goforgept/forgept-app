import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function PurchaseOrders({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [expandedPO, setExpandedPO] = useState(null)
  const [lineItems, setLineItems] = useState({})
  const [savingReceiving, setSavingReceiving] = useState({})
  const navigate = useNavigate()

  useEffect(() => { fetchPOs() }, [])

  const fetchPOs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }

    const { data } = await supabase
      .from('purchase_orders')
      .select('*, proposals(proposal_name, company)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    setPOs(data || [])
    setLoading(false)
  }

  const fetchLineItemsForPO = async (po) => {
    const { data } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('po_number', po.po_number)
    setLineItems(prev => ({ ...prev, [po.id]: data || [] }))
  }

  const toggleExpand = async (po) => {
    if (expandedPO === po.id) { setExpandedPO(null); return }
    setExpandedPO(po.id)
    if (!lineItems[po.id]) await fetchLineItemsForPO(po)
  }

  const updateStatus = async (poId, status) => {
    await supabase.from('purchase_orders').update({ status }).eq('id', poId)
    fetchPOs()
  }

  const updateReceivedQty = async (poId, itemId, receivedQty, orderedQty) => {
    setSavingReceiving(prev => ({ ...prev, [itemId]: true }))
    const qty = parseFloat(receivedQty) || 0
    const now = qty > 0 ? new Date().toISOString() : null

    await supabase.from('bom_line_items').update({
      received_qty: qty,
      received_at: now
    }).eq('id', itemId)

    const po = pos.find(p => p.id === poId)
    const { data: items } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('po_number', po?.po_number)

    setLineItems(prev => ({ ...prev, [poId]: items || [] }))

    if (items) {
      const total = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)
      const received = items.reduce((sum, i) => sum + (parseFloat(i.received_qty) || 0), 0)
      const newStatus = received === 0 ? 'Sent' : received >= total ? 'Received' : 'Partial'
      await supabase.from('purchase_orders').update({ receiving_status: newStatus, status: newStatus }).eq('id', poId)
      fetchPOs()
    }

    setSavingReceiving(prev => ({ ...prev, [itemId]: false }))
  }

  const getReceivingProgress = (poId) => {
    const items = lineItems[poId]
    if (!items) return null
    const total = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)
    const received = items.reduce((sum, i) => sum + (parseFloat(i.received_qty) || 0), 0)
    return { total, received }
  }

  const filtered = pos.filter(p => statusFilter === 'All' || p.status === statusFilter)
  const totalSent = pos.reduce((sum, p) => sum + (p.total_amount || 0), 0)
  const totalReceived = pos.filter(p => p.status === 'Received').reduce((sum, p) => sum + (p.total_amount || 0), 0)
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
            <p className="text-white text-2xl font-bold">${totalSent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Received</p>
            <p className="text-green-400 text-2xl font-bold">${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Pending</p>
            <p className="text-yellow-400 text-2xl font-bold">{pendingCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {['All', 'Sent', 'Partial', 'Received', 'Cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* PO List */}
        {loading ? <p className="text-[#8A9AB0]">Loading...</p> : filtered.length === 0 ? (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <p className="text-[#8A9AB0]">No purchase orders yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(po => {
              const isExpanded = expandedPO === po.id
              const progress = getReceivingProgress(po.id)

              return (
                <div key={po.id} className="border border-[#2a3d55] rounded-xl overflow-hidden bg-[#1a2d45]">
                  {/* PO Header */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#1f3550] transition-colors"
                    onClick={() => toggleExpand(po)}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-white font-semibold text-sm">{po.po_number}</p>
                        <p className="text-[#8A9AB0] text-xs">
                          {po.vendor_name} ·{' '}
                          <span
                            className="hover:text-[#C8622A] transition-colors"
                            onClick={e => { e.stopPropagation(); navigate(`/proposal/${po.proposal_id}`) }}
                          >
                            {po.proposals?.proposal_name || '—'}
                          </span>
                          {' '}· {new Date(po.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        po.status === 'Received' ? 'bg-green-500/20 text-green-400' :
                        po.status === 'Partial' ? 'bg-yellow-500/20 text-yellow-400' :
                        po.status === 'Cancelled' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {po.status}
                      </span>
                      {progress && (
                        <span className="text-[#8A9AB0] text-xs">
                          {progress.received} of {progress.total} received
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-white text-sm font-semibold">
                        ${(po.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <select
                        value={po.status}
                        onChange={e => { e.stopPropagation(); updateStatus(po.id, e.target.value) }}
                        onClick={e => e.stopPropagation()}
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                      >
                        {['Sent', 'Partial', 'Received', 'Cancelled'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <span className="text-[#8A9AB0] text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded Receiving */}
                  {isExpanded && (
                    <div className="border-t border-[#2a3d55] p-4">
                      {!lineItems[po.id] ? (
                        <p className="text-[#8A9AB0] text-sm">Loading items...</p>
                      ) : lineItems[po.id].length === 0 ? (
                        <p className="text-[#8A9AB0] text-sm">No line items found for this PO.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">Item</th>
                              <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">Part #</th>
                              <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal text-xs">Ordered</th>
                              <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal text-xs">Received Qty</th>
                              <th className="text-[#8A9AB0] text-left py-2 font-normal text-xs">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems[po.id].map(item => {
                              const ordered = parseFloat(item.quantity) || 0
                              const received = parseFloat(item.received_qty) || 0
                              const itemStatus = received === 0 ? 'Pending' : received >= ordered ? 'Received' : 'Partial'
                              return (
                                <tr key={item.id} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-3 pr-4">{item.item_name}</td>
                                  <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
                                  <td className="text-white py-3 pr-4 text-right">{ordered} {item.unit || 'ea'}</td>
                                  <td className="py-3 pr-4 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      max={ordered}
                                      value={received || ''}
                                      onChange={e => updateReceivedQty(po.id, item.id, e.target.value, ordered)}
                                      placeholder="0"
                                      className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] text-right"
                                    />
                                    {savingReceiving[item.id] && <span className="text-[#8A9AB0] text-xs ml-1">✓</span>}
                                  </td>
                                  <td className="py-3">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                      itemStatus === 'Received' ? 'bg-green-500/20 text-green-400' :
                                      itemStatus === 'Partial' ? 'bg-yellow-500/20 text-yellow-400' :
                                      'bg-[#2a3d55] text-[#8A9AB0]'
                                    }`}>
                                      {itemStatus}
                                    </span>
                                    {item.received_at && (
                                      <span className="text-[#8A9AB0] text-xs ml-2">
                                        {new Date(item.received_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan="2" className="text-[#8A9AB0] pt-3 text-right font-semibold text-xs pr-4">Totals</td>
                              <td className="text-white pt-3 pr-4 text-right text-xs font-semibold">
                                {lineItems[po.id].reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)}
                              </td>
                              <td className="text-[#C8622A] pt-3 pr-4 text-right text-xs font-semibold">
                                {lineItems[po.id].reduce((sum, i) => sum + (parseFloat(i.received_qty) || 0), 0)}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
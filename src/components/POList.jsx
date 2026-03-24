import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function POList({ proposalId }) {
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedPO, setExpandedPO] = useState(null)
  const [lineItems, setLineItems] = useState({})
  const [savingReceiving, setSavingReceiving] = useState({})

  useEffect(() => { fetchPOs() }, [])

  const fetchPOs = async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('proposal_id', proposalId)
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
    if (expandedPO === po.id) {
      setExpandedPO(null)
      return
    }
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

    // Refetch line items for this PO
    const { data: items } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('po_number', pos.find(p => p.id === poId)?.po_number)

    setLineItems(prev => ({ ...prev, [poId]: items || [] }))

    // Roll up receiving status on PO
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

  if (loading || pos.length === 0) return null

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <h3 className="text-white font-bold text-lg mb-4">Purchase Orders ({pos.length})</h3>
      <div className="space-y-3">
        {pos.map(po => {
          const isExpanded = expandedPO === po.id
          const progress = getReceivingProgress(po.id)

          return (
            <div key={po.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
              {/* PO Header Row */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#1f3550] transition-colors"
                onClick={() => toggleExpand(po)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-white font-semibold text-sm">{po.po_number}</p>
                    <p className="text-[#8A9AB0] text-xs">{po.vendor_name} · {new Date(po.created_at).toLocaleDateString()}</p>
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

              {/* Expanded Receiving Table */}
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
    </div>
  )
}
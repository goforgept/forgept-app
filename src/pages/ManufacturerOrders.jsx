import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const STATUSES = ['Draft', 'In Production', 'Packed', 'Shipped', 'Delivered']
const STATUS_COLORS = {
  'Draft': 'bg-[#2a3d55] text-[#8A9AB0]',
  'In Production': 'bg-yellow-500/20 text-yellow-400',
  'Packed': 'bg-blue-500/20 text-blue-400',
  'Shipped': 'bg-purple-500/20 text-purple-400',
  'Delivered': 'bg-green-500/20 text-green-400',
}

export default function ManufacturerOrders({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [editingOrder, setEditingOrder] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchOrders() }, [])

  const fetchOrders = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }

    const { data } = await supabase
      .from('manufacturer_orders')
      .select('*, manufacturer_order_items(*), proposals(proposal_name, company, client_name)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    setOrders(data || [])
    setLoading(false)
  }

  const updateOrderStatus = async (orderId, newStatus) => {
    const updates = { status: newStatus }
    if (newStatus === 'Submitted') updates.submitted_at = new Date().toISOString()
    if (newStatus === 'Shipped') updates.actual_ship_date = new Date().toISOString().split('T')[0]
    await supabase.from('manufacturer_orders').update(updates).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o))
  }

  const updateOrderField = async (orderId, field, value) => {
    await supabase.from('manufacturer_orders').update({ [field]: value }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value } : o))
  }

  const updateItemReceivedQty = async (itemId, orderId, qty) => {
    await supabase.from('manufacturer_order_items').update({ received_qty: parseFloat(qty) || 0 }).eq('id', itemId)
    // Update order items in state
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      const updatedItems = o.manufacturer_order_items.map(i =>
        i.id === itemId ? { ...i, received_qty: parseFloat(qty) || 0 } : i
      )
      // Auto-update status based on received qty
      const allReceived = updatedItems.every(i => (i.received_qty || 0) >= (i.quantity || 0))
      const anyReceived = updatedItems.some(i => (i.received_qty || 0) > 0)
      return { ...o, manufacturer_order_items: updatedItems }
    }))
  }

  const filtered = orders
    .filter(o => statusFilter === 'All' || o.status === statusFilter)
    .filter(o => {
      if (!search) return true
      const s = search.toLowerCase()
      return o.order_number?.toLowerCase().includes(s) ||
        o.vendor_name?.toLowerCase().includes(s) ||
        o.proposals?.proposal_name?.toLowerCase().includes(s) ||
        o.proposals?.company?.toLowerCase().includes(s)
    })

  const totalValue = filtered.reduce((sum, o) => sum + (o.total_cost || 0), 0)
  const inFlight = filtered.filter(o => ['Submitted', 'In Production', 'Shipped'].includes(o.status)).length
  const receivedCount = filtered.filter(o => o.status === 'Delivered').length

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />
      <div className="flex-1 p-6">

        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-white text-2xl font-bold">Manufacturer Orders</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">Fulfill and ship orders on won deals</p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Total Order Value</p>
            <p className="text-white text-xl font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">In Flight</p>
            <p className="text-yellow-400 text-xl font-bold">{inFlight}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Delivered</p>
            <p className="text-green-400 text-xl font-bold">{receivedCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Search orders, vendors, proposals..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <div className="flex gap-2">
            {['All', ...STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Orders list */}
        {loading ? <p className="text-[#8A9AB0]">Loading...</p> :
         filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#8A9AB0] text-lg mb-2">No orders yet</p>
            <p className="text-[#8A9AB0] text-sm">Convert a Won proposal to a fulfillment order from the proposal detail page.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => {
              const isExpanded = expandedOrder === order.id
              const items = order.manufacturer_order_items || []
              const receivedAll = items.length > 0 && items.every(i => (i.received_qty || 0) >= (i.quantity || 0))
              const receivedSome = items.some(i => (i.received_qty || 0) > 0)

              return (
                <div key={order.id} className="bg-[#1a2d45] rounded-xl overflow-hidden">
                  {/* Order header */}
                  <div className="p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <p className="text-white font-bold">{order.order_number}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-[#8A9AB0] text-sm">{order.vendor_name} · {order.proposals?.proposal_name}</p>
                        <p className="text-[#8A9AB0] text-xs mt-0.5">{order.proposals?.company}{order.proposals?.client_name ? ` · ${order.proposals.client_name}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">${(order.total_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[#8A9AB0] text-xs mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                        {order.expected_ship_date && (
                          <p className="text-[#8A9AB0] text-xs">Ships {order.expected_ship_date}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-[#2a3d55] p-5 space-y-4">
                      {/* Status controls */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[#8A9AB0] text-xs">Status:</span>
                        {STATUSES.map(s => (
                          <button key={s} onClick={() => updateOrderStatus(order.id, s)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${order.status === s ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                            {s}
                          </button>
                        ))}
                      </div>

                      {/* Fulfillment details */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[#8A9AB0] text-xs mb-1 block">Ship-To Address</label>
                          <input type="text" defaultValue={order.ship_to_address || ''}
                            onBlur={e => updateOrderField(order.id, 'ship_to_address', e.target.value)}
                            placeholder="123 Main St, Nashville, TN"
                            className={inputClass + ' w-full'} />
                        </div>
                        <div>
                          <label className="text-[#8A9AB0] text-xs mb-1 block">Shipping Method</label>
                          <select defaultValue={order.shipping_method || ''}
                            onBlur={e => updateOrderField(order.id, 'shipping_method', e.target.value)}
                            className={inputClass + ' w-full'}>
                            <option value="">— Select —</option>
                            {['Will Call', 'UPS Ground', 'FedEx Ground', 'FedEx Express', 'Freight', 'LTL', 'Company Truck'].map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[#8A9AB0] text-xs mb-1 block">Tracking Number</label>
                          <input type="text" defaultValue={order.tracking_number || ''}
                            onBlur={e => updateOrderField(order.id, 'tracking_number', e.target.value)}
                            placeholder="Enter tracking #"
                            className={inputClass + ' w-full'} />
                        </div>
                        <div>
                          <label className="text-[#8A9AB0] text-xs mb-1 block">Expected Ship Date</label>
                          <input type="date" defaultValue={order.expected_ship_date || ''}
                            onBlur={e => updateOrderField(order.id, 'expected_ship_date', e.target.value)}
                            className={inputClass + ' w-full'} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[#8A9AB0] text-xs mb-1 block">Notes</label>
                        <input type="text" defaultValue={order.notes || ''}
                          onBlur={e => updateOrderField(order.id, 'notes', e.target.value)}
                          placeholder="Internal fulfillment notes..."
                          className={inputClass + ' w-full'} />
                      </div>

                      {/* Line items with receiving */}
                      <div>
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Line Items & Receiving</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              <th className="text-[#8A9AB0] text-left py-2 text-xs font-normal">Item</th>
                              <th className="text-[#8A9AB0] text-left py-2 text-xs font-normal">Part #</th>
                              <th className="text-[#8A9AB0] text-right py-2 text-xs font-normal">Ordered</th>
                              <th className="text-[#8A9AB0] text-right py-2 text-xs font-normal">Received</th>
                              <th className="text-[#8A9AB0] text-right py-2 text-xs font-normal">Cost</th>
                              <th className="text-[#8A9AB0] text-center py-2 text-xs font-normal">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(item => {
                              const pct = item.quantity > 0 ? Math.min(100, Math.round(((item.received_qty || 0) / item.quantity) * 100)) : 0
                              const itemStatus = pct >= 100 ? 'Received' : pct > 0 ? 'Partial' : 'Pending'
                              return (
                                <tr key={item.id} className="border-b border-[#2a3d55]/50">
                                  <td className="text-white py-2 pr-4">{item.item_name}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4 text-xs">{item.part_number_sku || '—'}</td>
                                  <td className="text-white py-2 pr-4 text-right">{item.quantity} {item.unit}</td>
                                  <td className="py-2 pr-4 text-right">
                                    <input type="number" value={item.received_qty || 0}
                                      onChange={e => updateItemReceivedQty(item.id, order.id, e.target.value)}
                                      min={0} max={item.quantity}
                                      className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:border-[#C8622A]" />
                                  </td>
                                  <td className="text-[#8A9AB0] py-2 text-right text-xs">${(item.total_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 text-center">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      itemStatus === 'Received' ? 'bg-green-500/20 text-green-400' :
                                      itemStatus === 'Partial' ? 'bg-yellow-500/20 text-yellow-400' :
                                      'bg-[#2a3d55] text-[#8A9AB0]'
                                    }`}>{itemStatus}</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {receivedAll && order.status !== 'Delivered' && (
                          <div className="mt-3 flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
                            <span className="text-green-400 text-sm">✓ All items delivered</span>
                            <button onClick={() => updateOrderStatus(order.id, 'Delivered')}
                              className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
                              Mark Order Delivered
                            </button>
                          </div>
                        )}
                      </div>

                      {order.submitted_at && (
                        <p className="text-[#8A9AB0] text-xs">Submitted {new Date(order.submitted_at).toLocaleDateString()}</p>
                      )}
                      <button onClick={() => navigate(`/proposal/${order.proposal_id}`)}
                        className="text-[#C8622A] text-xs hover:text-white transition-colors">
                        → View Proposal
                      </button>
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
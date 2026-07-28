import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function JobPOList({ proposalId }) {
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!proposalId) { setLoading(false); return }
    supabase.from('purchase_orders').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false })
      .then(({ data }) => { setPos(data || []); setLoading(false) })
  }, [proposalId])

  if (loading) return <p className="text-fp-muted text-sm">Loading...</p>
  if (!proposalId) return <p className="text-fp-muted text-sm">No proposal linked to this job.</p>
  if (pos.length === 0) return (
    <div className="text-center py-8 border-2 border-dashed border-fp-border rounded-xl">
      <p className="text-fp-muted">No purchase orders yet.</p>
      <p className="text-fp-muted text-xs mt-1">Generate POs from the BOM items above.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {pos.map(po => (
        <div key={po.id} className="bg-fp-inset rounded-xl p-4 border border-fp-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-fp-text font-semibold font-mono">{po.po_number}</p>
              <p className="text-fp-muted text-sm mt-0.5">{po.vendor_name}</p>
              <p className="text-fp-muted text-xs mt-0.5">{po.created_at ? new Date(po.created_at).toLocaleDateString() : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-[#C8622A] font-bold text-lg">${fmt(po.total_amount)}</p>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${po.status === 'Received' ? 'bg-green-500/20 text-green-400' : po.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : 'bg-fp-inset text-fp-muted'}`}>
                {po.status}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function POTab({ lineItems, selectedForPO, setSelectedForPO, job, onOpenPOModal }) {
  const [allocations, setAllocations] = useState([])

  useEffect(() => {
    if (!job?.id) return
    supabase.from('job_inventory_allocations')
      .select('bom_line_item_id, status, quantity_reserved, quantity_fulfilled, inventory_items(description)')
      .eq('job_id', job.id)
      .in('status', ['reserved', 'fulfilled'])
      .then(({ data }) => setAllocations(data || []))
  }, [job?.id])

  const getAlloc = (itemId) => allocations.find(a => a.bom_line_item_id === itemId) || null

  // Items that are sourced from inventory can't also go on a PO
  const isFromInventory = (itemId) => !!getAlloc(itemId)

  const orderable = lineItems.filter(l =>
    (!l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing') && !isFromInventory(l.id)
  )

  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-fp-text font-bold text-lg">Purchase Orders</h3>
        <button onClick={onOpenPOModal}
          disabled={selectedForPO.size === 0}
          title={selectedForPO.size === 0 ? 'Check items below to select for PO' : `Generate PO for ${selectedForPO.size} items`}
          className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {selectedForPO.size > 0 ? `Generate PO (${selectedForPO.size})` : 'Generate PO'}
        </button>
      </div>
      {lineItems.length === 0 ? (
        <p className="text-fp-muted text-sm">No materials on this job's BOM.</p>
      ) : (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fp-border">
                <th className="py-2 pr-2 w-8">
                  <input type="checkbox" className="accent-fp-brand"
                    checked={orderable.length > 0 && orderable.every(l => selectedForPO.has(l.id))}
                    onChange={() => {
                      const allSelected = orderable.every(l => selectedForPO.has(l.id))
                      setSelectedForPO(prev => {
                        const next = new Set(prev)
                        orderable.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
                        return next
                      })
                    }} />
                </th>
                {['Item', 'Vendor', 'Qty', 'Your Cost', 'PO #', 'Status'].map(h => (
                  <th key={h} className="text-fp-muted text-left py-2 pr-4 font-normal text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map(item => {
                const isOrdered = item.po_status === 'PO Sent' || item.po_status === 'Received'
                const alloc = getAlloc(item.id)
                const fromInventory = !!alloc
                const invFulfilled = alloc?.status === 'fulfilled'

                return (
                  <tr key={item.id} className={`border-b border-fp-border/50 ${selectedForPO.has(item.id) ? 'bg-[#C8622A]/5' : ''}`}>
                    <td className="pr-2 py-3">
                      {!isOrdered && !fromInventory && (
                        <input type="checkbox" className="accent-fp-brand cursor-pointer"
                          checked={selectedForPO.has(item.id)}
                          onChange={() => setSelectedForPO(prev => {
                            const next = new Set(prev)
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                            return next
                          })} />
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-fp-text text-sm">{item.item_name}</p>
                      {item.part_number_sku && <p className="text-fp-muted text-xs">{item.part_number_sku}</p>}
                      {fromInventory && (
                        <p className="text-xs text-fp-muted mt-0.5">
                          from: <span className="font-medium">{alloc.inventory_items?.description || 'inventory'}</span>
                        </p>
                      )}
                    </td>
                    <td className="text-fp-muted py-3 pr-4 text-sm">{item.vendor || '—'}</td>
                    <td className="text-fp-text py-3 pr-4 text-sm">{item.quantity} {item.unit}</td>
                    <td className="text-fp-text py-3 pr-4 text-sm">${fmt((item.your_cost_unit || 0) * (item.quantity || 0))}</td>
                    <td className="py-3 pr-4">{item.po_number ? <span className="text-fp-muted text-xs font-mono">{item.po_number}</span> : <span className="text-fp-muted">—</span>}</td>
                    <td className="py-3">
                      {fromInventory ? (
                        <span className={`text-xs px-2 py-1 rounded font-semibold ${invFulfilled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {invFulfilled ? 'Fulfilled from Stock' : 'In Stock / Spoken For'}
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded font-semibold ${item.po_status === 'Received' ? 'bg-green-500/20 text-green-400' : item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' : 'bg-fp-inset text-fp-muted'}`}>
                          {item.po_status || 'Not Ordered'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <JobPOList proposalId={job?.proposal_id} />
    </div>
  )
}

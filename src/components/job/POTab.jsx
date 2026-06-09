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

  if (loading) return <p className="text-[#8A9AB0] text-sm">Loading...</p>
  if (!proposalId) return <p className="text-[#8A9AB0] text-sm">No proposal linked to this job.</p>
  if (pos.length === 0) return (
    <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
      <p className="text-[#8A9AB0]">No purchase orders yet.</p>
      <p className="text-[#8A9AB0] text-xs mt-1">Generate POs from the linked proposal's BOM tab.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {pos.map(po => (
        <div key={po.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-semibold font-mono">{po.po_number}</p>
              <p className="text-[#8A9AB0] text-sm mt-0.5">{po.vendor_name}</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">{po.created_at ? new Date(po.created_at).toLocaleDateString() : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-[#C8622A] font-bold text-lg">${fmt(po.total_amount)}</p>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${po.status === 'Received' ? 'bg-green-500/20 text-green-400' : po.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
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
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-white font-bold text-lg">Purchase Orders</h3>
        <button onClick={onOpenPOModal}
          disabled={selectedForPO.size === 0}
          title={selectedForPO.size === 0 ? 'Check items below to select for PO' : `Generate PO for ${selectedForPO.size} items`}
          className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {selectedForPO.size > 0 ? `Generate PO (${selectedForPO.size})` : 'Generate PO'}
        </button>
      </div>
      {lineItems.length === 0 ? (
        <p className="text-[#8A9AB0] text-sm">No materials on this job's BOM.</p>
      ) : (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3d55]">
                <th className="py-2 pr-2 w-8">
                  <input type="checkbox" className="accent-[#C8622A]"
                    checked={lineItems.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing').every(l => selectedForPO.has(l.id)) && lineItems.some(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')}
                    onChange={() => {
                      const orderable = lineItems.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')
                      const allSelected = orderable.every(l => selectedForPO.has(l.id))
                      setSelectedForPO(prev => {
                        const next = new Set(prev)
                        orderable.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
                        return next
                      })
                    }} />
                </th>
                {['Item', 'Vendor', 'Qty', 'Your Cost', 'PO #', 'Status'].map(h => (
                  <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map(item => {
                const isOrdered = item.po_status === 'PO Sent' || item.po_status === 'Received'
                return (
                  <tr key={item.id} className={`border-b border-[#2a3d55]/50 ${selectedForPO.has(item.id) ? 'bg-[#C8622A]/5' : ''}`}>
                    <td className="pr-2 py-3">
                      {!isOrdered && (
                        <input type="checkbox" className="accent-[#C8622A] cursor-pointer"
                          checked={selectedForPO.has(item.id)}
                          onChange={() => setSelectedForPO(prev => {
                            const next = new Set(prev)
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                            return next
                          })} />
                      )}
                    </td>
                    <td className="py-3 pr-4"><p className="text-white text-sm">{item.item_name}</p>{item.part_number_sku && <p className="text-[#8A9AB0] text-xs">{item.part_number_sku}</p>}</td>
                    <td className="text-[#8A9AB0] py-3 pr-4 text-sm">{item.vendor || '—'}</td>
                    <td className="text-white py-3 pr-4 text-sm">{item.quantity} {item.unit}</td>
                    <td className="text-white py-3 pr-4 text-sm">${fmt((item.your_cost_unit || 0) * (item.quantity || 0))}</td>
                    <td className="py-3 pr-4">{item.po_number ? <span className="text-[#8A9AB0] text-xs font-mono">{item.po_number}</span> : <span className="text-[#2a3d55]">—</span>}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded font-semibold ${item.po_status === 'Received' ? 'bg-green-500/20 text-green-400' : item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                        {item.po_status || 'Not Ordered'}
                      </span>
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

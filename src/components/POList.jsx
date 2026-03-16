import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function POList({ proposalId }) {
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPOs()
  }, [])

  const fetchPOs = async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('proposal_id', proposalId)
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

  if (loading) return null
  if (pos.length === 0) return null

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <h3 className="text-white font-bold text-lg mb-4">Purchase Orders ({pos.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a3d55]">
              {['PO Number', 'Vendor', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pos.map(po => (
              <tr key={po.id} className="border-b border-[#2a3d55]/30">
                <td className="text-white py-3 pr-4 font-medium">{po.po_number}</td>
                <td className="text-[#8A9AB0] py-3 pr-4">{po.vendor_name}</td>
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
    </div>
  )
}

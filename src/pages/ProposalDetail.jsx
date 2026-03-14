import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function ProposalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProposal()
    fetchLineItems()
  }, [])

  const fetchProposal = async () => {
    const { data } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single()
    setProposal(data)
    setLoading(false)
  }

  const fetchLineItems = async () => {
    const { data } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('proposal_id', id)
    setLineItems(data || [])
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <button onClick={() => navigate('/')} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">
          Back to Dashboard
        </button>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white text-2xl font-bold">{proposal?.proposal_name}</h2>
              <p className="text-[#8A9AB0] mt-1">{proposal?.company} · {proposal?.client_name}</p>
              <p className="text-[#8A9AB0] text-sm">{proposal?.client_email}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              proposal?.status === 'Won' ? 'bg-green-500/20 text-green-400' :
              proposal?.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
              proposal?.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
              'bg-[#8A9AB0]/20 text-[#8A9AB0]'
            }`}>
              {proposal?.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div>
              <p className="text-[#8A9AB0] text-xs">Rep</p>
              <p className="text-white text-sm font-medium">{proposal?.rep_name}</p>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Close Date</p>
              <p className="text-white text-sm font-medium">{proposal?.close_date}</p>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Industry</p>
              <p className="text-white text-sm font-medium">{proposal?.industry}</p>
            </div>
          </div>
        </div>

        {proposal?.scope_of_work && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Scope of Work</h3>
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{proposal.scope_of_work}</p>
          </div>
        )}

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">BOM Line Items ({lineItems.length})</h3>
          {lineItems.length === 0 ? (
            <p className="text-[#8A9AB0]">No line items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    <th className="text-[#8A9AB0] text-left py-2 pr-4">Item</th>
                    <th className="text-[#8A9AB0] text-left py-2 pr-4">Category</th>
                    <th className="text-[#8A9AB0] text-left py-2 pr-4">Vendor</th>
                    <th className="text-[#8A9AB0] text-right py-2 pr-4">Qty</th>
                    <th className="text-[#8A9AB0] text-right py-2 pr-4">Unit Price</th>
                    <th className="text-[#8A9AB0] text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-[#2a3d55]/50">
                      <td className="text-white py-3 pr-4">{item.item_name}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{item.category}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{item.vendor}</td>
                      <td className="text-white py-3 pr-4 text-right">{item.quantity}</td>
                      <td className="text-white py-3 pr-4 text-right">${item.customer_price_unit?.toFixed(2)}</td>
                      <td className="text-white py-3 text-right">${item.customer_price_total?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" className="text-[#8A9AB0] pt-4 text-right font-semibold">Total</td>
                    <td className="text-[#C8622A] pt-4 text-right font-bold text-lg">
                      ${lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const STATUS_COLORS = {
  'Draft': 'bg-[#2a3d55] text-[#8A9AB0]',
  'Sent': 'bg-blue-500/20 text-blue-400',
  'Partially Paid': 'bg-yellow-500/20 text-yellow-400',
  'Paid': 'bg-green-500/20 text-green-400',
  'Overdue': 'bg-red-500/20 text-red-400',
}

export default function Invoices({ isAdmin, featureProposals = true, featureCRM = false }) {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  useEffect(() => { fetchInvoices() }, [])

  const fetchInvoices = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }

    const { data } = await supabase
      .from('invoices')
      .select('*, proposals(proposal_name, company, client_name)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    // Auto-flag overdue
    const today = new Date()
    const updated = (data || []).map(inv => {
      if (inv.status === 'Sent' && inv.due_date && new Date(inv.due_date) < today) {
        return { ...inv, status: 'Overdue' }
      }
      return inv
    })

    setInvoices(updated)
    setLoading(false)
  }

  const filtered = filter === 'All' ? invoices : invoices.filter(i => i.status === filter)

  const totalOutstanding = invoices
    .filter(i => ['Sent', 'Partially Paid', 'Overdue'].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due || 0), 0)

  const totalOverdue = invoices
    .filter(i => i.status === 'Overdue')
    .reduce((sum, i) => sum + (i.balance_due || 0), 0)

  const getDaysAging = (dueDate) => {
    if (!dueDate) return null
    const days = Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24))
    return days > 0 ? days : null
  }

  const getAgingBadge = (days) => {
    if (!days) return null
    if (days > 90) return <span className="text-xs px-2 py-0.5 rounded bg-red-500/30 text-red-300">90+ days</span>
    if (days > 60) return <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">60+ days</span>
    if (days > 30) return <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">30+ days</span>
    return <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">{days}d overdue</span>
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-2xl font-bold">Invoices</h2>
          <button
            onClick={() => navigate('/invoices/new')}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            + New Invoice
          </button>
        </div>

        {/* AR Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Total Outstanding</p>
            <p className="text-white text-2xl font-bold">${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Overdue</p>
            <p className="text-red-400 text-2xl font-bold">${totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Total Invoices</p>
            <p className="text-white text-2xl font-bold">{invoices.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {['All', 'Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>

        {loading ? <p className="text-[#8A9AB0]">Loading...</p> : filtered.length === 0 ? (
          <div className="bg-[#1a2d45] rounded-xl p-12 text-center">
            <p className="text-white font-semibold mb-2">No invoices yet</p>
            <p className="text-[#8A9AB0] text-sm mb-4">Create an invoice from any Won proposal, or start a new one.</p>
            <button onClick={() => navigate('/invoices/new')} className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              + New Invoice
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(inv => {
              const days = getDaysAging(inv.due_date)
              return (
                <div key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="bg-[#1a2d45] rounded-xl p-5 flex justify-between items-center cursor-pointer hover:bg-[#1f3550] transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-semibold">{inv.invoice_number}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[inv.status] || 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                        {inv.status}
                      </span>
                      {inv.status === 'Overdue' && getAgingBadge(days)}
                    </div>
                    <p className="text-[#8A9AB0] text-sm">
                      {inv.proposals?.company || '—'} · {inv.proposals?.client_name || '—'}
                    </p>
                    <p className="text-[#8A9AB0] text-xs mt-0.5">
                      {inv.proposals?.proposal_name || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">${(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    {inv.balance_due > 0 && (
                      <p className="text-[#C8622A] text-sm">Balance: ${inv.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    )}
                    <p className="text-[#8A9AB0] text-xs mt-0.5">
                      {inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : 'No due date'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
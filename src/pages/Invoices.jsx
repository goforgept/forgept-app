import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

const STATUS_COLORS = {
  'Draft': 'bg-fp-inset text-fp-muted',
  'Sent': 'bg-blue-500/20 text-blue-400',
  'Partially Paid': 'bg-yellow-500/20 text-yellow-400',
  'Paid': 'bg-green-500/20 text-green-400',
  'Overdue': 'bg-red-500/20 text-red-400',
}

export default function Invoices({ isAdmin, featureProposals = true, featureCRM = false }) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  useEffect(() => { if (profile?.org_id) fetchInvoices() }, [profile?.org_id])

  const fetchInvoices = async () => {
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
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-fp-text text-2xl font-bold">Invoices</h2>
          <button
            onClick={() => navigate('/invoices/new')}
            className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            + New Invoice
          </button>
        </div>

        {/* AR Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-fp-card rounded-xl p-5">
            <p className="text-fp-muted text-sm mb-1">Total Outstanding</p>
            <p className="text-fp-text text-2xl font-bold">${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-fp-card rounded-xl p-5">
            <p className="text-fp-muted text-sm mb-1">Overdue</p>
            <p className="text-red-400 text-2xl font-bold">${totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-fp-card rounded-xl p-5">
            <p className="text-fp-muted text-sm mb-1">Total Invoices</p>
            <p className="text-fp-text text-2xl font-bold">{invoices.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {['All', 'Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === s ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text'}`}>
              {s}
            </button>
          ))}
        </div>

        {loading ? <p className="text-fp-muted">Loading...</p> : filtered.length === 0 ? (
          <div className="bg-fp-card rounded-xl p-12 text-center">
            <p className="text-fp-text font-semibold mb-2">No invoices yet</p>
            <p className="text-fp-muted text-sm mb-4">Create an invoice from any Won proposal, or start a new one.</p>
            <button onClick={() => navigate('/invoices/new')} className="bg-fp-brand text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              + New Invoice
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(inv => {
              const days = getDaysAging(inv.due_date)
              return (
                <div key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="bg-fp-card rounded-xl p-5 flex justify-between items-center cursor-pointer hover:bg-fp-hover transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-fp-text font-semibold">{inv.invoice_number}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[inv.status] || 'bg-fp-inset text-fp-muted'}`}>
                        {inv.status}
                      </span>
                      {inv.status === 'Overdue' && getAgingBadge(days)}
                    </div>
                    <p className="text-fp-muted text-sm">
                      {inv.proposals?.company || '—'} · {inv.proposals?.client_name || '—'}
                    </p>
                    <p className="text-fp-muted text-xs mt-0.5">
                      {inv.proposals?.proposal_name || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-fp-text font-bold">${(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    {inv.balance_due > 0 && (
                      <p className="text-[#C8622A] text-sm">Balance: ${inv.balance_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    )}
                    <p className="text-fp-muted text-xs mt-0.5">
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
import { useNavigate } from 'react-router-dom'

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_COLORS = {
  'Draft':          'bg-fp-inset text-fp-muted',
  'Sent':           'bg-blue-500/20 text-blue-400',
  'Partially Paid': 'bg-yellow-500/20 text-yellow-400',
  'Paid':           'bg-green-500/20 text-green-400',
  'Overdue':        'bg-red-500/20 text-red-400',
}

export default function BillingsTab({ invoices = [], proposalValue }) {
  const navigate = useNavigate()
  const today = new Date()

  const displayInvoices = invoices.map(inv => {
    if (inv.status === 'Sent' && inv.due_date && new Date(inv.due_date) < today) {
      return { ...inv, status: 'Overdue' }
    }
    return inv
  })

  const totalInvoiced  = displayInvoices.reduce((s, i) => s + (i.total || 0), 0)
  const totalPaid      = displayInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0)
  const totalBalance   = displayInvoices.reduce((s, i) => s + (i.balance_due || 0), 0)
  const pctInvoiced    = proposalValue > 0 ? Math.min((totalInvoiced / proposalValue) * 100, 100) : 0
  const pctCollected   = totalInvoiced > 0 ? Math.min((totalPaid / totalInvoiced) * 100, 100) : 0

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-fp-card rounded-xl p-4">
          <p className="text-fp-muted text-xs mb-1">Total Invoiced</p>
          <p className="text-fp-text font-bold text-lg">${fmt(totalInvoiced)}</p>
          {proposalValue > 0 && (
            <>
              <div className="mt-2 h-1.5 rounded-full bg-fp-inset overflow-hidden">
                <div className="h-full bg-fp-brand rounded-full" style={{ width: `${pctInvoiced}%` }} />
              </div>
              <p className="text-fp-muted text-xs mt-1">{pctInvoiced.toFixed(0)}% of contract</p>
            </>
          )}
        </div>
        <div className="bg-fp-card rounded-xl p-4">
          <p className="text-fp-muted text-xs mb-1">Collected</p>
          <p className="text-green-400 font-bold text-lg">${fmt(totalPaid)}</p>
          {totalInvoiced > 0 && (
            <>
              <div className="mt-2 h-1.5 rounded-full bg-fp-inset overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${pctCollected}%` }} />
              </div>
              <p className="text-fp-muted text-xs mt-1">{pctCollected.toFixed(0)}% of invoiced</p>
            </>
          )}
        </div>
        <div className="bg-fp-card rounded-xl p-4">
          <p className="text-fp-muted text-xs mb-1">Outstanding</p>
          <p className={`font-bold text-lg ${totalBalance > 0 ? 'text-yellow-400' : 'text-fp-text'}`}>${fmt(totalBalance)}</p>
          {displayInvoices.some(i => i.status === 'Overdue') && (
            <p className="text-red-400 text-xs mt-1">Includes overdue invoices</p>
          )}
        </div>
      </div>

      {/* Invoice list */}
      <div className="bg-fp-card rounded-xl overflow-hidden">
        {displayInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-fp-muted text-sm">No invoices on this job yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fp-border">
                <th className="text-left text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Invoice</th>
                <th className="text-left text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Description</th>
                <th className="text-left text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Total</th>
                <th className="text-right text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Paid</th>
                <th className="text-right text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Balance</th>
                <th className="text-left text-fp-muted font-semibold text-xs uppercase tracking-wide px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {displayInvoices.map(inv => (
                <tr key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="border-b border-fp-border/50 hover:bg-fp-hover cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-semibold text-fp-text">{inv.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-fp-muted max-w-[180px] truncate">{inv.description || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status] || STATUS_COLORS['Draft']}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-fp-text font-mono">${fmt(inv.total)}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">${fmt(inv.amount_paid)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${inv.balance_due > 0 ? 'text-yellow-400' : 'text-fp-muted'}`}>
                    ${fmt(inv.balance_due)}
                  </td>
                  <td className="px-4 py-3 text-fp-muted text-xs">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

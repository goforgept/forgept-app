import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

export default function Contracts({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, featureSla, featureMonitoring, role, isSalesManager, isPM, isTechnician, featureInventory = false }) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [contracts, setContracts] = useState([])
  const [recurringItems, setRecurringItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('contracts')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    if (profile?.org_id) {
      fetchContracts(profile)
      fetchRecurringItems(profile)
    }
  }, [profile?.org_id])

  const toggleAutoInvoice = async (contract) => {
    const newVal = !contract.auto_invoice
    // Set next_invoice_date to today when enabling (engine runs tonight and picks it up)
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('contracts')
      .update({
        auto_invoice: newVal,
        next_invoice_date: newVal ? (contract.next_invoice_date || today) : contract.next_invoice_date,
      })
      .eq('id', contract.id)
    setContracts(prev => prev.map(c => c.id === contract.id ? { ...c, auto_invoice: newVal } : c))
  }

  const fetchRecurringItems = async (prof) => {
    let query = supabase
      .from('bom_line_items')
      .select('id, item_name, part_number_sku, customer_price_total, billing_frequency, auto_invoice, next_invoice_date, renewal_date, proposal_id, proposals(proposal_name, company, client_name, user_id)')
      .eq('org_id', prof.org_id)
      .eq('recurring', true)
      .order('next_invoice_date', { ascending: true })

    if (prof.org_role !== 'admin') {
      query = query.eq('proposals.user_id', prof.id)
    }

    const { data } = await query
    setRecurringItems((data || []).filter(r => r.proposals))
  }

  const toggleBomAutoInvoice = async (item) => {
    const newVal = !item.auto_invoice
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('bom_line_items')
      .update({
        auto_invoice: newVal,
        next_invoice_date: newVal ? (item.next_invoice_date || item.renewal_date || today) : item.next_invoice_date,
      })
      .eq('id', item.id)
    setRecurringItems(prev => prev.map(r => r.id === item.id ? { ...r, auto_invoice: newVal } : r))
  }

  const fetchContracts = async (prof) => {
    let query = supabase
      .from('contracts')
      .select('*, proposals(proposal_name, company, client_name, client_email)')
      .eq('org_id', prof.org_id)
      .order('end_date', { ascending: true })

    // Reps only see their own contracts
    if (prof.org_role !== 'admin') {
      query = query.eq('user_id', prof.id)
    }

    const { data, error } = await query
    if (error) setError(error.message)
    setContracts(data || [])
    setLoading(false)
  }

  const daysUntil = (dateStr) => {
    if (!dateStr) return null
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const expiryBadge = (dateStr) => {
    const days = daysUntil(dateStr)
    if (days === null) return null
    if (days < 0) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Expired</span>
    if (days <= 30) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">⚠ {days}d left</span>
    if (days <= 90) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">{days}d left</span>
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">{days}d left</span>
  }

  const filtered = contracts.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  const expiringSoon = contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d >= 0 && d <= 90 }).length

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} featureInventory={featureInventory} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-fp-text text-2xl font-bold">Contracts</h1>
              <p className="text-fp-muted text-sm mt-0.5">Service agreements and recurring billing</p>
            </div>
            {expiringSoon > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-yellow-400 text-sm font-semibold">⚠ {expiringSoon} expiring within 90 days</span>
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Contracts', value: contracts.length, color: 'text-fp-text' },
              { label: 'Active', value: contracts.filter(c => c.status === 'Active').length, color: 'text-green-400' },
              { label: 'Recurring Items', value: recurringItems.length, color: 'text-[#C8622A]' },
              { label: 'Auto Invoice On', value: [...contracts.filter(c => c.auto_invoice), ...recurringItems.filter(r => r.auto_invoice)].length, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-fp-card rounded-xl p-4">
                <p className="text-fp-muted text-xs mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-fp-card rounded-xl p-1 w-fit mb-5">
            <button onClick={() => setActiveTab('contracts')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'contracts' ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
              Service Contracts
            </button>
            <button onClick={() => setActiveTab('recurring')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'recurring' ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
              Recurring Items {recurringItems.length > 0 && <span className="ml-1.5 bg-fp-inset text-fp-muted text-xs px-1.5 py-0.5 rounded-full">{recurringItems.length}</span>}
            </button>
          </div>

          {/* Contract filters (contracts tab only) */}
          {activeTab === 'contracts' && (
          <div className="flex gap-3 mb-5 flex-wrap">
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              <option value="all">All Types</option>
              <option value="sla">Service Agreement</option>
              <option value="monitoring">Monitoring</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">{error}</div>
          )}

          {/* Service Contracts table */}
          {activeTab === 'contracts' && (loading ? (
            <div className="text-center py-16"><p className="text-fp-muted">Loading contracts...</p></div>
          ) : filtered.length === 0 ? (
            <div className="bg-fp-card rounded-xl p-12 text-center">
              <p className="text-fp-muted text-lg mb-1">No contracts found</p>
              <p className="text-fp-muted text-sm">Contracts are created when a proposal is marked as Won.</p>
            </div>
          ) : (
            <div className="bg-fp-card rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-fp-border">
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Client</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Contract</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Type</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Start</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">End</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Status</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Auto-Renew</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Auto Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const days = daysUntil(c.end_date)
                    const isExpiringSoon = days !== null && days >= 0 && days <= 90
                    return (
                      <tr
                        key={c.id}
                        onClick={() => c.proposal_id && navigate(`/proposal/${c.proposal_id}`)}
                        className={`border-b border-fp-border cursor-pointer transition-colors hover:bg-fp-inset ${isExpiringSoon ? 'bg-yellow-500/5' : ''} ${i === filtered.length - 1 ? 'border-0' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <p className="text-fp-text text-sm font-medium">{c.proposals?.company || '—'}</p>
                          <p className="text-fp-muted text-xs">{c.proposals?.client_name || ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-fp-text text-sm">{c.name || '—'}</p>
                          <p className="text-fp-muted text-xs truncate max-w-[180px]">{c.proposals?.proposal_name || ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.type === 'sla' ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-blue-500/20 text-blue-400'}`}>
                            {c.type === 'sla' ? 'Service SLA' : 'Monitoring'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-fp-muted text-sm">{c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-fp-muted text-sm">{c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}</span>
                            {expiryBadge(c.end_date)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.status === 'Active' ? 'bg-green-500/20 text-green-400' : c.status === 'Expired' ? 'bg-red-500/20 text-red-400' : 'bg-fp-inset text-fp-muted'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {c.auto_renew ? <span className="text-green-400 font-semibold">Yes</span> : <span className="text-fp-muted">No</span>}
                        </td>
                        <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                          {c.recurring_fee > 0 ? (
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => toggleAutoInvoice(c)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${c.auto_invoice ? 'bg-green-500' : 'bg-fp-border'}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${c.auto_invoice ? 'translate-x-4' : 'translate-x-1'}`} />
                              </button>
                              {c.auto_invoice && c.next_invoice_date && (
                                <p className="text-fp-muted text-xs">
                                  Next: {new Date(c.next_invoice_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-fp-muted text-xs">No fee set</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {/* Recurring BOM Items tab */}
          {activeTab === 'recurring' && (recurringItems.length === 0 ? (
            <div className="bg-fp-card rounded-xl p-12 text-center">
              <p className="text-fp-muted text-lg mb-1">No recurring items</p>
              <p className="text-fp-muted text-sm">Mark BOM line items as recurring when closing a deal as Won.</p>
            </div>
          ) : (
            <div className="bg-fp-card rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-fp-border">
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Client</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Item</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Frequency</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Amount</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Renewal Date</th>
                    <th className="text-left text-fp-muted text-xs font-semibold uppercase tracking-wide px-5 py-3">Auto Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringItems.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => r.proposal_id && navigate(`/proposal/${r.proposal_id}`)}
                      className={`border-b border-fp-border cursor-pointer transition-colors hover:bg-fp-inset ${i === recurringItems.length - 1 ? 'border-0' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <p className="text-fp-text text-sm font-medium">{r.proposals?.company || '—'}</p>
                        <p className="text-fp-muted text-xs">{r.proposals?.client_name || ''}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-fp-text text-sm">{r.item_name}</p>
                        {r.part_number_sku && <p className="text-fp-muted text-xs font-mono">{r.part_number_sku}</p>}
                        <p className="text-fp-muted text-xs truncate max-w-[200px]">{r.proposals?.proposal_name || ''}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#C8622A]/20 text-[#C8622A]">
                          {r.billing_frequency || 'Annual'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-fp-text text-sm font-semibold">
                        {r.customer_price_total != null ? `$${Number(r.customer_price_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-5 py-4 text-fp-muted text-sm">
                        {r.renewal_date ? new Date(r.renewal_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => toggleBomAutoInvoice(r)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${r.auto_invoice ? 'bg-green-500' : 'bg-fp-border'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${r.auto_invoice ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                          {r.auto_invoice && r.next_invoice_date && (
                            <p className="text-fp-muted text-xs">
                              Next: {new Date(r.next_invoice_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

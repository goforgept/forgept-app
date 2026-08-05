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
  const [editContract, setEditContract] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [editRecurring, setEditRecurring] = useState(null)
  const [editRecurringForm, setEditRecurringForm] = useState({})
  const [savingRecurring, setSavingRecurring] = useState(false)

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
    // Get proposal IDs for this org first (handles legacy bom_line_items where org_id may be null)
    let proposalsQuery = supabase.from('proposals').select('id').eq('org_id', prof.org_id)
    if (prof.org_role !== 'admin') proposalsQuery = proposalsQuery.eq('user_id', prof.id)
    const { data: propRows } = await proposalsQuery
    const propIds = (propRows || []).map(p => p.id)
    if (!propIds.length) { setRecurringItems([]); return }

    const { data } = await supabase
      .from('bom_line_items')
      .select('id, item_name, part_number_sku, customer_price_total, billing_frequency, auto_invoice, next_invoice_date, renewal_date, proposal_id, proposals(proposal_name, company, client_name, user_id)')
      .in('proposal_id', propIds)
      .eq('recurring', true)
      .order('renewal_date', { ascending: true, nullsFirst: false })

    setRecurringItems(data || [])
  }

  const openEditContract = (e, contract) => {
    e.stopPropagation()
    setEditContract(contract)
    setEditForm({
      name: contract.name || '',
      status: contract.status || 'Active',
      start_date: contract.start_date || '',
      end_date: contract.end_date || '',
      auto_renew: contract.auto_renew || false,
      recurring_fee: contract.recurring_fee != null ? String(contract.recurring_fee) : '',
      billing_frequency: contract.billing_frequency || 'Monthly',
    })
  }

  const saveContractEdit = async () => {
    setSavingEdit(true)
    const updates = {
      name: editForm.name,
      status: editForm.status,
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
      auto_renew: editForm.auto_renew,
      recurring_fee: editForm.recurring_fee !== '' ? parseFloat(editForm.recurring_fee) : null,
      billing_frequency: editForm.billing_frequency || null,
    }
    await supabase.from('contracts').update(updates).eq('id', editContract.id)
    setContracts(prev => prev.map(c => c.id === editContract.id ? { ...c, ...updates } : c))
    setSavingEdit(false)
    setEditContract(null)
  }

  const deleteContract = async () => {
    if (!window.confirm('Permanently delete this contract? This cannot be undone.')) return
    await supabase.from('contracts').delete().eq('id', editContract.id)
    setContracts(prev => prev.filter(c => c.id !== editContract.id))
    setEditContract(null)
  }

  const openEditRecurring = (e, item) => {
    e.stopPropagation()
    setEditRecurring(item)
    setEditRecurringForm({
      item_name: item.item_name || '',
      billing_frequency: item.billing_frequency || 'Annual',
      renewal_date: item.renewal_date || '',
      customer_price_total: item.customer_price_total != null ? String(item.customer_price_total) : '',
    })
  }

  const saveRecurringEdit = async () => {
    setSavingRecurring(true)
    const updates = {
      item_name: editRecurringForm.item_name,
      billing_frequency: editRecurringForm.billing_frequency,
      renewal_date: editRecurringForm.renewal_date || null,
      customer_price_total: editRecurringForm.customer_price_total !== '' ? parseFloat(editRecurringForm.customer_price_total) : null,
    }
    await supabase.from('bom_line_items').update(updates).eq('id', editRecurring.id)
    setRecurringItems(prev => prev.map(r => r.id === editRecurring.id ? { ...r, ...updates } : r))
    setSavingRecurring(false)
    setEditRecurring(null)
  }

  const deleteRecurring = async () => {
    if (!window.confirm('Remove this item from recurring subscriptions? It will stay on the proposal but will no longer be tracked here.')) return
    await supabase.from('bom_line_items').update({ recurring: false }).eq('id', editRecurring.id)
    setRecurringItems(prev => prev.filter(r => r.id !== editRecurring.id))
    setEditRecurring(null)
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

  const toMonthly = (amount, freq) => {
    const a = parseFloat(amount) || 0
    if (!a) return 0
    const f = (freq || 'Annual').toLowerCase()
    if (f === 'monthly') return a
    if (f === 'quarterly') return a / 3
    return a / 12
  }

  const rmrSla = contracts.filter(c => c.status === 'Active' && c.type === 'sla').reduce((sum, c) => sum + toMonthly(c.recurring_fee, c.billing_frequency), 0)
  const rmrMonitoring = contracts.filter(c => c.status === 'Active' && c.type === 'monitoring').reduce((sum, c) => sum + toMonthly(c.recurring_fee, c.billing_frequency), 0)
  const rmrSubscriptions = recurringItems.reduce((sum, r) => sum + toMonthly(r.customer_price_total, r.billing_frequency), 0)
  const rmr = rmrSla + rmrMonitoring + rmrSubscriptions
  const arr = rmr * 12

  const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const renewalAlerts = [
    ...contracts
      .filter(c => { const d = daysUntil(c.end_date); return c.status === 'Active' && d !== null && d >= 0 && d <= 90 })
      .map(c => ({
        id: c.id, name: c.name, company: c.proposals?.company || c.proposals?.client_name,
        daysLeft: daysUntil(c.end_date), date: c.end_date,
        autoRenew: c.auto_renew, autoInvoice: c.auto_invoice,
        proposalId: c.proposal_id, kind: 'contract', type: c.type,
      })),
    ...recurringItems
      .filter(r => { const d = daysUntil(r.renewal_date); return d !== null && d >= 0 && d <= 90 })
      .map(r => ({
        id: r.id, name: r.item_name, company: r.proposals?.company || r.proposals?.client_name,
        daysLeft: daysUntil(r.renewal_date), date: r.renewal_date,
        autoRenew: true, autoInvoice: r.auto_invoice,
        proposalId: r.proposal_id, kind: 'recurring', type: 'subscription',
      })),
  ].sort((a, b) => a.daysLeft - b.daysLeft)

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} featureInventory={featureInventory} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-fp-text text-2xl font-bold">Contracts</h1>
            <p className="text-fp-muted text-sm mt-0.5">Service agreements and recurring billing</p>
          </div>

          {/* RMR / ARR with category breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-fp-card rounded-xl p-5 border border-[#C8622A]/30">
              <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1">Monthly Recurring Revenue</p>
              <p className="text-[#C8622A] text-3xl font-bold">{fmt(rmr)}</p>
              <p className="text-fp-muted text-xs mt-1 mb-3">RMR / month</p>
              <div className="space-y-1 border-t border-fp-border pt-3">
                {rmrSla > 0 && <div className="flex justify-between text-xs"><span className="text-fp-muted">Service SLA</span><span className="text-fp-text font-semibold">{fmt(rmrSla)}</span></div>}
                {rmrMonitoring > 0 && <div className="flex justify-between text-xs"><span className="text-fp-muted">Monitoring</span><span className="text-fp-text font-semibold">{fmt(rmrMonitoring)}</span></div>}
                {rmrSubscriptions > 0 && <div className="flex justify-between text-xs"><span className="text-fp-muted">Subscriptions</span><span className="text-fp-text font-semibold">{fmt(rmrSubscriptions)}</span></div>}
                {rmr === 0 && <p className="text-fp-muted text-xs">No recurring fees set</p>}
              </div>
            </div>
            <div className="bg-fp-card rounded-xl p-5 border border-[#C8622A]/30">
              <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1">Annual Recurring Revenue</p>
              <p className="text-[#C8622A] text-3xl font-bold">{fmt(arr)}</p>
              <p className="text-fp-muted text-xs mt-1 mb-3">ARR / year</p>
              <div className="space-y-1 border-t border-fp-border pt-3">
                {rmrSla > 0 && <div className="flex justify-between text-xs"><span className="text-fp-muted">Service SLA</span><span className="text-fp-text font-semibold">{fmt(rmrSla * 12)}</span></div>}
                {rmrMonitoring > 0 && <div className="flex justify-between text-xs"><span className="text-fp-muted">Monitoring</span><span className="text-fp-text font-semibold">{fmt(rmrMonitoring * 12)}</span></div>}
                {rmrSubscriptions > 0 && <div className="flex justify-between text-xs"><span className="text-fp-muted">Subscriptions</span><span className="text-fp-text font-semibold">{fmt(rmrSubscriptions * 12)}</span></div>}
                {arr === 0 && <p className="text-fp-muted text-xs">No recurring fees set</p>}
              </div>
            </div>
          </div>

          {/* Summary counts */}
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

          {/* Renewal alerts */}
          {renewalAlerts.length > 0 && (
            <div className="bg-fp-card rounded-xl border border-yellow-500/30 mb-6 overflow-hidden">
              <div className="px-5 py-3 border-b border-fp-border flex items-center gap-2">
                <span className="text-yellow-400 text-sm">⚠</span>
                <h3 className="text-fp-text text-sm font-bold">Renewal Alerts</h3>
                <span className="ml-auto text-fp-muted text-xs">{renewalAlerts.length} within 90 days</span>
              </div>
              <div className="divide-y divide-fp-border">
                {renewalAlerts.map(alert => {
                  const isAutoInvoice = alert.autoInvoice
                  const isAutoRenewOnly = alert.autoRenew && !alert.autoInvoice
                  const isManual = !alert.autoRenew
                  return (
                    <div key={`${alert.kind}-${alert.id}`}
                      className="px-5 py-3 flex items-start gap-4 hover:bg-fp-inset transition-colors cursor-pointer"
                      onClick={() => alert.proposalId && navigate(`/proposal/${alert.proposalId}`)}>
                      <div className="flex-shrink-0 mt-0.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${alert.daysLeft <= 30 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {alert.daysLeft}d
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-fp-text text-sm font-semibold">{alert.company || '—'}</span>
                          <span className="text-fp-muted text-xs">·</span>
                          <span className="text-fp-muted text-xs truncate">{alert.name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${alert.type === 'sla' ? 'bg-[#C8622A]/20 text-[#C8622A]' : alert.type === 'monitoring' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                            {alert.type === 'sla' ? 'SLA' : alert.type === 'monitoring' ? 'Monitoring' : 'Subscription'}
                          </span>
                        </div>
                        <p className="text-fp-muted text-xs mt-0.5">
                          Renews {new Date(alert.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' · '}
                          {isAutoInvoice
                            ? <span className="text-green-400 font-medium">Auto-invoice enabled — verify your amounts before renewal</span>
                            : isAutoRenewOnly
                            ? <span className="text-yellow-400 font-medium">Will auto-renew but no auto-invoice set — send invoice manually</span>
                            : <span className="text-red-400 font-medium">Not set to auto-renew — send a renewal invoice and update contract dates</span>
                          }
                        </p>
                      </div>
                      {isAutoInvoice && (
                        <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Auto-Invoice</span>
                      )}
                      {isAutoRenewOnly && (
                        <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Invoice Needed</span>
                      )}
                      {isManual && (
                        <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Action Required</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
                    <th className="px-5 py-3"></th>
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
                        className={`group border-b border-fp-border cursor-pointer transition-colors hover:bg-fp-inset ${isExpiringSoon ? 'bg-yellow-500/5' : ''} ${i === filtered.length - 1 ? 'border-0' : ''}`}
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
                        <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                          <button onClick={e => openEditContract(e, c)}
                            className="text-fp-muted hover:text-fp-text text-xs font-medium px-3 py-1.5 rounded-lg border border-fp-border hover:border-fp-text/30 transition-colors opacity-0 group-hover:opacity-100">
                            Edit
                          </button>
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
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {recurringItems.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => r.proposal_id && navigate(`/proposal/${r.proposal_id}`)}
                      className={`group border-b border-fp-border cursor-pointer transition-colors hover:bg-fp-inset ${i === recurringItems.length - 1 ? 'border-0' : ''}`}
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
                      <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                        <button onClick={e => openEditRecurring(e, r)}
                          className="text-fp-muted hover:text-fp-text text-xs font-medium px-3 py-1.5 rounded-lg border border-fp-border hover:border-fp-text/30 transition-colors opacity-0 group-hover:opacity-100">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Contract Modal */}
      {editContract && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditContract(null)}>
          <div className="bg-fp-card rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-fp-text font-bold text-lg mb-5">Edit Contract</h3>
            <div className="space-y-4">
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Name</label>
                <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                    <option>Active</option>
                    <option>Expired</option>
                    <option>Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Billing</label>
                  <select value={editForm.billing_frequency} onChange={e => setEditForm(p => ({ ...p, billing_frequency: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Start Date</label>
                  <input type="date" value={editForm.start_date} onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                </div>
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">End Date</label>
                  <input type="date" value={editForm.end_date} onChange={e => setEditForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Recurring Fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fp-muted text-sm">$</span>
                  <input type="number" min="0" step="0.01" value={editForm.recurring_fee}
                    onChange={e => setEditForm(p => ({ ...p, recurring_fee: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fp-text text-sm font-medium">Auto-Renew</span>
                <button onClick={() => setEditForm(p => ({ ...p, auto_renew: !p.auto_renew }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editForm.auto_renew ? 'bg-green-500' : 'bg-fp-border'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.auto_renew ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center mt-6">
              <button onClick={deleteContract}
                className="text-red-400 hover:text-red-300 text-sm transition-colors">
                Delete Contract
              </button>
              <div className="flex gap-3">
                <button onClick={() => setEditContract(null)} className="px-4 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={saveContractEdit} disabled={savingEdit}
                  className="bg-fp-brand text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Recurring Item Modal */}
      {editRecurring && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditRecurring(null)}>
          <div className="bg-fp-card rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-fp-text font-bold text-lg mb-5">Edit Recurring Item</h3>
            <div className="space-y-4">
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Item Name</label>
                <input value={editRecurringForm.item_name} onChange={e => setEditRecurringForm(p => ({ ...p, item_name: e.target.value }))}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Frequency</label>
                  <select value={editRecurringForm.billing_frequency} onChange={e => setEditRecurringForm(p => ({ ...p, billing_frequency: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Renewal Date</label>
                  <input type="date" value={editRecurringForm.renewal_date} onChange={e => setEditRecurringForm(p => ({ ...p, renewal_date: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fp-muted text-sm">$</span>
                  <input type="number" min="0" step="0.01" value={editRecurringForm.customer_price_total}
                    onChange={e => setEditRecurringForm(p => ({ ...p, customer_price_total: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-6">
              <button onClick={deleteRecurring}
                className="text-red-400 hover:text-red-300 text-sm transition-colors">
                Remove Subscription
              </button>
              <div className="flex gap-3">
                <button onClick={() => setEditRecurring(null)} className="px-4 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={saveRecurringEdit} disabled={savingRecurring}
                  className="bg-fp-brand text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingRecurring ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

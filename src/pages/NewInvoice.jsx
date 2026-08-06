import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

export default function NewInvoice({ isAdmin, featureProposals = true, featureCRM = false }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useProfile()
  const [sourceType, setSourceType] = useState('proposal') // 'proposal' | 'ticket'
  const [proposals, setProposals] = useState([])
  const [selectedProposal, setSelectedProposal] = useState(null)
  const [serviceTickets, setServiceTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [saving, setSaving] = useState(false)
  const [orgDefaultTaxRate, setOrgDefaultTaxRate] = useState('')
  const [ticketSlaContracts, setTicketSlaContracts] = useState([])
  const [slaVisitsUsed, setSlaVisitsUsed] = useState({})
  const [slaMode, setSlaMode] = useState(null) // null | 'covered' | 'billable'
  const [selectedSlaContractId, setSelectedSlaContractId] = useState(null)
  const [form, setForm] = useState({
    proposal_id: '',
    service_ticket_id: '',
    issued_date: new Date().toISOString().split('T')[0],
    due_date: '',
    tax_percent: '0',
    description: '',
    notes: '',
  })
  const [lineItems, setLineItems] = useState([])
  const [includedCOs, setIncludedCOs] = useState([])
  const [contractFees, setContractFees] = useState([])
  const [includedContractFees, setIncludedContractFees] = useState({})
  const [aiaWarning, setAiaWarning] = useState(false)
  const [clientPaymentMethod, setClientPaymentMethod] = useState('')
  const [orgServiceBilling, setOrgServiceBilling] = useState({ mode: 'none', tripFee: 0, driveRate: 0 })

  useEffect(() => { if (profile?.org_id) fetchData() }, [profile?.org_id])

  useEffect(() => {
    if (slaMode !== 'billable') return
    const contract = ticketSlaContracts.find(c => c.id === selectedSlaContractId)
    if (!contract?.labor_rate) return
    const rate = parseFloat(contract.labor_rate)
    setLineItems(prev => prev.map(item => {
      if (!item._isLabor) return item
      const hours = parseFloat(item.quantity) || 1
      return { ...item, unit_price: rate, total: Math.round(hours * rate * 100) / 100 }
    }))
  }, [slaMode, selectedSlaContractId])

  const fetchData = async () => {
    const defaultRate = profile?.organizations?.default_tax_rate ?? ''
    setOrgDefaultTaxRate(String(defaultRate))
    setForm(prev => ({ ...prev, tax_percent: String(defaultRate || '0') }))

    const { data: orgSvc } = await supabase
      .from('organizations')
      .select('service_billing_mode, trip_fee_default, drive_time_rate_default')
      .eq('id', profile.org_id)
      .single()
    if (orgSvc) {
      setOrgServiceBilling({
        mode: orgSvc.service_billing_mode || 'none',
        tripFee: parseFloat(orgSvc.trip_fee_default) || 0,
        driveRate: parseFloat(orgSvc.drive_time_rate_default) || 0,
      })
    }

    const { data: props } = await supabase
      .from('proposals')
      .select('id, proposal_name, company, client_name, total_customer_value, labor_items, client_id, clients(net_terms, payment_method)')
      .eq('org_id', profile.org_id)
      .eq('status', 'Won')
      .order('created_at', { ascending: false })
    setProposals(props || [])

    const { data: tickets } = await supabase
      .from('service_tickets')
      .select('id, ticket_number, title, status, client_id, line_items, labor_items, clients(company, client_name, payment_method, net_terms)')
      .eq('org_id', profile.org_id)
      .neq('status', 'Cancelled')
      .order('created_at', { ascending: false })
    setServiceTickets(tickets || [])

    // Pre-select if proposalId passed in URL
    const preId = searchParams.get('proposalId')
    if (preId) {
      setForm(prev => ({ ...prev, proposal_id: preId }))
      loadProposalItems(preId, props || [])
    }
  }

  const applyClientTerms = (clientData) => {
    if (!clientData) return
    if (clientData.net_terms) {
      const termDays = clientData.net_terms === 'Due on Receipt' ? 0
        : parseInt(clientData.net_terms.replace('NET ', '')) || 30
      const due = new Date()
      due.setDate(due.getDate() + termDays)
      setForm(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }))
    }
    setClientPaymentMethod(clientData.payment_method || '')
  }

  const loadProposalItems = async (proposalId, propsList) => {
    const prop = (propsList.length ? propsList : proposals).find(p => p.id === proposalId)
    setSelectedProposal(prop || null)
    setSelectedTicket(null)
    setContractFees([])
    setIncludedContractFees({})

    const { data: bomItems } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('proposal_id', proposalId)

    if (prop) {
      setForm(prev => ({ ...prev, description: prop.job_description || prop.proposal_name || '' }))
    }

    const items = []
    if (bomItems?.length) {
      bomItems.forEach(i => {
        if (i.item_name) items.push({
          description: i.item_name,
          quantity: i.quantity || 1,
          unit_price: i.customer_price_unit || 0,
          total: (i.customer_price_unit || 0) * (i.quantity || 1)
        })
      })
    }

    const laborItems = prop?.labor_items || []
    laborItems.filter(l => l.role).forEach(l => {
      items.push({
        description: l.role,
        quantity: l.quantity || 1,
        unit_price: parseFloat(l.customer_price) || 0,
        total: parseFloat(l.customer_price) || 0
      })
    })

    // Load job for billing type, client terms, and change orders
    const { data: jobData } = await supabase
      .from('jobs')
      .select('id, billing_type, client_id')
      .eq('proposal_id', proposalId)
      .maybeSingle()

    if (jobData?.id) {
      // AIA billing type warning
      setAiaWarning(jobData.billing_type === 'AIA')

      // Auto-set due date from client NET terms
      if (jobData.client_id) {
        const { data: clientData } = await supabase.from('clients').select('net_terms, payment_method').eq('id', jobData.client_id).single()
        applyClientTerms(clientData)
      } else {
        applyClientTerms(prop?.clients)
      }

      const { data: coData } = await supabase
        .from('change_orders')
        .select('*')
        .eq('job_id', jobData.id)
        .eq('status', 'Approved')
      const approved = coData || []
      setIncludedCOs(approved)
      approved.forEach(co => {
        if (co.line_items?.length || co.labor_items?.length) {
          ;(co.line_items || []).forEach(l => {
            if (l.item_name) items.push({
              description: `CO: ${co.name} — ${l.item_name}`,
              quantity: parseFloat(l.quantity) || 1,
              unit_price: parseFloat(l.customer_price_unit) || 0,
              total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 1)
            })
          })
          ;(co.labor_items || []).forEach(l => {
            if (l.role) items.push({
              description: `CO: ${co.name} — ${l.role}`,
              quantity: parseFloat(l.quantity) || 1,
              unit_price: l.quantity > 0 ? (parseFloat(l.customer_price) || 0) / parseFloat(l.quantity) : 0,
              total: parseFloat(l.customer_price) || 0
            })
          })
        } else {
          items.push({
            description: `Change Order: ${co.name}`,
            quantity: 1,
            unit_price: co.amount || 0,
            total: co.amount || 0
          })
        }
      })
    } else {
      setIncludedCOs([])
      applyClientTerms(prop?.clients)
    }

    setLineItems(items)

    // Load SLA & monitoring contract fees
    const { data: propFull } = await supabase
      .from('proposals')
      .select('sla_contracts, monitoring_contracts, tax_rate, tax_exempt')
      .eq('id', proposalId)
      .single()

    // Apply proposal tax rate, or fall back to org default
    const proposalTaxRate = (!propFull?.tax_exempt && propFull?.tax_rate)
      ? String(propFull.tax_rate)
      : propFull?.tax_exempt ? '0' : orgDefaultTaxRate
    setForm(prev => ({ ...prev, tax_percent: proposalTaxRate }))

    const fees = []
    const initIncluded = {}
    ;(propFull?.sla_contracts || []).forEach((c, i) => {
      if (c.initial_fee > 0) {
        const key = `sla_init_${i}`
        fees.push({ key, label: `${c.name || 'Service Agreement'} — Initial Fee`, amount: c.initial_fee })
        initIncluded[key] = false
      }
      if (c.recurring_fee > 0) {
        const key = `sla_rec_${i}`
        fees.push({ key, label: `${c.name || 'Service Agreement'} — ${c.billing_frequency || 'Recurring'} Fee`, amount: c.recurring_fee })
        initIncluded[key] = false
      }
    })
    ;(propFull?.monitoring_contracts || []).forEach((c, i) => {
      if (c.monthly_fee > 0) {
        const key = `mon_${i}`
        const freq = c.billing_frequency || 'Monthly'
        const multiplier = freq === 'Annual' || freq === 'Annually' ? 12 : freq === 'Quarterly' ? 3 : 1
        const amount = (parseFloat(c.monthly_fee) || 0) * multiplier
        fees.push({ key, label: `${c.name || 'Monitoring Contract'} — ${freq} Fee`, amount })
        initIncluded[key] = false
      }
    })
    setContractFees(fees)
    setIncludedContractFees(initIncluded)
  }

  const getContractYearStart = (startDateStr) => {
    if (!startDateStr) return new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const now = new Date()
    let yearStart = new Date(startDateStr)
    while (true) {
      const next = new Date(yearStart)
      next.setFullYear(next.getFullYear() + 1)
      if (next > now) break
      yearStart = next
    }
    return yearStart.toISOString().split('T')[0]
  }

  const loadTicketItems = async (ticketId) => {
    setSelectedProposal(null)
    setIncludedCOs([])
    setTicketSlaContracts([])
    setSlaVisitsUsed({})
    setSlaMode(null)
    setSelectedSlaContractId(null)

    // Always re-fetch from DB for fresh line_items / labor_items / client_id
    const { data: freshTicket } = await supabase
      .from('service_tickets')
      .select('id, ticket_number, title, status, client_id, line_items, labor_items, clients(company, client_name, payment_method, net_terms)')
      .eq('id', ticketId)
      .single()

    const ticket = freshTicket || serviceTickets.find(t => t.id === ticketId) || null
    setSelectedTicket(ticket)

    if (!ticket) { setLineItems([]); setClientPaymentMethod(''); return }

    applyClientTerms(ticket.clients)
    setForm(prev => ({ ...prev, description: ticket.title || '', tax_percent: orgDefaultTaxRate || '0' }))

    // Look up active SLA contracts for this client
    if (ticket.client_id) {
      const { data: slaRows } = await supabase
        .from('contracts')
        .select('id, name, labor_rate, emergency_rate, maintenance_calls_per_year, start_date, end_date, billing_frequency')
        .eq('org_id', profile.org_id)
        .eq('client_id', ticket.client_id)
        .eq('type', 'sla')
        .eq('status', 'Active')
      if (slaRows?.length) {
        setTicketSlaContracts(slaRows)
        setSelectedSlaContractId(slaRows[0].id)
        const usedMap = {}
        for (const c of slaRows) {
          const yearStart = getContractYearStart(c.start_date)
          const { count } = await supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('contract_id', c.id)
            .eq('is_sla_visit', true)
            .gte('issued_date', yearStart)
          usedMap[c.id] = count || 0
        }
        setSlaVisitsUsed(usedMap)
      }
    }

    const items = []
    const { mode, tripFee, driveRate } = orgServiceBilling

    // Materials — use customer_price_unit (marked-up price)
    const ticketLines = ticket.line_items || []
    if (ticketLines.length > 0) {
      ticketLines.forEach(l => {
        if (l.item_name) items.push({
          description: l.item_name,
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.customer_price_unit) || 0,
          total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 1)
        })
      })
    } else if ((mode === 'trip_fee' || mode === 'both') && tripFee > 0) {
      // Ticket was never opened in detail — inject default trip fee
      items.push({ description: 'Trip Fee', quantity: 1, unit_price: tripFee, total: tripFee })
    }

    // Labor — use customer_price (marked-up total for that labor line)
    const ticketLabor = ticket.labor_items || []
    if (ticketLabor.length > 0) {
      ticketLabor.forEach(l => {
        if (l.role) {
          const hours = parseFloat(l.quantity) || 1
          const unitPrice = hours > 0 ? (parseFloat(l.customer_price) || 0) / hours : parseFloat(l.customer_price) || 0
          items.push({
            description: l.role,
            quantity: hours,
            unit_price: unitPrice,
            total: parseFloat(l.customer_price) || 0,
            _isLabor: true,
          })
        }
      })
    } else if ((mode === 'drive_time' || mode === 'both') && driveRate > 0) {
      items.push({ description: 'Drive Time', quantity: 1, unit_price: driveRate, total: driveRate, _isLabor: true })
    }

    setLineItems(items)
  }

  const handleProposalChange = (proposalId) => {
    setForm(prev => ({ ...prev, proposal_id: proposalId, service_ticket_id: '' }))
    setAiaWarning(false)
    if (proposalId) loadProposalItems(proposalId, proposals)
    else { setSelectedProposal(null); setLineItems([]); setClientPaymentMethod('') }
  }

  const handleTicketChange = async (ticketId) => {
    setForm(prev => ({ ...prev, service_ticket_id: ticketId, proposal_id: '' }))
    if (ticketId) await loadTicketItems(ticketId)
    else { setSelectedTicket(null); setLineItems([]); setClientPaymentMethod(''); setTicketSlaContracts([]); setSlaMode(null) }
  }

  const updateLine = (i, field, value) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        updated[i].total = (parseFloat(updated[i].quantity) || 0) * (parseFloat(updated[i].unit_price) || 0)
      }
      return updated
    })
  }

  const addLine = () => setLineItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, total: 0 }])
  const removeLine = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  const contractFeesTotal = contractFees.filter(f => includedContractFees[f.key]).reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0)
  const lineSubtotal = lineItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0) + contractFeesTotal
  const ccFeePercent = parseFloat(profile?.organizations?.cc_fee_percent) || 3.0
  const ccFeeAmount = clientPaymentMethod === 'Credit Card' ? Math.round(lineSubtotal * (ccFeePercent / 100) * 100) / 100 : 0
  const subtotal = lineSubtotal + ccFeeAmount
  const taxAmount = subtotal * ((parseFloat(form.tax_percent) || 0) / 100)
  const total = subtotal + taxAmount

  const handleSave = async () => {
    setSaving(true)

    const { data: invoiceNumber } = await supabase.rpc('get_next_invoice_number', { org_id_input: profile.org_id })

    const isCovered = slaMode === 'covered'
    const invoiceTotal = isCovered ? 0 : total

    const { data: inv, error } = await supabase.from('invoices').insert({
      org_id: profile.org_id,
      proposal_id: form.proposal_id || null,
      service_ticket_id: form.service_ticket_id || null,
      contract_id: isCovered ? selectedSlaContractId : null,
      is_sla_visit: isCovered,
      invoice_number: invoiceNumber,
      status: 'Draft',
      issued_date: form.issued_date,
      due_date: form.due_date || null,
      subtotal: isCovered ? 0 : subtotal,
      tax_percent: isCovered ? 0 : parseFloat(form.tax_percent) || 0,
      tax_amount: isCovered ? 0 : taxAmount,
      total: invoiceTotal,
      amount_paid: 0,
      balance_due: invoiceTotal,
      description: form.description,
      notes: form.notes
    }).select().single()

    if (error) { alert('Error creating invoice'); setSaving(false); return }

    const selectedFeeItems = contractFees
      .filter(f => includedContractFees[f.key])
      .map(f => ({ description: f.label, quantity: 1, unit_price: f.amount, total: f.amount }))

    const slaContract = ticketSlaContracts.find(c => c.id === selectedSlaContractId)
    const allItems = isCovered
      ? [{ description: `SLA Covered Visit — ${slaContract?.name || 'Service Agreement'}`, quantity: 1, unit_price: 0, total: 0 }]
      : [...lineItems.filter(i => i.description), ...selectedFeeItems]
    if (ccFeeAmount > 0) {
      allItems.push({ description: `Credit Card Service Fee (${ccFeePercent}%)`, quantity: 1, unit_price: ccFeeAmount, total: ccFeeAmount })
    }
    if (allItems.length > 0) {
      await supabase.from('invoice_line_items').insert(
        allItems.map(({ _isLabor, ...i }) => ({
          invoice_id: inv.id,
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit_price: parseFloat(i.unit_price) || 0,
          total: parseFloat(i.total) || 0
        }))
      )
    }

    setSaving(false)
    navigate(`/invoices/${inv.id}`)
  }

  const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6 max-w-4xl">
        <div className="flex justify-between items-center">
          <h2 className="text-fp-text text-2xl font-bold">New Invoice</h2>
          <button onClick={() => navigate('/invoices')} className="text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
        </div>

        {/* Invoice Details */}
        <div className="bg-fp-card rounded-xl p-6">
          <h3 className="text-fp-text font-bold mb-4">Invoice Details</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Source type toggle */}
            <div className="col-span-2">
              <label className="text-fp-muted text-xs mb-2 block">Invoice Source</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setSourceType('proposal'); setSelectedTicket(null); setForm(p => ({ ...p, service_ticket_id: '' })); setLineItems([]) }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${sourceType === 'proposal' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                  Won Proposal / Job
                </button>
                <button
                  onClick={() => { setSourceType('ticket'); setSelectedProposal(null); setForm(p => ({ ...p, proposal_id: '' })); setLineItems([]) }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${sourceType === 'ticket' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                  Service Ticket
                </button>
              </div>
            </div>

            {/* Proposal selector */}
            {sourceType === 'proposal' && (
              <div className="col-span-2">
                <label className="text-fp-muted text-xs mb-1 block">Link to Won Proposal (optional)</label>
                <select value={form.proposal_id} onChange={e => handleProposalChange(e.target.value)} className={inputClass}>
                  <option value="">— Select a proposal or create manually —</option>
                  {proposals.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_name} — {p.company}</option>
                  ))}
                </select>
                {selectedProposal && !aiaWarning && (
                  <p className="text-green-400 text-xs mt-1">
                    ✓ Line items loaded from proposal
                    {includedCOs.length > 0 && ` + ${includedCOs.length} approved change order${includedCOs.length !== 1 ? 's' : ''}`}
                  </p>
                )}
                {aiaWarning && (
                  <div className="mt-2 flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                    <span className="text-yellow-400 text-sm mt-0.5">⚠</span>
                    <div>
                      <p className="text-yellow-400 text-xs font-semibold">This job is billed via AIA Applications</p>
                      <p className="text-yellow-400/70 text-xs">Payment applications should be created from the AIA Applications tab on the job. Creating a manual invoice here may result in duplicate billing.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Service ticket selector */}
            {sourceType === 'ticket' && (
              <div className="col-span-2">
                <label className="text-fp-muted text-xs mb-1 block">Select Service Ticket</label>
                <select value={form.service_ticket_id} onChange={e => handleTicketChange(e.target.value)} className={inputClass}>
                  <option value="">— Select a service ticket —</option>
                  {serviceTickets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.ticket_number ? `${t.ticket_number} — ` : ''}{t.title}{t.clients?.company ? ` · ${t.clients.company}` : ''} [{t.status}]
                    </option>
                  ))}
                </select>
                {selectedTicket && (
                  <p className="text-green-400 text-xs mt-1">
                    ✓ Line items loaded from ticket
                    {(!selectedTicket.line_items?.length && !selectedTicket.labor_items?.length) && ' — no labor or materials logged yet on this ticket'}
                  </p>
                )}
                {selectedTicket && ticketSlaContracts.length > 0 && (() => {
                  const contract = ticketSlaContracts.find(c => c.id === selectedSlaContractId) || ticketSlaContracts[0]
                  const visitsUsed = slaVisitsUsed[contract?.id] || 0
                  const visitsIncluded = contract?.maintenance_calls_per_year || 0
                  const visitsRemaining = Math.max(0, visitsIncluded - visitsUsed)
                  const isCovered = visitsRemaining > 0
                  return (
                    <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-blue-400 font-semibold text-sm">Active SLA Contract</p>
                          {ticketSlaContracts.length > 1 ? (
                            <select value={selectedSlaContractId || ''} onChange={e => setSelectedSlaContractId(e.target.value)}
                              className="mt-1 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand">
                              {ticketSlaContracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          ) : (
                            <p className="text-fp-muted text-xs mt-0.5">{contract?.name}</p>
                          )}
                        </div>
                        <div className={`text-xs font-bold px-2 py-1 rounded ${visitsRemaining > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {visitsRemaining > 0 ? `${visitsRemaining} visit${visitsRemaining !== 1 ? 's' : ''} remaining` : 'No visits remaining'}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                        <div className="bg-fp-card rounded-lg px-3 py-2">
                          <p className="text-fp-muted mb-0.5">Labor Rate</p>
                          <p className="text-fp-text font-bold">{contract?.labor_rate ? `$${contract.labor_rate}/hr` : '—'}</p>
                        </div>
                        <div className="bg-fp-card rounded-lg px-3 py-2">
                          <p className="text-fp-muted mb-0.5">Emergency Rate</p>
                          <p className="text-fp-text font-bold">{contract?.emergency_rate ? `$${contract.emergency_rate}/hr` : '—'}</p>
                        </div>
                        <div className="bg-fp-card rounded-lg px-3 py-2">
                          <p className="text-fp-muted mb-0.5">Visits / Year</p>
                          <p className="text-fp-text font-bold">{visitsUsed} of {visitsIncluded} used</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setSlaMode('covered')}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${slaMode === 'covered' ? 'bg-green-600 text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                          {isCovered ? 'SLA Covered ($0)' : 'Use Remaining Visit ($0)'}
                        </button>
                        <button onClick={() => setSlaMode('billable')}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${slaMode === 'billable' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                          Billable Overage
                        </button>
                      </div>
                      {slaMode === 'covered' && (
                        <p className="text-green-400 text-xs mt-2">Invoice will be created at $0 and logged as a covered SLA visit.</p>
                      )}
                      {slaMode === 'billable' && contract?.labor_rate && (
                        <p className="text-blue-400 text-xs mt-2">Billable at ${contract.labor_rate}/hr standard · ${contract.emergency_rate || '—'}/hr emergency per SLA terms.</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="col-span-2">
              <label className="text-fp-muted text-xs mb-1 block">Description of Work</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={3} placeholder="Brief description of the work being invoiced..."
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Invoice Date</label>
              <input type="date" value={form.issued_date} onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Tax %</label>
              <input type="number" value={form.tax_percent} onChange={e => setForm(p => ({ ...p, tax_percent: e.target.value }))} placeholder="0" className="w-32 bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-fp-card rounded-xl p-6">
          <h3 className="text-fp-text font-bold mb-4">Line Items</h3>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-fp-border">
                {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                  <th key={h} className="text-fp-muted text-left py-2 pr-3 font-normal text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-b border-fp-border/30">
                  <td className="pr-3 py-1">
                    <div className="flex items-center gap-1.5">
                      {item._isLabor && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold flex-shrink-0">Labor</span>}
                      <input type="text" value={item.description} onChange={e => updateLine(i, 'description', e.target.value)}
                        placeholder="Description" className="w-full bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand" />
                    </div>
                  </td>
                  <td className="pr-3 py-1">
                    <input type="number" value={item.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)}
                      className="w-16 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand" />
                  </td>
                  <td className="pr-3 py-1">
                    <input type="number" value={item.unit_price} onChange={e => updateLine(i, 'unit_price', e.target.value)}
                      className="w-24 bg-fp-inset text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand" />
                  </td>
                  <td className="pr-3 py-1 text-fp-text text-xs">${(parseFloat(item.total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1"><button onClick={() => removeLine(i)} className="text-fp-muted hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr><td colSpan="5" className="py-4 text-fp-muted text-xs italic">No line items yet. Select a source above or add manually.</td></tr>
              )}
            </tbody>
          </table>
          <button onClick={addLine} className="text-[#C8622A] hover:text-fp-text text-sm transition-colors">+ Add Line</button>

          {/* Contract fees */}
          {contractFees.length > 0 && (
            <div className="mt-5 border-t border-fp-border pt-4">
              <p className="text-fp-text text-sm font-semibold mb-2">Service Agreement & Monitoring Fees</p>
              <p className="text-fp-muted text-xs mb-3">Select any fees to include on this invoice.</p>
              <div className="space-y-2">
                {contractFees.map(f => (
                  <label key={f.key} className="flex items-center justify-between bg-fp-inset rounded-lg px-4 py-2.5 cursor-pointer hover:bg-fp-inset transition-colors">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={includedContractFees[f.key] || false}
                        onChange={e => setIncludedContractFees(prev => ({ ...prev, [f.key]: e.target.checked }))}
                        className="accent-fp-brand"
                      />
                      <span className="text-fp-text text-sm">{f.label}</span>
                    </div>
                    <span className="text-[#C8622A] text-sm font-semibold">${parseFloat(f.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-fp-border pt-4 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm"><span className="text-fp-muted">Subtotal</span><span className="text-fp-text">${lineSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
            {ccFeeAmount > 0 && <div className="flex justify-between text-sm"><span className="text-yellow-400">Credit Card Fee ({ccFeePercent}%)</span><span className="text-yellow-400">${ccFeeAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>}
            {parseFloat(form.tax_percent) > 0 && <div className="flex justify-between text-sm"><span className="text-fp-muted">Tax ({form.tax_percent}%)</span><span className="text-fp-text">${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>}
            <div className="flex justify-between text-base font-bold border-t border-fp-border pt-2"><span className="text-fp-text">Total</span><span className="text-[#C8622A]">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-fp-card rounded-xl p-6">
          <h3 className="text-fp-text font-bold mb-3">Notes</h3>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3} placeholder="Payment terms, project notes, etc."
            className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" />
        </div>

        <div className="flex justify-end gap-4">
          <button onClick={() => navigate('/invoices')} className="px-6 py-3 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || lineItems.length === 0}
            className="px-6 py-3 bg-fp-brand text-white rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

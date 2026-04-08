import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function NewInvoice({ isAdmin, featureProposals = true, featureCRM = false }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [sourceType, setSourceType] = useState('proposal') // 'proposal' | 'ticket'
  const [proposals, setProposals] = useState([])
  const [selectedProposal, setSelectedProposal] = useState(null)
  const [serviceTickets, setServiceTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [profile, setProfile] = useState(null)
  const [saving, setSaving] = useState(false)
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
  const [contractFees, setContractFees] = useState([]) // { label, amount, included }
  const [includedContractFees, setIncludedContractFees] = useState({})

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(prof)

    const { data: props } = await supabase
      .from('proposals')
      .select('id, proposal_name, company, client_name, total_customer_value, labor_items')
      .eq('org_id', prof.org_id)
      .eq('status', 'Won')
      .order('created_at', { ascending: false })
    setProposals(props || [])

    const { data: tickets } = await supabase
      .from('service_tickets')
      .select('id, ticket_number, title, status, line_items, labor_items, clients(company, client_name)')
      .eq('org_id', prof.org_id)
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

    // Load approved change orders
    const { data: jobData } = await supabase
      .from('jobs')
      .select('id')
      .eq('proposal_id', proposalId)
      .maybeSingle()

    if (jobData?.id) {
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
    }

    setLineItems(items)

    // Load SLA & monitoring contract fees
    const { data: propFull } = await supabase
      .from('proposals')
      .select('sla_contracts, monitoring_contracts')
      .eq('id', proposalId)
      .single()

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

  const loadTicketItems = (ticketId) => {
    const ticket = serviceTickets.find(t => t.id === ticketId)
    setSelectedTicket(ticket || null)
    setSelectedProposal(null)
    setIncludedCOs([])

    if (!ticket) { setLineItems([]); return }

    setForm(prev => ({ ...prev, description: ticket.title || '' }))

    const items = []

    // Materials — use customer_price_unit (marked-up price)
    ;(ticket.line_items || []).forEach(l => {
      if (l.item_name) items.push({
        description: l.item_name,
        quantity: parseFloat(l.quantity) || 1,
        unit_price: parseFloat(l.customer_price_unit) || 0,
        total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 1)
      })
    })

    // Labor — use customer_price (marked-up total for that labor line)
    ;(ticket.labor_items || []).forEach(l => {
      if (l.role) items.push({
        description: l.role,
        quantity: parseFloat(l.quantity) || 1,
        unit_price: parseFloat(l.quantity) > 0
          ? (parseFloat(l.customer_price) || 0) / parseFloat(l.quantity)
          : parseFloat(l.customer_price) || 0,
        total: parseFloat(l.customer_price) || 0
      })
    })

    setLineItems(items)
  }

  const handleProposalChange = (proposalId) => {
    setForm(prev => ({ ...prev, proposal_id: proposalId, service_ticket_id: '' }))
    if (proposalId) loadProposalItems(proposalId, proposals)
    else { setSelectedProposal(null); setLineItems([]) }
  }

  const handleTicketChange = (ticketId) => {
    setForm(prev => ({ ...prev, service_ticket_id: ticketId, proposal_id: '' }))
    if (ticketId) loadTicketItems(ticketId)
    else { setSelectedTicket(null); setLineItems([]) }
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
  const subtotal = lineItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0) + contractFeesTotal
  const taxAmount = subtotal * ((parseFloat(form.tax_percent) || 0) / 100)
  const total = subtotal + taxAmount

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

    const { data: org } = await supabase.from('organizations').select('invoice_counter').eq('id', prof.org_id).single()
    const invoiceNumber = `INV-${String(org.invoice_counter).padStart(4, '0')}`
    await supabase.from('organizations').update({ invoice_counter: org.invoice_counter + 1 }).eq('id', prof.org_id)

    const { data: inv, error } = await supabase.from('invoices').insert({
      org_id: prof.org_id,
      proposal_id: form.proposal_id || null,
      service_ticket_id: form.service_ticket_id || null,
      invoice_number: invoiceNumber,
      status: 'Draft',
      issued_date: form.issued_date,
      due_date: form.due_date || null,
      subtotal,
      tax_percent: parseFloat(form.tax_percent) || 0,
      tax_amount: taxAmount,
      total,
      amount_paid: 0,
      balance_due: total,
      description: form.description,
      notes: form.notes
    }).select().single()

    if (error) { alert('Error creating invoice'); setSaving(false); return }

    const selectedFeeItems = contractFees
      .filter(f => includedContractFees[f.key])
      .map(f => ({ description: f.label, quantity: 1, unit_price: f.amount, total: f.amount }))

    const allItems = [...lineItems.filter(i => i.description), ...selectedFeeItems]
    if (allItems.length > 0) {
      await supabase.from('invoice_line_items').insert(
        allItems.map(i => ({
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

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6 max-w-4xl">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">New Invoice</h2>
          <button onClick={() => navigate('/invoices')} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
        </div>

        {/* Invoice Details */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Invoice Details</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Source type toggle */}
            <div className="col-span-2">
              <label className="text-[#8A9AB0] text-xs mb-2 block">Invoice Source</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setSourceType('proposal'); setSelectedTicket(null); setForm(p => ({ ...p, service_ticket_id: '' })); setLineItems([]) }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${sourceType === 'proposal' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white border border-[#2a3d55]'}`}>
                  Won Proposal / Job
                </button>
                <button
                  onClick={() => { setSourceType('ticket'); setSelectedProposal(null); setForm(p => ({ ...p, proposal_id: '' })); setLineItems([]) }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${sourceType === 'ticket' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white border border-[#2a3d55]'}`}>
                  Service Ticket
                </button>
              </div>
            </div>

            {/* Proposal selector */}
            {sourceType === 'proposal' && (
              <div className="col-span-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Link to Won Proposal (optional)</label>
                <select value={form.proposal_id} onChange={e => handleProposalChange(e.target.value)} className={inputClass}>
                  <option value="">— Select a proposal or create manually —</option>
                  {proposals.map(p => (
                    <option key={p.id} value={p.id}>{p.proposal_name} — {p.company}</option>
                  ))}
                </select>
                {selectedProposal && (
                  <p className="text-green-400 text-xs mt-1">
                    ✓ Line items loaded from proposal
                    {includedCOs.length > 0 && ` + ${includedCOs.length} approved change order${includedCOs.length !== 1 ? 's' : ''}`}
                  </p>
                )}
              </div>
            )}

            {/* Service ticket selector */}
            {sourceType === 'ticket' && (
              <div className="col-span-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Select Service Ticket</label>
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
              </div>
            )}

            <div className="col-span-2">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Description of Work</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={3} placeholder="Brief description of the work being invoiced..."
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Invoice Date</label>
              <input type="date" value={form.issued_date} onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Tax %</label>
              <input type="number" value={form.tax_percent} onChange={e => setForm(p => ({ ...p, tax_percent: e.target.value }))} placeholder="0" className="w-32 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Line Items</h3>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-[#2a3d55]">
                {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                  <th key={h} className="text-[#8A9AB0] text-left py-2 pr-3 font-normal text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-b border-[#2a3d55]/30">
                  <td className="pr-3 py-1">
                    <input type="text" value={item.description} onChange={e => updateLine(i, 'description', e.target.value)}
                      placeholder="Description" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                  </td>
                  <td className="pr-3 py-1">
                    <input type="number" value={item.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)}
                      className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                  </td>
                  <td className="pr-3 py-1">
                    <input type="number" value={item.unit_price} onChange={e => updateLine(i, 'unit_price', e.target.value)}
                      className="w-24 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                  </td>
                  <td className="pr-3 py-1 text-white text-xs">${(parseFloat(item.total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1"><button onClick={() => removeLine(i)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr><td colSpan="5" className="py-4 text-[#8A9AB0] text-xs italic">No line items yet. Select a source above or add manually.</td></tr>
              )}
            </tbody>
          </table>
          <button onClick={addLine} className="text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Line</button>

          {/* Contract fees */}
          {contractFees.length > 0 && (
            <div className="mt-5 border-t border-[#2a3d55] pt-4">
              <p className="text-white text-sm font-semibold mb-2">Service Agreement & Monitoring Fees</p>
              <p className="text-[#8A9AB0] text-xs mb-3">Select any fees to include on this invoice.</p>
              <div className="space-y-2">
                {contractFees.map(f => (
                  <label key={f.key} className="flex items-center justify-between bg-[#0F1C2E] rounded-lg px-4 py-2.5 cursor-pointer hover:bg-[#0a1828] transition-colors">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={includedContractFees[f.key] || false}
                        onChange={e => setIncludedContractFees(prev => ({ ...prev, [f.key]: e.target.checked }))}
                        className="accent-[#C8622A]"
                      />
                      <span className="text-white text-sm">{f.label}</span>
                    </div>
                    <span className="text-[#C8622A] text-sm font-semibold">${parseFloat(f.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-[#2a3d55] pt-4 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Subtotal</span><span className="text-white">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
            {parseFloat(form.tax_percent) > 0 && <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Tax ({form.tax_percent}%)</span><span className="text-white">${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>}
            <div className="flex justify-between text-base font-bold border-t border-[#2a3d55] pt-2"><span className="text-white">Total</span><span className="text-[#C8622A]">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-3">Notes</h3>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3} placeholder="Payment terms, project notes, etc."
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
        </div>

        <div className="flex justify-end gap-4">
          <button onClick={() => navigate('/invoices')} className="px-6 py-3 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || lineItems.length === 0}
            className="px-6 py-3 bg-[#C8622A] text-white rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'

const INDUSTRIES = [
  'Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security',
  'Low Voltage', 'General Contractor', 'Roofing', 'Home Improvement', 'Flooring',
  'Painting', 'Landscaping', 'Solar', 'Fire Protection', 'Telecom', 'IT / Networking', 'Other'
]

export default function NewProposal() {
  const navigate = useNavigate()
  const location = useLocation()
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [locations, setLocations] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [clientContacts, setClientContacts] = useState([])
  const [selectedContactId, setSelectedContactId] = useState('__main__')
  const [profile, setProfile] = useState(null)
  const [taxRate, setTaxRate] = useState('')
  const [taxExempt, setTaxExempt] = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 45)
    return {
      job_description: '',
      client_name: '',
      company: '',
      client_email: '',
      close_date: d.toISOString().split('T')[0],
      industry: '',
      rep_name: '',
      rep_email: '',
    }
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, organizations(org_type, default_tax_rate)')
      .eq('id', user.id)
      .single()

    if (prof) {
      setProfile(prof)
      setForm(prev => ({
        ...prev,
        rep_name: prof.full_name || '',
        rep_email: prof.email || user.email || '',
      }))
      setTaxRate(prof.organizations?.default_tax_rate ?? '')

      if (prof.org_id) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, company, client_name, email, industry')
          .eq('org_id', prof.org_id)
          .order('company', { ascending: true })
        setClients(clientsData || [])
      }
    }

    // Handle pre-selected client from URL
    const params = new URLSearchParams(location.search)
    const clientId = params.get('clientId')
    if (clientId) {
      setSelectedClientId(clientId)
      await prefillClient(clientId, params.get('locationId'))
    }
  }

  const prefillClient = async (clientId, preselectedLocationId = null) => {
    const [{ data }, { data: locs }, { data: contacts }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('client_locations').select('*').eq('client_id', clientId).order('site_name', { ascending: true }),
      supabase.from('client_contacts').select('*').eq('client_id', clientId).order('is_primary', { ascending: false }).order('full_name', { ascending: true }),
    ])
    if (data) {
      setForm(prev => ({
        ...prev,
        client_name: data.client_name || '',
        company: data.company || '',
        client_email: data.email || '',
        industry: data.industry || prev.industry,
      }))
      setClientContacts(contacts || [])
      setSelectedContactId('__main__')
    }
    setLocations(locs || [])
    if (preselectedLocationId && locs?.some(l => l.id === preselectedLocationId)) {
      setSelectedLocationId(preselectedLocationId)
    }
  }

  const handleClientSelect = async (clientId) => {
    setSelectedClientId(clientId)
    setSelectedLocationId('')
    setSelectedContactId('__main__')
    setLocations([])
    setClientContacts([])
    if (clientId) {
      await prefillClient(clientId)
    } else {
      setForm(prev => ({ ...prev, client_name: '', company: '', client_email: '' }))
    }
  }

  const handleContactSelect = (value) => {
    setSelectedContactId(value)
    if (value === '__main__') {
      const client = clients.find(c => c.id === selectedClientId)
      setForm(prev => ({ ...prev, client_name: client?.client_name || '', client_email: client?.email || '' }))
    } else if (value === '__none__') {
      setForm(prev => ({ ...prev, client_name: '', client_email: '' }))
    } else {
      const contact = clientContacts.find(c => c.id === value)
      if (contact) setForm(prev => ({ ...prev, client_name: contact.full_name || '', client_email: contact.email || '' }))
    }
  }

  const validate = () => {
    const e = {}
    if (!form.job_description.trim()) e.job_description = 'Deal name is required'
    if (!form.company.trim() && !selectedClientId) e.company = 'Company is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

    // Auto-generate quote number
    let quoteNumber = ''
    if (prof?.org_id) {
      const { data: org } = await supabase.from('organizations').select('quote_counter').eq('id', prof.org_id).single()
      quoteNumber = `Q-${org.quote_counter}`
      await supabase.from('organizations').update({ quote_counter: org.quote_counter + 1 }).eq('id', prof.org_id)
    }

    // Create client if new
    const params = new URLSearchParams(location.search)
    let clientId = params.get('clientId') || selectedClientId || null
    if (!clientId && form.company.trim()) {
      const { data: newClient } = await supabase.from('clients').insert({
        org_id: prof?.org_id,
        company: form.company,
        client_name: form.client_name || '',
        email: form.client_email || '',
        industry: form.industry || '',
        active: true,
      }).select().single()
      if (newClient) clientId = newClient.id
    }

    const taxRateVal = taxExempt ? 0 : (parseFloat(taxRate) || 0)

    const resolvedContactId = selectedContactId && selectedContactId !== '__main__' && selectedContactId !== '__none__' ? selectedContactId : null

    const { data: proposal, error } = await supabase.from('proposals').insert({
      proposal_name: form.job_description,
      user_id: user.id,
      org_id: prof?.org_id,
      client_id: clientId || null,
      contact_id: resolvedContactId,
      location_id: selectedLocationId || null,
      rep_name: form.rep_name,
      rep_email: form.rep_email,
      client_name: form.client_name,
      company: form.company,
      client_email: form.client_email,
      close_date: form.close_date,
      industry: form.industry,
      job_description: form.job_description,
      status: 'Draft',
      quote_number: quoteNumber,
      tax_rate: taxRateVal,
      tax_exempt: taxExempt,
      labor_items: [],
      proposal_value: 0,
      total_customer_value: 0,
      total_your_cost: 0,
      total_gross_margin_dollars: 0,
      total_gross_margin_percent: 0,
    }).select().single()

    if (error) { alert('Error creating deal: ' + error.message); setSaving(false); return }
    navigate(`/proposal/${proposal.id}`)
  }

  const inputClass = (field) =>
    `w-full bg-[#0a1628] text-white border rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors placeholder-[#3a4d65] ${
      errors[field] ? 'border-red-500/60 focus:border-red-400' : 'border-[#1e3450] focus:border-[#C8622A]'
    }`

  const selectedClient = clients.find(c => c.id === selectedClientId)

  return (
    <div className="min-h-screen bg-[#070f1a]">

      {/* Top bar */}
      <div className="border-b border-[#1a2d45] px-6 py-4 flex justify-between items-center bg-[#0a1628]">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg">ForgePt<span className="text-[#C8622A]">.</span></span>
          <span className="text-[#2a3d55] text-sm">›</span>
          <span className="text-[#8A9AB0] text-sm">Create Deal</span>
        </div>
        <button onClick={() => navigate(-1)} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">
          Cancel
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-white text-3xl font-bold tracking-tight mb-2">Create Deal</h1>
          <p className="text-[#8A9AB0] text-sm">Fill in the basics. You'll add your BOM, labor, and scope once the deal is created.</p>
        </div>

        <div className="space-y-6">

          {/* Deal Name */}
          <div className="bg-[#0a1628] border border-[#1a2d45] rounded-2xl p-6">
            <label className="text-white text-sm font-semibold block mb-1">
              Deal Name <span className="text-[#C8622A]">*</span>
            </label>
            <p className="text-[#8A9AB0] text-xs mb-3">What is this job? e.g. "Access Control Upgrade — Main Office"</p>
            <input
              type="text"
              value={form.job_description}
              onChange={e => { setForm(prev => ({ ...prev, job_description: e.target.value })); setErrors(prev => ({ ...prev, job_description: '' })) }}
              placeholder="e.g. 8 Camera Security Install — Warehouse"
              className={inputClass('job_description')}
              autoFocus
            />
            {errors.job_description && <p className="text-red-400 text-xs mt-1">{errors.job_description}</p>}
          </div>

          {/* Client */}
          <div className="bg-[#0a1628] border border-[#1a2d45] rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-white text-sm font-semibold block mb-3">Client</label>
              <select
                value={selectedClientId}
                onChange={e => handleClientSelect(e.target.value)}
                className="w-full bg-[#070f1a] text-white border border-[#1e3450] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A] transition-colors"
              >
                <option value="">— Select existing client or add new below —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.company}{c.client_name ? ` — ${c.client_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Location picker — only shows if client has locations */}
            {locations.length > 0 && (
              <div>
                <label className="text-[#8A9AB0] text-xs font-semibold block mb-1 uppercase tracking-wide">Job Site Location</label>
                <select
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                  className="w-full bg-[#070f1a] text-white border border-[#1e3450] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A] transition-colors"
                >
                  <option value="">— Main address (no specific location) —</option>
                  {locations.map(l => {
                    const addr = [l.address, l.city, l.state].filter(Boolean).join(', ')
                    return (
                      <option key={l.id} value={l.id}>
                        {l.site_name}{addr ? ` — ${addr}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Contact picker — only shows when a client is selected */}
            {selectedClientId && (
              <div>
                <label className="text-[#8A9AB0] text-xs font-semibold block mb-1 uppercase tracking-wide">Deal Contact</label>
                <select
                  value={selectedContactId}
                  onChange={e => handleContactSelect(e.target.value)}
                  className="w-full bg-[#070f1a] text-white border border-[#1e3450] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A] transition-colors"
                >
                  {(() => {
                    const client = clients.find(c => c.id === selectedClientId)
                    const mainLabel = client?.client_name
                      ? `${client.client_name}${client.email ? ` — ${client.email}` : ''} (main contact)`
                      : '— Main client contact —'
                    return <option value="__main__">{mainLabel}</option>
                  })()}
                  {clientContacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}{c.title ? ` · ${c.title}` : ''}{c.email ? ` — ${c.email}` : ''}
                    </option>
                  ))}
                  <option value="__none__">— No specific contact —</option>
                </select>
                {selectedContactId && selectedContactId !== '__main__' && selectedContactId !== '__none__' && (() => {
                  const contact = clientContacts.find(c => c.id === selectedContactId)
                  return contact ? (
                    <p className="text-[#8A9AB0] text-xs mt-1.5">
                      Contact name and email on this deal will be set to <span className="text-white">{contact.full_name}</span>{contact.email ? <> · <span className="text-[#C8622A]">{contact.email}</span></> : null}
                    </p>
                  ) : null
                })()}
              </div>
            )}

            {/* Manual client fields */}
            <div className={`grid grid-cols-2 gap-3 ${selectedClientId ? 'opacity-60' : ''}`}>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">
                  Company {!selectedClientId && <span className="text-[#C8622A]">*</span>}
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={e => { setForm(prev => ({ ...prev, company: e.target.value })); setErrors(prev => ({ ...prev, company: '' })) }}
                  placeholder="Company name"
                  disabled={!!selectedClientId}
                  className={inputClass('company')}
                />
                {errors.company && <p className="text-red-400 text-xs mt-1">{errors.company}</p>}
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Contact Name</label>
                <input
                  type="text"
                  value={form.client_name}
                  onChange={e => setForm(prev => ({ ...prev, client_name: e.target.value }))}
                  placeholder="Contact name"
                  disabled={!!selectedClientId}
                  className={inputClass('client_name')}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Client Email</label>
                <input
                  type="email"
                  value={form.client_email}
                  onChange={e => setForm(prev => ({ ...prev, client_email: e.target.value }))}
                  placeholder="client@company.com"
                  disabled={!!selectedClientId}
                  className={inputClass('client_email')}
                />
              </div>
            </div>

            {selectedClientId && (
              <button
                onClick={() => handleClientSelect('')}
                className="text-[#8A9AB0] hover:text-[#C8622A] text-xs transition-colors"
              >
                ✕ Clear client — enter manually instead
              </button>
            )}
          </div>

          {/* Deal Details */}
          <div className="bg-[#0a1628] border border-[#1a2d45] rounded-2xl p-6">
            <label className="text-white text-sm font-semibold block mb-4">Deal Details</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                <select
                  value={form.industry}
                  onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))}
                  className="w-full bg-[#070f1a] text-white border border-[#1e3450] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A] transition-colors"
                >
                  <option value="">Select industry</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Close Date</label>
                <input
                  type="date"
                  value={form.close_date}
                  onChange={e => setForm(prev => ({ ...prev, close_date: e.target.value }))}
                  className={inputClass('close_date')}
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Tax Rate %</label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                  placeholder="e.g. 9.25"
                  disabled={taxExempt}
                  className={`${inputClass('taxRate')} ${taxExempt ? 'opacity-40' : ''}`}
                />
              </div>
              <div className="flex items-end pb-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setTaxExempt(p => !p)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${taxExempt ? 'bg-[#C8622A]' : 'bg-[#1e3450]'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${taxExempt ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-[#8A9AB0] text-sm">Tax Exempt</span>
                </label>
              </div>
            </div>
          </div>

          {/* Rep */}
          <div className="bg-[#0a1628] border border-[#1a2d45] rounded-2xl p-6">
            <label className="text-white text-sm font-semibold block mb-4">Rep Details</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Rep Name</label>
                <input
                  type="text"
                  value={form.rep_name}
                  onChange={e => setForm(prev => ({ ...prev, rep_name: e.target.value }))}
                  className={inputClass('rep_name')}
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Rep Email</label>
                <input
                  type="email"
                  value={form.rep_email}
                  onChange={e => setForm(prev => ({ ...prev, rep_email: e.target.value }))}
                  className={inputClass('rep_email')}
                />
              </div>
            </div>
          </div>

          {/* What happens next hint */}
          <div className="bg-[#C8622A]/8 border border-[#C8622A]/20 rounded-2xl px-5 py-4">
            <p className="text-[#C8622A] text-xs font-semibold uppercase tracking-wide mb-2">After creating your deal you can:</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                '📦 Add BOM line items',
                '⏱ Add labor',
                '✨ Generate SOW with AI',
                '📋 Load from a template',
                '📎 Upload Excel BOM',
                '🔍 Search product library',
              ].map(item => (
                <p key={item} className="text-[#8A9AB0] text-xs">{item}</p>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-3.5 text-[#8A9AB0] hover:text-white text-sm transition-colors rounded-xl border border-[#1a2d45] hover:border-[#2a3d55]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3.5 bg-[#C8622A] text-white rounded-xl font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Deal →'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
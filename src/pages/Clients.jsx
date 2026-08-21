import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const emptyForm = {
  client_name: '', company: '', email: '', phone: '',
  industry: '', crm_source: '', notes: '',
  address: '', city: '', state: '', zip: '', store_id: '',
  net_terms: 'NET 30', payment_method: 'Default',
}

const industries = ['Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security', 'Low Voltage', 'General Contractor', 'Roofing', 'Home Improvement', 'Flooring', 'Painting', 'Landscaping', 'Solar', 'Fire Protection', 'Telecom', 'IT / Networking', 'Other']

const industryColors = {
  'Electrical': 'bg-yellow-500/20 text-yellow-400',
  'Mechanical': 'bg-blue-500/20 text-blue-400',
  'Plumbing': 'bg-cyan-500/20 text-cyan-400',
  'HVAC': 'bg-sky-500/20 text-sky-400',
  'Audio/Visual': 'bg-purple-500/20 text-purple-400',
  'Security': 'bg-red-500/20 text-red-400',
  'Low Voltage': 'bg-orange-500/20 text-orange-400',
  'General Contractor': 'bg-green-500/20 text-green-400',
  'Roofing': 'bg-amber-500/20 text-amber-400',
  'Home Improvement': 'bg-lime-500/20 text-lime-400',
  'Flooring': 'bg-teal-500/20 text-teal-400',
  'Painting': 'bg-pink-500/20 text-pink-400',
  'Landscaping': 'bg-emerald-500/20 text-emerald-400',
  'Solar': 'bg-yellow-400/20 text-yellow-300',
  'Fire Protection': 'bg-red-600/20 text-red-300',
  'Telecom': 'bg-indigo-500/20 text-indigo-400',
  'IT / Networking': 'bg-violet-500/20 text-violet-400',
  'Other': 'bg-fp-inset text-fp-muted',
}

export default function Clients({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [panel, setPanel] = useState(null) // null | { clientId, company }
  const [contactForm, setContactForm] = useState({ full_name: '', title: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [companySuggestions, setCompanySuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchOrgAndClients() }, [])

  const fetchOrgAndClients = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)

    const { data } = await supabase
      .from('clients')
      .select('*, client_locations(id)')
      .eq('org_id', profile.org_id)
      .order('company', { ascending: true })
    setClients(data || [])
    setLoading(false)
  }

  const handleCompanyInput = (value) => {
    setForm(prev => ({ ...prev, company: value }))
    if (value.length > 0) {
      const existing = [...new Set(clients.map(c => c.company).filter(Boolean))]
      const matches = existing.filter(c => c.toLowerCase().includes(value.toLowerCase()))
      setCompanySuggestions(matches)
      setShowSuggestions(matches.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  const handleAdd = async () => {
    setSaving(true)
    setError(null)
    if (!form.company) { setError('Company name is required'); setSaving(false); return }

    const { data: newClient, error } = await supabase.from('clients')
      .insert({ ...form, active: true, org_id: orgId })
      .select('id').single()

    if (error) { setError(error.message); setSaving(false); return }

    setForm(emptyForm)
    setPanel(null)
    setShowModal(false)
    setSaving(false)
    fetchOrgAndClients()

    // Push to Zoho and QBO if connected (fire-and-forget)
    if (newClient?.id) {
      const { data: { session } } = await supabase.auth.getSession()
      const pushHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
      const pushBody = JSON.stringify({ clientId: newClient.id })
      fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/zoho-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
      fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/qbo-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
      fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/stripe-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
      fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/square-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
    }
  }

  const handleAddContact = async () => {
    if (!contactForm.full_name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const { error } = await supabase.from('client_contacts').insert({
      ...contactForm,
      client_id: panel.clientId,
      org_id: profile.org_id,
      is_primary: false,
      notes: '',
      location_id: null,
    })
    if (error) { setError(error.message); setSaving(false); return }
    setContactForm({ full_name: '', title: '', email: '', phone: '' })
    setPanel(null)
    setSaving(false)
  }

  const archiveCompany = async (e, company) => {
    e.stopPropagation()
    const ids = clients.filter(c => c.company === company).map(c => c.id)
    await supabase.from('clients').update({ archived_at: new Date().toISOString() }).in('id', ids)
    setClients(prev => prev.map(c => ids.includes(c.id) ? { ...c, archived_at: new Date().toISOString() } : c))
  }

  const restoreCompany = async (e, company) => {
    e.stopPropagation()
    const ids = clients.filter(c => c.company === company).map(c => c.id)
    await supabase.from('clients').update({ archived_at: null }).in('id', ids)
    setClients(prev => prev.map(c => ids.includes(c.id) ? { ...c, archived_at: null } : c))
  }

  // Group clients by company
  const grouped = clients.reduce((acc, client) => {
    const company = client.company || 'No Company'
    if (!acc.has(company)) acc.set(company, [])
    acc.get(company).push(client)
    return acc
  }, new Map())

  // One card per company — archived if all contacts are archived
  const companies = Array.from(grouped.entries()).map(([company, contacts]) => ({
    company,
    contacts,
    primary: contacts[0],
    industry: contacts[0]?.industry || '',
    location: [contacts[0]?.city, contacts[0]?.state].filter(Boolean).join(', '),
    email: contacts[0]?.email || '',
    phone: contacts[0]?.phone || '',
    isArchived: contacts.every(c => !!c.archived_at),
  }))

  const archivedCount = companies.filter(c => c.isArchived).length

  const filtered = companies
    .filter(c => showArchived ? c.isArchived : !c.isArchived)
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        c.company.toLowerCase().includes(q) ||
        c.contacts.some(x => (x.client_name || '').toLowerCase().includes(q)) ||
        c.contacts.some(x => (x.email || '').toLowerCase().includes(q))
      const matchIndustry = !filterIndustry || c.industry === filterIndustry
      return matchSearch && matchIndustry
    })
    .map(c => {
      const q = search.toLowerCase()
      if (!q || c.company.toLowerCase().includes(q)) return { ...c, visibleContacts: c.contacts, navigateTo: c.contacts[0]?.id }
      const matched = c.contacts.filter(x =>
        (x.client_name || '').toLowerCase().includes(q) ||
        (x.email || '').toLowerCase().includes(q)
      )
      return { ...c, visibleContacts: matched.length ? matched : c.contacts, navigateTo: (matched[0] || c.contacts[0])?.id }
    })

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">{showArchived ? 'Archived Clients' : 'Clients'}</h2>
            <p className="text-fp-muted text-sm mt-0.5">{clients.length} total · {companies.length} companies</p>
          </div>
          <div className="flex items-center gap-3">
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(v => !v)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  showArchived ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30' : 'bg-fp-card text-fp-muted hover:text-fp-text'
                }`}
              >
                {showArchived ? '← Active' : `Archive (${archivedCount})`}
              </button>
            )}
            {!showArchived && (
              <button
                onClick={() => { setShowModal(true); setError(null) }}
                className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
              >
                + Add Client
              </button>
            )}
          </div>
        </div>

        {/* Search + Filter bar */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search companies, contacts, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"
          />
          <select
            value={filterIndustry}
            onChange={e => setFilterIndustry(e.target.value)}
            className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
          >
            <option value="">All Industries</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Cards grid */}
        {loading ? (
          <p className="text-fp-muted">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-fp-muted text-lg mb-2">No clients found</p>
            <p className="text-fp-muted text-sm">Try adjusting your search or add a new client.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(({ company, contacts, visibleContacts, navigateTo, primary, industry, location, email, phone, isArchived }) => {
              const initials = company.slice(0, 2).toUpperCase()
              const badgeClass = industryColors[industry] || industryColors['Other']
              const displayPrimary = visibleContacts[0] || primary
              const fullAddress = [displayPrimary?.address, displayPrimary?.city, displayPrimary?.state, displayPrimary?.zip].filter(Boolean).join(', ')

              return (
                <div
                  key={company}
                  onClick={() => navigate(`/client/${navigateTo}`)}
                  className="bg-fp-card rounded-xl p-5 cursor-pointer hover:bg-fp-hover hover:border-fp-brand/40 border border-fp-border transition-all group"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#C8622A] text-sm font-bold">{initials}</span>
                      </div>
                      <div>
                        <p className="text-fp-text font-semibold group-hover:text-[#C8622A] transition-colors leading-tight">
                          {company}
                        </p>
                        {visibleContacts.length > 0 && (
                          <p className="text-fp-muted text-xs mt-0.5">
                            {visibleContacts.map(c => c.client_name).filter(Boolean).join(', ') || 'No contact name'}
                            {visibleContacts.length < contacts.length && (
                              <span className="text-fp-muted/50"> +{contacts.length - visibleContacts.length} more</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {industry && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${badgeClass}`}>
                        {industry}
                      </span>
                    )}
                  </div>

                  {/* Contact details */}
                  <div className="space-y-1.5">
                    {displayPrimary?.email && (
                      <div className="flex items-center gap-2">
                        <span className="text-fp-muted text-xs w-4">@</span>
                        <span className="text-fp-muted text-xs truncate">{displayPrimary.email}</span>
                      </div>
                    )}
                    {displayPrimary?.phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-fp-muted text-xs w-4">#</span>
                        <span className="text-fp-muted text-xs">{displayPrimary.phone}</span>
                      </div>
                    )}
                    {[displayPrimary?.city, displayPrimary?.state].filter(Boolean).join(', ') && (
                      <div className="flex items-center gap-2">
                        <span className="text-fp-muted text-xs w-4">⌖</span>
                        <span className="text-fp-muted text-xs">{[displayPrimary?.city, displayPrimary?.state].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {displayPrimary?.store_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-fp-muted text-xs w-4">ID</span>
                        <span className="text-fp-muted text-xs font-mono">{displayPrimary.store_id}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-fp-border">
                    <div className="flex gap-3">
                      <span className="text-fp-muted text-xs">
                        {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
                      </span>
                      {(() => {
                        const locCount = contacts.reduce((sum, c) => sum + (c.client_locations?.length || 0), 0)
                        return locCount > 0 ? <span className="text-fp-muted text-xs">· {locCount} {locCount === 1 ? 'location' : 'locations'}</span> : null
                      })()}
                    </div>
                    <div className="flex gap-2 items-center">
                      {!isArchived && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setPanel({ clientId: navigateTo, company })
                            setContactForm({ full_name: '', title: '', email: '', phone: '' })
                            setError(null)
                          }}
                          className="text-fp-muted hover:text-fp-text text-xs transition-colors"
                        >
                          + Contact
                        </button>
                      )}
                      {isArchived ? (
                        <button
                          onClick={e => restoreCompany(e, company)}
                          className="text-fp-muted hover:text-green-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          onClick={e => archiveCompany(e, company)}
                          className="text-fp-muted hover:text-[#C8622A] text-xs transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Archive
                        </button>
                      )}
                      <span className="text-fp-muted text-xs group-hover:text-[#C8622A] transition-colors">→</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Client Modal (full form) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-fp-text font-bold text-lg mb-5">New Client</h3>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-fp-muted text-xs mb-1 block">Company <span className="text-[#C8622A]">*</span></label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={e => handleCompanyInput(e.target.value)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Company name"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                  {showSuggestions && (
                    <div className="absolute z-10 w-full mt-1 bg-fp-inset border border-fp-border rounded-lg overflow-hidden shadow-lg">
                      {companySuggestions.map(c => (
                        <button key={c} onClick={() => { setForm(prev => ({ ...prev, company: c })); setShowSuggestions(false) }}
                          className="w-full text-left px-3 py-2 text-fp-text text-sm hover:bg-fp-card transition-colors">
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Contact Name</label>
                  <input type="text" value={form.client_name}
                    onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Email</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Phone</label>
                  <input type="text" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Industry</label>
                  <select value={form.industry}
                    onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  >
                    <option value="">Select industry</option>
                    {industries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">CRM Source</label>
                  <input type="text" value={form.crm_source}
                    onChange={e => setForm(p => ({ ...p, crm_source: e.target.value }))}
                    placeholder="e.g. Referral, Website"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
              </div>

              <div>
                <label className="text-fp-muted text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="123 Main St"
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">City</label>
                  <input type="text" value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="Nashville"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">State</label>
                  <input type="text" value={form.state}
                    onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                    placeholder="TN"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">ZIP</label>
                  <input type="text" value={form.zip}
                    onChange={e => setForm(p => ({ ...p, zip: e.target.value }))}
                    placeholder="37201"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Store ID</label>
                  <input type="text" value={form.store_id}
                    onChange={e => setForm(p => ({ ...p, store_id: e.target.value }))}
                    placeholder="e.g. STR-001"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  />
                </div>
                <div>{/* spacer */}</div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Payment Terms</label>
                  <select value={form.net_terms} onChange={e => setForm(p => ({ ...p, net_terms: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                    {['Due on Receipt', 'NET 15', 'NET 30', 'NET 45', 'NET 60', 'NET 90'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                    {['Default', 'Check', 'ACH', 'Credit Card'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-fp-muted text-xs mb-1 block">Notes</label>
                <textarea value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any notes about this client..."
                  rows={3}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowModal(false); setForm(emptyForm); setError(null) }}
                  className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving || !form.company}
                  className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Panel (inserts to client_contacts) */}
      {panel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setPanel(null); setError(null) }} />
          <div className="fixed inset-y-0 right-0 w-80 bg-fp-card border-l border-fp-border z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fp-border">
              <h3 className="text-fp-text font-semibold">New Contact — {panel.company}</h3>
              <button onClick={() => { setPanel(null); setError(null) }} className="text-fp-muted hover:text-fp-text text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div>
                <label className="text-fp-muted text-xs mb-1 block">Full Name <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={contactForm.full_name}
                  onChange={e => setContactForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>

              <div>
                <label className="text-fp-muted text-xs mb-1 block">Title / Role</label>
                <input type="text" value={contactForm.title}
                  onChange={e => setContactForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Project Manager"
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>

              <div>
                <label className="text-fp-muted text-xs mb-1 block">Email</label>
                <input type="email" value={contactForm.email}
                  onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>

              <div>
                <label className="text-fp-muted text-xs mb-1 block">Phone</label>
                <input type="text" value={contactForm.phone}
                  onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-fp-border flex gap-3">
              <button
                onClick={() => { setPanel(null); setError(null) }}
                className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContact}
                disabled={saving || !contactForm.full_name.trim()}
                className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
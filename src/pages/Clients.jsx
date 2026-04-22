import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const emptyForm = {
  client_name: '', company: '', email: '', phone: '',
  industry: '', crm_source: '', notes: '',
  address: '', city: '', state: '', zip: '', store_id: ''
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
  'Other': 'bg-[#2a3d55] text-[#8A9AB0]',
}

export default function Clients({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')
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

    const { error } = await supabase.from('clients').insert({
      ...form, active: true, org_id: orgId
    })

    if (error) { setError(error.message); setSaving(false); return }

    setForm(emptyForm)
    setShowModal(false)
    fetchOrgAndClients()
    setSaving(false)
  }

  // Group clients by company
  const grouped = clients.reduce((acc, client) => {
    const company = client.company || 'No Company'
    if (!acc[company]) acc[company] = []
    acc[company].push(client)
    return acc
  }, {})

  // One card per company — use first contact's details for the card
  const companies = Object.entries(grouped).map(([company, contacts]) => ({
    company,
    contacts,
    primary: contacts[0],
    industry: contacts[0]?.industry || '',
    location: [contacts[0]?.city, contacts[0]?.state].filter(Boolean).join(', '),
    email: contacts[0]?.email || '',
    phone: contacts[0]?.phone || '',
  }))

  const filtered = companies.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      c.company.toLowerCase().includes(q) ||
      c.contacts.some(x => (x.client_name || '').toLowerCase().includes(q)) ||
      c.email.toLowerCase().includes(q)
    const matchIndustry = !filterIndustry || c.industry === filterIndustry
    return matchSearch && matchIndustry
  })

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Clients</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{clients.length} total · {companies.length} companies</p>
          </div>
          <button
            onClick={() => { setShowModal(true); setError(null) }}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            + Add Client
          </button>
        </div>

        {/* Search + Filter bar */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search companies, contacts, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
          />
          <select
            value={filterIndustry}
            onChange={e => setFilterIndustry(e.target.value)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
          >
            <option value="">All Industries</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Cards grid */}
        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#8A9AB0] text-lg mb-2">No clients found</p>
            <p className="text-[#8A9AB0] text-sm">Try adjusting your search or add a new client.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(({ company, contacts, primary, industry, location, email, phone }) => {
              const initials = company.slice(0, 2).toUpperCase()
              const badgeClass = industryColors[industry] || industryColors['Other']
              const fullAddress = [primary?.address, primary?.city, primary?.state, primary?.zip].filter(Boolean).join(', ')

              return (
                <div
                  key={company}
                  onClick={() => navigate(`/client/${primary.id}`)}
                  className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3552] hover:border-[#C8622A]/40 border border-[#2a3d55] transition-all group"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#C8622A] text-sm font-bold">{initials}</span>
                      </div>
                      <div>
                        <p className="text-white font-semibold group-hover:text-[#C8622A] transition-colors leading-tight">
                          {company}
                        </p>
                        {contacts.length > 0 && (
                          <p className="text-[#8A9AB0] text-xs mt-0.5">
                            {contacts.map(c => c.client_name).filter(Boolean).join(', ') || 'No contact name'}
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
                    {email && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#8A9AB0] text-xs w-4">@</span>
                        <span className="text-[#8A9AB0] text-xs truncate">{email}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#8A9AB0] text-xs w-4">#</span>
                        <span className="text-[#8A9AB0] text-xs">{phone}</span>
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#8A9AB0] text-xs w-4">⌖</span>
                        <span className="text-[#8A9AB0] text-xs">{location}</span>
                      </div>
                    )}
                    {primary?.store_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#8A9AB0] text-xs w-4">ID</span>
                        <span className="text-[#8A9AB0] text-xs font-mono">{primary.store_id}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2a3d55]">
                    <div className="flex gap-3">
                      <span className="text-[#8A9AB0] text-xs">
                        {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
                      </span>
                      {(() => {
                        const locCount = contacts.reduce((sum, c) => sum + (c.client_locations?.length || 0), 0)
                        return locCount > 0 ? <span className="text-[#8A9AB0] text-xs">· {locCount} {locCount === 1 ? 'location' : 'locations'}</span> : null
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setForm(prev => ({ ...prev, company }))
                          setShowModal(true)
                        }}
                        className="text-[#8A9AB0] hover:text-white text-xs transition-colors"
                      >
                        + Contact
                      </button>
                      <span className="text-[#8A9AB0] text-xs group-hover:text-[#C8622A] transition-colors">→</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">New Client</h3>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">

                {/* Company with autocomplete */}
                <div className="relative">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Company <span className="text-[#C8622A]">*</span></label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={e => handleCompanyInput(e.target.value)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Company name"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                  {showSuggestions && (
                    <div className="absolute z-10 w-full mt-1 bg-[#0F1C2E] border border-[#2a3d55] rounded-lg overflow-hidden shadow-lg">
                      {companySuggestions.map(c => (
                        <button key={c} onClick={() => { setForm(prev => ({ ...prev, company: c })); setShowSuggestions(false) }}
                          className="w-full text-left px-3 py-2 text-white text-sm hover:bg-[#1a2d45] transition-colors">
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Contact Name</label>
                  <input type="text" value={form.client_name}
                    onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Phone</label>
                  <input type="text" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                  <select value={form.industry}
                    onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  >
                    <option value="">Select industry</option>
                    {industries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">CRM Source</label>
                  <input type="text" value={form.crm_source}
                    onChange={e => setForm(p => ({ ...p, crm_source: e.target.value }))}
                    placeholder="e.g. Referral, Website"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                <input type="text" value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="123 Main St"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">City</label>
                  <input type="text" value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="Nashville"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">State</label>
                  <input type="text" value={form.state}
                    onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                    placeholder="TN"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label>
                  <input type="text" value={form.zip}
                    onChange={e => setForm(p => ({ ...p, zip: e.target.value }))}
                    placeholder="37201"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Store ID</label>
                <input type="text" value={form.store_id}
                  onChange={e => setForm(p => ({ ...p, store_id: e.target.value }))}
                  placeholder="e.g. STR-001"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Notes</label>
                <textarea value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any notes about this client..."
                  rows={3}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowModal(false); setForm(emptyForm); setError(null) }}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving || !form.company}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
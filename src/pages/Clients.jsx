import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const emptyForm = {
  client_name: '', company: '', email: '', phone: '',
  industry: '', crm_source: '', notes: ''
}

const fields = [
  ['client_name', 'Contact Name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['industry', 'Industry'],
  ['crm_source', 'CRM Source'],
  ['notes', 'Notes'],
]

export default function Clients({ isAdmin }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [expandedCompanies, setExpandedCompanies] = useState({})
  const [companySuggestions, setCompanySuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    fetchOrgAndClients()
  }, [])

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
      .select('*')
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

  const selectCompany = (company) => {
    setForm(prev => ({ ...prev, company }))
    setShowSuggestions(false)
  }

  const handleAdd = async () => {
    setSaving(true)
    setError(null)

    if (!form.company) {
      setError('Company name is required')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('clients').insert({
      client_name: form.client_name,
      company: form.company,
      email: form.email,
      phone: form.phone,
      industry: form.industry,
      crm_source: form.crm_source,
      notes: form.notes,
      active: true,
      org_id: orgId
    })

    if (error) { setError(error.message); setSaving(false); return }

    setSuccess('Client added successfully')
    setForm(emptyForm)
    setShowForm(false)
    fetchOrgAndClients()
    setSaving(false)
  }

  const startEditing = (client) => {
    setEditingId(client.id)
    setEditForm({
      client_name: client.client_name || '',
      company: client.company || '',
      email: client.email || '',
      phone: client.phone || '',
      industry: client.industry || '',
      crm_source: client.crm_source || '',
      notes: client.notes || ''
    })
  }

  const handleEdit = async (clientId) => {
    setError(null)
    const { error } = await supabase.from('clients').update({
      client_name: editForm.client_name,
      company: editForm.company,
      email: editForm.email,
      phone: editForm.phone,
      industry: editForm.industry,
      crm_source: editForm.crm_source,
      notes: editForm.notes
    }).eq('id', clientId)

    if (error) { setError(error.message); return }

    setSuccess('Client updated successfully')
    setEditingId(null)
    fetchOrgAndClients()
  }

  const toggleCompany = (company) => {
    setExpandedCompanies(prev => ({ ...prev, [company]: !prev[company] }))
  }

  const grouped = clients.reduce((acc, client) => {
    const company = client.company || 'No Company'
    if (!acc[company]) acc[company] = []
    acc[company].push(client)
    return acc
  }, {})

  const existingCompanies = [...new Set(clients.map(c => c.company).filter(Boolean))].sort()

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Clients</h2>
          <button
            onClick={() => { setShowForm(!showForm); setError(null); setShowSuggestions(false) }}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Client'}
          </button>
        </div>

        {success && <p className="text-green-400 text-sm">{success}</p>}

        {showForm && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">New Client</h3>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="grid grid-cols-3 gap-4 mb-4">

              {/* Company field with autocomplete */}
              <div className="relative">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Company <span className="text-[#C8622A]">*</span></label>
                <input
                  type="text"
                  value={form.company}
                  onChange={e => handleCompanyInput(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onFocus={() => {
                    if (form.company && companySuggestions.length > 0) setShowSuggestions(true)
                  }}
                  placeholder="Type or select existing company"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
                {showSuggestions && (
                  <div className="absolute z-10 w-full mt-1 bg-[#0F1C2E] border border-[#2a3d55] rounded-lg overflow-hidden shadow-lg">
                    {companySuggestions.map(company => (
                      <button
                        key={company}
                        onClick={() => selectCompany(company)}
                        className="w-full text-left px-3 py-2 text-white text-sm hover:bg-[#1a2d45] transition-colors"
                      >
                        {company}
                      </button>
                    ))}
                  </div>
                )}
                {existingCompanies.length > 0 && !form.company && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {existingCompanies.slice(0, 5).map(company => (
                      <button
                        key={company}
                        onClick={() => selectCompany(company)}
                        className="text-xs bg-[#2a3d55] text-[#8A9AB0] hover:text-white px-2 py-1 rounded transition-colors"
                      >
                        {company}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rest of fields */}
              {fields.map(([field, label]) => (
                <div key={field}>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">{label}</label>
                  <input
                    type="text"
                    value={form[field]}
                    onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !form.company}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Client'}
            </button>
          </div>
        )}

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">All Clients ({clients.length})</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : clients.length === 0 ? (
            <p className="text-[#8A9AB0]">No clients yet. Add your first client above.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(grouped).map(([company, contacts]) => {
                const isExpanded = expandedCompanies[company] !== false
                return (
                  <div key={company} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                    {/* Company Header */}
                    <button
                      onClick={() => toggleCompany(company)}
                      className="w-full flex justify-between items-center px-5 py-4 hover:bg-[#0F1C2E] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#C8622A]/20 flex items-center justify-center">
                          <span className="text-[#C8622A] text-xs font-bold">
                            {company.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="text-left">
                          <p className="text-white font-semibold">{company}</p>
                          <p className="text-[#8A9AB0] text-xs">
                            {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
                            {contacts[0]?.industry ? ` · ${contacts[0].industry}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setForm(prev => ({ ...prev, company }))
                            setShowForm(true)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="bg-[#2a3d55] text-white px-3 py-1 rounded-lg text-xs hover:bg-[#3a4d65] transition-colors"
                        >
                          + Add Contact
                        </button>
                        <span className="text-[#8A9AB0] text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Contacts */}
                    {isExpanded && (
                      <div className="border-t border-[#2a3d55]">
                        {contacts.map((c, idx) => (
                          <div
                            key={c.id}
                            className={`${idx < contacts.length - 1 ? 'border-b border-[#2a3d55]/50' : ''}`}
                          >
                            {editingId === c.id ? (
                              <div className="p-4 bg-[#0F1C2E]/50">
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                  {[['company', 'Company'], ...fields].map(([field, label]) => (
                                    <div key={field}>
                                      <label className="text-[#8A9AB0] text-xs mb-1 block">{label}</label>
                                      <input
                                        type="text"
                                        value={editForm[field]}
                                        onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                                        className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEdit(c.id)}
                                    className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
                                  >
                                    Save Changes
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="text-[#8A9AB0] hover:text-white px-4 py-2 text-sm transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center px-5 py-3 hover:bg-[#0F1C2E]/40 transition-colors">
                                <div
                                  className="flex items-center gap-6 flex-1 cursor-pointer"
                                  onClick={() => navigate(`/client/${c.id}`)}
                                >
                                  <div className="w-2 h-2 rounded-full bg-[#C8622A]/50 shrink-0 ml-1" />
                                  <div>
                                    <p className="text-white text-sm font-medium">{c.client_name || 'No contact name'}</p>
                                    <p className="text-[#8A9AB0] text-xs">
                                      {c.email || ''}
                                      {c.email && c.phone ? ' · ' : ''}
                                      {c.phone || ''}
                                    </p>
                                  </div>
                                  {c.crm_source && (
                                    <span className="text-[#8A9AB0] text-xs bg-[#2a3d55] px-2 py-0.5 rounded">
                                      {c.crm_source}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2 items-center">
                                  <button
                                    onClick={e => { e.stopPropagation(); navigate(`/client/${c.id}`) }}
                                    className="text-[#8A9AB0] hover:text-white text-xs transition-colors"
                                  >
                                    View →
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); startEditing(c) }}
                                    className="bg-[#2a3d55] text-white px-3 py-1 rounded-lg text-xs hover:bg-[#3a4d65] transition-colors"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

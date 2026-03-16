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
  ['company', 'Company'],
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

  const handleAdd = async () => {
    setSaving(true)
    setError(null)

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

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Clients</h2>
          <button
            onClick={() => { setShowForm(!showForm); setError(null) }}
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
              {clients.map(c => (
                <div key={c.id} className="border border-[#2a3d55] rounded-xl p-4">
                  {editingId === c.id ? (
                    <div>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        {fields.map(([field, label]) => (
                          <div key={field}>
                            <label className="text-[#8A9AB0] text-xs mb-1 block">{label}</label>
                            <input
                              type="text"
                              value={editForm[field]}
                              onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
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
                    <div className="flex justify-between items-start">
                      <div
                        className="grid grid-cols-4 gap-x-8 gap-y-2 flex-1 cursor-pointer"
                        onClick={() => navigate(`/client/${c.id}`)}
                      >
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Company</p>
                          <p className="text-white font-medium">{c.company}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Contact</p>
                          <p className="text-white text-sm">{c.client_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Email</p>
                          <p className="text-white text-sm">{c.email || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Phone</p>
                          <p className="text-white text-sm">{c.phone || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Industry</p>
                          <p className="text-white text-sm">{c.industry || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">CRM Source</p>
                          <p className="text-white text-sm">{c.crm_source || '—'}</p>
                        </div>
                        {c.notes && (
                          <div className="col-span-2">
                            <p className="text-[#8A9AB0] text-xs">Notes</p>
                            <p className="text-white text-sm">{c.notes}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); startEditing(c) }}
                        className="bg-[#2a3d55] text-white px-3 py-1.5 rounded-lg text-xs hover:bg-[#3a4d65] transition-colors ml-4 shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

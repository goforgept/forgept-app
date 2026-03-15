import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Clients({ isAdmin }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    client_name: '', company: '', email: '', phone: '',
    industry: '', crm_source: '', notes: ''
  })

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
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
      active: true
    })

    if (error) { setError(error.message); setSaving(false); return }

    setSuccess('Client added successfully')
    setForm({ client_name: '', company: '', email: '', phone: '', industry: '', crm_source: '', notes: '' })
    setShowForm(false)
    fetchClients()
    setSaving(false)
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Clients</h2>
          <button
            onClick={() => setShowForm(!showForm)}
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
              {[
                ['client_name', 'Contact Name'],
                ['company', 'Company'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['industry', 'Industry'],
                ['crm_source', 'CRM Source'],
                ['notes', 'Notes'],
              ].map(([field, label]) => (
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Company', 'Contact', 'Email', 'Phone', 'Industry', 'Source'].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id} className="border-b border-[#2a3d55]/30">
                      <td className="text-white py-3 pr-4 font-medium">{c.company}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{c.client_name || '—'}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{c.email || '—'}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{c.phone || '—'}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{c.industry || '—'}</td>
                      <td className="text-[#8A9AB0] py-3">{c.crm_source || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [form, setForm] = useState({
    vendor_name: '', contact_name: '', contact_email: '',
    contact_phone_number: '', account_number: '', payment_terms: '',
    default_markup_percent: '', notes: ''
  })

  useEffect(() => {
    fetchVendors()
  }, [])

  const fetchVendors = async () => {
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .order('vendor_name', { ascending: true })
    setVendors(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    setAdding(true)
    setError(null)

    const { error } = await supabase.from('vendors').insert({
      vendor_name: form.vendor_name,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone_number: form.contact_phone_number,
      account_number: form.account_number,
      payment_terms: form.payment_terms,
      default_markup_percent: parseFloat(form.default_markup_percent) || null,
      notes: form.notes,
      active: true
    })

    if (error) { setError(error.message); setAdding(false); return }

    setSuccess('Vendor added successfully')
    setForm({ vendor_name: '', contact_name: '', contact_email: '', contact_phone_number: '', account_number: '', payment_terms: '', default_markup_percent: '', notes: '' })
    setShowForm(false)
    fetchVendors()
    setAdding(false)
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={true} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Vendors</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Vendor'}
          </button>
        </div>

        {success && <p className="text-green-400 text-sm">{success}</p>}

        {showForm && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">New Vendor</h3>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                ['vendor_name', 'Vendor Name'],
                ['contact_name', 'Contact Name'],
                ['contact_email', 'Contact Email'],
                ['contact_phone_number', 'Phone'],
                ['account_number', 'Account Number'],
                ['payment_terms', 'Payment Terms'],
                ['default_markup_percent', 'Default Markup %'],
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
              disabled={adding || !form.vendor_name}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
            >
              {adding ? 'Saving...' : 'Save Vendor'}
            </button>
          </div>
        )}

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">All Vendors ({vendors.length})</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : vendors.length === 0 ? (
            <p className="text-[#8A9AB0]">No vendors yet. Add your first vendor above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Vendor', 'Contact', 'Email', 'Phone', 'Account #', 'Default Markup', 'Terms'].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendors.map(v => (
                    <tr key={v.id} className="border-b border-[#2a3d55]/30">
                      <td className="text-white py-3 pr-4 font-medium">{v.vendor_name}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{v.contact_name || '—'}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{v.contact_email || '—'}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{v.contact_phone_number || '—'}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{v.account_number || '—'}</td>
                      <td className="text-[#C8622A] py-3 pr-4">{v.default_markup_percent ? `${v.default_markup_percent}%` : '—'}</td>
                      <td className="text-[#8A9AB0] py-3">{v.payment_terms || '—'}</td>
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
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const emptyForm = {
  vendor_name: '', contact_name: '', contact_email: '',
  contact_phone_number: '', account_number: '', payment_terms: '',
  default_markup_percent: '', notes: ''
}

export default function Vendors({ isAdmin }) {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [orgId, setOrgId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    fetchOrgAndVendors()
  }, [])

  const fetchOrgAndVendors = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)

    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('org_id', profile.org_id)
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
      active: true,
      org_id: orgId
    })

    if (error) { setError(error.message); setAdding(false); return }

    setSuccess('Vendor added successfully')
    setForm(emptyForm)
    setShowForm(false)
    fetchOrgAndVendors()
    setAdding(false)
  }

  const startEditing = (vendor) => {
    setEditingId(vendor.id)
    setEditForm({
      vendor_name: vendor.vendor_name || '',
      contact_name: vendor.contact_name || '',
      contact_email: vendor.contact_email || '',
      contact_phone_number: vendor.contact_phone_number || '',
      account_number: vendor.account_number || '',
      payment_terms: vendor.payment_terms || '',
      default_markup_percent: vendor.default_markup_percent || '',
      notes: vendor.notes || ''
    })
  }

  const handleEdit = async (vendorId) => {
    setError(null)

    const { error } = await supabase.from('vendors').update({
      vendor_name: editForm.vendor_name,
      contact_name: editForm.contact_name,
      contact_email: editForm.contact_email,
      contact_phone_number: editForm.contact_phone_number,
      account_number: editForm.account_number,
      payment_terms: editForm.payment_terms,
      default_markup_percent: parseFloat(editForm.default_markup_percent) || null,
      notes: editForm.notes
    }).eq('id', vendorId)

    if (error) { setError(error.message); return }

    setSuccess('Vendor updated successfully')
    setEditingId(null)
    fetchOrgAndVendors()
  }

  const fields = [
    ['vendor_name', 'Vendor Name'],
    ['contact_name', 'Contact Name'],
    ['contact_email', 'Contact Email'],
    ['contact_phone_number', 'Phone'],
    ['account_number', 'Account Number'],
    ['payment_terms', 'Payment Terms'],
    ['default_markup_percent', 'Default Markup %'],
    ['notes', 'Notes'],
  ]

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Vendors</h2>
          <button
            onClick={() => { setShowForm(!showForm); setError(null) }}
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
            <div className="space-y-3">
              {vendors.map(v => (
                <div key={v.id} className="border border-[#2a3d55] rounded-xl p-4">
                  {editingId === v.id ? (
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
                          onClick={() => handleEdit(v.id)}
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
                      <div className="grid grid-cols-4 gap-x-8 gap-y-2 flex-1">
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Vendor</p>
                          <p className="text-white font-medium">{v.vendor_name}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Contact</p>
                          <p className="text-white text-sm">{v.contact_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Email</p>
                          <p className="text-white text-sm">{v.contact_email || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Phone</p>
                          <p className="text-white text-sm">{v.contact_phone_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Account #</p>
                          <p className="text-white text-sm">{v.account_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Default Markup</p>
                          <p className="text-[#C8622A] text-sm">{v.default_markup_percent ? `${v.default_markup_percent}%` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[#8A9AB0] text-xs">Payment Terms</p>
                          <p className="text-white text-sm">{v.payment_terms || '—'}</p>
                        </div>
                        {v.notes && (
                          <div>
                            <p className="text-[#8A9AB0] text-xs">Notes</p>
                            <p className="text-white text-sm">{v.notes}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => startEditing(v)}
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
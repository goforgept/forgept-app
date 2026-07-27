import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

export default function EditClientModal({ allClients, editClientForm, setEditClientForm, savingClient, onSave, onClose }) {
  const [clientContacts, setClientContacts] = useState([])
  const [selectedContactId, setSelectedContactId] = useState('__main__')

  // Load contacts when client changes
  useEffect(() => {
    const cid = editClientForm.client_id
    if (!cid) { setClientContacts([]); setSelectedContactId('__main__'); return }
    supabase.from('client_contacts').select('*').eq('client_id', cid)
      .order('is_primary', { ascending: false }).order('full_name', { ascending: true })
      .then(({ data }) => setClientContacts(data || []))
    setSelectedContactId('__main__')
  }, [editClientForm.client_id])

  const handleContactSelect = (value) => {
    setSelectedContactId(value)
    if (value === '__main__') {
      const found = allClients.find(c => c.id === editClientForm.client_id)
      if (found) setEditClientForm(p => ({ ...p, client_name: found.client_name || p.client_name, client_email: found.email || p.client_email }))
    } else {
      const contact = clientContacts.find(c => c.id === value)
      if (contact) setEditClientForm(p => ({ ...p, client_name: contact.full_name || p.client_name, client_email: contact.email || p.client_email }))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-fp-text font-bold text-lg mb-1">Edit Client Info</h3>
        <p className="text-fp-muted text-sm mb-5">Link to an existing client or edit the contact details directly.</p>
        <div className="space-y-3">
          {/* Client picker */}
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Client</label>
            <select value={editClientForm.client_id || ''}
              onChange={e => {
                const cid = e.target.value
                const found = allClients.find(c => c.id === cid)
                setEditClientForm(p => ({
                  ...p, client_id: cid,
                  ...(found ? { company: found.company || p.company, client_name: found.client_name || p.client_name, client_email: found.email || p.client_email } : {})
                }))
              }}
              className={inputClass}>
              <option value="">— No client linked —</option>
              {allClients.map(c => <option key={c.id} value={c.id}>{c.company}{c.client_name ? ` — ${c.client_name}` : ''}</option>)}
            </select>
            {editClientForm.client_id && <p className="text-green-400 text-xs mt-1">✓ Linked — changes below will also update the client record</p>}
          </div>

          {/* Contact picker — only when client has CRM contacts */}
          {editClientForm.client_id && clientContacts.length > 0 && (
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Contact</label>
              <select value={selectedContactId} onChange={e => handleContactSelect(e.target.value)} className={inputClass}>
                {(() => {
                  const client = allClients.find(c => c.id === editClientForm.client_id)
                  const mainLabel = client?.client_name ? `${client.client_name} (main contact)` : '— Main client contact —'
                  return <option value="__main__">{mainLabel}</option>
                })()}
                {clientContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}{c.title ? ` · ${c.title}` : ''}{c.email ? ` — ${c.email}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-fp-muted text-xs mt-1">Selecting a contact sets the name and email on this proposal.</p>
            </div>
          )}

          <div><label className="text-fp-muted text-xs mb-1 block">Company</label><input type="text" value={editClientForm.company} onChange={e => setEditClientForm(p => ({ ...p, company: e.target.value }))} className={inputClass} /></div>
          <div><label className="text-fp-muted text-xs mb-1 block">Contact Name</label><input type="text" value={editClientForm.client_name} onChange={e => setEditClientForm(p => ({ ...p, client_name: e.target.value }))} className={inputClass} /></div>
          <div><label className="text-fp-muted text-xs mb-1 block">Email</label><input type="email" value={editClientForm.client_email} onChange={e => setEditClientForm(p => ({ ...p, client_email: e.target.value }))} className={inputClass} /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
          <button onClick={onSave} disabled={savingClient} className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingClient ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

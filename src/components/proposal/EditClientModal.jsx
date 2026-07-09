export default function EditClientModal({ allClients, editClientForm, setEditClientForm, savingClient, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-fp-text font-bold text-lg mb-1">Edit Client Info</h3>
        <p className="text-fp-muted text-sm mb-5">Link to an existing client or edit the contact details directly.</p>
        <div className="space-y-3">
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Link to Client Record</label>
            <select value={editClientForm.client_id || ''} onChange={e => { const cid = e.target.value; const found = allClients.find(c => c.id === cid); setEditClientForm(p => ({ ...p, client_id: cid, ...(found ? { company: found.company || p.company, client_name: found.client_name || p.client_name, client_email: found.email || p.client_email } : {}) })) }}
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              <option value="">— No client linked —</option>
              {allClients.map(c => <option key={c.id} value={c.id}>{c.company}{c.client_name ? ` — ${c.client_name}` : ''}</option>)}
            </select>
            {editClientForm.client_id && <p className="text-green-400 text-xs mt-1">✓ Linked — changes below will also update the client record</p>}
          </div>
          <div><label className="text-fp-muted text-xs mb-1 block">Company</label><input type="text" value={editClientForm.company} onChange={e => setEditClientForm(p => ({ ...p, company: e.target.value }))} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" /></div>
          <div><label className="text-fp-muted text-xs mb-1 block">Client Name</label><input type="text" value={editClientForm.client_name} onChange={e => setEditClientForm(p => ({ ...p, client_name: e.target.value }))} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" /></div>
          <div><label className="text-fp-muted text-xs mb-1 block">Email</label><input type="email" value={editClientForm.client_email} onChange={e => setEditClientForm(p => ({ ...p, client_email: e.target.value }))} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
          <button onClick={onSave} disabled={savingClient} className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingClient ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

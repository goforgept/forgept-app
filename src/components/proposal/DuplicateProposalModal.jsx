import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

const inputCls = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

export default function DuplicateProposalModal({ proposal, orgId, onDuplicate, onClose, duplicating }) {
  const [proposalName, setProposalName] = useState(`Copy of ${proposal?.proposal_name || 'Proposal'}`)
  const [allClients,   setAllClients]   = useState([])
  const [selectedClientId, setSelectedClientId] = useState(proposal?.client_id || '')
  const [company,      setCompany]      = useState(proposal?.company      || '')
  const [clientName,   setClientName]   = useState(proposal?.client_name  || '')
  const [clientEmail,  setClientEmail]  = useState(proposal?.client_email || '')
  const [locations,    setLocations]    = useState([])
  const [locationId,   setLocationId]   = useState('')
  const [contacts,     setContacts]     = useState([])
  const [contactId,    setContactId]    = useState('__main__')

  // Load clients on mount
  useEffect(() => {
    supabase.from('clients').select('id, company, client_name, email').eq('org_id', orgId)
      .order('company', { ascending: true })
      .then(({ data }) => setAllClients(data || []))
  }, [orgId])

  // Load locations + contacts when client changes
  useEffect(() => {
    if (!selectedClientId) { setLocations([]); setLocationId(''); setContacts([]); setContactId('__main__'); return }
    supabase.from('client_locations').select('id, site_name, address, city, state').eq('client_id', selectedClientId)
      .order('site_name', { ascending: true })
      .then(({ data }) => setLocations(data || []))
    supabase.from('client_contacts').select('*').eq('client_id', selectedClientId)
      .order('is_primary', { ascending: false }).order('full_name', { ascending: true })
      .then(({ data }) => setContacts(data || []))
    setLocationId('')
    setContactId('__main__')
  }, [selectedClientId])

  const handleClientChange = (cid) => {
    setSelectedClientId(cid)
    const found = allClients.find(c => c.id === cid)
    if (found) {
      setCompany(found.company || '')
      setClientName(found.client_name || '')
      setClientEmail(found.email || '')
    }
  }

  const handleContactChange = (val) => {
    setContactId(val)
    if (val === '__main__') {
      const found = allClients.find(c => c.id === selectedClientId)
      if (found) { setClientName(found.client_name || ''); setClientEmail(found.email || '') }
    } else {
      const c = contacts.find(c => c.id === val)
      if (c) { setClientName(c.full_name || ''); setClientEmail(c.email || '') }
    }
  }

  const handleSubmit = () => {
    onDuplicate({ proposalName, company, clientName, clientEmail, clientId: selectedClientId || null, locationId: locationId || null })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-fp-text font-bold text-lg">Duplicate Proposal</h2>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Proposal name */}
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Proposal Name</label>
            <input type="text" value={proposalName} onChange={e => setProposalName(e.target.value)} className={inputCls} />
          </div>

          {/* Client picker */}
          <div>
            <label className="text-fp-muted text-xs mb-1 block">Company</label>
            <select value={selectedClientId} onChange={e => handleClientChange(e.target.value)} className={inputCls}>
              <option value="">— Select company —</option>
              {allClients.map(c => (
                <option key={c.id} value={c.id}>{c.company}{c.client_name ? ` — ${c.client_name}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Location picker */}
          {locations.length > 0 && (
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} className={inputCls}>
                <option value="">— No specific location —</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.site_name}{l.address ? ` · ${l.address}` : ''}{l.city ? `, ${l.city}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Contact picker */}
          {contacts.length > 0 && (
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Contact</label>
              <select value={contactId} onChange={e => handleContactChange(e.target.value)} className={inputCls}>
                {(() => {
                  const main = allClients.find(c => c.id === selectedClientId)
                  return <option value="__main__">{main?.client_name ? `${main.client_name} (main)` : '— Main contact —'}</option>
                })()}
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}{c.title ? ` · ${c.title}` : ''}{c.email ? ` — ${c.email}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Manual overrides */}
          {selectedClientId && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-fp-border">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Contact Name</label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Contact Email</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          <p className="text-fp-muted text-xs">All line items, sections, and labor will be copied. Status resets to Draft.</p>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-fp-border text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={duplicating || !proposalName.trim()}
            className="flex-1 bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {duplicating ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const STATUS_COLORS = {
  'Open': 'bg-blue-500/20 text-blue-400',
  'In Progress': 'bg-yellow-500/20 text-yellow-400',
  'Resolved': 'bg-green-500/20 text-green-400',
  'Cancelled': 'bg-red-500/20 text-red-400',
}

const PRIORITY_COLORS = {
  'Low': 'bg-[#2a3d55] text-[#8A9AB0]',
  'Normal': 'bg-blue-500/20 text-blue-400',
  'High': 'bg-orange-500/20 text-orange-400',
  'Urgent': 'bg-red-500/20 text-red-400',
}

export default function ServiceTicketDetail({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [techs, setTechs] = useState([])
  const [saving, setSaving] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editingTicketNumber, setEditingTicketNumber] = useState(false)
  const [ticketNumberDraft, setTicketNumberDraft] = useState('')
  const cancelTicketNumberEdit = useRef(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [lineItems, setLineItems] = useState([])
  const [laborItems, setLaborItems] = useState([])
  const [savingItems, setSavingItems] = useState(false)
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago')

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)
    const { data: orgData } = await supabase.from('organizations').select('timezone').eq('id', profileData.org_id).single()
    setOrgTimezone(orgData?.timezone || 'America/Chicago')

    const { data: ticketData } = await supabase
      .from('service_tickets')
      .select('*, clients(id, company, client_name), profiles!service_tickets_assigned_tech_id_fkey(full_name, email), jobs(id, name, job_number)')
      .eq('id', id)
      .single()
    setTicket(ticketData)
    setLineItems(ticketData?.line_items || [])
    setLaborItems(ticketData?.labor_items || [])

    const { data: techData } = await supabase
      .from('profiles').select('id, full_name, dispatch_zone')
      .eq('org_id', profileData.org_id).order('full_name')
    setTechs(techData || [])

    setLoading(false)
  }

  const deleteTicket = async () => {
    await supabase.from('service_tickets').delete().eq('id', id)
    navigate('/service-tickets')
  }

  const pushToCalendar = async (updatedTicket) => {
    if (!updatedTicket?.assigned_tech_id || !updatedTicket?.scheduled_date) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tech_id: updatedTicket.assigned_tech_id,
          title: `🎫 ${updatedTicket.title}`,
          description: `Service ticket via ForgePt.\n${updatedTicket.clients?.company ? `Client: ${updatedTicket.clients.company}` : ''}`,
          date: updatedTicket.scheduled_date,
          start_time: updatedTicket.scheduled_time || null,
          duration_hours: updatedTicket.duration_hours || 2,
          record_type: 'ticket',
          record_id: updatedTicket.id,
          existing_google_event_id: updatedTicket.google_event_id || null,
          existing_microsoft_event_id: updatedTicket.microsoft_event_id || null,
          timezone: orgTimezone,
        }),
      })
    } catch (e) { console.error('Calendar push error:', e) }
  }

  const deleteCalendarEvent = async (techId, googleEventId, microsoftEventId) => {
    if (!techId || (!googleEventId && !microsoftEventId)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/delete-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tech_id: techId, google_event_id: googleEventId || null, microsoft_event_id: microsoftEventId || null }),
      })
    } catch (e) { console.error('Calendar delete error:', e) }
  }

  const updateTicket = async (field, value) => {
    setSaving(true)
    const updates = { [field]: value || null }
    if (field === 'status' && value === 'Resolved') {
      updates.resolved_at = new Date().toISOString()
    }
    // If unassigning tech or clearing date, delete the calendar event first
    const isClearing = !value
    if (isClearing && ['assigned_tech_id', 'scheduled_date'].includes(field)) {
      const techId = ticket.assigned_tech_id
      if (ticket.google_event_id || ticket.microsoft_event_id) {
        deleteCalendarEvent(techId, ticket.google_event_id, ticket.microsoft_event_id)
        updates.google_event_id = null
        updates.microsoft_event_id = null
      }
    }
    await supabase.from('service_tickets').update(updates).eq('id', id)
    const updatedTicket = { ...ticket, ...updates }
    setTicket(updatedTicket)
    // Push to calendar when date, tech, or duration changes and all are set
    if (['scheduled_date', 'assigned_tech_id', 'duration_hours'].includes(field) && !isClearing) {
      pushToCalendar(updatedTicket)
    }
    setSaving(false)
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    const existing = ticket?.notes || ''
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const entry = `[${timestamp} · ${profile?.full_name || 'Unknown'}] ${newNote.trim()}`
    const updated = existing ? `${existing}\n\n${entry}` : entry
    await supabase.from('service_tickets').update({ notes: updated }).eq('id', id)
    setTicket(prev => ({ ...prev, notes: updated }))
    setNewNote('')
    setSavingNote(false)
  }

  const saveItems = async () => {
    setSavingItems(true)
    await supabase.from('service_tickets').update({
      line_items: lineItems.length > 0 ? lineItems : null,
      labor_items: laborItems.length > 0 ? laborItems : null,
    }).eq('id', id)
    setTicket(prev => ({ ...prev, line_items: lineItems, labor_items: laborItems }))
    setSavingItems(false)
  }

  // --- Materials helpers ---
  const addMaterial = () => setLineItems(prev => [...prev, {
    id: crypto.randomUUID(), item_name: '', quantity: 1, unit: 'ea',
    your_cost_unit: '', markup_percent: 35, customer_price_unit: ''
  }])

  const updateMaterial = (i, field, value) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(field === 'your_cost_unit' ? value : updated[i].your_cost_unit) || 0
        const mkp = parseFloat(field === 'markup_percent' ? value : updated[i].markup_percent) || 0
        updated[i].customer_price_unit = (cost * (1 + mkp / 100)).toFixed(2)
      }
      return updated
    })
  }

  const removeMaterial = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  // --- Labor helpers ---
  const addLabor = () => setLaborItems(prev => [...prev, {
    id: crypto.randomUUID(), role: '', quantity: '', unit: 'hr',
    your_cost: '', markup: 35, customer_price: ''
  }])

  const updateLabor = (i, field, value) => {
    setLaborItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      if (field === 'your_cost' || field === 'markup' || field === 'quantity') {
        const cost = parseFloat(field === 'your_cost' ? value : updated[i].your_cost) || 0
        const mkp = parseFloat(field === 'markup' ? value : updated[i].markup) || 0
        const qty = parseFloat(field === 'quantity' ? value : updated[i].quantity) || 0
        updated[i].customer_price = (cost * (1 + mkp / 100) * qty).toFixed(2)
      }
      return updated
    })
  }

  const removeLabor = (i) => setLaborItems(prev => prev.filter((_, idx) => idx !== i))

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
  const cellInput = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"

  const matTotal = lineItems.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const labTotal = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>
  if (!ticket) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Ticket not found.</p></div>

  const noteLines = ticket.notes ? ticket.notes.split('\n\n').filter(Boolean).reverse() : []

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6 max-w-5xl">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <button onClick={() => navigate('/service-tickets')} className="text-[#8A9AB0] hover:text-white text-xs mb-2 transition-colors">← Service Tickets</button>
              <div className="flex items-center gap-3 mb-1">
                {editingTicketNumber ? (
                  <input
                    autoFocus
                    value={ticketNumberDraft}
                    onChange={e => setTicketNumberDraft(e.target.value)}
                    onBlur={async () => {
                      if (!cancelTicketNumberEdit.current) {
                        const val = ticketNumberDraft.trim()
                        if (val && val !== ticket.ticket_number) await updateTicket('ticket_number', val)
                      }
                      cancelTicketNumberEdit.current = false
                      setEditingTicketNumber(false)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.target.blur()
                      if (e.key === 'Escape') { cancelTicketNumberEdit.current = true; e.target.blur() }
                    }}
                    className="text-xs font-mono bg-[#0F1C2E] text-white border border-[#C8622A] rounded px-2 py-0.5 w-32 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => { setTicketNumberDraft(ticket.ticket_number || ''); setEditingTicketNumber(true) }}
                    className="text-[#8A9AB0] text-xs font-mono bg-[#0F1C2E] px-2 py-0.5 rounded hover:border-[#C8622A] border border-transparent transition-colors"
                    title="Click to edit ticket number">
                    {ticket.ticket_number || 'No #'}
                  </button>
                )}
              </div>
              <h2 className="text-white text-2xl font-bold">{ticket.title}</h2>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded font-semibold ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.Normal}`}>{ticket.priority}</span>
                <span className={`text-xs px-2 py-1 rounded font-semibold ${STATUS_COLORS[ticket.status] || STATUS_COLORS.Open}`}>{ticket.status}</span>
                {ticket.clients?.company && (
                  <button onClick={() => navigate(`/client/${ticket.clients.id}`)} className="text-[#8A9AB0] text-sm hover:text-[#C8622A] transition-colors">🏢 {ticket.clients.company}</button>
                )}
                {ticket.jobs?.name && (
                  <button onClick={() => navigate(`/jobs/${ticket.jobs.id}`)} className="text-[#8A9AB0] text-sm hover:text-[#C8622A] transition-colors">🔨 {ticket.jobs.job_number ? `${ticket.jobs.job_number} — ` : ''}{ticket.jobs.name}</button>
                )}
              </div>
            </div>
            <div>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[#8A9AB0] text-xs">Delete ticket?</span>
                  <button onClick={deleteTicket} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[#8A9AB0] hover:text-white text-xs px-3 py-1.5 transition-colors">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Delete</button>
              )}
            </div>
          </div>

          {/* Quick controls */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Status</p>
              <select value={ticket.status} onChange={e => updateTicket('status', e.target.value)} disabled={saving} className={`w-full ${inputClass}`}>
                {['Open', 'In Progress', 'Resolved', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Priority</p>
              <select value={ticket.priority} onChange={e => updateTicket('priority', e.target.value)} disabled={saving} className={`w-full ${inputClass}`}>
                {['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Technician</p>
              <select value={ticket.assigned_tech_id || ''} onChange={e => updateTicket('assigned_tech_id', e.target.value)} disabled={saving} className={`w-full ${inputClass}`}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.dispatch_zone ? ` · ${t.dispatch_zone}` : ''}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Scheduled</p>
              <input type="date" value={ticket.scheduled_date || ''} onChange={e => updateTicket('scheduled_date', e.target.value)} className={`w-full ${inputClass}`} />
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Duration</p>
              <select value={ticket.duration_hours || '2'} onChange={e => updateTicket('duration_hours', parseFloat(e.target.value))} className={`w-full ${inputClass}`}>
                {['0.5','1','1.5','2','2.5','3','3.5','4','5','6','7','8'].map(h => (
                  <option key={h} value={h}>{h} {parseFloat(h) === 1 ? 'hr' : 'hrs'}</option>
                ))}
              </select>
            </div>
          </div>

          {ticket.scheduled_time && (
            <div className="mt-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Scheduled Time</p>
              <input type="time" value={ticket.scheduled_time || ''} onChange={e => updateTicket('scheduled_time', e.target.value)} className={`w-40 ${inputClass}`} />
            </div>
          )}

          {ticket.resolved_at && (
            <p className="text-green-400 text-xs mt-3">✓ Resolved {new Date(ticket.resolved_at).toLocaleDateString()}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'labor', label: 'Labor & Materials' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <>
            {ticket.description && (
              <div className="bg-[#1a2d45] rounded-xl p-6">
                <h3 className="text-white font-bold mb-3">Description</h3>
                <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              </div>
            )}

            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-4">Notes & Activity</h3>
              <div className="flex gap-3 mb-5">
                <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  placeholder="Add a note or update..."
                  className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
                <button onClick={addNote} disabled={savingNote || !newNote.trim()}
                  className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingNote ? '...' : 'Add'}
                </button>
              </div>
              {noteLines.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm italic">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  {noteLines.map((note, i) => {
                    const match = note.match(/^\[(.+?)\] (.+)$/s)
                    const meta = match ? match[1] : null
                    const body = match ? match[2] : note
                    return (
                      <div key={i} className="bg-[#0F1C2E] rounded-lg p-4 border border-[#2a3d55]">
                        {meta && <p className="text-[#8A9AB0] text-xs mb-1.5">{meta}</p>}
                        <p className="text-[#D6E4F0] text-sm whitespace-pre-wrap">{body}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-3">Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-[#8A9AB0] text-xs mb-0.5">Created</p><p className="text-white">{new Date(ticket.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
                {ticket.profiles?.full_name && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Assigned To</p><p className="text-white">{ticket.profiles.full_name}</p></div>}
                {ticket.clients?.company && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Client</p><p className="text-white">{ticket.clients.company}</p></div>}
                {ticket.jobs?.name && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Job</p><p className="text-white">{ticket.jobs.name}</p></div>}
              </div>
            </div>
          </>
        )}

        {/* ── Labor & Materials Tab ── */}
        {activeTab === 'labor' && (
          <div className="space-y-6">

            {/* Materials */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold">Materials</h3>
                <button onClick={addMaterial} className="text-[#C8622A] text-sm hover:text-white transition-colors">+ Add Material</button>
              </div>
              {lineItems.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm italic">No materials logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Item Name</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Qty</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Unit</th>
                        {!isTechnician && <>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Your Cost</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Markup %</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Unit Price</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Total</th>
                        </>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((line, i) => {
                        const lineTotal = (parseFloat(line.customer_price_unit) || 0) * (parseFloat(line.quantity) || 0)
                        return (
                          <tr key={line.id} className="border-b border-[#2a3d55]/30">
                            <td className="pr-3 py-1.5">
                              <input value={line.item_name} onChange={e => updateMaterial(i, 'item_name', e.target.value)} placeholder="Item name" className={`w-40 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5">
                              <input type="number" min="0" value={line.quantity} onChange={e => updateMaterial(i, 'quantity', e.target.value)} className={`w-16 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5">
                              <select value={line.unit} onChange={e => updateMaterial(i, 'unit', e.target.value)} className={cellInput}>
                                {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            {!isTechnician && <>
                              <td className="pr-3 py-1.5">
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={line.your_cost_unit} onChange={e => updateMaterial(i, 'your_cost_unit', e.target.value)} className={`w-20 ${cellInput}`} />
                              </td>
                              <td className="pr-3 py-1.5">
                                <input type="number" min="0" placeholder="35" value={line.markup_percent} onChange={e => updateMaterial(i, 'markup_percent', e.target.value)} className={`w-16 ${cellInput}`} />
                              </td>
                              <td className="pr-3 py-1.5">
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={line.customer_price_unit} onChange={e => updateMaterial(i, 'customer_price_unit', e.target.value)} className={`w-20 ${cellInput}`} />
                              </td>
                              <td className="pr-3 py-1.5 text-white font-medium">${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </>}
                            <td className="py-1.5">
                              <button onClick={() => removeMaterial(i)} className="text-[#8A9AB0] hover:text-red-400 transition-colors">✕</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {!isTechnician && lineItems.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan="6" className="text-[#8A9AB0] text-right pt-3 pr-3 font-semibold">Materials Total</td>
                          <td className="text-[#C8622A] font-bold pt-3">${matTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Labor */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold">Labor</h3>
                <button onClick={addLabor} className="text-[#C8622A] text-sm hover:text-white transition-colors">+ Add Labor</button>
              </div>
              {laborItems.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm italic">No labor logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Role / Description</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Qty</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Unit</th>
                        {!isTechnician && <>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Your Cost</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Markup %</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Total</th>
                        </>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborItems.map((labor, i) => (
                        <tr key={labor.id} className="border-b border-[#2a3d55]/30">
                          <td className="pr-3 py-1.5">
                            <input value={labor.role} onChange={e => updateLabor(i, 'role', e.target.value)} placeholder="e.g. Low Voltage Tech" className={`w-44 ${cellInput}`} />
                          </td>
                          <td className="pr-3 py-1.5">
                            <input type="number" min="0" step="0.5" value={labor.quantity} onChange={e => updateLabor(i, 'quantity', e.target.value)} className={`w-16 ${cellInput}`} />
                          </td>
                          <td className="pr-3 py-1.5">
                            <select value={labor.unit} onChange={e => updateLabor(i, 'unit', e.target.value)} className={cellInput}>
                              {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          {!isTechnician && <>
                            <td className="pr-3 py-1.5">
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={labor.your_cost} onChange={e => updateLabor(i, 'your_cost', e.target.value)} className={`w-20 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5">
                              <input type="number" min="0" placeholder="35" value={labor.markup} onChange={e => updateLabor(i, 'markup', e.target.value)} className={`w-16 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5 text-white font-medium">${(parseFloat(labor.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          </>}
                          <td className="py-1.5">
                            <button onClick={() => removeLabor(i)} className="text-[#8A9AB0] hover:text-red-400 transition-colors">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {!isTechnician && laborItems.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan="5" className="text-[#8A9AB0] text-right pt-3 pr-3 font-semibold">Labor Total</td>
                          <td className="text-[#C8622A] font-bold pt-3">${labTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Grand total — managers only */}
            {!isTechnician && (lineItems.length > 0 || laborItems.length > 0) && (
              <div className="bg-[#1a2d45] rounded-xl p-4 flex justify-between items-center">
                <div className="text-sm text-[#8A9AB0] space-y-0.5">
                  {lineItems.length > 0 && <p>Materials: <span className="text-white">${matTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>}
                  {laborItems.length > 0 && <p>Labor: <span className="text-white">${labTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>}
                </div>
                <div className="text-right">
                  <p className="text-[#8A9AB0] text-xs mb-0.5">Ticket Total</p>
                  <p className="text-[#C8622A] font-bold text-xl">${(matTotal + labTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={saveItems} disabled={savingItems}
                className="bg-[#C8622A] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingItems ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

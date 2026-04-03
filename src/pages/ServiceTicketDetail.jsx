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
  const [ticketNotes, setTicketNotes] = useState([])
  const [editingTicketNumber, setEditingTicketNumber] = useState(false)
  const [ticketNumberDraft, setTicketNumberDraft] = useState('')
  const cancelTicketNumberEdit = useRef(false)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const { data: ticketData } = await supabase
      .from('service_tickets')
      .select('*, clients(id, company, client_name), profiles!service_tickets_assigned_tech_id_fkey(full_name, email), jobs(id, name, job_number)')
      .eq('id', id)
      .single()
    setTicket(ticketData)

    const { data: techData } = await supabase
      .from('profiles').select('id, full_name, dispatch_zone')
      .eq('org_id', profileData.org_id).order('full_name')
    setTechs(techData || [])

    // Notes stored as JSON array in ticket.notes field — or we can use activities
    // For now parse notes as a simple array stored in a separate fetch
    setLoading(false)
  }

  const updateTicket = async (field, value) => {
    setSaving(true)
    const updates = { [field]: value || null }
    if (field === 'status' && value === 'Resolved') {
      updates.resolved_at = new Date().toISOString()
    }
    await supabase.from('service_tickets').update(updates).eq('id', id)
    setTicket(prev => ({ ...prev, ...updates }))
    setSaving(false)
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    // Append to notes field as timestamped entries
    const existing = ticket?.notes || ''
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const entry = `[${timestamp} · ${profile?.full_name || 'Unknown'}] ${newNote.trim()}`
    const updated = existing ? `${existing}\n\n${entry}` : entry
    await supabase.from('service_tickets').update({ notes: updated }).eq('id', id)
    setTicket(prev => ({ ...prev, notes: updated }))
    setNewNote('')
    setSavingNote(false)
  }

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>
  if (!ticket) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Ticket not found.</p></div>

  const noteLines = ticket.notes ? ticket.notes.split('\n\n').filter(Boolean).reverse() : []

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6 max-w-4xl">
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
                        if (val && val !== ticket.ticket_number) {
                          await updateTicket('ticket_number', val)
                        }
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
          </div>

          {/* Quick controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Status</p>
              <select value={ticket.status} onChange={e => updateTicket('status', e.target.value)} disabled={saving}
                className={`w-full ${inputClass}`}>
                {['Open', 'In Progress', 'Resolved', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Priority</p>
              <select value={ticket.priority} onChange={e => updateTicket('priority', e.target.value)} disabled={saving}
                className={`w-full ${inputClass}`}>
                {['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Technician</p>
              <select value={ticket.assigned_tech_id || ''} onChange={e => updateTicket('assigned_tech_id', e.target.value)} disabled={saving}
                className={`w-full ${inputClass}`}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.dispatch_zone ? ` · ${t.dispatch_zone}` : ''}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Scheduled</p>
              <input type="date" value={ticket.scheduled_date || ''} onChange={e => updateTicket('scheduled_date', e.target.value)}
                className={`w-full ${inputClass}`} />
            </div>
          </div>

          {ticket.scheduled_time && (
            <div className="mt-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Scheduled Time</p>
              <input type="time" value={ticket.scheduled_time || ''} onChange={e => updateTicket('scheduled_time', e.target.value)}
                className={`w-40 ${inputClass}`} />
            </div>
          )}

          {ticket.resolved_at && (
            <p className="text-green-400 text-xs mt-3">✓ Resolved {new Date(ticket.resolved_at).toLocaleDateString()}</p>
          )}
        </div>

        {/* Description */}
        {ticket.description && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-3">Description</h3>
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}

        {/* Notes / Activity */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Notes & Activity</h3>

          {/* Add note */}
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
            <p className="text-[#8A9AB0] text-sm italic">No notes yet. Add one above.</p>
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

        {/* Metadata */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-3">Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-[#8A9AB0] text-xs mb-0.5">Created</p><p className="text-white">{new Date(ticket.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
            {ticket.profiles?.full_name && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Assigned To</p><p className="text-white">{ticket.profiles.full_name}</p></div>}
            {ticket.clients?.company && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Client</p><p className="text-white">{ticket.clients.company}</p></div>}
            {ticket.jobs?.name && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Job</p><p className="text-white">{ticket.jobs.name}</p></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
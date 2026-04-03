import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const STATUS_COLORS = {
  'Open': 'border-blue-500/40 bg-blue-500/5',
  'In Progress': 'border-yellow-500/40 bg-yellow-500/5',
  'Resolved': 'border-green-500/40 bg-green-500/5',
  'Cancelled': 'border-red-500/40 bg-red-500/5',
}

const PRIORITY_DOT = {
  'Low': 'bg-[#8A9AB0]',
  'Normal': 'bg-blue-400',
  'High': 'bg-orange-400',
  'Urgent': 'bg-red-400',
}

export default function Dispatch({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [techs, setTechs] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [view, setView] = useState('board') // 'board' | 'unscheduled'
  const [dragging, setDragging] = useState(null) // { ticketId }
  const [dragOver, setDragOver] = useState(null) // { techId }
  const [saving, setSaving] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [editTechId, setEditTechId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')

  useEffect(() => { fetchAll() }, [selectedDate])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const { data: techData } = await supabase
      .from('profiles').select('id, full_name, dispatch_zone, role')
      .eq('org_id', profileData.org_id)
      .order('full_name')
    setTechs(techData || [])

    const { data: ticketData } = await supabase
      .from('service_tickets')
      .select('*, clients(company), profiles!service_tickets_assigned_tech_id_fkey(full_name)')
      .eq('org_id', profileData.org_id)
      .not('status', 'in', '("Resolved","Cancelled")')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
    setTickets(ticketData || [])

    setLoading(false)
  }

  // Scheduled for selected date, grouped by tech
  const scheduledToday = tickets.filter(t => t.scheduled_date === selectedDate)
  const unscheduled = tickets.filter(t => !t.scheduled_date)
  const scheduledOtherDays = tickets.filter(t => t.scheduled_date && t.scheduled_date !== selectedDate)

  const getTicketsForTech = (techId) =>
    scheduledToday.filter(t => t.assigned_tech_id === techId)

  const unassignedToday = scheduledToday.filter(t => !t.assigned_tech_id)

  // Drag & drop handlers
  const handleDragStart = (e, ticketId) => {
    setDragging({ ticketId })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, techId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver({ techId })
  }

  const handleDrop = async (e, techId) => {
    e.preventDefault()
    if (!dragging) return
    setSaving(true)
    await supabase.from('service_tickets').update({
      assigned_tech_id: techId || null,
      scheduled_date: selectedDate
    }).eq('id', dragging.ticketId)
    setTickets(prev => prev.map(t =>
      t.id === dragging.ticketId
        ? { ...t, assigned_tech_id: techId || null, scheduled_date: selectedDate }
        : t
    ))
    setDragging(null)
    setDragOver(null)
    setSaving(false)
  }

  const openTicketModal = (ticket) => {
    setSelectedTicket(ticket)
    setEditTechId(ticket.assigned_tech_id || '')
    setEditDate(ticket.scheduled_date || selectedDate)
    setEditTime(ticket.scheduled_time || '')
    setShowTicketModal(true)
  }

  const saveTicketAssignment = async () => {
    if (!selectedTicket) return
    setSaving(true)
    await supabase.from('service_tickets').update({
      assigned_tech_id: editTechId || null,
      scheduled_date: editDate || null,
      scheduled_time: editTime || null,
    }).eq('id', selectedTicket.id)
    setTickets(prev => prev.map(t =>
      t.id === selectedTicket.id
        ? { ...t, assigned_tech_id: editTechId || null, scheduled_date: editDate || null, scheduled_time: editTime || null }
        : t
    ))
    setShowTicketModal(false)
    setSaving(false)
  }

  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-5 overflow-x-auto">
        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h2 className="text-white text-2xl font-bold">Dispatch Board</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{scheduledToday.length} scheduled · {unscheduled.length} unscheduled · {saving && <span className="text-[#C8622A]">Saving...</span>}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className={inputClass} />
            <div className="flex gap-2">
              <button onClick={() => setView('board')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'board' ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>📋 Board</button>
              <button onClick={() => setView('unscheduled')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'unscheduled' ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                📥 Unscheduled {unscheduled.length > 0 && <span className="ml-1 bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded">{unscheduled.length}</span>}
              </button>
            </div>
            <button onClick={() => navigate('/service-tickets')} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">All Tickets</button>
          </div>
        </div>

        {view === 'board' && (
          <>
            <p className="text-[#8A9AB0] text-sm">{dateLabel} — drag tickets between columns to reassign</p>

            {/* Unassigned drop zone for today */}
            {unassignedToday.length > 0 && (
              <div className="bg-[#1a2d45] rounded-xl p-4 border border-dashed border-[#2a3d55]"
                onDragOver={e => handleDragOver(e, null)}
                onDrop={e => handleDrop(e, null)}
                onDragLeave={() => setDragOver(null)}>
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">⚠ Scheduled but Unassigned ({unassignedToday.length})</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {unassignedToday.map(ticket => (
                    <TicketCard key={ticket.id} ticket={ticket} onDragStart={handleDragStart} onClick={() => openTicketModal(ticket)} />
                  ))}
                </div>
              </div>
            )}

            {/* Tech columns */}
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minWidth: 'max-content' }}>
              {techs.map(tech => {
                const techTickets = getTicketsForTech(tech.id)
                const isOver = dragOver?.techId === tech.id
                return (
                  <div key={tech.id}
                    className={`w-72 flex-shrink-0 rounded-xl border-2 transition-colors ${isOver ? 'border-[#C8622A]/50 bg-[#C8622A]/5' : 'border-[#2a3d55] bg-[#1a2d45]'}`}
                    onDragOver={e => handleDragOver(e, tech.id)}
                    onDrop={e => handleDrop(e, tech.id)}
                    onDragLeave={() => setDragOver(null)}>
                    {/* Tech header */}
                    <div className="p-4 border-b border-[#2a3d55]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold text-sm">{tech.full_name}</p>
                          {tech.dispatch_zone && <p className="text-[#8A9AB0] text-xs mt-0.5">📍 {tech.dispatch_zone}</p>}
                        </div>
                        <span className="bg-[#0F1C2E] text-[#8A9AB0] text-xs px-2 py-1 rounded font-semibold">{techTickets.length}</span>
                      </div>
                    </div>

                    {/* Tickets */}
                    <div className="p-3 space-y-2 min-h-32">
                      {techTickets.length === 0 ? (
                        <div className="flex items-center justify-center h-24 text-[#2a3d55] text-sm">
                          {isOver ? <span className="text-[#C8622A]">Drop here →</span> : 'No tickets'}
                        </div>
                      ) : (
                        techTickets
                          .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99'))
                          .map(ticket => (
                            <TicketCard key={ticket.id} ticket={ticket} onDragStart={handleDragStart} onClick={() => openTicketModal(ticket)} />
                          ))
                      )}
                    </div>
                  </div>
                )
              })}

              {techs.length === 0 && (
                <div className="flex-1 text-center py-16 text-[#8A9AB0]">
                  <p>No technicians found. Add team members with the Technician role.</p>
                </div>
              )}
            </div>

            {/* Other days section */}
            {scheduledOtherDays.length > 0 && (
              <div className="bg-[#1a2d45] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Other Scheduled Tickets</p>
                <div className="space-y-2">
                  {scheduledOtherDays.slice(0, 5).map(ticket => (
                    <div key={ticket.id} onClick={() => navigate(`/service-tickets/${ticket.id}`)}
                      className="flex items-center justify-between bg-[#0F1C2E] rounded-lg px-4 py-2 cursor-pointer hover:bg-[#0a1628] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.Normal}`} />
                        <span className="text-white text-sm">{ticket.title}</span>
                        {ticket.clients?.company && <span className="text-[#8A9AB0] text-xs">· {ticket.clients.company}</span>}
                      </div>
                      <span className="text-[#8A9AB0] text-xs">{new Date(ticket.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  ))}
                  {scheduledOtherDays.length > 5 && <p className="text-[#8A9AB0] text-xs text-center pt-1">+{scheduledOtherDays.length - 5} more</p>}
                </div>
              </div>
            )}
          </>
        )}

        {view === 'unscheduled' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Unscheduled Tickets ({unscheduled.length})</h3>
              <p className="text-[#8A9AB0] text-sm">Click a ticket to schedule and assign it</p>
            </div>
            {unscheduled.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-green-400 font-semibold mb-1">✓ All clear!</p>
                <p className="text-[#8A9AB0] text-sm">No unscheduled tickets.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unscheduled.map(ticket => (
                  <div key={ticket.id}
                    className="flex items-center justify-between bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55] cursor-pointer hover:border-[#C8622A]/30 hover:bg-[#0a1628] transition-colors"
                    onClick={() => openTicketModal(ticket)}>
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.Normal}`} />
                      <div>
                        <p className="text-white font-medium">{ticket.title}</p>
                        <div className="flex items-center gap-3 text-xs text-[#8A9AB0] mt-0.5">
                          {ticket.clients?.company && <span>🏢 {ticket.clients.company}</span>}
                          <span className={`px-1.5 py-0.5 rounded ${ticket.priority === 'Urgent' ? 'bg-red-500/20 text-red-400' : ticket.priority === 'High' ? 'bg-orange-500/20 text-orange-400' : 'text-[#8A9AB0]'}`}>{ticket.priority}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {ticket.profiles?.full_name
                        ? <span className="text-[#8A9AB0] text-xs">🔧 {ticket.profiles.full_name}</span>
                        : <span className="text-red-400 text-xs">Unassigned</span>}
                      <span className="text-[#C8622A] text-sm">Schedule →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign / Reschedule Modal */}
      {showTicketModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Assign & Schedule</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">{selectedTicket.title}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Technician</label>
                <select value={editTechId} onChange={e => setEditTechId(e.target.value)} className={`w-full ${inputClass}`}>
                  <option value="">— Unassigned —</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.dispatch_zone ? ` · ${t.dispatch_zone}` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Time</label>
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => navigate(`/service-tickets/${selectedTicket.id}`)}
                  className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">View Ticket →</button>
                <button onClick={() => setShowTicketModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveTicketAssignment} disabled={saving}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TicketCard({ ticket, onDragStart, onClick }) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, ticket.id)}
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-grab active:cursor-grabbing hover:border-[#C8622A]/40 transition-colors ${STATUS_COLORS[ticket.status] || STATUS_COLORS.Open}`}>
      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.Normal}`} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium leading-snug line-clamp-2">{ticket.title}</p>
          {ticket.clients?.company && <p className="text-[#8A9AB0] text-xs mt-0.5 truncate">{ticket.clients.company}</p>}
          {ticket.scheduled_time && <p className="text-[#C8622A] text-xs mt-0.5">{ticket.scheduled_time.slice(0, 5)}</p>}
        </div>
      </div>
    </div>
  )
}
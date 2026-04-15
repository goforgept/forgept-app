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

const TECH_COLORS = [
  'bg-purple-500/20 border-purple-500/40 text-purple-300',
  'bg-teal-500/20 border-teal-500/40 text-teal-300',
  'bg-pink-500/20 border-pink-500/40 text-pink-300',
  'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
  'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  'bg-amber-500/20 border-amber-500/40 text-amber-300',
  'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
  'bg-rose-500/20 border-rose-500/40 text-rose-300',
]

function getWeekDates(referenceDate) {
  const date = new Date(referenceDate + 'T12:00:00')
  const day = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export default function Dispatch({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [jobs, setJobs] = useState([])
  const [jobSchedules, setJobSchedules] = useState([])
  const [unscheduledJobs, setUnscheduledJobs] = useState([])
  const [techs, setTechs] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [viewMode, setViewMode] = useState('day') // 'day' | 'week'
  const [view, setView] = useState('board') // 'board' | 'unscheduled'
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [showJobModal, setShowJobModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [editTechId, setEditTechId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editDuration, setEditDuration] = useState('2')
  const [editJobTechId, setEditJobTechId] = useState('')
  const [editJobDate, setEditJobDate] = useState('')
  const [editJobHours, setEditJobHours] = useState('4')

  const [orgTimezone, setOrgTimezone] = useState('America/Chicago')
  const today = new Date().toISOString().split('T')[0]
  const weekDates = getWeekDates(selectedDate)

  useEffect(() => { fetchAll() }, [selectedDate])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const startDate = viewMode === 'week' ? weekDates[0] : selectedDate
    const endDate = viewMode === 'week' ? weekDates[4] : selectedDate

    const [
      { data: orgData },
      { data: techData },
      { data: ticketData },
      { data: jobData },
      { data: scheduleData },
      { data: allSchedules },
    ] = await Promise.all([
      supabase.from('organizations').select('timezone').eq('id', profileData.org_id).single(),
      supabase.from('profiles').select('id, full_name, dispatch_zone, role').eq('org_id', profileData.org_id).order('full_name'),
      supabase.from('service_tickets').select('*, clients(company), profiles!service_tickets_assigned_tech_id_fkey(full_name)').eq('org_id', profileData.org_id).not('status', 'in', '("Resolved","Cancelled")').order('scheduled_date', { ascending: true, nullsFirst: false }),
      supabase.from('jobs').select('*, clients(company), proposals(proposal_name)').eq('org_id', profileData.org_id).eq('status', 'Active').order('created_at', { ascending: false }),
      supabase.from('job_tech_schedules').select('*, jobs(name, job_number, clients(company)), profiles(full_name)').eq('org_id', profileData.org_id).gte('date', startDate).lte('date', endDate),
      supabase.from('job_tech_schedules').select('job_id').eq('org_id', profileData.org_id).gte('date', today),
    ])

    setOrgTimezone(orgData?.timezone || 'America/Chicago')
    setTechs(techData || [])
    setTickets(ticketData || [])
    setJobs(jobData || [])
    setJobSchedules(scheduleData || [])
    const scheduledJobIds = new Set((allSchedules || []).map(s => s.job_id))
    setUnscheduledJobs((jobData || []).filter(j => !scheduledJobIds.has(j.id)))

    setLoading(false)
  }

  const navigateDate = (direction) => {
    const date = new Date(selectedDate + 'T12:00:00')
    if (viewMode === 'week') {
      date.setDate(date.getDate() + direction * 7)
    } else {
      date.setDate(date.getDate() + direction)
    }
    setSelectedDate(date.toISOString().split('T')[0])
  }

  const goToToday = () => setSelectedDate(today)

  // Capacity calculation per tech per day
  const getTechCapacity = (techId, date) => {
    const ticketHours = tickets
      .filter(t => t.assigned_tech_id === techId && t.scheduled_date === date)
      .reduce((sum, t) => sum + (parseFloat(t.duration_hours) || 2), 0)
    const jobHours = jobSchedules
      .filter(s => s.tech_id === techId && s.date === date)
      .reduce((sum, s) => sum + (parseFloat(s.hours_allocated) || 4), 0)
    const total = ticketHours + jobHours
    const maxHours = 8
    return { total, pct: Math.min((total / maxHours) * 100, 100), over: total > maxHours, remaining: Math.max(maxHours - total, 0) }
  }

  const unassignedTickets = tickets.filter(t => !t.assigned_tech_id)
  const unscheduled = tickets.filter(t => !t.scheduled_date && !t.assigned_tech_id)

  const getTicketsForTechDate = (techId, date) =>
    tickets.filter(t => t.assigned_tech_id === techId && t.scheduled_date === date)

  const getJobSchedulesForTechDate = (techId, date) =>
    jobSchedules.filter(s => s.tech_id === techId && s.date === date)

  const handleDragStart = (e, ticketId) => {
    setDragging({ ticketId })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, techId, date) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver({ techId, date })
  }

  const handleDrop = async (e, techId, date) => {
    e.preventDefault()
    if (!dragging) return
    setSaving(true)
    const updates = techId
      ? { assigned_tech_id: techId, scheduled_date: date || selectedDate }
      : { assigned_tech_id: null }
    await supabase.from('service_tickets').update(updates).eq('id', dragging.ticketId)
    setTickets(prev => prev.map(t => t.id === dragging.ticketId ? { ...t, ...updates } : t))
    setDragging(null)
    setDragOver(null)
    setSaving(false)
  }

  const openTicketModal = (ticket) => {
    setSelectedTicket(ticket)
    setEditTechId(ticket.assigned_tech_id || '')
    setEditDate(ticket.scheduled_date || selectedDate)
    setEditTime(ticket.scheduled_time || '')
    setEditDuration(String(ticket.duration_hours || 2))
    setShowTicketModal(true)
  }

  const saveTicketAssignment = async () => {
    if (!selectedTicket) return
    setSaving(true)
    await supabase.from('service_tickets').update({
      assigned_tech_id: editTechId || null,
      scheduled_date: editDate || null,
      scheduled_time: editTime || null,
      duration_hours: parseFloat(editDuration) || 2,
    }).eq('id', selectedTicket.id)
    const updatedTicket = { ...selectedTicket, assigned_tech_id: editTechId || null, scheduled_date: editDate || null, scheduled_time: editTime || null, duration_hours: parseFloat(editDuration) || 2 }
    setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t))
    if (editTechId && editDate) pushTicketToCalendar(updatedTicket, editTechId)
    setShowTicketModal(false)
    setSaving(false)
  }

  const openJobModal = (job, existingSchedule = null) => {
    setSelectedJob(job)
    setEditJobTechId(existingSchedule?.tech_id || '')
    setEditJobDate(existingSchedule?.date || selectedDate)
    setEditJobHours(String(existingSchedule?.hours_allocated || 4))
    setShowJobModal(true)
  }

  const saveJobSchedule = async () => {
    if (!selectedJob || !editJobTechId || !editJobDate) return
    setSaving(true)
    const { error } = await supabase.from('job_tech_schedules').insert({
      job_id: selectedJob.id,
      tech_id: editJobTechId,
      org_id: profile.org_id,
      date: editJobDate,
      hours_allocated: parseFloat(editJobHours) || 4,
    })
    if (!error) {
      await fetchAll()
      // Find the newly inserted schedule to get its ID
      const { data: newSched } = await supabase
        .from('job_tech_schedules')
        .select('*')
        .eq('job_id', selectedJob.id)
        .eq('tech_id', editJobTechId)
        .eq('date', editJobDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (newSched) pushJobScheduleToCalendar(newSched, selectedJob.name, selectedJob.clients?.company)
    }
    setShowJobModal(false)
    setSaving(false)
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

  const removeJobSchedule = async (scheduleId) => {
    const schedule = jobSchedules.find(s => s.id === scheduleId)
    if (schedule?.google_event_id || schedule?.microsoft_event_id) {
      deleteCalendarEvent(schedule.tech_id, schedule.google_event_id, schedule.microsoft_event_id)
    }
    await supabase.from('job_tech_schedules').delete().eq('id', scheduleId)
    setJobSchedules(prev => prev.filter(s => s.id !== scheduleId))
  }

  const pushTicketToCalendar = async (ticket, techId) => {
    if (!techId || !ticket?.scheduled_date) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tech_id: techId,
          title: `🎫 ${ticket.title}`,
          description: `Service ticket via ForgePt.\n${ticket.clients?.company ? `Client: ${ticket.clients.company}` : ''}`,
          date: ticket.scheduled_date,
          start_time: ticket.scheduled_time || null,
          duration_hours: ticket.duration_hours || 2,
          record_type: 'ticket',
          record_id: ticket.id,
          existing_google_event_id: ticket.google_event_id || null,
          existing_microsoft_event_id: ticket.microsoft_event_id || null,
          timezone: orgTimezone,
        }),
      })
    } catch (e) { console.error('Calendar push error:', e) }
  }

  const pushJobScheduleToCalendar = async (scheduleRow, jobName, clientCompany) => {
    if (!scheduleRow?.id || !scheduleRow?.tech_id) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tech_id: scheduleRow.tech_id,
          title: `🔨 ${jobName || 'Job'}`,
          description: `Job scheduled via ForgePt.\n${clientCompany ? `Client: ${clientCompany}` : ''}\nHours: ${scheduleRow.hours_allocated}`,
          date: scheduleRow.date,
          start_time: null,
          duration_hours: scheduleRow.hours_allocated,
          record_type: 'job_schedule',
          record_id: scheduleRow.id,
          existing_google_event_id: scheduleRow.google_event_id || null,
          existing_microsoft_event_id: scheduleRow.microsoft_event_id || null,
          timezone: orgTimezone,
        }),
      })
    } catch (e) { console.error('Calendar push error:', e) }
  }

  const techColorMap = {}
  techs.forEach((t, i) => { techColorMap[t.id] = TECH_COLORS[i % TECH_COLORS.length] })

  const dateLabel = viewMode === 'week'
    ? `${new Date(weekDates[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(weekDates[4] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>

  const displayDates = viewMode === 'week' ? weekDates : [selectedDate]

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-5 overflow-x-auto">

        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h2 className="text-white text-2xl font-bold">Dispatch Board</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">
              {tickets.filter(t => t.assigned_tech_id).length} assigned · {unscheduled.length} unscheduled tickets
              {unscheduledJobs.length > 0 && <span className="ml-2 text-orange-400">· ⚠ {unscheduledJobs.length} job{unscheduledJobs.length !== 1 ? 's' : ''} need scheduling</span>}
              {saving && <span className="ml-2 text-[#C8622A]">Saving...</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date navigation */}
            <div className="flex items-center gap-1 bg-[#1a2d45] rounded-lg p-1">
              <button onClick={() => navigateDate(-1)} className="text-[#8A9AB0] hover:text-white px-2 py-1 rounded transition-colors">‹</button>
              <button onClick={goToToday} className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${selectedDate === today ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>Today</button>
              <button onClick={() => navigateDate(1)} className="text-[#8A9AB0] hover:text-white px-2 py-1 rounded transition-colors">›</button>
            </div>

            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className={`${inputClass} text-xs`} />

            {/* View mode */}
            <div className="flex gap-1 bg-[#1a2d45] rounded-lg p-1">
              <button onClick={() => setViewMode('day')} className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${viewMode === 'day' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>Day</button>
              <button onClick={() => setViewMode('week')} className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${viewMode === 'week' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>Week</button>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setView('board')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'board' ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>📋 Board</button>
              <button onClick={() => setView('unscheduled')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'unscheduled' ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                📥 Unscheduled
                {(unscheduled.length > 0 || unscheduledJobs.length > 0) && (
                  <span className="ml-1 bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded">{unscheduled.length + unscheduledJobs.length}</span>
                )}
              </button>
            </div>
            <button onClick={() => navigate('/service-tickets')} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">All Tickets</button>
          </div>
        </div>

        {/* Unscheduled jobs banner */}
        {unscheduledJobs.length > 0 && view === 'board' && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-orange-400 text-lg">⚠</span>
              <div>
                <p className="text-orange-400 text-sm font-semibold">{unscheduledJobs.length} active job{unscheduledJobs.length !== 1 ? 's' : ''} with no upcoming tech schedule</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">{unscheduledJobs.map(j => j.name).join(', ')}</p>
              </div>
            </div>
            <button onClick={() => setView('unscheduled')} className="text-orange-400 hover:text-white text-xs font-semibold transition-colors">Review →</button>
          </div>
        )}

        {view === 'board' && (
          <>
            <p className="text-[#8A9AB0] text-sm">{dateLabel} — drag tickets to reassign · blue blocks = jobs · green blocks = service tickets</p>

            {/* Board — week view shows date columns per tech, day view shows single column per tech */}
            {viewMode === 'day' ? (
              <div className="flex gap-4 overflow-x-auto pb-4" style={{ minWidth: 'max-content' }}>

                {/* Unassigned column */}
                <div
                  className={`w-72 flex-shrink-0 rounded-xl border-2 transition-colors ${dragOver?.techId === 'unassigned' ? 'border-[#C8622A]/50 bg-[#C8622A]/5' : 'border-dashed border-[#2a3d55] bg-[#1a2d45]'}`}
                  onDragOver={e => handleDragOver(e, 'unassigned', selectedDate)}
                  onDrop={e => { handleDrop(e, null, selectedDate); setDragOver(null) }}
                  onDragLeave={() => setDragOver(null)}>
                  <div className="p-4 border-b border-[#2a3d55]">
                    <div className="flex items-center justify-between">
                      <p className="text-[#8A9AB0] font-semibold text-sm">Unassigned</p>
                      <span className="bg-[#0F1C2E] text-[#8A9AB0] text-xs px-2 py-1 rounded font-semibold">{unassignedTickets.length}</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 min-h-32">
                    {unassignedTickets.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-[#2a3d55] text-sm">
                        {dragOver?.techId === 'unassigned' ? <span className="text-[#C8622A]">Drop to unassign</span> : 'All assigned'}
                      </div>
                    ) : (
                      unassignedTickets.map(ticket => (
                        <TicketCard key={ticket.id} ticket={ticket} selectedDate={selectedDate} onDragStart={handleDragStart} onClick={() => openTicketModal(ticket)} />
                      ))
                    )}
                  </div>
                </div>

                {/* Tech columns */}
                {techs.map(tech => {
                  const techTickets = getTicketsForTechDate(tech.id, selectedDate)
                  const techJobSchedules = getJobSchedulesForTechDate(tech.id, selectedDate)
                  const capacity = getTechCapacity(tech.id, selectedDate)
                  const isOver = dragOver?.techId === tech.id
                  return (
                    <div key={tech.id}
                      className={`w-72 flex-shrink-0 rounded-xl border-2 transition-colors ${isOver ? 'border-[#C8622A]/50 bg-[#C8622A]/5' : 'border-[#2a3d55] bg-[#1a2d45]'}`}
                      onDragOver={e => handleDragOver(e, tech.id, selectedDate)}
                      onDrop={e => handleDrop(e, tech.id, selectedDate)}
                      onDragLeave={() => setDragOver(null)}>
                      <TechHeader tech={tech} capacity={capacity} techTickets={techTickets} techJobSchedules={techJobSchedules} />
                      <div className="p-3 space-y-2 min-h-32">
                        {/* Job blocks */}
                        {techJobSchedules.map(schedule => (
                          <JobBlock key={schedule.id} schedule={schedule} onRemove={() => removeJobSchedule(schedule.id)} onNavigate={() => navigate(`/jobs/${schedule.job_id}`)} />
                        ))}
                        {/* Ticket blocks */}
                        {techTickets.length === 0 && techJobSchedules.length === 0 ? (
                          <div className="flex items-center justify-center h-24 text-[#2a3d55] text-sm">
                            {isOver ? <span className="text-[#C8622A]">Drop here →</span> : 'No work scheduled'}
                          </div>
                        ) : (
                          techTickets
                            .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99'))
                            .map(ticket => (
                              <TicketCard key={ticket.id} ticket={ticket} selectedDate={selectedDate} onDragStart={handleDragStart} onClick={() => openTicketModal(ticket)} />
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
            ) : (
              /* Week view — techs as rows, dates as columns */
              <div className="space-y-4">
              {/* Unassigned tickets — draggable source for week view */}
              {unassignedTickets.length > 0 && (
                <div className="bg-[#1a2d45] rounded-xl p-4">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Unassigned Tickets — drag to a day below</p>
                  <div className="flex flex-wrap gap-2">
                    {unassignedTickets.map(ticket => (
                      <div
                        key={ticket.id}
                        draggable
                        onDragStart={e => handleDragStart(e, ticket.id)}
                        onClick={() => openTicketModal(ticket)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing hover:border-[#C8622A]/40 transition-colors ${STATUS_COLORS[ticket.status] || STATUS_COLORS.Open}`}>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.Normal}`} />
                        <div>
                          <p className="text-white text-xs font-medium">{ticket.title}</p>
                          {ticket.clients?.company && <p className="text-[#8A9AB0] text-xs">{ticket.clients.company}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto pb-4">
                <table className="w-full" style={{ minWidth: `${techs.length > 0 ? 200 + weekDates.length * 180 : 800}px` }}>
                  <thead>
                    <tr>
                      <th className="w-44 text-left pb-3 pr-3">
                        <span className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Technician</span>
                      </th>
                      {weekDates.map(date => {
                        const isToday = date === today
                        const isSelected = date === selectedDate
                        const d = new Date(date + 'T12:00:00')
                        return (
                          <th key={date} className="pb-3 px-2 text-center">
                            <button onClick={() => { setSelectedDate(date); setViewMode('day') }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors w-full ${isToday ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30' : isSelected ? 'bg-[#2a3d55] text-white' : 'text-[#8A9AB0] hover:text-white hover:bg-[#1a2d45]'}`}>
                              <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                              <div className="text-lg font-bold mt-0.5">{d.getDate()}</div>
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {techs.map(tech => (
                      <tr key={tech.id} className="border-t border-[#2a3d55]">
                        <td className="py-3 pr-3 align-top">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${techColorMap[tech.id]?.split(' ')[0] || 'bg-blue-400'}`} />
                            <div>
                              <p className="text-white text-sm font-semibold">{tech.full_name}</p>
                              {tech.dispatch_zone && <p className="text-[#8A9AB0] text-xs">📍 {tech.dispatch_zone}</p>}
                            </div>
                          </div>
                        </td>
                        {weekDates.map(date => {
                          const dayTickets = getTicketsForTechDate(tech.id, date)
                          const daySchedules = getJobSchedulesForTechDate(tech.id, date)
                          const capacity = getTechCapacity(tech.id, date)
                          const isEmpty = dayTickets.length === 0 && daySchedules.length === 0
                          return (
                            <td key={date} className="py-2 px-2 align-top"
                              onDragOver={e => handleDragOver(e, tech.id, date)}
                              onDrop={e => handleDrop(e, tech.id, date)}
                              onDragLeave={() => setDragOver(null)}>
                              <div className={`min-h-20 rounded-lg p-2 space-y-1.5 transition-colors ${dragOver?.techId === tech.id && dragOver?.date === date ? 'bg-[#C8622A]/10 border border-[#C8622A]/30' : 'bg-[#0F1C2E] border border-[#2a3d55]'}`}>
                                {/* Capacity bar */}
                                {!isEmpty && (
                                  <div className="mb-2">
                                    <div className="w-full bg-[#1a2d45] rounded-full h-1">
                                      <div className={`h-1 rounded-full transition-all ${capacity.over ? 'bg-red-500' : capacity.pct > 80 ? 'bg-yellow-400' : 'bg-green-400'}`}
                                        style={{ width: `${capacity.pct}%` }} />
                                    </div>
                                    <p className="text-[#8A9AB0] text-xs mt-0.5">{capacity.total}h / 8h</p>
                                  </div>
                                )}
                                {daySchedules.map(s => (
                                  <div key={s.id} className="bg-blue-500/10 border border-blue-500/30 rounded p-1.5 text-xs cursor-pointer hover:bg-blue-500/20 transition-colors"
                                    onClick={() => navigate(`/jobs/${s.job_id}`)}>
                                    <p className="text-blue-300 font-semibold truncate">🔨 {s.jobs?.name || 'Job'}</p>
                                    <p className="text-blue-400/70">{s.hours_allocated}h</p>
                                  </div>
                                ))}
                                {dayTickets.map(ticket => (
                                  <div key={ticket.id}
                                    draggable
                                    onDragStart={e => handleDragStart(e, ticket.id)}
                                    onClick={() => openTicketModal(ticket)}
                                    className="bg-green-500/10 border border-green-500/30 rounded p-1.5 text-xs cursor-grab hover:bg-green-500/20 transition-colors">
                                    <p className="text-green-300 font-semibold truncate">🎫 {ticket.title}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {ticket.scheduled_time && <p className="text-green-400/70">{ticket.scheduled_time.slice(0, 5)}</p>}
                                      {ticket.duration_hours && <p className="text-green-400/70">{ticket.duration_hours}h</p>}
                                    </div>
                                  </div>
                                ))}
                                {isEmpty && (
                                  <div className="flex items-center justify-center h-12 text-[#2a3d55] text-xs">
                                    {dragOver?.techId === tech.id && dragOver?.date === date ? <span className="text-[#C8622A]">Drop →</span> : 'Free'}
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </>
        )}

        {view === 'unscheduled' && (
          <div className="space-y-6">

            {/* Unscheduled Jobs */}
            {unscheduledJobs.length > 0 && (
              <div className="bg-[#1a2d45] rounded-xl p-6">
                <div className="flex justify-between items-center mb-5">
                  <div>
                    <h3 className="text-white font-bold text-lg">Unscheduled Jobs ({unscheduledJobs.length})</h3>
                    <p className="text-[#8A9AB0] text-sm mt-0.5">Active jobs with no upcoming tech schedule</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {unscheduledJobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between bg-[#0F1C2E] rounded-xl p-4 border border-orange-500/20 hover:border-orange-500/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-orange-400 text-lg">⚠</span>
                        <div>
                          <p className="text-white font-medium">{job.name}</p>
                          <div className="flex items-center gap-3 text-xs text-[#8A9AB0] mt-0.5">
                            {job.job_number && <span className="font-mono">{job.job_number}</span>}
                            {job.clients?.company && <span>🏢 {job.clients.company}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openJobModal(job)}
                          className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors">
                          Schedule Tech →
                        </button>
                        <button onClick={() => navigate(`/jobs/${job.id}`)}
                          className="bg-[#2a3d55] text-white px-3 py-1.5 rounded-lg text-xs hover:bg-[#3a4d65] transition-colors">
                          View Job
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unscheduled Tickets */}
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
          </div>
        )}
      </div>

      {/* Ticket Modal */}
      {showTicketModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Assign & Schedule Ticket</h3>
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
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Start Time</label>
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Duration (hours)</label>
                <select value={editDuration} onChange={e => setEditDuration(e.target.value)} className={`w-full ${inputClass}`}>
                  {['0.5','1','1.5','2','2.5','3','3.5','4','5','6','7','8'].map(h => (
                    <option key={h} value={h}>{h} {parseFloat(h) === 1 ? 'hour' : 'hours'}</option>
                  ))}
                </select>
              </div>
              {editTechId && editDate && (
                <div className="bg-[#0F1C2E] rounded-lg px-4 py-3">
                  <p className="text-[#8A9AB0] text-xs font-semibold mb-1">Capacity on {new Date(editDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  {(() => {
                    const cap = getTechCapacity(editTechId, editDate)
                    return (
                      <div>
                        <div className="w-full bg-[#1a2d45] rounded-full h-1.5 mb-1">
                          <div className={`h-1.5 rounded-full ${cap.over ? 'bg-red-500' : cap.pct > 80 ? 'bg-yellow-400' : 'bg-green-400'}`} style={{ width: `${cap.pct}%` }} />
                        </div>
                        <p className={`text-xs ${cap.over ? 'text-red-400' : 'text-[#8A9AB0]'}`}>
                          {cap.total}h booked · {cap.remaining}h remaining
                          {cap.over && ' ⚠ Overbooked'}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              )}
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

      {/* Job Schedule Modal */}
      {showJobModal && selectedJob && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Schedule Tech for Job</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">{selectedJob.name}{selectedJob.clients?.company ? ` · ${selectedJob.clients.company}` : ''}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Technician <span className="text-[#C8622A]">*</span></label>
                <select value={editJobTechId} onChange={e => setEditJobTechId(e.target.value)} className={`w-full ${inputClass}`}>
                  <option value="">— Select tech —</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.dispatch_zone ? ` · ${t.dispatch_zone}` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                  <input type="date" value={editJobDate} onChange={e => setEditJobDate(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Hours on this job</label>
                  <select value={editJobHours} onChange={e => setEditJobHours(e.target.value)} className={`w-full ${inputClass}`}>
                    {['1','2','3','4','5','6','7','8'].map(h => (
                      <option key={h} value={h}>{h} {parseInt(h) === 1 ? 'hour' : 'hours'}</option>
                    ))}
                  </select>
                </div>
              </div>
              {editJobTechId && editJobDate && (
                <div className="bg-[#0F1C2E] rounded-lg px-4 py-3">
                  <p className="text-[#8A9AB0] text-xs font-semibold mb-1">Capacity on {new Date(editJobDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  {(() => {
                    const cap = getTechCapacity(editJobTechId, editJobDate)
                    return (
                      <div>
                        <div className="w-full bg-[#1a2d45] rounded-full h-1.5 mb-1">
                          <div className={`h-1.5 rounded-full ${cap.over ? 'bg-red-500' : cap.pct > 80 ? 'bg-yellow-400' : 'bg-green-400'}`} style={{ width: `${cap.pct}%` }} />
                        </div>
                        <p className={`text-xs ${cap.over ? 'text-red-400' : 'text-[#8A9AB0]'}`}>
                          {cap.total}h booked · {cap.remaining}h remaining
                          {cap.over && ' ⚠ Overbooked'}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              )}
              <p className="text-[#8A9AB0] text-xs">You can schedule the same job on multiple days or assign multiple techs by adding additional schedule entries.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowJobModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveJobSchedule} disabled={saving || !editJobTechId || !editJobDate}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TechHeader({ tech, capacity, techTickets, techJobSchedules }) {
  const total = techTickets.length + techJobSchedules.length
  return (
    <div className="p-4 border-b border-[#2a3d55]">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-white font-semibold text-sm">{tech.full_name}</p>
          {tech.dispatch_zone && <p className="text-[#8A9AB0] text-xs mt-0.5">📍 {tech.dispatch_zone}</p>}
        </div>
        <span className="bg-[#0F1C2E] text-[#8A9AB0] text-xs px-2 py-1 rounded font-semibold">{total}</span>
      </div>
      {/* Capacity bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[#8A9AB0] text-xs">{capacity.total}h / 8h</span>
          <span className={`text-xs font-semibold ${capacity.over ? 'text-red-400' : capacity.pct > 80 ? 'text-yellow-400' : 'text-green-400'}`}>
            {capacity.over ? '⚠ Over' : `${capacity.remaining}h free`}
          </span>
        </div>
        <div className="w-full bg-[#0F1C2E] rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${capacity.over ? 'bg-red-500' : capacity.pct > 80 ? 'bg-yellow-400' : 'bg-green-400'}`}
            style={{ width: `${capacity.pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function JobBlock({ schedule, onRemove, onNavigate }) {
  return (
    <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-blue-400 text-xs">🔨</span>
            <p className="text-blue-300 text-xs font-semibold truncate">{schedule.jobs?.name || 'Job'}</p>
          </div>
          {schedule.jobs?.clients?.company && <p className="text-blue-400/70 text-xs truncate">{schedule.jobs.clients.company}</p>}
          <p className="text-blue-400/70 text-xs mt-0.5">{schedule.hours_allocated}h allocated</p>
        </div>
        <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-[#8A9AB0] hover:text-red-400 text-xs transition-all flex-shrink-0">✕</button>
      </div>
    </div>
  )
}

function TicketCard({ ticket, selectedDate, onDragStart, onClick }) {
  const isOtherDay = ticket.scheduled_date && ticket.scheduled_date !== selectedDate
  const dateLabel = isOtherDay
    ? new Date(ticket.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, ticket.id)}
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-grab active:cursor-grabbing hover:border-[#C8622A]/40 transition-colors ${isOtherDay ? 'border-[#2a3d55] bg-[#0F1C2E]/60 opacity-70' : STATUS_COLORS[ticket.status] || STATUS_COLORS.Open}`}>
      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.Normal}`} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium leading-snug line-clamp-2">{ticket.title}</p>
          {ticket.clients?.company && <p className="text-[#8A9AB0] text-xs mt-0.5 truncate">{ticket.clients.company}</p>}
          <div className="flex items-center gap-2 mt-0.5">
            {dateLabel
              ? <p className="text-[#8A9AB0] text-xs">📅 {dateLabel}</p>
              : ticket.scheduled_time && <p className="text-[#C8622A] text-xs">{ticket.scheduled_time.slice(0, 5)}</p>}
            {ticket.duration_hours && <p className="text-[#8A9AB0] text-xs">{ticket.duration_hours}h</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
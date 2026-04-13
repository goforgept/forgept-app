import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Tasks({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('pending')
  const [view, setView] = useState('list') // 'list' | 'calendar'
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [profile, setProfile] = useState(null)
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '', due_date: '', priority: 'normal',
    assigned_to: '', client_id: '', notes: '',
    meeting_type: '', meeting_link: '', duration_minutes: 60,
    customer_notified: false, attendee_ids: [], attendee_emails: [],
    meeting_notes: ''
  })
  const [showMeeting, setShowMeeting] = useState(false)
  const [newAttendeeEmail, setNewAttendeeEmail] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(profileData)
    if (!profileData?.org_id) { setLoading(false); return }

    const [tasksRes, profilesRes, clientsRes] = await Promise.all([
      supabase.from('tasks').select('*, clients(company), profiles!tasks_assigned_to_fkey(full_name)').eq('org_id', profileData.org_id).order('due_date', { ascending: true }),
      supabase.from('profiles').select('id, full_name').eq('org_id', profileData.org_id),
      supabase.from('clients').select('id, company').eq('org_id', profileData.org_id).order('company')
    ])

    setTasks(tasksRes.data || [])
    setProfiles(profilesRes.data || [])
    setClients(clientsRes.data || [])
    setForm(prev => ({ ...prev, assigned_to: profileData.id }))
    setLoading(false)
  }

  const pushMeetingToCalendar = async (taskId, assignedTo, title, dueDate, durationMinutes, meetingType, attendeeIds) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const allTechIds = [assignedTo, ...(attendeeIds || [])].filter(Boolean)
      for (const techId of allTechIds) {
        await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            tech_id: techId,
            title: `📅 ${meetingType}: ${title}`,
            description: `Meeting scheduled via ForgePt.`,
            date: dueDate,
            start_time: null,
            duration_hours: (durationMinutes || 60) / 60,
            record_type: 'ticket',
            record_id: taskId,
            existing_google_event_id: null,
            existing_microsoft_event_id: null,
          }),
        })
      }
    } catch (e) { console.error('Calendar push error:', e) }
  }

  const sendMeetingConfirmation = async (task, clientEmail, clientName) => {
    if (!clientEmail) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const meetingDate = new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      })
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a2d45;">Meeting Scheduled</h2>
          <p>Hi ${clientName},</p>
          <p>A <strong>${task.meeting_type}</strong> has been scheduled with you.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
            <tr><td style="padding: 8px; color: #666;">Meeting</td><td style="padding: 8px; font-weight: bold;">${task.title}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">Type</td><td style="padding: 8px;">${task.meeting_type}</td></tr>
            <tr><td style="padding: 8px; color: #666;">Date</td><td style="padding: 8px;">${meetingDate}</td></tr>
            ${task.duration_minutes ? `<tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">Duration</td><td style="padding: 8px;">${task.duration_minutes} minutes</td></tr>` : ''}
            ${task.meeting_link ? `<tr><td style="padding: 8px; color: #666;">Link</td><td style="padding: 8px;"><a href="${task.meeting_link}" style="color: #C8622A;">${task.meeting_link}</a></td></tr>` : ''}
          </table>
          ${task.meeting_notes ? `<p style="color: #444;">${task.meeting_notes}</p>` : ''}
          <p style="color: #888; font-size: 12px; margin-top: 32px;">You will receive a reminder the day before. Sent via ForgePt.</p>
        </div>
      `
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          type: 'ai_email',
          toEmail: clientEmail,
          toName: clientName,
          fromName: profile?.full_name || '',
          fromEmail: profile?.email || '',
          subject: `${task.meeting_type} scheduled — ${task.title}`,
          body: html,
          orgId: profile?.org_id,
          sentBy: profile?.id,
        }),
      })
    } catch (e) { console.error('Meeting confirmation email error:', e) }
  }

  const handleAdd = async () => {
    if (!form.title) return
    setSaving(true)
    const isMeeting = !!form.meeting_type
    const { data: newTask } = await supabase.from('tasks').insert({
      org_id: profile.org_id,
      title: form.title,
      due_date: form.due_date || null,
      priority: form.priority,
      assigned_to: form.assigned_to || profile.id,
      created_by: profile.id,
      client_id: form.client_id || null,
      completed: false,
      meeting_type: isMeeting ? form.meeting_type : null,
      meeting_link: isMeeting ? form.meeting_link || null : null,
      duration_minutes: isMeeting ? form.duration_minutes : null,
      customer_notified: isMeeting ? form.customer_notified : false,
      attendee_ids: isMeeting && form.attendee_ids.length > 0 ? form.attendee_ids : null,
      attendee_emails: isMeeting && form.attendee_emails.length > 0 ? form.attendee_emails : null,
      meeting_notes: isMeeting ? form.meeting_notes || null : null,
    }).select('*, clients(company, client_name, email)').single()

    if (newTask && isMeeting && form.due_date) {
      pushMeetingToCalendar(newTask.id, form.assigned_to || profile.id, form.title, form.due_date, form.duration_minutes, form.meeting_type, form.attendee_ids)
      if (form.customer_notified && newTask.clients?.email) {
        sendMeetingConfirmation(newTask, newTask.clients.email, newTask.clients.client_name || newTask.clients.company)
      }
    }

    setForm({ title: '', due_date: '', priority: 'normal', assigned_to: profile.id, client_id: '', notes: '', meeting_type: '', meeting_link: '', duration_minutes: 60, customer_notified: false, attendee_ids: [], attendee_emails: [], meeting_notes: '' })
    setShowMeeting(false)
    setShowForm(false)
    fetchData()
    setSaving(false)
  }

  const toggleComplete = async (task) => {
    await supabase.from('tasks').update({
      completed: !task.completed,
      completed_at: !task.completed ? new Date().toISOString() : null
    }).eq('id', task.id)
    fetchData()
  }

  const isOverdue = (task) => !task.due_date || task.completed ? false : new Date(task.due_date) < new Date(new Date().toDateString())
  const isDueToday = (task) => {
    if (!task.due_date || task.completed) return false
    return task.due_date === new Date().toISOString().split('T')[0]
  }

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return !t.completed
    if (filter === 'completed') return t.completed
    if (filter === 'overdue') return isOverdue(t)
    if (filter === 'today') return isDueToday(t)
    return true
  })

  const pendingCount = tasks.filter(t => !t.completed).length
  const overdueCount = tasks.filter(t => isOverdue(t)).length
  const todayCount = tasks.filter(t => isDueToday(t)).length

  const priorityColor = (p) => {
    if (p === 'high') return 'text-red-400'
    if (p === 'low') return 'text-[#8A9AB0]'
    return 'text-[#C8622A]'
  }

  // ── CALENDAR HELPERS ──────────────────────────────────────────────────
  const calYear = calendarDate.getFullYear()
  const calMonth = calendarDate.getMonth()
  const monthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()

  const prevMonth = () => setCalendarDate(new Date(calYear, calMonth - 1, 1))
  const nextMonth = () => setCalendarDate(new Date(calYear, calMonth + 1, 1))

  const getTasksForDay = (day) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return tasks.filter(t => t.due_date === dateStr)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const selectedDayStr = selectedDay
    ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null
  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : []

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Tasks</h2>
          <div className="flex gap-2">
            {/* View toggle */}
            <div className="flex bg-[#1a2d45] rounded-lg p-1 gap-1">
              <button onClick={() => setView('list')}
                className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${view === 'list' ? 'bg-[#0F1C2E] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                ☰ List
              </button>
              <button onClick={() => setView('calendar')}
                className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${view === 'calendar' ? 'bg-[#0F1C2E] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                📅 Calendar
              </button>
            </div>
            <button onClick={() => setShowForm(!showForm)}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              {showForm ? 'Cancel' : '+ New Task'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Pending</p><p className="text-white text-2xl font-bold">{pendingCount}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Due Today</p><p className="text-[#C8622A] text-2xl font-bold">{todayCount}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Overdue</p><p className="text-red-400 text-2xl font-bold">{overdueCount}</p></div>
        </div>

        {/* New Task Form */}
        {showForm && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">New Task</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Task Title</label>
                <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Call John about panel upgrade quote" className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Priority</label>
                <select value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))} className={inputClass}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Assign To</label>
                <select value={form.assigned_to} onChange={e => setForm(prev => ({ ...prev, assigned_to: e.target.value }))} className={inputClass}>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Link to Client (optional)</label>
                <select value={form.client_id} onChange={e => setForm(prev => ({ ...prev, client_id: e.target.value }))} className={inputClass}>
                  <option value="">— No client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
                </select>
              </div>
            </div>
            {/* Meeting toggle */}
            <div className="col-span-2 border-t border-[#2a3d55] pt-4">
              <button onClick={() => setShowMeeting(p => !p)}
                className="flex items-center gap-2 text-sm font-semibold text-[#8A9AB0] hover:text-white transition-colors">
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${showMeeting ? 'bg-[#C8622A] border-[#C8622A]' : 'border-[#2a3d55]'}`}>
                  {showMeeting && <span className="text-white text-xs">✓</span>}
                </span>
                Schedule a Meeting
              </button>
            </div>

            {showMeeting && (
              <>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Meeting Type</label>
                  <select value={form.meeting_type} onChange={e => setForm(p => ({ ...p, meeting_type: e.target.value }))} className={inputClass}>
                    <option value="">— Select type —</option>
                    {['Site Visit', 'Sales Call', 'Follow-up Call', 'Proposal Review', 'Kickoff Meeting'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Duration (minutes)</label>
                  <select value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))} className={inputClass}>
                    {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Meeting Link (optional)</label>
                  <input type="url" value={form.meeting_link} onChange={e => setForm(p => ({ ...p, meeting_link: e.target.value }))}
                    placeholder="https://meet.google.com/..." className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Additional Attendees</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {profiles.filter(p => p.id !== form.assigned_to).map(p => (
                      <button key={p.id} onClick={() => setForm(prev => ({
                        ...prev,
                        attendee_ids: prev.attendee_ids.includes(p.id)
                          ? prev.attendee_ids.filter(id => id !== p.id)
                          : [...prev.attendee_ids, p.id]
                      }))}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${form.attendee_ids.includes(p.id) ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white border border-[#2a3d55]'}`}>
                        {p.full_name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="email" value={newAttendeeEmail} onChange={e => setNewAttendeeEmail(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newAttendeeEmail.includes('@')) {
                          setForm(p => ({ ...p, attendee_emails: [...p.attendee_emails, newAttendeeEmail] }))
                          setNewAttendeeEmail('')
                        }
                      }}
                      placeholder="Add external email and press Enter"
                      className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
                  </div>
                  {form.attendee_emails.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.attendee_emails.map((email, i) => (
                        <span key={i} className="flex items-center gap-1 bg-[#0F1C2E] border border-[#2a3d55] text-[#8A9AB0] text-xs px-2 py-1 rounded">
                          {email}
                          <button onClick={() => setForm(p => ({ ...p, attendee_emails: p.attendee_emails.filter((_, idx) => idx !== i) }))}
                            className="hover:text-red-400 ml-1">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Meeting Notes (optional)</label>
                  <textarea value={form.meeting_notes} onChange={e => setForm(p => ({ ...p, meeting_notes: e.target.value }))}
                    rows={2} placeholder="Agenda, prep notes, location details..."
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0]" />
                </div>
                {form.client_id && (
                  <div className="col-span-2">
                    <button onClick={() => setForm(p => ({ ...p, customer_notified: !p.customer_notified }))}
                      className="flex items-center gap-2 text-sm transition-colors">
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${form.customer_notified ? 'bg-[#C8622A] border-[#C8622A]' : 'border-[#2a3d55]'}`}>
                        {form.customer_notified && <span className="text-white text-xs">✓</span>}
                      </span>
                      <span className={form.customer_notified ? 'text-white' : 'text-[#8A9AB0]'}>
                        Send confirmation email to customer + 24hr reminder
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="mt-4">
              <button onClick={handleAdd} disabled={saving || !form.title}
                className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Create Task'}
              </button>
            </div>
          </div>
        )}

        {/* ── CALENDAR VIEW ── */}
        {view === 'calendar' && (
          <div className="grid grid-cols-3 gap-4">
            {/* Calendar grid */}
            <div className="col-span-2 bg-[#1a2d45] rounded-xl p-5">
              {/* Month navigation */}
              <div className="flex justify-between items-center mb-5">
                <button onClick={prevMonth} className="text-[#8A9AB0] hover:text-white text-lg transition-colors px-2">‹</button>
                <h3 className="text-white font-bold text-lg">{monthName}</h3>
                <button onClick={nextMonth} className="text-[#8A9AB0] hover:text-white text-lg transition-colors px-2">›</button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[#8A9AB0] text-xs font-semibold py-1">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for first day offset */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const dayStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayTasks = getTasksForDay(day)
                  const isToday = dayStr === todayStr
                  const isSelected = selectedDay === day
                  const hasOverdue = dayTasks.some(t => !t.completed && dayStr < todayStr)
                  const hasPending = dayTasks.some(t => !t.completed)
                  const allDone = dayTasks.length > 0 && dayTasks.every(t => t.completed)

                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      className={`min-h-[64px] rounded-lg p-1.5 cursor-pointer transition-colors border ${
                        isSelected ? 'border-[#C8622A] bg-[#C8622A]/10' :
                        isToday ? 'border-[#C8622A]/40 bg-[#C8622A]/5' :
                        'border-transparent hover:border-[#2a3d55] hover:bg-[#0F1C2E]/50'
                      }`}
                    >
                      <p className={`text-xs font-semibold mb-1 ${
                        isToday ? 'text-[#C8622A]' :
                        isSelected ? 'text-white' :
                        'text-[#8A9AB0]'
                      }`}>{day}</p>
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map(task => (
                          <div key={task.id} className={`text-xs px-1 py-0.5 rounded truncate ${
                            task.completed ? 'bg-green-500/10 text-green-400/60 line-through' :
                            dayStr < todayStr ? 'bg-red-500/20 text-red-400' :
                            task.priority === 'high' ? 'bg-red-500/15 text-red-300' :
                            'bg-[#C8622A]/15 text-[#C8622A]'
                          }`}>
                            {task.title}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <p className="text-xs text-[#8A9AB0] pl-1">+{dayTasks.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Selected day detail */}
            <div className="bg-[#1a2d45] rounded-xl p-5">
              {selectedDay ? (
                <>
                  <h3 className="text-white font-bold mb-1">
                    {new Date(calYear, calMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h3>
                  <p className="text-[#8A9AB0] text-xs mb-4">{selectedDayTasks.length} task{selectedDayTasks.length !== 1 ? 's' : ''}</p>
                  {selectedDayTasks.length === 0 ? (
                    <p className="text-[#8A9AB0] text-sm">No tasks this day.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDayTasks.map(task => (
                        <div key={task.id} className={`p-3 rounded-lg border ${
                          task.completed ? 'border-[#2a3d55]/30 opacity-60' :
                          selectedDayStr < todayStr ? 'border-red-500/30 bg-red-500/5' :
                          'border-[#2a3d55]'
                        }`}>
                          <div className="flex items-start gap-2">
                            <button onClick={() => toggleComplete(task)}
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                task.completed ? 'bg-green-500 border-green-500' : 'border-[#2a3d55] hover:border-[#C8622A]'
                              }`}>
                              {task.completed && <span className="text-white text-xs">✓</span>}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${task.completed ? 'line-through text-[#8A9AB0]' : 'text-white'}`}>
                                {task.title}
                              </p>
                              {task.clients?.company && (
                                <button onClick={() => navigate(`/client/${task.client_id}`)}
                                  className="text-[#C8622A] text-xs hover:underline mt-0.5 block">
                                  {task.clients.company}
                                </button>
                              )}
                              {task.profiles?.full_name && (
                                <p className="text-[#8A9AB0] text-xs mt-0.5">{task.profiles.full_name}</p>
                              )}
                            </div>
                            <span className={`text-xs font-semibold capitalize shrink-0 ${priorityColor(task.priority)}`}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <p className="text-[#8A9AB0] text-sm">Click a day to see tasks</p>
                  <p className="text-[#8A9AB0] text-xs mt-1">Days with tasks show colored chips</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <>
            <div className="flex gap-2">
              {[
                { key: 'pending', label: `Pending (${pendingCount})` },
                { key: 'today', label: `Today (${todayCount})` },
                { key: 'overdue', label: `Overdue (${overdueCount})` },
                { key: 'completed', label: 'Completed' },
                { key: 'all', label: 'All' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === f.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="bg-[#1a2d45] rounded-xl p-6">
              {loading ? (
                <p className="text-[#8A9AB0]">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-[#8A9AB0]">No tasks here. Click + New Task to get started.</p>
              ) : (
                <div className="space-y-2">
                  {filtered.map(task => (
                    <div key={task.id} className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                      task.completed ? 'border-[#2a3d55]/30 bg-[#0F1C2E]/30 opacity-60' :
                      isOverdue(task) ? 'border-red-500/20 bg-red-500/5' :
                      isDueToday(task) ? 'border-[#C8622A]/20 bg-[#C8622A]/5' :
                      'border-[#2a3d55]/50 bg-[#0F1C2E]/50'
                    }`}>
                      <button onClick={() => toggleComplete(task)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          task.completed ? 'bg-green-500 border-green-500' : 'border-[#2a3d55] hover:border-[#C8622A]'
                        }`}>
                        {task.completed && <span className="text-white text-xs">✓</span>}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${task.completed ? 'line-through text-[#8A9AB0]' : 'text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {task.clients?.company && (
                            <button onClick={() => navigate(`/client/${task.client_id}`)} className="text-[#C8622A] text-xs hover:underline">
                              {task.clients.company}
                            </button>
                          )}
                          {task.profiles?.full_name && (
                            <span className="text-[#8A9AB0] text-xs">{task.profiles.full_name}</span>
                          )}
                        </div>
                      </div>
                      {task.meeting_type && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">
                          📅 {task.meeting_type}
                        </span>
                      )}
                      <span className={`text-xs font-semibold capitalize ${priorityColor(task.priority)}`}>{task.priority}</span>
                      {task.due_date && (
                        <span className={`text-xs font-semibold ${
                          isOverdue(task) ? 'text-red-400' : isDueToday(task) ? 'text-[#C8622A]' : 'text-[#8A9AB0]'
                        }`}>
                          {isOverdue(task) ? 'Overdue' : isDueToday(task) ? 'Today' : task.due_date}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
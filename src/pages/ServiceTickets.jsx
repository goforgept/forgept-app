import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function ServiceTickets({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [clients, setClients] = useState([])
  const [techs, setTechs] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', client_id: '', job_id: '',
    assigned_tech_id: '', priority: 'Normal', status: 'Open',
    scheduled_date: '', scheduled_time: '', duration_hours: '2'
  })
  const [clientJobs, setClientJobs] = useState([])

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const { data: ticketData } = await supabase
      .from('service_tickets')
      .select('*, clients(company, client_name), profiles!service_tickets_assigned_tech_id_fkey(full_name), jobs(name, job_number)')
      .eq('org_id', profileData.org_id)
      .order('created_at', { ascending: false })
    setTickets(ticketData || [])

    const { data: clientData } = await supabase
      .from('clients').select('id, company, client_name')
      .eq('org_id', profileData.org_id).order('company')
    setClients(clientData || [])

    const { data: techData } = await supabase
      .from('profiles').select('id, full_name, role, dispatch_zone')
      .eq('org_id', profileData.org_id).order('full_name')
    setTechs(techData || [])

    setLoading(false)
  }

  const handleClientChange = async (clientId) => {
    setForm(p => ({ ...p, client_id: clientId, job_id: '' }))
    setClientJobs([])
    if (!clientId) return
    const { data } = await supabase
      .from('jobs').select('id, name, job_number')
      .eq('client_id', clientId).in('status', ['Active', 'On Hold'])
      .order('created_at', { ascending: false })
    setClientJobs(data || [])
  }

  const saveTicket = async () => {
    if (!form.title.trim() || !profile) return
    setSaving(true)
    setSaveError('')
    try {
      const { data: ticketNumber } = await supabase.rpc('get_next_ticket_number', { org_id_input: profile.org_id })

      const { error } = await supabase.from('service_tickets').insert({
        org_id: profile.org_id,
        ticket_number: ticketNumber,
        title: form.title.trim(),
        description: form.description.trim() || null,
        client_id: form.client_id || null,
        job_id: form.job_id || null,
        assigned_tech_id: form.assigned_tech_id || null,
        priority: form.priority,
        status: form.status,
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null,
        duration_hours: parseFloat(form.duration_hours) || 2,
      })

      if (error) {
        setSaveError(error.message)
        return
      }

      setShowModal(false)
      setSaveError('')
      setForm({ title: '', description: '', client_id: '', job_id: '', assigned_tech_id: '', priority: 'Normal', status: 'Open', scheduled_date: '', scheduled_time: '' })
      setClientJobs([])
      fetchAll()
    } catch (err) {
      setSaveError(err.message || 'Unexpected error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = tickets.filter(t => {
    const matchStatus = statusFilter === 'All' || t.status === statusFilter
    const matchPriority = priorityFilter === 'All' || t.priority === priorityFilter
    const q = search.toLowerCase()
    const matchSearch = !q || t.title?.toLowerCase().includes(q) || t.clients?.company?.toLowerCase().includes(q) || t.ticket_number?.toLowerCase().includes(q)
    return matchStatus && matchPriority && matchSearch
  })

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Service Tickets</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{filtered.length} of {tickets.length} tickets</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/dispatch')} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">🗺 Dispatch Board</button>
            <button onClick={() => setShowModal(true)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ New Ticket</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Open', value: tickets.filter(t => t.status === 'Open').length, color: 'text-blue-400' },
            { label: 'In Progress', value: tickets.filter(t => t.status === 'In Progress').length, color: 'text-yellow-400' },
            { label: 'Resolved', value: tickets.filter(t => t.status === 'Resolved').length, color: 'text-green-400' },
            { label: 'Urgent', value: tickets.filter(t => t.priority === 'Urgent' && t.status !== 'Resolved').length, color: 'text-red-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-[#1a2d45] rounded-xl p-4">
              <p className="text-[#8A9AB0] text-xs mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <input type="text" placeholder="Search tickets, clients..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <div className="flex gap-2 flex-wrap">
            {['All', 'Open', 'In Progress', 'Resolved', 'Cancelled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>{s}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {['All', 'Urgent', 'High', 'Normal', 'Low'].map(p => (
              <button key={p} onClick={() => setPriorityFilter(p)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${priorityFilter === p ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>{p}</button>
            ))}
          </div>
        </div>

        {loading ? <p className="text-[#8A9AB0]">Loading...</p> : filtered.length === 0 ? (
          <div className="text-center py-16 bg-[#1a2d45] rounded-xl border-2 border-dashed border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-lg mb-2">No tickets yet</p>
            <p className="text-[#8A9AB0] text-sm mb-4">Create a service ticket to track field work requests.</p>
            <button onClick={() => setShowModal(true)} className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ New Ticket</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(ticket => (
              <div key={ticket.id} onClick={() => navigate(`/service-tickets/${ticket.id}`)}
                className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3552] transition-colors group border border-[#2a3d55] hover:border-[#C8622A]/30">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="text-white font-semibold group-hover:text-[#C8622A] transition-colors">{ticket.title}</h3>
                      {ticket.ticket_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#2a3d55] px-2 py-0.5 rounded">{ticket.ticket_number}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.Normal}`}>{ticket.priority}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${STATUS_COLORS[ticket.status] || STATUS_COLORS.Open}`}>{ticket.status}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[#8A9AB0] flex-wrap">
                      {ticket.clients?.company && <span>🏢 {ticket.clients.company}</span>}
                      {ticket.jobs?.name && <span>🔨 {ticket.jobs.job_number ? `${ticket.jobs.job_number} — ` : ''}{ticket.jobs.name}</span>}
                      {ticket.profiles?.full_name && <span>🔧 {ticket.profiles.full_name}</span>}
                      {ticket.scheduled_date && <span>📅 {new Date(ticket.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{ticket.scheduled_time ? ` at ${ticket.scheduled_time.slice(0, 5)}` : ''}</span>}
                    </div>
                    {ticket.description && <p className="text-[#8A9AB0] text-xs mt-1.5 line-clamp-1">{ticket.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-[#8A9AB0] text-xs">{new Date(ticket.created_at).toLocaleDateString()}</span>
                    <span className="text-[#8A9AB0] group-hover:text-white transition-colors">→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">New Service Ticket</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Title <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Camera offline at Building A" className={inputClass} autoFocus />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="What needs to be done?"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className={inputClass}>
                    {['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={inputClass}>
                    {['Open', 'In Progress', 'Resolved', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Client</label>
                <select value={form.client_id} onChange={e => handleClientChange(e.target.value)} className={inputClass}>
                  <option value="">— Select client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
                </select>
              </div>
              {clientJobs.length > 0 && (
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Link to Job (optional)</label>
                  <select value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))} className={inputClass}>
                    <option value="">— No job —</option>
                    {clientJobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Assign Technician</label>
                <select value={form.assigned_tech_id} onChange={e => setForm(p => ({ ...p, assigned_tech_id: e.target.value }))} className={inputClass}>
                  <option value="">— Unassigned —</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.dispatch_zone ? ` · ${t.dispatch_zone}` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Scheduled Date</label>
                  <input type="date" value={form.scheduled_date} onChange={e => setForm(p => ({ ...p, scheduled_date: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Scheduled Time</label>
                  <input type="time" value={form.scheduled_time} onChange={e => setForm(p => ({ ...p, scheduled_time: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Duration</label>
                  <select value={form.duration_hours} onChange={e => setForm(p => ({ ...p, duration_hours: e.target.value }))} className={inputClass}>
                    {['0.5','1','1.5','2','2.5','3','3.5','4','5','6','7','8'].map(h => (
                      <option key={h} value={h}>{h} {parseFloat(h) === 1 ? 'hr' : 'hrs'}</option>
                    ))}
                  </select>
                </div>
              </div>
              {saveError && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{saveError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveTicket} disabled={saving || !form.title.trim()}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
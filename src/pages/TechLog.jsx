import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

export default function TechLog({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'rep', isPM = false, isTechnician = false, featureInventory = false, isSalesManager = false }) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [jobs, setJobs] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterJob, setFilterJob] = useState('all')
  const [filterTech, setFilterTech] = useState('all')
  const [filterDate, setFilterDate] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    job_id: '',
    log_date: new Date().toISOString().split('T')[0],
    hours_worked: '',
    work_summary: '',
    materials_used: '',
    issues: ''
  })

  // BOM / labor state for the job form
  const [jobBom, setJobBom] = useState([])
  const [jobLabor, setJobLabor] = useState([])
  const [bomUsage, setBomUsage] = useState({})
  const [fetchingBom, setFetchingBom] = useState(false)
  const [jobRunningTotals, setJobRunningTotals] = useState({})
  const [jobTotalHours, setJobTotalHours] = useState(0)
  const [jobChangeOrders, setJobChangeOrders] = useState([])
  const [selectedCOId, setSelectedCOId] = useState('')
  const [coBomUsage, setCoBomUsage] = useState({})

  // Service ticket mode state
  const [logMode, setLogMode] = useState('job') // 'job' | 'ticket'
  const [serviceTickets, setServiceTickets] = useState([])
  const [orgServiceSettings, setOrgServiceSettings] = useState({})
  const [stTicketId, setStTicketId] = useState('')
  const [stDate, setStDate] = useState(new Date().toISOString().split('T')[0])
  const [stLaborRole, setStLaborRole] = useState('Tech Labor')
  const [laborRates, setLaborRates] = useState([])
  const [stLaborHours, setStLaborHours] = useState('')
  const [stDriveHours, setStDriveHours] = useState('')

  const [stMaterials, setStMaterials] = useState([])
  const [stSummary, setStSummary] = useState('')

  useEffect(() => { if (profile?.org_id) fetchAll() }, [profile?.org_id])

  const fetchAll = async () => {
    const [jobsRes, logsRes, orgRes, ticketsRes, ratesRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, name, job_number, status, clients(company)')
        .eq('org_id', profile.org_id)
        .in('status', ['Active', 'On Hold'])
        .order('created_at', { ascending: false }),

      (() => {
        let q = supabase
          .from('tech_daily_logs')
          .select('*, jobs(name, job_number, clients(company)), profiles(full_name), service_tickets(id, ticket_number, title, clients(company))')
          .eq('org_id', profile.org_id)
          .order('log_date', { ascending: false })
          .order('created_at', { ascending: false })
        if (isTechnician) q = q.eq('user_id', profile.id)
        return q
      })(),

      supabase
        .from('organizations')
        .select('service_billing_mode, trip_fee_default, drive_time_rate_default')
        .eq('id', profile.org_id)
        .single(),

      (() => {
        let q = supabase
          .from('service_tickets')
          .select('id, ticket_number, title, status, clients(company)')
          .eq('org_id', profile.org_id)
          .in('status', ['Open', 'In Progress'])
          .order('created_at', { ascending: false })
        if (isTechnician) q = q.eq('assigned_tech_id', profile.id)
        return q
      })(),

      supabase
        .from('labor_rates')
        .select('id, role, bill_rate_per_hour')
        .eq('org_id', profile.org_id)
        .order('sort_order')
    ])

    setJobs(jobsRes.data || [])
    setLogs(logsRes.data || [])
    setLaborRates(ratesRes.data || [])
    setOrgServiceSettings(orgRes.data || {})
    setServiceTickets(ticketsRes.data || [])
    setLoading(false)
  }

  const handleJobSelect = async (jobId) => {
    setForm(p => ({ ...p, job_id: jobId }))
    setJobBom([])
    setJobLabor([])
    setBomUsage({})
    setJobRunningTotals({})
    setJobTotalHours(0)
    if (!jobId) return

    setFetchingBom(true)
    const { data: jobData } = await supabase.from('jobs').select('proposal_id').eq('id', jobId).single()

    if (jobData?.proposal_id) {
      const [{ data: bomData }, { data: propData }] = await Promise.all([
        supabase.from('bom_line_items')
          .select('id, item_name, quantity, unit, category')
          .eq('proposal_id', jobData.proposal_id)
          .order('category'),
        supabase.from('proposals').select('labor_items').eq('id', jobData.proposal_id).single()
      ])
      setJobBom(bomData || [])
      setJobLabor(propData?.labor_items || [])
    }

    const { data: existingLogs } = await supabase
      .from('tech_daily_logs')
      .select('materials_used, hours_worked')
      .eq('job_id', jobId)

    const runningTotals = Object.create(null)
    let totalHours = 0
    ;(existingLogs || []).forEach(log => {
      totalHours += parseFloat(log.hours_worked) || 0
      if (!log.materials_used) return
      try {
        const parsed = JSON.parse(log.materials_used)
        if (Array.isArray(parsed)) {
          parsed.forEach(m => {
            runningTotals[m.id] = (runningTotals[m.id] || 0) + (parseFloat(m.qty) || 0)
          })
        }
      } catch {}
    })
    setJobRunningTotals(runningTotals)
    setJobTotalHours(totalHours)

    const { data: coData } = await supabase
      .from('change_orders')
      .select('id, name, status, line_items, labor_items')
      .eq('job_id', jobId)
      .in('status', ['Approved', 'Pending'])
      .order('created_at', { ascending: true })
    setJobChangeOrders(coData || [])
    setSelectedCOId('')
    setCoBomUsage({})
    setFetchingBom(false)
  }

  const openForm = (presetJobId) => {
    const jobId = presetJobId && presetJobId !== 'all' ? presetJobId : ''
    setLogMode('job')
    setForm({
      job_id: jobId,
      log_date: new Date().toISOString().split('T')[0],
      hours_worked: '',
      work_summary: '',
      materials_used: '',
      issues: ''
    })
    setJobBom([])
    setJobLabor([])
    setBomUsage({})
    setJobRunningTotals({})
    setJobTotalHours(0)
    setJobChangeOrders([])
    setSelectedCOId('')
    setCoBomUsage({})
    setStTicketId('')
    setStDate(new Date().toISOString().split('T')[0])
    setStLaborRole(laborRates[0]?.role || '')
    setStLaborHours('')
    setStDriveHours('')

    setStMaterials([])
    setStSummary('')
    setShowForm(true)
    if (jobId) handleJobSelect(jobId)
  }

  const submitLog = async () => {
    if (!form.job_id || !form.log_date || !form.work_summary.trim()) return
    setSaving(true)

    let materialsValue = null
    const mainBomItems = jobBom.length > 0
      ? Object.entries(bomUsage)
          .filter(([, qty]) => qty !== '' && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0)
          .map(([id, qty]) => {
            const item = jobBom.find(b => b.id === id)
            return { id, name: item?.item_name, qty: parseFloat(qty), unit: item?.unit, planned: item?.quantity }
          })
      : []

    const co = selectedCOId ? jobChangeOrders.find(c => c.id === selectedCOId) : null
    const coItems = co?.line_items
      ? Object.entries(coBomUsage)
          .filter(([, qty]) => qty !== '' && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0)
          .map(([key, qty]) => {
            const idx = parseInt(key.split('_').pop())
            const item = co.line_items[idx]
            return {
              id: `co_${selectedCOId}_${idx}`,
              name: item?.item_name,
              qty: parseFloat(qty),
              unit: item?.unit,
              planned: item?.quantity,
              source: 'co',
              co_id: selectedCOId,
              co_name: co.name
            }
          })
      : []

    const allUsed = [...mainBomItems, ...coItems]
    if (allUsed.length > 0) {
      materialsValue = JSON.stringify(allUsed)
    } else if (jobBom.length === 0 && !selectedCOId) {
      materialsValue = form.materials_used.trim() || null
    }

    const { data } = await supabase.from('tech_daily_logs').insert({
      job_id: form.job_id,
      org_id: profile.org_id,
      user_id: profile.id,
      log_date: form.log_date,
      hours_worked: parseFloat(form.hours_worked) || 0,
      work_summary: form.work_summary.trim(),
      materials_used: materialsValue,
      issues: form.issues.trim() || null
    }).select('*, jobs(name, job_number, clients(company)), profiles(full_name), service_tickets(id, ticket_number, title, clients(company))').single()

    if (data) {
      setLogs(prev => [data, ...prev])
      setShowForm(false)
    }
    setSaving(false)
  }

  const submitTicketLog = async () => {
    if (!stTicketId || !stDate || !stSummary.trim()) return
    setSaving(true)

    const billingMode = orgServiceSettings.service_billing_mode || 'none'
    const driveRate = parseFloat(orgServiceSettings.drive_time_rate_default) || 0
    const tripFeeAmount = parseFloat(orgServiceSettings.trip_fee_default) || 0

    // Fetch current ticket state
    const { data: ticket } = await supabase
      .from('service_tickets')
      .select('line_items, labor_items, notes')
      .eq('id', stTicketId)
      .single()

    const existingLineItems = ticket?.line_items || []
    const existingLaborItems = ticket?.labor_items || []
    const existingNotes = ticket?.notes || ''

    // Build new labor entries
    const newLaborItems = [...existingLaborItems]
    const laborHours = parseFloat(stLaborHours) || 0
    if (laborHours > 0) {
      const matchedRate = laborRates.find(r => r.role === stLaborRole)
      newLaborItems.push({
        id: crypto.randomUUID(),
        role: stLaborRole || 'Tech Labor',
        quantity: laborHours,
        unit: 'hr',
        your_cost: '',
        markup: 0,
        customer_price: matchedRate?.bill_rate_per_hour ? String(matchedRate.bill_rate_per_hour) : ''
      })
    }
    const driveHours = parseFloat(stDriveHours) || 0
    if ((billingMode === 'drive_time' || billingMode === 'both') && driveHours > 0) {
      newLaborItems.push({
        id: crypto.randomUUID(),
        role: 'Drive Time',
        quantity: driveHours,
        unit: 'hr',
        your_cost: '',
        markup: 0,
        customer_price: driveRate > 0 ? String(driveRate) : ''
      })
    }

    // Build new line items (materials + trip fee)
    const newLineItems = [...existingLineItems]
    if ((billingMode === 'trip_fee' || billingMode === 'both') && tripFeeAmount > 0) {
      newLineItems.push({
        id: crypto.randomUUID(),
        item_name: 'Trip Fee',
        quantity: 1,
        unit: 'ea',
        your_cost_unit: '',
        markup_percent: 0,
        customer_price_unit: String(tripFeeAmount)
      })
    }
    stMaterials.forEach(mat => {
      if (!mat.name.trim()) return
      newLineItems.push({
        id: mat.id,
        item_name: mat.name.trim(),
        quantity: parseFloat(mat.qty) || 1,
        unit: mat.unit || 'ea',
        your_cost_unit: '',
        markup_percent: 0,
        customer_price_unit: ''
      })
    })

    // Build note entry
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const noteEntry = `[${timestamp} · ${profile?.full_name || 'Tech'}] ${stSummary.trim()}`
    const updatedNotes = existingNotes ? `${existingNotes}\n\n${noteEntry}` : noteEntry

    // Update the service ticket
    await supabase.from('service_tickets').update({
      line_items: newLineItems.length > 0 ? newLineItems : null,
      labor_items: newLaborItems.length > 0 ? newLaborItems : null,
      notes: updatedNotes
    }).eq('id', stTicketId)

    // Save to tech_daily_logs for time tracking
    const totalHoursLogged = laborHours + driveHours
    const matSummary = stMaterials.filter(m => m.name.trim()).map(m => `${m.name} (${m.qty || 1} ${m.unit || 'ea'})`).join(', ')
    const { data: logData } = await supabase.from('tech_daily_logs').insert({
      service_ticket_id: stTicketId,
      org_id: profile.org_id,
      user_id: profile.id,
      log_date: stDate,
      hours_worked: totalHoursLogged,
      work_summary: stSummary.trim(),
      materials_used: matSummary || null,
      issues: null
    }).select('*, jobs(name, job_number, clients(company)), profiles(full_name), service_tickets(id, ticket_number, title, clients(company))').single()

    if (logData) setLogs(prev => [logData, ...prev])
    setShowForm(false)
    setSaving(false)
  }

  const deleteLog = async (logId) => {
    if (!window.confirm('Delete this log entry?')) return
    await supabase.from('tech_daily_logs').delete().eq('id', logId)
    setLogs(prev => prev.filter(l => l.id !== logId))
  }

  const parseMaterials = (raw) => {
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  const addStMaterial = () => setStMaterials(prev => [...prev, { id: crypto.randomUUID(), name: '', qty: '', unit: 'ea' }])
  const updateStMaterial = (id, field, val) => setStMaterials(prev => prev.map(m => m.id === id ? { ...m, [field]: val } : m))
  const removeStMaterial = (id) => setStMaterials(prev => prev.filter(m => m.id !== id))

  // Compute per-job running totals from all logs (for list view)
  const jobLogTotals = {}
  logs.forEach(log => {
    if (!log.job_id) return
    if (!jobLogTotals[log.job_id]) jobLogTotals[log.job_id] = { hours: 0, materials: Object.create(null) }
    jobLogTotals[log.job_id].hours += parseFloat(log.hours_worked) || 0
    const parsed = parseMaterials(log.materials_used)
    if (Array.isArray(parsed)) {
      parsed.forEach(m => {
        jobLogTotals[log.job_id].materials[m.id] = {
          name: m.name,
          unit: m.unit,
          planned: m.planned,
          used: (jobLogTotals[log.job_id].materials[m.id]?.used || 0) + (parseFloat(m.qty) || 0)
        }
      })
    }
  })

  const uniqueTechs = [...new Map(
    logs.filter(l => l.user_id && l.profiles?.full_name).map(l => [l.user_id, l.profiles.full_name])
  ).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

  const getDateBounds = () => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    if (filterDate === 'this_week') {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1)
      return [mon.toISOString().split('T')[0], today]
    }
    if (filterDate === 'last_week') {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() - 6)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return [mon.toISOString().split('T')[0], sun.toISOString().split('T')[0]]
    }
    if (filterDate === 'this_month') {
      return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, today]
    }
    if (filterDate === 'last_month') {
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const m = now.getMonth() === 0 ? 12 : now.getMonth()
      const last = new Date(y, m, 0)
      return [`${y}-${String(m).padStart(2, '0')}-01`, last.toISOString().split('T')[0]]
    }
    return [null, null]
  }
  const [dateFrom, dateTo] = getDateBounds()

  const filteredLogs = logs.filter(l => {
    if (filterJob !== 'all' && l.job_id !== filterJob) return false
    if (filterTech !== 'all' && l.user_id !== filterTech) return false
    if (dateFrom && l.log_date < dateFrom) return false
    if (dateTo && l.log_date > dateTo) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (l.work_summary || '').toLowerCase().includes(q) ||
        (l.jobs?.name || '').toLowerCase().includes(q) ||
        (l.jobs?.job_number || '').toLowerCase().includes(q) ||
        (l.jobs?.clients?.company || '').toLowerCase().includes(q) ||
        (l.service_tickets?.title || '').toLowerCase().includes(q) ||
        (l.service_tickets?.ticket_number || '').toLowerCase().includes(q) ||
        (l.service_tickets?.clients?.company || '').toLowerCase().includes(q) ||
        (l.profiles?.full_name || '').toLowerCase().includes(q) ||
        (l.issues || '').toLowerCase().includes(q)
      )
    }
    return true
  })
  const totalHours = filteredLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
  const uniqueDays = new Set(filteredLogs.map(l => l.log_date)).size
  const logsThisWeek = filteredLogs.filter(l => {
    const logDate = new Date(l.log_date)
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    return logDate >= weekAgo
  }).length

  const exportCSV = () => {
    const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`
    const header = ['Date', 'Tech', 'Type', 'Job # / Ticket #', 'Name', 'Client', 'Hours', 'Work Summary', 'Issues']
    const rows = filteredLogs.map(log => [
      log.log_date,
      escape(log.profiles?.full_name || ''),
      log.service_ticket_id ? 'Service Ticket' : 'Job',
      escape(log.service_tickets?.ticket_number || log.jobs?.job_number || ''),
      escape(log.service_tickets?.title || log.jobs?.name || ''),
      escape(log.service_tickets?.clients?.company || log.jobs?.clients?.company || ''),
      log.hours_worked || 0,
      escape(log.work_summary || ''),
      escape(log.issues || ''),
    ])
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tech-hours-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const myWeek = isTechnician ? (() => {
    const now = new Date()
    const dow = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    mon.setHours(0, 0, 0, 0)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i)
      return d.toISOString().split('T')[0]
    })
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const hoursPerDay = Object.fromEntries(days.map(d => [d, 0]))
    logs.forEach(log => {
      if (Object.prototype.hasOwnProperty.call(hoursPerDay, log.log_date)) {
        hoursPerDay[log.log_date] += parseFloat(log.hours_worked) || 0
      }
    })
    const weekTotal = days.reduce((s, d) => s + hoursPerDay[d], 0)
    const nowStr = now.toISOString().split('T')[0]
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthTotal = logs.filter(l => l.log_date >= monthStart).reduce((s, l) => s + (parseFloat(l.hours_worked) || 0), 0)
    return { days, dayLabels, hoursPerDay, weekTotal, monthTotal, nowStr }
  })() : null

  const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"
  const estimatedHours = jobLabor.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0)
  const billingMode = orgServiceSettings.service_billing_mode || 'none'
  const showDriveTime = billingMode === 'drive_time' || billingMode === 'both'
  const showTripFee = billingMode === 'trip_fee' || billingMode === 'both'

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureInventory={featureInventory} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">Tech Daily Log</h2>
            <p className="text-fp-muted text-sm mt-0.5">Track daily hours and work notes by job or service ticket</p>
          </div>
          <div className="flex items-center gap-3">
            {filteredLogs.length > 0 && (
              <button onClick={exportCSV}
                className="border border-fp-border text-fp-muted px-4 py-2 rounded-lg text-sm font-medium hover:text-fp-text hover:border-fp-brand/50 transition-colors">
                Export CSV
              </button>
            )}
            <button onClick={() => openForm(filterJob)}
              className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              + Log Work
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Hours Logged', value: totalHours.toFixed(1), color: 'text-fp-text' },
            { label: 'Days Worked', value: uniqueDays, color: 'text-fp-text' },
            { label: 'Logs This Week', value: logsThisWeek, color: 'text-[#C8622A]' },
            { label: 'Total Entries', value: filteredLogs.length, color: 'text-fp-text' },
          ].map(stat => (
            <div key={stat.label} className="bg-fp-card rounded-xl p-4">
              <p className="text-fp-muted text-xs mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {myWeek && (
          <div className="bg-fp-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-fp-text font-semibold text-sm">My Hours This Week</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-fp-muted">Week total: <span className="text-fp-text font-bold">{myWeek.weekTotal.toFixed(1)} hrs</span></span>
                <span className="text-fp-muted">This month: <span className="text-fp-text font-bold">{myWeek.monthTotal.toFixed(1)} hrs</span></span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {myWeek.days.map((day, i) => {
                const hrs = myWeek.hoursPerDay[day]
                const isToday = day === myWeek.nowStr
                const isFuture = day > myWeek.nowStr
                return (
                  <div key={day} className={`rounded-lg p-3 text-center ${isToday ? 'bg-fp-brand/20 border border-fp-brand/40' : 'bg-fp-inset'}`}>
                    <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-fp-brand' : 'text-fp-muted'}`}>{myWeek.dayLabels[i]}</p>
                    <p className={`text-lg font-bold ${isFuture ? 'text-fp-border' : hrs > 0 ? 'text-[#C8622A]' : 'text-fp-muted'}`}>
                      {isFuture ? '—' : hrs > 0 ? hrs.toFixed(1) : '0'}
                    </p>
                    <p className="text-fp-muted text-xs">hrs</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3 items-center flex-wrap">
          <input type="text" placeholder="Search summary, job, ticket, tech, client..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-fp-muted" />
          <select value={filterJob} onChange={e => setFilterJob(e.target.value)}
            className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand cursor-pointer">
            <option value="all">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>)}
          </select>
          {uniqueTechs.length > 1 && (
            <select value={filterTech} onChange={e => setFilterTech(e.target.value)}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand cursor-pointer">
              <option value="all">All Techs</option>
              {uniqueTechs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <select value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand cursor-pointer">
            <option value="all">All Time</option>
            <option value="this_week">This Week</option>
            <option value="last_week">Last Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
          </select>
          {(search || filterJob !== 'all' || filterTech !== 'all' || filterDate !== 'all') && (
            <button onClick={() => { setSearch(''); setFilterJob('all'); setFilterTech('all'); setFilterDate('all') }}
              className="text-fp-muted hover:text-fp-text text-xs transition-colors">Clear</button>
          )}
        </div>

        {filterJob !== 'all' && jobLogTotals[filterJob] && (
          <div className="flex items-center gap-4 bg-fp-card rounded-lg px-4 py-2 text-sm w-fit">
            <span className="text-fp-muted">Job totals:</span>
            <span className="text-fp-text font-semibold">{jobLogTotals[filterJob].hours.toFixed(1)} hrs logged</span>
            {Object.keys(jobLogTotals[filterJob].materials).length > 0 && (
              <span className="text-fp-muted">{Object.keys(jobLogTotals[filterJob].materials).length} material types used</span>
            )}
          </div>
        )}

        {filterJob !== 'all' && jobLogTotals[filterJob] && Object.keys(jobLogTotals[filterJob].materials).length > 0 && (
          <div className="bg-fp-card rounded-xl p-5">
            <p className="text-fp-text font-semibold text-sm mb-4">📦 Material Usage — Running Totals for This Job</p>
            <div className="grid grid-cols-1 gap-2">
              {Object.values(jobLogTotals[filterJob].materials).map((mat, i) => {
                const planned = parseFloat(mat.planned) || 0
                const used = mat.used
                const remaining = planned - used
                const pct = planned > 0 ? Math.min((used / planned) * 100, 100) : 0
                const isOver = used > planned && planned > 0
                const isLow = !isOver && planned > 0 && remaining / planned < 0.2
                return (
                  <div key={i} className="bg-fp-inset rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-fp-text text-sm font-medium">{mat.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-fp-muted">Planned: <span className="text-fp-text">{planned > 0 ? `${planned} ${mat.unit}` : '—'}</span></span>
                        <span className="text-fp-muted">Used: <span className={`font-semibold ${isOver ? 'text-red-400' : 'text-[#C8622A]'}`}>{used} {mat.unit}</span></span>
                        {planned > 0 && (
                          <span className={`font-semibold ${isOver ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                            {isOver ? `${Math.abs(remaining).toFixed(1)} over ⚠` : `${remaining.toFixed(1)} ${mat.unit} left`}
                          </span>
                        )}
                      </div>
                    </div>
                    {planned > 0 && (
                      <div className="w-full bg-fp-card rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${isOver ? 'bg-red-500' : isLow ? 'bg-yellow-400' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-fp-muted">Loading...</p>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-16 bg-fp-card rounded-xl border-2 border-dashed border-fp-border">
            <p className="text-fp-muted text-lg mb-2">No log entries yet</p>
            <p className="text-fp-muted text-sm mb-4">Start logging daily work to track hours and progress.</p>
            <button onClick={() => openForm(filterJob)} className="bg-fp-brand text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Log Work</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map(log => {
              const isTicketLog = !!log.service_ticket_id
              const parsedMaterials = !isTicketLog ? parseMaterials(log.materials_used) : null
              return (
                <div key={log.id} className="bg-fp-card rounded-xl p-5 border border-fp-border hover:border-fp-brand/30 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-fp-muted text-xs bg-fp-inset px-2 py-0.5 rounded font-mono">
                          {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {isTicketLog ? (
                          <>
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-semibold">Service Ticket</span>
                            {log.service_tickets?.ticket_number && (
                              <span className="text-fp-muted text-xs font-mono bg-fp-inset px-2 py-0.5 rounded">{log.service_tickets.ticket_number}</span>
                            )}
                            <span className="text-fp-text font-semibold">{log.service_tickets?.title || 'Ticket'}</span>
                          </>
                        ) : (
                          <>
                            {log.jobs?.job_number && <span className="text-fp-muted text-xs font-mono bg-fp-inset px-2 py-0.5 rounded">{log.jobs.job_number}</span>}
                            <span className="text-fp-text font-semibold">{log.jobs?.name}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-fp-muted">
                        {(isTicketLog ? log.service_tickets?.clients?.company : log.jobs?.clients?.company) && (
                          <span>🏢 {isTicketLog ? log.service_tickets?.clients?.company : log.jobs?.clients?.company}</span>
                        )}
                        <span>👤 {log.profiles?.full_name || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-fp-muted text-xs">Hours</p>
                        <p className="text-[#C8622A] font-bold text-lg">{log.hours_worked || 0}</p>
                      </div>
                      {(isAdmin || log.user_id === profile?.id) && (
                        <button onClick={() => deleteLog(log.id)} className="text-fp-muted hover:text-red-400 text-xs transition-colors ml-2">✕</button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-fp-inset rounded-lg p-3">
                      <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1">
                        {isTicketLog ? 'Work Summary / Notes' : 'Work Summary'}
                      </p>
                      <p className="text-fp-text text-sm leading-relaxed">{log.work_summary}</p>
                    </div>

                    {isTicketLog && log.materials_used && (
                      <div className="bg-fp-inset rounded-lg p-3">
                        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1">📦 Materials Used</p>
                        <p className="text-fp-text text-sm">{log.materials_used}</p>
                      </div>
                    )}

                    {!isTicketLog && parsedMaterials && Array.isArray(parsedMaterials) && parsedMaterials.length > 0 && (
                      <div className="bg-fp-inset rounded-lg p-3">
                        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">📦 Materials Used Today</p>
                        <div className="space-y-1">
                          {parsedMaterials.map((item, i) => {
                            const jobTotal = jobLogTotals[log.job_id]?.materials[item.id]
                            const isOver = item.planned && item.qty > item.planned
                            return (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-fp-text">{item.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className={`font-semibold ${isOver ? 'text-yellow-400' : 'text-[#C8622A]'}`}>
                                    {item.qty} {item.unit} today
                                  </span>
                                  {jobTotal && (
                                    <span className="text-fp-muted">
                                      {jobTotal.used} {item.unit} total
                                      {item.planned && jobTotal.planned > 0 && (
                                        <span className={jobTotal.used > jobTotal.planned ? ' text-red-400' : ' text-green-400'}>
                                          {' '}/ {jobTotal.planned} planned
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {!isTicketLog && log.materials_used && !parsedMaterials && (
                      <div className="bg-fp-inset rounded-lg p-3">
                        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1">📦 Materials</p>
                        <p className="text-fp-text text-sm">{log.materials_used}</p>
                      </div>
                    )}

                    {log.issues && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                        <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-1">⚠ Issues / Notes</p>
                        <p className="text-fp-text text-sm">{log.issues}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Log Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-fp-text font-bold text-lg mb-4">Log Work</h3>

            {/* Mode toggle */}
            <div className="flex bg-fp-inset rounded-lg p-1 mb-5">
              <button
                onClick={() => setLogMode('job')}
                className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${logMode === 'job' ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
                Job
              </button>
              <button
                onClick={() => setLogMode('ticket')}
                className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${logMode === 'ticket' ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
                Service Ticket
              </button>
            </div>

            {/* ── JOB MODE ── */}
            {logMode === 'job' && (
              <div className="space-y-4">
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Job <span className="text-[#C8622A]">*</span></label>
                  <select value={form.job_id} onChange={e => handleJobSelect(e.target.value)} className={inputClass}>
                    <option value="">— Select job —</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}{j.clients?.company ? ` (${j.clients.company})` : ''}</option>
                    ))}
                  </select>
                </div>

                {form.job_id && jobChangeOrders.length > 0 && (
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Logging Against</label>
                    <select value={selectedCOId} onChange={e => { setSelectedCOId(e.target.value); setCoBomUsage({}) }} className={inputClass}>
                      <option value="">Main Job BOM</option>
                      {jobChangeOrders.map(co => (
                        <option key={co.id} value={co.id}>CO: {co.name}{co.status !== 'Approved' ? ` (${co.status})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                    <input type="date" value={form.log_date} onChange={e => setForm(p => ({ ...p, log_date: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Hours Worked</label>
                    <input type="number" step="0.5" min="0" value={form.hours_worked} onChange={e => setForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder="e.g. 8" className={inputClass} />
                  </div>
                </div>

                {form.job_id && (estimatedHours > 0 || jobTotalHours > 0) && (
                  <div className="bg-fp-inset rounded-lg p-3">
                    <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">Labor Hours Status</p>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-fp-muted">Logged so far</span>
                      <span className="text-fp-text font-semibold">{jobTotalHours.toFixed(1)} hrs</span>
                    </div>
                    {estimatedHours > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-fp-muted">Estimated total</span>
                          <span className="text-fp-text">{estimatedHours.toFixed(1)} hrs</span>
                        </div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-fp-muted">Remaining</span>
                          <span className={`font-semibold ${jobTotalHours > estimatedHours ? 'text-red-400' : 'text-green-400'}`}>
                            {jobTotalHours > estimatedHours
                              ? `${(jobTotalHours - estimatedHours).toFixed(1)} hrs over ⚠`
                              : `${(estimatedHours - jobTotalHours).toFixed(1)} hrs left`}
                          </span>
                        </div>
                        <div className="w-full bg-fp-card rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${jobTotalHours > estimatedHours ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min((jobTotalHours / estimatedHours) * 100, 100)}%` }}
                          />
                        </div>
                      </>
                    )}
                    {jobLabor.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {jobLabor.map((labor, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-fp-muted text-xs">{labor.role}</span>
                            <span className="text-fp-muted text-xs">{labor.quantity} {labor.unit || 'hr'} planned</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {fetchingBom && <p className="text-fp-muted text-xs">Loading job materials...</p>}

                {!fetchingBom && selectedCOId && (() => {
                  const co = jobChangeOrders.find(c => c.id === selectedCOId)
                  if (!co) return null
                  return (
                    <div className="space-y-3">
                      <div className="bg-[#C8622A]/10 border border-[#C8622A]/30 rounded-lg px-3 py-2">
                        <p className="text-[#C8622A] text-xs font-semibold">Logging against Change Order: {co.name}</p>
                        {co.status === 'Pending' && <p className="text-yellow-400 text-xs mt-0.5">⚠ This CO is still Pending approval</p>}
                      </div>
                      {co.labor_items?.length > 0 && (
                        <div className="bg-fp-inset rounded-lg p-3">
                          <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">CO Labor</p>
                          <div className="space-y-1">
                            {co.labor_items.map((l, i) => (
                              <div key={i} className="flex justify-between text-xs">
                                <span className="text-fp-text">{l.role}</span>
                                <span className="text-fp-muted">{l.quantity} {l.unit || 'hr'} planned</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {co.line_items?.length > 0 && (
                        <div>
                          <label className="text-fp-muted text-xs mb-2 block font-semibold uppercase tracking-wide">
                            CO Materials Used Today
                            <span className="text-fp-muted font-normal normal-case ml-1">(enter qty used today)</span>
                          </label>
                          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                            {co.line_items.map((item, idx) => {
                              const key = `co_${selectedCOId}_${idx}`
                              const planned = parseFloat(item.quantity) || 0
                              return (
                                <div key={idx} className="bg-fp-inset border border-transparent rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-fp-text text-sm block truncate">{item.item_name}</span>
                                      <div className="flex items-center gap-3 mt-0.5">
                                        {item.category && <span className="text-fp-muted text-xs">{item.category}</span>}
                                        <span className="text-fp-muted text-xs">Planned: {planned} {item.unit}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <input
                                        type="number" min="0" step="any" placeholder="0"
                                        value={coBomUsage[key] || ''}
                                        onChange={e => setCoBomUsage(p => ({ ...p, [key]: e.target.value }))}
                                        className="w-20 bg-fp-card text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand text-right"
                                      />
                                      <span className="text-fp-muted text-xs w-6 shrink-0">{item.unit}</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {!fetchingBom && !selectedCOId && jobBom.length > 0 && (
                  <div>
                    <label className="text-fp-muted text-xs mb-2 block font-semibold uppercase tracking-wide">
                      Materials Used Today
                      <span className="text-fp-muted font-normal normal-case ml-1">(enter qty used today)</span>
                    </label>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {jobBom.map(item => {
                        const alreadyUsed = jobRunningTotals[item.id] || 0
                        const planned = parseFloat(item.quantity) || 0
                        const remaining = planned - alreadyUsed
                        const isOver = alreadyUsed > planned && planned > 0
                        const isLow = !isOver && planned > 0 && remaining / planned < 0.2
                        return (
                          <div key={item.id} className={`rounded-lg px-3 py-2 border ${isOver ? 'bg-red-500/5 border-red-500/20' : isLow ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-fp-inset border-transparent'}`}>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <span className="text-fp-text text-sm block truncate">{item.item_name}</span>
                                <div className="flex items-center gap-3 mt-0.5">
                                  {item.category && <span className="text-fp-muted text-xs">{item.category}</span>}
                                  <span className="text-fp-muted text-xs">Planned: {planned} {item.unit}</span>
                                  {alreadyUsed > 0 && (
                                    <span className={`text-xs font-semibold ${isOver ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                                      {alreadyUsed} used · {isOver ? `${Math.abs(remaining).toFixed(1)} over ⚠` : `${remaining.toFixed(1)} left`}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number" min="0" step="any" placeholder="0"
                                  value={bomUsage[item.id] || ''}
                                  onChange={e => setBomUsage(p => ({ ...p, [item.id]: e.target.value }))}
                                  className="w-20 bg-fp-card text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand text-right"
                                />
                                <span className="text-fp-muted text-xs w-6 shrink-0">{item.unit}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {!fetchingBom && jobBom.length === 0 && !selectedCOId && (
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Materials Used <span className="text-fp-muted">(optional)</span></label>
                    <textarea value={form.materials_used} onChange={e => setForm(p => ({ ...p, materials_used: e.target.value }))} rows={2}
                      placeholder="List any materials consumed or installed today..."
                      className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none placeholder-[#8A9AB0]" />
                  </div>
                )}

                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Work Summary <span className="text-[#C8622A]">*</span></label>
                  <textarea value={form.work_summary} onChange={e => setForm(p => ({ ...p, work_summary: e.target.value }))} rows={4}
                    placeholder="What was completed today? What was installed, configured, or tested?"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none placeholder-[#8A9AB0]" />
                </div>

                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Issues / Notes <span className="text-fp-muted">(optional)</span></label>
                  <textarea value={form.issues} onChange={e => setForm(p => ({ ...p, issues: e.target.value }))} rows={2}
                    placeholder="Any problems encountered, open items, or notes for tomorrow..."
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none placeholder-[#8A9AB0]" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                  <button onClick={submitLog} disabled={saving || !form.job_id || !form.log_date || !form.work_summary.trim()}
                    className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Log Entry'}
                  </button>
                </div>
              </div>
            )}

            {/* ── SERVICE TICKET MODE ── */}
            {logMode === 'ticket' && (
              <div className="space-y-4">

                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Service Ticket <span className="text-[#C8622A]">*</span></label>
                  <select value={stTicketId} onChange={e => setStTicketId(e.target.value)} className={inputClass}>
                    <option value="">— Select ticket —</option>
                    {serviceTickets.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.ticket_number ? `${t.ticket_number} — ` : ''}{t.title}{t.clients?.company ? ` (${t.clients.company})` : ''}
                      </option>
                    ))}
                  </select>
                  {serviceTickets.length === 0 && (
                    <p className="text-fp-muted text-xs mt-1">No open or in-progress tickets assigned to you.</p>
                  )}
                </div>

                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                  <input type="date" value={stDate} onChange={e => setStDate(e.target.value)} className={inputClass} />
                </div>

                {/* Labor */}
                <div className="bg-fp-inset rounded-lg p-4 space-y-3">
                  <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Labor</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-fp-muted text-xs mb-1 block">Role</label>
                      {laborRates.length > 0 ? (
                        <select value={stLaborRole} onChange={e => setStLaborRole(e.target.value)}
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                          {laborRates.map(r => <option key={r.id} value={r.role}>{r.role}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={stLaborRole} onChange={e => setStLaborRole(e.target.value)}
                          placeholder="e.g. Tech Labor"
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]" />
                      )}
                    </div>
                    <div>
                      <label className="text-fp-muted text-xs mb-1 block">Hours</label>
                      <input type="number" step="0.25" min="0" value={stLaborHours} onChange={e => setStLaborHours(e.target.value)}
                        placeholder="0"
                        className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]" />
                    </div>
                  </div>

                  {showDriveTime && (
                    <div>
                      <label className="text-fp-muted text-xs mb-1 block">Drive Time (hrs)</label>
                      <input type="number" step="0.25" min="0" value={stDriveHours} onChange={e => setStDriveHours(e.target.value)}
                        placeholder="0"
                        className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]" />
                    </div>
                  )}

                  {showTripFee && orgServiceSettings.trip_fee_default > 0 && (
                    <p className="text-fp-muted text-xs">Trip fee will be added automatically.</p>
                  )}
                </div>

                {/* Materials */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Materials Used</label>
                    <button onClick={addStMaterial}
                      className="text-fp-brand text-xs font-semibold hover:underline">
                      + Add Item
                    </button>
                  </div>
                  {stMaterials.length === 0 ? (
                    <p className="text-fp-muted text-xs italic">No materials — click Add Item if parts were used.</p>
                  ) : (
                    <div className="space-y-2">
                      {stMaterials.map(mat => (
                        <div key={mat.id} className="flex items-center gap-2 bg-fp-inset rounded-lg px-3 py-2">
                          <input
                            type="text"
                            value={mat.name}
                            onChange={e => updateStMaterial(mat.id, 'name', e.target.value)}
                            placeholder="Item name"
                            className="flex-1 bg-transparent text-fp-text text-sm focus:outline-none placeholder-[#8A9AB0]"
                          />
                          <input
                            type="number"
                            value={mat.qty}
                            onChange={e => updateStMaterial(mat.id, 'qty', e.target.value)}
                            placeholder="Qty"
                            min="0"
                            step="any"
                            className="w-16 bg-fp-card text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand text-right"
                          />
                          <input
                            type="text"
                            value={mat.unit}
                            onChange={e => updateStMaterial(mat.id, 'unit', e.target.value)}
                            placeholder="ea"
                            className="w-14 bg-fp-card text-fp-text border border-fp-border rounded px-2 py-1 text-sm focus:outline-none focus:border-fp-brand text-center"
                          />
                          <button onClick={() => removeStMaterial(mat.id)} className="text-fp-muted hover:text-red-400 text-xs transition-colors shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary / Resolution */}
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Work Summary / Resolution <span className="text-[#C8622A]">*</span></label>
                  <textarea
                    value={stSummary}
                    onChange={e => setStSummary(e.target.value)}
                    rows={4}
                    placeholder="What was done? How was the issue resolved? Any follow-up needed?"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none placeholder-[#8A9AB0]"
                  />
                  <p className="text-fp-muted text-xs mt-1">This will be saved to the service ticket notes.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                  <button onClick={submitTicketLog} disabled={saving || !stTicketId || !stDate || !stSummary.trim()}
                    className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save to Ticket'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

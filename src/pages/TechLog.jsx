import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function TechLog({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'rep', isPM = false, isTechnician = false }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [logs, setLogs] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterJob, setFilterJob] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    job_id: '',
    log_date: new Date().toISOString().split('T')[0],
    hours_worked: '',
    work_summary: '',
    materials_used: '',
    issues: ''
  })

  // BOM / labor state for the form
  const [jobBom, setJobBom] = useState([])
  const [jobLabor, setJobLabor] = useState([])
  const [bomUsage, setBomUsage] = useState({})
  const [fetchingBom, setFetchingBom] = useState(false)

  // Running totals for selected job (shown in modal)
  const [jobRunningTotals, setJobRunningTotals] = useState({}) // { [item_id]: qty_used_total }
  const [jobTotalHours, setJobTotalHours] = useState(0)

  // Change order state
  const [jobChangeOrders, setJobChangeOrders] = useState([])
  const [selectedCOId, setSelectedCOId] = useState('')
  const [coBomUsage, setCoBomUsage] = useState({})

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const { data: jobsData } = await supabase
      .from('jobs')
      .select('id, name, job_number, status, clients(company)')
      .eq('org_id', profileData.org_id)
      .in('status', ['Active', 'On Hold'])
      .order('created_at', { ascending: false })
    setJobs(jobsData || [])

    const { data: logsData } = await supabase
      .from('tech_daily_logs')
      .select('*, jobs(name, job_number, clients(company)), profiles(full_name)')
      .eq('org_id', profileData.org_id)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
    setLogs(logsData || [])

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

    // Calculate running totals from all previous logs for this job
    const { data: existingLogs } = await supabase
      .from('tech_daily_logs')
      .select('materials_used, hours_worked')
      .eq('job_id', jobId)

    const runningTotals = {}
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

    // Fetch change orders for this job
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
    }).select('*, jobs(name, job_number, clients(company)), profiles(full_name)').single()

    if (data) {
      setLogs(prev => [data, ...prev])
      setShowForm(false)
    }
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

  // Compute per-job running totals from all logs (for list view)
  const jobLogTotals = {}
  logs.forEach(log => {
    if (!jobLogTotals[log.job_id]) jobLogTotals[log.job_id] = { hours: 0, materials: {} }
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

  const filteredLogs = filterJob === 'all' ? logs : logs.filter(l => l.job_id === filterJob)
  const totalHours = filteredLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
  const uniqueDays = new Set(filteredLogs.map(l => l.log_date)).size
  const logsThisWeek = filteredLogs.filter(l => {
    const logDate = new Date(l.log_date)
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    return logDate >= weekAgo
  }).length

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"

  // Estimated hours for selected job
  const estimatedHours = jobLabor.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0)

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Tech Daily Log</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">Track daily hours and work notes by job</p>
          </div>
          <button onClick={() => openForm(filterJob)}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
            + Log Today's Work
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Hours Logged', value: totalHours.toFixed(1), color: 'text-white' },
            { label: 'Days Worked', value: uniqueDays, color: 'text-white' },
            { label: 'Logs This Week', value: logsThisWeek, color: 'text-[#C8622A]' },
            { label: 'Total Entries', value: filteredLogs.length, color: 'text-white' },
          ].map(stat => (
            <div key={stat.label} className="bg-[#1a2d45] rounded-xl p-4">
              <p className="text-[#8A9AB0] text-xs mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3 items-center">
          <span className="text-[#8A9AB0] text-sm">Filter by job:</span>
          <select value={filterJob} onChange={e => setFilterJob(e.target.value)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            <option value="all">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>)}
          </select>
          {filterJob !== 'all' && jobLogTotals[filterJob] && (
            <div className="flex items-center gap-4 ml-2 bg-[#1a2d45] rounded-lg px-4 py-2 text-sm">
              <span className="text-[#8A9AB0]">Job totals:</span>
              <span className="text-white font-semibold">{jobLogTotals[filterJob].hours.toFixed(1)} hrs logged</span>
              {Object.keys(jobLogTotals[filterJob].materials).length > 0 && (
                <span className="text-[#8A9AB0]">{Object.keys(jobLogTotals[filterJob].materials).length} material types used</span>
              )}
            </div>
          )}
        </div>

        {/* Per-job material running totals panel */}
        {filterJob !== 'all' && jobLogTotals[filterJob] && Object.keys(jobLogTotals[filterJob].materials).length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-white font-semibold text-sm mb-4">📦 Material Usage — Running Totals for This Job</p>
            <div className="grid grid-cols-1 gap-2">
              {Object.values(jobLogTotals[filterJob].materials).map((mat, i) => {
                const planned = parseFloat(mat.planned) || 0
                const used = mat.used
                const remaining = planned - used
                const pct = planned > 0 ? Math.min((used / planned) * 100, 100) : 0
                const isOver = used > planned && planned > 0
                const isLow = !isOver && planned > 0 && remaining / planned < 0.2
                return (
                  <div key={i} className="bg-[#0F1C2E] rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-white text-sm font-medium">{mat.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[#8A9AB0]">Planned: <span className="text-white">{planned > 0 ? `${planned} ${mat.unit}` : '—'}</span></span>
                        <span className="text-[#8A9AB0]">Used: <span className={`font-semibold ${isOver ? 'text-red-400' : 'text-[#C8622A]'}`}>{used} {mat.unit}</span></span>
                        {planned > 0 && (
                          <span className={`font-semibold ${isOver ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                            {isOver ? `${Math.abs(remaining).toFixed(1)} over ⚠` : `${remaining.toFixed(1)} ${mat.unit} left`}
                          </span>
                        )}
                      </div>
                    </div>
                    {planned > 0 && (
                      <div className="w-full bg-[#1a2d45] rounded-full h-1.5">
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
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-16 bg-[#1a2d45] rounded-xl border-2 border-dashed border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-lg mb-2">No log entries yet</p>
            <p className="text-[#8A9AB0] text-sm mb-4">Start logging daily work to track hours and progress.</p>
            <button onClick={() => openForm(filterJob)} className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Log Today's Work</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map(log => {
              const parsedMaterials = parseMaterials(log.materials_used)
              return (
                <div key={log.id} className="bg-[#1a2d45] rounded-xl p-5 border border-[#2a3d55] hover:border-[#C8622A]/30 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[#8A9AB0] text-xs bg-[#0F1C2E] px-2 py-0.5 rounded font-mono">
                          {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {log.jobs?.job_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#0F1C2E] px-2 py-0.5 rounded">{log.jobs.job_number}</span>}
                        <span className="text-white font-semibold">{log.jobs?.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#8A9AB0]">
                        {log.jobs?.clients?.company && <span>🏢 {log.jobs.clients.company}</span>}
                        <span>👤 {log.profiles?.full_name || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[#8A9AB0] text-xs">Hours</p>
                        <p className="text-[#C8622A] font-bold text-lg">{log.hours_worked || 0}</p>
                      </div>
                      {(isAdmin || log.user_id === profile?.id) && (
                        <button onClick={() => deleteLog(log.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors ml-2">✕</button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-[#0F1C2E] rounded-lg p-3">
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">Work Summary</p>
                      <p className="text-[#D6E4F0] text-sm leading-relaxed">{log.work_summary}</p>
                    </div>

                    {parsedMaterials && Array.isArray(parsedMaterials) && parsedMaterials.length > 0 && (
                      <div className="bg-[#0F1C2E] rounded-lg p-3">
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">📦 Materials Used Today</p>
                        <div className="space-y-1">
                          {parsedMaterials.map((item, i) => {
                            const jobTotal = jobLogTotals[log.job_id]?.materials[item.id]
                            const isOver = item.planned && item.qty > item.planned
                            return (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-[#D6E4F0]">{item.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className={`font-semibold ${isOver ? 'text-yellow-400' : 'text-[#C8622A]'}`}>
                                    {item.qty} {item.unit} today
                                  </span>
                                  {jobTotal && (
                                    <span className="text-[#8A9AB0]">
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

                    {log.materials_used && !parsedMaterials && (
                      <div className="bg-[#0F1C2E] rounded-lg p-3">
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">📦 Materials</p>
                        <p className="text-[#D6E4F0] text-sm">{log.materials_used}</p>
                      </div>
                    )}

                    {log.issues && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                        <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-1">⚠ Issues / Notes</p>
                        <p className="text-[#D6E4F0] text-sm">{log.issues}</p>
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
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">Log Work</h3>
            <div className="space-y-4">

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Job <span className="text-[#C8622A]">*</span></label>
                <select value={form.job_id} onChange={e => handleJobSelect(e.target.value)} className={inputClass}>
                  <option value="">— Select job —</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}{j.clients?.company ? ` (${j.clients.company})` : ''}</option>
                  ))}
                </select>
              </div>

              {form.job_id && jobChangeOrders.length > 0 && (
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Logging Against</label>
                  <select value={selectedCOId} onChange={e => { setSelectedCOId(e.target.value); setCoBomUsage({}) }} className={inputClass}>
                    <option value="">Main Job BOM</option>
                    {jobChangeOrders.map(co => (
                      <option key={co.id} value={co.id}>
                        CO: {co.name}{co.status !== 'Approved' ? ` (${co.status})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                  <input type="date" value={form.log_date} onChange={e => setForm(p => ({ ...p, log_date: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Hours Worked</label>
                  <input type="number" step="0.5" min="0" value={form.hours_worked} onChange={e => setForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder="e.g. 8" className={inputClass} />
                </div>
              </div>

              {/* Hours context — show running total vs estimate */}
              {form.job_id && (estimatedHours > 0 || jobTotalHours > 0) && (
                <div className="bg-[#0F1C2E] rounded-lg p-3">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Labor Hours Status</p>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-[#8A9AB0]">Logged so far</span>
                    <span className="text-white font-semibold">{jobTotalHours.toFixed(1)} hrs</span>
                  </div>
                  {estimatedHours > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[#8A9AB0]">Estimated total</span>
                        <span className="text-white">{estimatedHours.toFixed(1)} hrs</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[#8A9AB0]">Remaining</span>
                        <span className={`font-semibold ${jobTotalHours > estimatedHours ? 'text-red-400' : 'text-green-400'}`}>
                          {jobTotalHours > estimatedHours
                            ? `${(jobTotalHours - estimatedHours).toFixed(1)} hrs over ⚠`
                            : `${(estimatedHours - jobTotalHours).toFixed(1)} hrs left`}
                        </span>
                      </div>
                      <div className="w-full bg-[#1a2d45] rounded-full h-1.5">
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
                          <span className="text-[#8A9AB0] text-xs">{labor.role}</span>
                          <span className="text-[#8A9AB0] text-xs">{labor.quantity} {labor.unit || 'hr'} planned</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {fetchingBom && <p className="text-[#8A9AB0] text-xs">Loading job materials...</p>}

              {/* Change Order BOM */}
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
                      <div className="bg-[#0F1C2E] rounded-lg p-3">
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">CO Labor</p>
                        <div className="space-y-1">
                          {co.labor_items.map((l, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-[#D6E4F0]">{l.role}</span>
                              <span className="text-[#8A9AB0]">{l.quantity} {l.unit || 'hr'} planned</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {co.line_items?.length > 0 && (
                      <div>
                        <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">
                          CO Materials Used Today
                          <span className="text-[#8A9AB0] font-normal normal-case ml-1">(enter qty used today)</span>
                        </label>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                          {co.line_items.map((item, idx) => {
                            const key = `co_${selectedCOId}_${idx}`
                            const planned = parseFloat(item.quantity) || 0
                            return (
                              <div key={idx} className="bg-[#0F1C2E] border border-transparent rounded-lg px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[#D6E4F0] text-sm block truncate">{item.item_name}</span>
                                    <div className="flex items-center gap-3 mt-0.5">
                                      {item.category && <span className="text-[#8A9AB0] text-xs">{item.category}</span>}
                                      <span className="text-[#8A9AB0] text-xs">Planned: {planned} {item.unit}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <input
                                      type="number" min="0" step="any" placeholder="0"
                                      value={coBomUsage[key] || ''}
                                      onChange={e => setCoBomUsage(p => ({ ...p, [key]: e.target.value }))}
                                      className="w-20 bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#C8622A] text-right"
                                    />
                                    <span className="text-[#8A9AB0] text-xs w-6 shrink-0">{item.unit}</span>
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
                  <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">
                    Materials Used Today
                    <span className="text-[#8A9AB0] font-normal normal-case ml-1">(enter qty used today)</span>
                  </label>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {jobBom.map(item => {
                      const alreadyUsed = jobRunningTotals[item.id] || 0
                      const planned = parseFloat(item.quantity) || 0
                      const remaining = planned - alreadyUsed
                      const isOver = alreadyUsed > planned && planned > 0
                      const isLow = !isOver && planned > 0 && remaining / planned < 0.2
                      return (
                        <div key={item.id} className={`rounded-lg px-3 py-2 border ${isOver ? 'bg-red-500/5 border-red-500/20' : isLow ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-[#0F1C2E] border-transparent'}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-[#D6E4F0] text-sm block truncate">{item.item_name}</span>
                              <div className="flex items-center gap-3 mt-0.5">
                                {item.category && <span className="text-[#8A9AB0] text-xs">{item.category}</span>}
                                <span className="text-[#8A9AB0] text-xs">Planned: {planned} {item.unit}</span>
                                {alreadyUsed > 0 && (
                                  <span className={`text-xs font-semibold ${isOver ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {alreadyUsed} used · {isOver ? `${Math.abs(remaining).toFixed(1)} over ⚠` : `${remaining.toFixed(1)} left`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={bomUsage[item.id] || ''}
                                onChange={e => setBomUsage(p => ({ ...p, [item.id]: e.target.value }))}
                                className="w-20 bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#C8622A] text-right"
                              />
                              <span className="text-[#8A9AB0] text-xs w-6 shrink-0">{item.unit}</span>
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
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Materials Used <span className="text-[#8A9AB0]">(optional)</span></label>
                  <textarea value={form.materials_used} onChange={e => setForm(p => ({ ...p, materials_used: e.target.value }))} rows={2}
                    placeholder="List any materials consumed or installed today..."
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0]" />
                </div>
              )}

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Work Summary <span className="text-[#C8622A]">*</span></label>
                <textarea value={form.work_summary} onChange={e => setForm(p => ({ ...p, work_summary: e.target.value }))} rows={4}
                  placeholder="What was completed today? What was installed, configured, or tested?"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0]" />
              </div>

              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Issues / Notes <span className="text-[#8A9AB0]">(optional)</span></label>
                <textarea value={form.issues} onChange={e => setForm(p => ({ ...p, issues: e.target.value }))} rows={2}
                  placeholder="Any problems encountered, open items, or notes for tomorrow..."
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0]" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={submitLog} disabled={saving || !form.job_id || !form.log_date || !form.work_summary.trim()}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Log Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function TechJobView({ isAdmin, featureProposals = true, featureCRM = false, role, isTechnician }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [checklist, setChecklist] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [laborItems, setLaborItems] = useState([])
  const [techLogs, setTechLogs] = useState([])
  const [jobSchedules, setJobSchedules] = useState([])
  const [orgProfiles, setOrgProfiles] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip, payment_instructions_payable_to, payment_instructions_zelle, payment_instructions_notes, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager').eq('id', user.id).single()
    setProfile(profileData)

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, clients(company, client_name), profiles!jobs_assigned_pm_fkey(full_name)')
      .eq('id', id)
      .single()
    setJob(jobData)

    if (profileData?.org_id) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, org_role')
        .eq('org_id', profileData.org_id)
      setOrgProfiles(profilesData || [])
    }

    // Fetch checklist
    const { data: checkData } = await supabase
      .from('job_checklist_items')
      .select('*')
      .eq('job_id', id)
      .order('sort_order', { ascending: true })
    setChecklist(checkData || [])

    // Fetch BOM line items (no cost data needed — we just need names/qty)
    if (jobData?.proposal_id) {
      const { data: lineData } = await supabase
        .from('bom_line_items')
        .select('id, item_name, quantity, unit, category, po_status')
        .eq('proposal_id', jobData.proposal_id)
      setLineItems(lineData || [])

      const { data: propData } = await supabase
        .from('proposals')
        .select('labor_items, scope_of_work')
        .eq('id', jobData.proposal_id)
        .single()
      setLaborItems(propData?.labor_items || [])

      // Store scope of work on job for PM notes
      if (propData?.scope_of_work) {
        jobData.scope_of_work = propData.scope_of_work
        setJob({ ...jobData })
      }
    }

    // Fetch tech logs for this job
    const { data: logData } = await supabase
      .from('tech_daily_logs')
      .select('*, profiles(full_name)')
      .eq('job_id', id)
      .order('log_date', { ascending: false })
    setTechLogs(logData || [])

    // Fetch tech schedules
    const { data: schedData } = await supabase
      .from('job_tech_schedules')
      .select('*, profiles(full_name)')
      .eq('job_id', id)
      .order('date', { ascending: true })
    setJobSchedules(schedData || [])

    setLoading(false)
  }

  // Calculate used quantities from tech logs
  const usedByItemId = {}
  techLogs.forEach(log => {
    if (!log.materials_used) return
    try {
      const parsed = JSON.parse(log.materials_used)
      if (Array.isArray(parsed)) {
        parsed.forEach(m => {
          usedByItemId[m.id] = (usedByItemId[m.id] || 0) + (parseFloat(m.qty) || 0)
        })
      }
    } catch {}
  })

  const hoursLogged = techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
  const estimatedHours = laborItems.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0)
  const laborPct = estimatedHours > 0 ? Math.min((hoursLogged / estimatedHours) * 100, 100) : 0
  const laborOver = hoursLogged > estimatedHours && estimatedHours > 0

  const completedCount = checklist.filter(c => c.completed).length
  const progress = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0

  // My upcoming schedules
  const today = new Date().toISOString().split('T')[0]
  const mySchedules = jobSchedules.filter(s => s.tech_id === profile?.id && s.date >= today)
  const allUpcoming = jobSchedules.filter(s => s.date >= today)

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} role={role} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <button onClick={() => navigate('/jobs')} className="text-[#8A9AB0] hover:text-white text-xs mb-3 transition-colors block">← Jobs</button>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                {job?.job_number && (
                  <span className="text-[#8A9AB0] text-sm font-mono bg-[#0F1C2E] px-2 py-0.5 rounded">{job.job_number}</span>
                )}
                <h2 className="text-white text-2xl font-bold">{job?.name}</h2>
              </div>
              {job?.clients?.company && (
                <p className="text-[#8A9AB0] mt-0.5">🏢 {job.clients.company}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-[#8A9AB0]">
                {job?.profiles?.full_name && (
                  <span>👤 PM: <span className="text-white">{job.profiles.full_name}</span></span>
                )}
                {job?.start_date && (
                  <span>📅 Start: <span className="text-white">{new Date(job.start_date + 'T12:00:00').toLocaleDateString()}</span></span>
                )}
                {job?.end_date && (
                  <span>🏁 End: <span className="text-white">{new Date(job.end_date + 'T12:00:00').toLocaleDateString()}</span></span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                job?.status === 'Active' ? 'bg-green-500/20 text-green-400' :
                job?.status === 'On Hold' ? 'bg-yellow-500/20 text-yellow-400' :
                job?.status === 'Completed' ? 'bg-blue-500/20 text-blue-400' :
                'bg-red-500/20 text-red-400'
              }`}>{job?.status}</span>
              <button onClick={() => navigate('/tech-log')}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                📋 Log Work
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[#8A9AB0] text-xs">Job progress — {completedCount} of {checklist.length} items complete</span>
              <span className="text-[#8A9AB0] text-xs">{progress}%</span>
            </div>
            <div className="w-full bg-[#0F1C2E] rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-400' : 'bg-[#C8622A]'}`}
                style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* My upcoming schedule */}
          {mySchedules.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#2a3d55]">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">My Upcoming Schedule</p>
              <div className="flex flex-wrap gap-2">
                {mySchedules.map(s => (
                  <div key={s.id} className="bg-[#C8622A]/15 border border-[#C8622A]/30 rounded-lg px-3 py-1.5">
                    <span className="text-[#C8622A] text-xs font-semibold">
                      {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[#C8622A]/70 text-xs ml-2">· {s.hours_allocated}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick stats — no costs */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Hours Logged</p>
            <p className={`text-2xl font-bold ${laborOver ? 'text-red-400' : 'text-white'}`}>{hoursLogged.toFixed(1)}</p>
            {estimatedHours > 0 && (
              <p className="text-[#8A9AB0] text-xs mt-1">of {estimatedHours.toFixed(1)} estimated</p>
            )}
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Checklist</p>
            <p className="text-white text-2xl font-bold">{completedCount}/{checklist.length}</p>
            <p className="text-[#8A9AB0] text-xs mt-1">{progress}% complete</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-4">
            <p className="text-[#8A9AB0] text-xs mb-1">Crew on Job</p>
            <p className="text-white text-2xl font-bold">{[...new Set(jobSchedules.map(s => s.tech_id))].length}</p>
            <p className="text-[#8A9AB0] text-xs mt-1">team members scheduled</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'checklist', label: `Checklist (${completedCount}/${checklist.length})` },
            { key: 'materials', label: `Materials (${lineItems.length})` },
            { key: 'hours', label: 'Hours' },
            { key: 'crew', label: 'Crew & Schedule' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* PM Notes / Scope of Work */}
            {job?.scope_of_work && (
              <div className="bg-[#1a2d45] rounded-xl p-6">
                <h3 className="text-white font-bold text-lg mb-3">📋 PM Notes / Scope of Work</h3>
                <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">
                  {job.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()}
                </p>
              </div>
            )}

            {/* Labor hours summary */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold text-lg mb-4">⏱ Hours Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#8A9AB0] text-sm">Hours logged</span>
                  <span className="text-white font-bold">{hoursLogged.toFixed(1)} hrs</span>
                </div>
                {estimatedHours > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[#8A9AB0] text-sm">Estimated total</span>
                      <span className="text-white">{estimatedHours.toFixed(1)} hrs</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#8A9AB0] text-sm">Remaining</span>
                      <span className={`font-semibold ${laborOver ? 'text-red-400' : 'text-green-400'}`}>
                        {laborOver
                          ? `${(hoursLogged - estimatedHours).toFixed(1)} hrs over ⚠`
                          : `${(estimatedHours - hoursLogged).toFixed(1)} hrs left`}
                      </span>
                    </div>
                    <div className="w-full bg-[#0F1C2E] rounded-full h-2">
                      <div className={`h-2 rounded-full ${laborOver ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${laborPct}%` }} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Recent log entries */}
            {techLogs.length > 0 && (
              <div className="bg-[#1a2d45] rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-bold text-lg">Recent Work Logs</h3>
                  <button onClick={() => navigate('/tech-log')} className="text-[#C8622A] text-sm hover:text-white transition-colors">View All →</button>
                </div>
                <div className="space-y-3">
                  {techLogs.slice(0, 3).map(log => (
                    <div key={log.id} className="bg-[#0F1C2E] rounded-lg p-4">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[#8A9AB0] text-xs font-mono">
                            {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-white text-sm font-medium">{log.profiles?.full_name}</span>
                        </div>
                        <span className="text-[#C8622A] font-bold text-sm">{log.hours_worked}h</span>
                      </div>
                      <p className="text-[#D6E4F0] text-sm">{log.work_summary}</p>
                      {log.issues && <p className="text-red-400 text-xs mt-1">⚠ {log.issues}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHECKLIST TAB — view only */}
        {activeTab === 'checklist' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-5">Job Checklist</h3>
            {checklist.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No checklist items yet.</p>
            ) : (
              <div className="space-y-2">
                {checklist.map(item => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    item.completed ? 'bg-green-500/5 border-green-500/20' : 'bg-[#0F1C2E] border-[#2a3d55]'
                  }`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      item.completed ? 'bg-green-500 border-green-500' : 'border-[#2a3d55]'
                    }`}>
                      {item.completed && <span className="text-white text-xs">✓</span>}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.completed ? 'text-green-400 line-through' : 'text-white'}`}>
                        {item.label}
                      </p>
                      {item.completed && item.completed_at && (
                        <p className="text-[#8A9AB0] text-xs mt-0.5">
                          Completed {new Date(item.completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {item.is_auto && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-[#8A9AB0] bg-[#2a3d55]">Auto</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MATERIALS TAB — no costs */}
        {activeTab === 'materials' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-5">Materials</h3>
            {lineItems.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No materials on this job.</p>
            ) : (
              <div className="space-y-2">
                {lineItems.map(item => {
                  const planned = parseFloat(item.quantity) || 0
                  const used = usedByItemId[item.id] || 0
                  const remaining = planned - used
                  const pct = planned > 0 ? Math.min((used / planned) * 100, 100) : 0
                  const isOver = used > planned && planned > 0
                  const isLow = !isOver && planned > 0 && remaining / planned < 0.2
                  return (
                    <div key={item.id} className={`bg-[#0F1C2E] rounded-xl p-4 border ${
                      isOver ? 'border-red-500/30' : isLow ? 'border-yellow-500/30' : 'border-[#2a3d55]'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white text-sm font-medium">{item.item_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.category && <span className="text-[#8A9AB0] text-xs">{item.category}</span>}
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              item.po_status === 'Received' ? 'bg-green-500/20 text-green-400' :
                              item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-[#2a3d55] text-[#8A9AB0]'
                            }`}>{item.po_status || 'Not Ordered'}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-[#8A9AB0]">Planned: <span className="text-white font-semibold">{planned} {item.unit}</span></p>
                          {used > 0 && <p className="text-[#C8622A] font-semibold">Used: {used} {item.unit}</p>}
                          {used > 0 && (
                            <p className={`font-semibold ${isOver ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                              {isOver ? `${Math.abs(remaining).toFixed(1)} over ⚠` : `${remaining.toFixed(1)} left`}
                            </p>
                          )}
                        </div>
                      </div>
                      {planned > 0 && used > 0 && (
                        <div className="w-full bg-[#1a2d45] rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all ${isOver ? 'bg-red-500' : isLow ? 'bg-yellow-400' : 'bg-green-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* HOURS TAB */}
        {activeTab === 'hours' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Hours Logged</h3>
              <button onClick={() => navigate('/tech-log')}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                + Log Work
              </button>
            </div>

            {/* Labor roles */}
            {laborItems.length > 0 && laborItems.some(l => l.role) && (
              <div className="bg-[#0F1C2E] rounded-xl p-4 mb-4">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Planned Labor</p>
                <div className="space-y-2">
                  {laborItems.filter(l => l.role).map((l, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-white">{l.role}</span>
                      <span className="text-[#8A9AB0]">{l.quantity} {l.unit || 'hr'} planned</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hours progress */}
            {estimatedHours > 0 && (
              <div className="bg-[#0F1C2E] rounded-xl p-4 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[#8A9AB0] text-sm">Progress</span>
                  <span className={`font-bold ${laborOver ? 'text-red-400' : 'text-white'}`}>
                    {hoursLogged.toFixed(1)} / {estimatedHours.toFixed(1)} hrs
                  </span>
                </div>
                <div className="w-full bg-[#1a2d45] rounded-full h-2 mb-2">
                  <div className={`h-2 rounded-full ${laborOver ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${laborPct}%` }} />
                </div>
                <p className={`text-xs font-semibold ${laborOver ? 'text-red-400' : 'text-green-400'}`}>
                  {laborOver
                    ? `${(hoursLogged - estimatedHours).toFixed(1)} hours over estimate ⚠`
                    : `${(estimatedHours - hoursLogged).toFixed(1)} hours remaining`}
                </p>
              </div>
            )}

            {/* Log entries */}
            {techLogs.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-[#8A9AB0] mb-3">No hours logged yet.</p>
                <button onClick={() => navigate('/tech-log')}
                  className="text-[#C8622A] hover:text-white text-sm transition-colors">+ Log Today's Work →</button>
              </div>
            ) : (
              <div className="space-y-3">
                {techLogs.map(log => (
                  <div key={log.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[#8A9AB0] text-xs font-mono bg-[#1a2d45] px-2 py-0.5 rounded">
                          {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-white text-sm font-medium">{log.profiles?.full_name}</span>
                      </div>
                      <span className="text-[#C8622A] font-bold">{log.hours_worked} hrs</span>
                    </div>
                    <p className="text-[#D6E4F0] text-sm">{log.work_summary}</p>
                    {log.issues && <p className="text-red-400 text-xs mt-1">⚠ {log.issues}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CREW & SCHEDULE TAB */}
        {activeTab === 'crew' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-5">Crew & Schedule</h3>

            {/* All upcoming schedules */}
            {allUpcoming.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No upcoming schedules.</p>
            ) : (
              <div className="space-y-2">
                {allUpcoming.map(s => (
                  <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                    s.tech_id === profile?.id
                      ? 'bg-[#C8622A]/10 border-[#C8622A]/30'
                      : 'bg-[#0F1C2E] border-[#2a3d55]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${s.tech_id === profile?.id ? 'bg-[#C8622A]' : 'bg-blue-400'}`} />
                      <span className={`text-sm font-medium ${s.tech_id === profile?.id ? 'text-[#C8622A]' : 'text-white'}`}>
                        {s.profiles?.full_name}
                        {s.tech_id === profile?.id && <span className="text-xs ml-1">(you)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#8A9AB0]">
                      <span>{new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span>{s.hours_allocated}h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* All team on this job */}
            {jobSchedules.length > 0 && (
              <div className="mt-6">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Team on This Job</p>
                <div className="flex flex-wrap gap-2">
                  {[...new Map(jobSchedules.map(s => [s.tech_id, s])).values()].map(s => (
                    <div key={s.tech_id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      s.tech_id === profile?.id
                        ? 'bg-[#C8622A]/15 border-[#C8622A]/30 text-[#C8622A]'
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                    }`}>
                      {s.profiles?.full_name}
                      {s.tech_id === profile?.id && <span className="opacity-70">(you)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
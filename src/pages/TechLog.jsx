import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function TechLog({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [logs, setLogs] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedJob, setSelectedJob] = useState('')
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

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    // Fetch active jobs
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('id, name, job_number, status, clients(company)')
      .eq('org_id', profileData.org_id)
      .in('status', ['Active', 'On Hold'])
      .order('created_at', { ascending: false })
    setJobs(jobsData || [])

    // Fetch all logs for org
    const { data: logsData } = await supabase
      .from('tech_daily_logs')
      .select('*, jobs(name, job_number, clients(company)), profiles(full_name)')
      .eq('org_id', profileData.org_id)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
    setLogs(logsData || [])

    setLoading(false)
  }

  const submitLog = async () => {
    if (!form.job_id || !form.log_date || !form.work_summary.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('tech_daily_logs').insert({
      job_id: form.job_id,
      org_id: profile.org_id,
      user_id: profile.id,
      log_date: form.log_date,
      hours_worked: parseFloat(form.hours_worked) || 0,
      work_summary: form.work_summary.trim(),
      materials_used: form.materials_used.trim() || null,
      issues: form.issues.trim() || null
    }).select('*, jobs(name, job_number, clients(company)), profiles(full_name)').single()

    if (data) {
      setLogs(prev => [data, ...prev])
      setForm({
        job_id: form.job_id, // keep job selected
        log_date: new Date().toISOString().split('T')[0],
        hours_worked: '',
        work_summary: '',
        materials_used: '',
        issues: ''
      })
      setShowForm(false)
    }
    setSaving(false)
  }

  const deleteLog = async (logId) => {
    if (!window.confirm('Delete this log entry?')) return
    await supabase.from('tech_daily_logs').delete().eq('id', logId)
    setLogs(prev => prev.filter(l => l.id !== logId))
  }

  const filteredLogs = filterJob === 'all' ? logs : logs.filter(l => l.job_id === filterJob)

  // Stats
  const totalHours = filteredLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
  const uniqueDays = new Set(filteredLogs.map(l => l.log_date)).size
  const logsThisWeek = filteredLogs.filter(l => {
    const logDate = new Date(l.log_date)
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    return logDate >= weekAgo
  }).length

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Tech Daily Log</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">Track daily hours and work notes by job</p>
          </div>
          <button onClick={() => { setShowForm(true); setForm(f => ({ ...f, job_id: filterJob !== 'all' ? filterJob : '' })) }}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
            + Log Today's Work
          </button>
        </div>

        {/* Stats */}
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

        {/* Filter by job */}
        <div className="flex gap-3 items-center">
          <span className="text-[#8A9AB0] text-sm">Filter by job:</span>
          <select value={filterJob} onChange={e => setFilterJob(e.target.value)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            <option value="all">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>)}
          </select>
        </div>

        {/* Log list */}
        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-16 bg-[#1a2d45] rounded-xl border-2 border-dashed border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-lg mb-2">No log entries yet</p>
            <p className="text-[#8A9AB0] text-sm mb-4">Start logging daily work to track hours and progress.</p>
            <button onClick={() => setShowForm(true)} className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Log Today's Work</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map(log => (
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
                  {log.materials_used && (
                    <div className="bg-[#0F1C2E] rounded-lg p-3">
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">Materials Used</p>
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
            ))}
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
                <select value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))} className={inputClass}>
                  <option value="">— Select job —</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}{j.clients?.company ? ` (${j.clients.company})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                  <input type="date" value={form.log_date} onChange={e => setForm(p => ({ ...p, log_date: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Hours Worked</label>
                  <input type="number" step="0.5" min="0" max="24" value={form.hours_worked} onChange={e => setForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder="e.g. 8" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Work Summary <span className="text-[#C8622A]">*</span></label>
                <textarea value={form.work_summary} onChange={e => setForm(p => ({ ...p, work_summary: e.target.value }))} rows={4}
                  placeholder="What was completed today? What was installed, configured, or tested?"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Materials Used <span className="text-[#8A9AB0]">(optional)</span></label>
                <textarea value={form.materials_used} onChange={e => setForm(p => ({ ...p, materials_used: e.target.value }))} rows={2}
                  placeholder="List any materials consumed or installed today..."
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
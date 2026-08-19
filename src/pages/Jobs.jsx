import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

export const JOB_STATUSES = [
  { key: 'Pending',          color: 'bg-fp-inset text-fp-muted',         dot: 'bg-gray-400' },
  { key: 'Scheduled',        color: 'bg-purple-500/20 text-purple-400',   dot: 'bg-purple-400' },
  { key: 'In Progress',      color: 'bg-green-500/20 text-green-400',     dot: 'bg-green-400' },
  { key: 'Waiting on Parts', color: 'bg-orange-500/20 text-orange-400',   dot: 'bg-orange-400' },
  { key: 'Punch List',       color: 'bg-cyan-500/20 text-cyan-400',       dot: 'bg-cyan-400' },
  { key: 'On Hold',          color: 'bg-yellow-500/20 text-yellow-400',   dot: 'bg-yellow-400' },
  { key: 'Completed',        color: 'bg-blue-500/20 text-blue-400',       dot: 'bg-blue-400' },
  { key: 'Cancelled',        color: 'bg-red-500/20 text-red-400',         dot: 'bg-red-400' },
]

const STATUS_COLOR_MAP = Object.fromEntries(JOB_STATUSES.map(s => [s.key, s.color]))

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function Jobs({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, isTechnician = false, featureInventory = false, isSalesManager = false, isPM = false }) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showArchived, setShowArchived] = useState(false)
  const [view, setView] = useState(() => localStorage.getItem('jobs_view') || 'board')
  const dragJob = useRef(null)

  const setView_ = (v) => { setView(v); localStorage.setItem('jobs_view', v) }

  useEffect(() => { if (profile?.org_id) fetchJobs() }, [profile?.org_id])

  const fetchJobs = async () => {
    if (!profile?.org_id) { setLoading(false); return }
    const { data } = await supabase
      .from('jobs')
      .select('*, proposals(proposal_name, proposal_value), clients(company), profiles!jobs_assigned_pm_fkey(full_name), job_checklist_items(id, completed)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  const updateStatus = async (jobId, status) => {
    await supabase.from('jobs').update({ status }).eq('id', jobId)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
  }

  const archiveJob = async (e, jobId) => {
    e.stopPropagation()
    await supabase.from('jobs').update({ archived_at: new Date().toISOString() }).eq('id', jobId)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived_at: new Date().toISOString() } : j))
  }

  const restoreJob = async (e, jobId) => {
    e.stopPropagation()
    await supabase.from('jobs').update({ archived_at: null }).eq('id', jobId)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived_at: null } : j))
  }

  const deleteJob = async (e, job) => {
    e.stopPropagation()
    if (!window.confirm(`Permanently delete "${job.name}"? This cannot be undone.`)) return
    await supabase.from('jobs').delete().eq('id', job.id)
    setJobs(prev => prev.filter(j => j.id !== job.id))
  }

  const getProgress = (job) => {
    const items = job.job_checklist_items || []
    if (items.length === 0) return null
    const done = items.filter(i => i.completed).length
    return Math.round((done / items.length) * 100)
  }

  const archivedCount = jobs.filter(j => !!j.archived_at).length
  const activeJobs = jobs.filter(j => !j.archived_at)

  const filtered = jobs
    .filter(j => showArchived ? !!j.archived_at : !j.archived_at)
    .filter(j => {
      const matchStatus = statusFilter === 'All' || j.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q || j.name?.toLowerCase().includes(q) || j.clients?.company?.toLowerCase().includes(q) || j.job_number?.toLowerCase().includes(q)
      return matchStatus && matchSearch
    })

  // Kanban drag handlers
  const onDragStart = (e, job) => {
    dragJob.current = job
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const onDrop = (e, targetStatus) => {
    e.preventDefault()
    if (dragJob.current && dragJob.current.status !== targetStatus) {
      updateStatus(dragJob.current.id, targetStatus)
    }
    dragJob.current = null
  }

  const jobUrl = (job) => isTechnician ? `/tech/job/${job.id}` : `/jobs/${job.id}`

  // Stats for header
  const statuses = JOB_STATUSES.filter(s => s.key !== 'Completed' && s.key !== 'Cancelled')
  const activeByStatus = Object.fromEntries(statuses.map(s => [s.key, activeJobs.filter(j => j.status === s.key).length]))
  const totalValue = activeJobs.reduce((sum, j) => sum + (j.proposals?.proposal_value || 0), 0)

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureInventory={featureInventory} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">{showArchived ? 'Archived Jobs' : 'Jobs'}</h2>
            <p className="text-fp-muted text-sm mt-0.5">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {archivedCount > 0 && (
              <button onClick={() => setShowArchived(v => !v)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${showArchived ? 'bg-fp-brand/20 text-fp-brand border border-fp-brand/30' : 'bg-fp-card text-fp-muted hover:text-fp-text'}`}>
                {showArchived ? '← Active' : `Archive (${archivedCount})`}
              </button>
            )}
            {/* View toggle */}
            <div className="flex bg-fp-card border border-fp-border rounded-lg overflow-hidden">
              <button onClick={() => setView_('list')}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${view === 'list' ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
                ☰ List
              </button>
              <button onClick={() => setView_('board')}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${view === 'board' ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>
                ⊞ Board
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'In Progress', value: (activeByStatus['In Progress'] || 0), color: 'text-green-400' },
            { label: 'Scheduled', value: (activeByStatus['Scheduled'] || 0), color: 'text-purple-400' },
            { label: 'Waiting on Parts', value: (activeByStatus['Waiting on Parts'] || 0), color: 'text-orange-400' },
            { label: 'Total Value', value: fmt(totalValue), color: 'text-fp-brand' },
          ].map(stat => (
            <div key={stat.label} className="bg-fp-card rounded-xl p-4">
              <p className="text-fp-muted text-xs mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters (list view only) */}
        {view === 'list' && (
          <div className="flex gap-3">
            <input type="text" placeholder="Search jobs, clients..." value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-fp-card border border-fp-border text-fp-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fp-brand cursor-pointer">
              <option value="All">All Statuses</option>
              {JOB_STATUSES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
            </select>
          </div>
        )}

        {loading ? (
          <p className="text-fp-muted">Loading...</p>
        ) : view === 'board' ? (
          <KanbanBoard jobs={filtered} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
            jobUrl={jobUrl} navigate={navigate} getProgress={getProgress} isAdmin={isAdmin}
            onArchive={archiveJob} onRestore={restoreJob} onDelete={deleteJob} showArchived={showArchived} />
        ) : (
          filtered.length === 0 ? (
            <div className="text-center py-16 bg-fp-card rounded-xl border-2 border-dashed border-fp-border">
              <p className="text-fp-muted text-lg mb-2">No jobs yet</p>
              <p className="text-fp-muted text-sm">Jobs are created automatically when a proposal is marked Won.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(job => {
                const progress = getProgress(job)
                return (
                  <div key={job.id} onClick={() => navigate(jobUrl(job))}
                    className="bg-fp-card rounded-xl p-5 cursor-pointer hover:bg-fp-hover transition-colors group border border-fp-border hover:border-fp-brand/30">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          {job.job_number && <span className="text-fp-muted text-xs font-mono bg-fp-inset px-2 py-0.5 rounded">{job.job_number}</span>}
                          <h3 className="text-fp-text font-semibold group-hover:text-fp-brand transition-colors">{job.name}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-fp-muted">
                          {job.clients?.company && <span>🏢 {job.clients.company}</span>}
                          {job.profiles?.full_name && <span>👤 {job.profiles.full_name}</span>}
                          {job.start_date && <span>📅 {new Date(job.start_date).toLocaleDateString()}</span>}
                          {job.end_date && <span>→ {new Date(job.end_date).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        {job.proposals?.proposal_value > 0 && (
                          <div className="text-right">
                            <p className="text-fp-muted text-xs">Value</p>
                            <p className="text-fp-text font-semibold">{fmt(job.proposals.proposal_value)}</p>
                          </div>
                        )}
                        {job.billing_type && job.billing_type !== 'Lump Sum' && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-fp-inset text-fp-muted">{job.billing_type}</span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR_MAP[job.status] || 'bg-fp-inset text-fp-muted'}`}>
                          {job.status}
                        </span>
                        {isAdmin && (
                          job.archived_at
                            ? <button onClick={e => restoreJob(e, job.id)} className="text-fp-muted hover:text-green-400 text-xs transition-colors opacity-0 group-hover:opacity-100">Restore</button>
                            : <button onClick={e => archiveJob(e, job.id)} className="text-fp-muted hover:text-fp-brand text-xs transition-colors opacity-0 group-hover:opacity-100">Archive</button>
                        )}
                        {isAdmin && job.status === 'Cancelled' && (
                          <button onClick={e => deleteJob(e, job)} className="text-red-500/50 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100">Delete</button>
                        )}
                        <span className="text-fp-muted group-hover:text-fp-text transition-colors">→</span>
                      </div>
                    </div>
                    {progress !== null && (
                      <div className="mt-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-fp-muted text-xs">Checklist</span>
                          <span className="text-fp-muted text-xs">{progress}%</span>
                        </div>
                        <div className="w-full bg-fp-inset rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all ${progress === 100 ? 'bg-green-400' : 'bg-fp-brand'}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function KanbanBoard({ jobs, onDragStart, onDragOver, onDrop, jobUrl, navigate, getProgress, isAdmin, onArchive, onRestore, onDelete, showArchived }) {
  const [dragOver, setDragOver] = useState(null)

  const columns = JOB_STATUSES.map(s => ({
    ...s,
    jobs: jobs.filter(j => j.status === s.key),
    value: jobs.filter(j => j.status === s.key).reduce((sum, j) => sum + (j.proposals?.proposal_value || 0), 0),
  }))

  return (
    <div className="overflow-x-auto pb-4 w-full min-w-0">
      <div className="flex gap-4" style={{ minWidth: `${JOB_STATUSES.length * 252}px` }}>
        {columns.map(col => (
          <div key={col.key}
            onDragOver={e => { onDragOver(e); setDragOver(col.key) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { onDrop(e, col.key); setDragOver(null) }}
            className={`flex flex-col w-60 min-w-[240px] rounded-xl transition-colors ${dragOver === col.key ? 'bg-fp-brand/10 ring-2 ring-fp-brand/30' : 'bg-fp-card/50'}`}>
            {/* Column header */}
            <div className="px-3 py-3 border-b border-fp-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-fp-text font-semibold text-sm">{col.key}</span>
                <span className="text-fp-muted text-xs bg-fp-inset px-1.5 py-0.5 rounded-full">{col.jobs.length}</span>
              </div>
              {col.value > 0 && <span className="text-fp-muted text-xs">{fmt(col.value)}</span>}
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 min-h-[120px]">
              {col.jobs.map(job => {
                const progress = getProgress(job)
                return (
                  <div key={job.id}
                    draggable
                    onDragStart={e => onDragStart(e, job)}
                    onClick={() => navigate(jobUrl(job))}
                    className="bg-fp-card rounded-lg p-3 cursor-pointer hover:bg-fp-hover transition-colors border border-fp-border hover:border-fp-brand/30 group active:opacity-60 select-none">
                    {job.job_number && (
                      <span className="text-fp-muted text-xs font-mono">{job.job_number}</span>
                    )}
                    <p className="text-fp-text text-sm font-semibold leading-snug mt-0.5 group-hover:text-fp-brand transition-colors">{job.name}</p>
                    {job.clients?.company && (
                      <p className="text-fp-muted text-xs mt-1 truncate">🏢 {job.clients.company}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {job.proposals?.proposal_value > 0 && (
                        <span className="text-fp-brand text-xs font-semibold">{fmt(job.proposals.proposal_value)}</span>
                      )}
                      {job.start_date && (
                        <span className="text-fp-muted text-xs ml-auto">{new Date(job.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                    {progress !== null && (
                      <div className="mt-2">
                        <div className="w-full bg-fp-inset rounded-full h-1">
                          <div className={`h-1 rounded-full ${progress === 100 ? 'bg-green-400' : 'bg-fp-brand'}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {col.jobs.length === 0 && (
                <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed border-fp-border/40">
                  <span className="text-fp-muted/40 text-xs">Drop here</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

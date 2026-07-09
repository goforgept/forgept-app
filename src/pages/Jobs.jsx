import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

const STATUS_COLORS = {
  'Active': 'bg-green-500/20 text-green-400',
  'On Hold': 'bg-yellow-500/20 text-yellow-400',
  'Completed': 'bg-blue-500/20 text-blue-400',
  'Cancelled': 'bg-red-500/20 text-red-400',
}

export default function Jobs({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, isTechnician = false }) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showArchived, setShowArchived] = useState(false)

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

  const getProgress = (job) => {
    const items = job.job_checklist_items || []
    if (items.length === 0) return null
    const done = items.filter(i => i.completed).length
    return Math.round((done / items.length) * 100)
  }

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">{showArchived ? 'Archived Jobs' : 'Jobs'}</h2>
            <p className="text-fp-muted text-sm mt-0.5">{filtered.length} of {jobs.length} jobs</p>
          </div>
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                showArchived ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/30' : 'bg-fp-card text-fp-muted hover:text-fp-text'
              }`}
            >
              {showArchived ? '← Active' : `Archive (${archivedCount})`}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active', value: activeJobs.filter(j => j.status === 'Active').length, color: 'text-green-400' },
            { label: 'On Hold', value: activeJobs.filter(j => j.status === 'On Hold').length, color: 'text-yellow-400' },
            { label: 'Completed', value: activeJobs.filter(j => j.status === 'Completed').length, color: 'text-blue-400' },
            { label: 'Total Value', value: `$${activeJobs.reduce((sum, j) => sum + (j.proposals?.proposal_value || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`, color: 'text-[#C8622A]' },
          ].map(stat => (
            <div key={stat.label} className="bg-fp-card rounded-xl p-4">
              <p className="text-fp-muted text-xs mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search jobs, clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-fp-card text-fp-text border border-fp-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"
          />
          <div className="flex gap-2">
            {['All', 'Active', 'On Hold', 'Completed', 'Cancelled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Jobs list */}
        {loading ? (
          <p className="text-fp-muted">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-fp-card rounded-xl border-2 border-dashed border-fp-border">
            <p className="text-fp-muted text-lg mb-2">No jobs yet</p>
            <p className="text-fp-muted text-sm">Jobs are created automatically when a proposal is marked Won.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => {
              const progress = getProgress(job)
              return (
                <div key={job.id} onClick={() => navigate(isTechnician ? `/tech/job/${job.id}` : `/jobs/${job.id}`)}
                  className="bg-fp-card rounded-xl p-5 cursor-pointer hover:bg-fp-hover transition-colors group border border-fp-border hover:border-fp-brand/30">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        {job.job_number && <span className="text-fp-muted text-xs font-mono bg-fp-inset px-2 py-0.5 rounded">{job.job_number}</span>}
                        <h3 className="text-fp-text font-semibold group-hover:text-[#C8622A] transition-colors">{job.name}</h3>
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
                          <p className="text-fp-text font-semibold">${(job.proposals.proposal_value || 0).toLocaleString()}</p>
                        </div>
                      )}
                      {job.billing_type && job.billing_type !== 'Lump Sum' && (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-fp-inset text-fp-muted">
                          {job.billing_type}
                        </span>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[job.status] || 'bg-fp-inset text-fp-muted'}`}>
                        {job.status}
                      </span>
                      {isAdmin && (
                        job.archived_at ? (
                          <button onClick={e => restoreJob(e, job.id)} className="text-fp-muted hover:text-green-400 text-xs transition-colors opacity-0 group-hover:opacity-100">Restore</button>
                        ) : (
                          <button onClick={e => archiveJob(e, job.id)} className="text-fp-muted hover:text-[#C8622A] text-xs transition-colors opacity-0 group-hover:opacity-100">Archive</button>
                        )
                      )}
                      <span className="text-fp-muted group-hover:text-fp-text transition-colors">→</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {progress !== null && (
                    <div className="mt-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-fp-muted text-xs">Checklist progress</span>
                        <span className="text-fp-muted text-xs">{progress}%</span>
                      </div>
                      <div className="w-full bg-fp-inset rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${progress === 100 ? 'bg-green-400' : 'bg-[#C8622A]'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
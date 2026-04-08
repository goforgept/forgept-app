import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const STATUS_COLORS = {
  'Active': 'bg-green-500/20 text-green-400',
  'On Hold': 'bg-yellow-500/20 text-yellow-400',
  'Completed': 'bg-blue-500/20 text-blue-400',
  'Cancelled': 'bg-red-500/20 text-red-400',
}

export default function Jobs({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [profile, setProfile] = useState(null)

  useEffect(() => { fetchJobs() }, [])

  const fetchJobs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('org_id, full_name').eq('id', user.id).single()
    setProfile(profileData)
    if (!profileData?.org_id) { setLoading(false); return }

    const { data } = await supabase
      .from('jobs')
      .select('*, proposals(proposal_name, proposal_value), clients(company), profiles!jobs_assigned_pm_fkey(full_name), job_checklist_items(id, completed)')
      .eq('org_id', profileData.org_id)
      .order('created_at', { ascending: false })

    setJobs(data || [])
    setLoading(false)
  }

  const filtered = jobs.filter(j => {
    const matchStatus = statusFilter === 'All' || j.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q || j.name?.toLowerCase().includes(q) || j.clients?.company?.toLowerCase().includes(q) || j.job_number?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const deleteJob = async (e, jobId) => {
    e.stopPropagation()
    if (!window.confirm('Delete this job? This cannot be undone.')) return
    await supabase.from('jobs').delete().eq('id', jobId)
    setJobs(prev => prev.filter(j => j.id !== jobId))
  }

  const getProgress = (job) => {
    const items = job.job_checklist_items || []
    if (items.length === 0) return null
    const done = items.filter(i => i.completed).length
    return Math.round((done / items.length) * 100)
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Jobs</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{filtered.length} of {jobs.length} jobs</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active', value: jobs.filter(j => j.status === 'Active').length, color: 'text-green-400' },
            { label: 'On Hold', value: jobs.filter(j => j.status === 'On Hold').length, color: 'text-yellow-400' },
            { label: 'Completed', value: jobs.filter(j => j.status === 'Completed').length, color: 'text-blue-400' },
            { label: 'Total Value', value: `$${jobs.reduce((sum, j) => sum + (j.proposals?.proposal_value || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`, color: 'text-[#C8622A]' },
          ].map(stat => (
            <div key={stat.label} className="bg-[#1a2d45] rounded-xl p-4">
              <p className="text-[#8A9AB0] text-xs mb-1">{stat.label}</p>
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
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
          />
          <div className="flex gap-2">
            {['All', 'Active', 'On Hold', 'Completed', 'Cancelled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Jobs list */}
        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-[#1a2d45] rounded-xl border-2 border-dashed border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-lg mb-2">No jobs yet</p>
            <p className="text-[#8A9AB0] text-sm">Jobs are created automatically when a proposal is marked Won.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => {
              const progress = getProgress(job)
              return (
                <div key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                  className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3552] transition-colors group border border-[#2a3d55] hover:border-[#C8622A]/30">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        {job.job_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#0F1C2E] px-2 py-0.5 rounded">{job.job_number}</span>}
                        <h3 className="text-white font-semibold group-hover:text-[#C8622A] transition-colors">{job.name}</h3>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[#8A9AB0]">
                        {job.clients?.company && <span>🏢 {job.clients.company}</span>}
                        {job.profiles?.full_name && <span>👤 {job.profiles.full_name}</span>}
                        {job.start_date && <span>📅 {new Date(job.start_date).toLocaleDateString()}</span>}
                        {job.end_date && <span>→ {new Date(job.end_date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      {job.proposals?.proposal_value > 0 && (
                        <div className="text-right">
                          <p className="text-[#8A9AB0] text-xs">Value</p>
                          <p className="text-white font-semibold">${(job.proposals.proposal_value || 0).toLocaleString()}</p>
                        </div>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[job.status] || 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                        {job.status}
                      </span>
                      {isAdmin && (
                        <button onClick={e => deleteJob(e, job.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100">Delete</button>
                      )}
                      <span className="text-[#8A9AB0] group-hover:text-white transition-colors">→</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {progress !== null && (
                    <div className="mt-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[#8A9AB0] text-xs">Checklist progress</span>
                        <span className="text-[#8A9AB0] text-xs">{progress}%</span>
                      </div>
                      <div className="w-full bg-[#0F1C2E] rounded-full h-1.5">
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
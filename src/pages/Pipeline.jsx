import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import PipelineStagesModal from '../components/pipeline/PipelineStagesModal'

const DEFAULT_STAGES = [
  { name: 'Lead',                  color: '#8A9AB0', probability: 10,  definition: 'Potential opportunity identified' },
  { name: 'Qualified',             color: '#3b82f6', probability: 20,  definition: 'Valid requirement confirmed' },
  { name: 'Site Assessment',       color: '#6366f1', probability: 40,  definition: 'Site survey/discovery required or underway' },
  { name: 'Design & Engineering',  color: '#a855f7', probability: 50,  definition: 'Solution, SOW and BOM development' },
  { name: 'Quoting',               color: '#C8622A', probability: 60,  definition: 'Pricing/proposal being finalized' },
  { name: 'Quote Submitted',       color: '#f59e0b', probability: 70,  definition: 'Proposal delivered' },
  { name: 'Negotiation / Revision',color: '#ec4899', probability: 80,  definition: 'Customer requests pricing, scope, BOM, or proposal changes' },
  { name: 'Pending Award',         color: '#14b8a6', probability: 90,  definition: 'Final proposal accepted / awaiting funding, PO or contract' },
  { name: 'Won',                   color: '#22c55e', probability: 100, definition: 'PO/contract received' },
  { name: 'Lost',                  color: '#ef4444', probability: 0,   definition: 'Opportunity did not proceed' },
]

export default function Pipeline({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [stages, setStages] = useState([])
  const [proposals, setProposals] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [showManageStages, setShowManageStages] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState(90)
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)

    // Check if stages exist, if not create defaults
    const { data: existingStages } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('position')

    let stageData = existingStages || []

    if (stageData.length === 0) {
      const { data: newStages } = await supabase
        .from('pipeline_stages')
        .insert(DEFAULT_STAGES.map((s, i) => ({
          org_id: profile.org_id,
          name: s.name,
          color: s.color,
          probability: s.probability,
          definition: s.definition,
          position: i
        })))
        .select()
      stageData = newStages || []
    }

    const [proposalsRes, clientsRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company, client_type, first_name, last_name').eq('org_id', profile.org_id)
    ])

    setStages(stageData)
    setProposals(proposalsRes.data || [])
    setClients(clientsRes.data || [])
    setLoading(false)
  }

  const dateThreshold = dateRange === 0 ? null : new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toISOString()

  const filteredProposals = dateThreshold
    ? proposals.filter(p => p.created_at >= dateThreshold)
    : proposals

  const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]))

  const getProposalsForStage = (stage) => {
    const q = search.toLowerCase()
    return filteredProposals.filter(p => {
      if (p.pipeline_stage_id) { if (p.pipeline_stage_id !== stage.id) return false }
      else {
        if (stage.name === 'Proposal Sent' && p.status !== 'Sent') return false
        else if (stage.name === 'Won' && p.status !== 'Won') return false
        else if (stage.name === 'Lost' && p.status !== 'Lost') return false
        else if (stage.name === 'Lead' && p.status !== 'Draft') return false
        else if (!['Proposal Sent','Won','Lost','Lead'].includes(stage.name)) return false
      }
      if (clientTypeFilter !== 'all') {
        const client = p.client_id ? clientMap[p.client_id] : null
        const type = client?.client_type || 'commercial'
        if (type !== clientTypeFilter) return false
      }
      if (!q) return true
      return (
        (p.proposal_name || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q) ||
        (p.rep_name || '').toLowerCase().includes(q)
      )
    })
  }

  const handleDragStart = (e, proposal) => {
    setDragging(proposal)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, stage) => {
    e.preventDefault()
    if (!dragging) return

    // Map stage name to proposal status
    let newStatus = dragging.status
    if (stage.name === 'Won') newStatus = 'Won'
    else if (stage.name === 'Lost') newStatus = 'Lost'
    else if (stage.name === 'Proposal Sent') newStatus = 'Sent'
    else if (stage.name === 'Lead' || stage.name === 'Contacted' || stage.name === 'Negotiating') newStatus = 'Draft'

    await supabase
      .from('proposals')
      .update({ pipeline_stage_id: stage.id, status: newStatus })
      .eq('id', dragging.id)

    // Create a job when moving to Won (or fix status if one already exists)
    if (newStatus === 'Won') {
      const { data: existingJob } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('proposal_id', dragging.id)
        .maybeSingle()

      if (existingJob) {
        if (existingJob.status === 'Active') {
          await supabase.from('jobs').update({ status: 'Pending' }).eq('id', existingJob.id)
        }
      } else {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('job_counter')
          .eq('id', orgId)
          .single()
        const jobNumber = `JOB-${orgData?.job_counter || 1000}`
        await supabase.from('organizations').update({ job_counter: (orgData?.job_counter || 1000) + 1 }).eq('id', orgId)
        const { error: jobErr } = await supabase.from('jobs').insert({
          org_id: orgId,
          proposal_id: dragging.id,
          client_id: dragging.client_id || null,
          job_number: jobNumber,
          name: dragging.proposal_name,
          status: 'Pending',
        })
        if (jobErr) console.error('Job creation failed:', jobErr.message, jobErr.details, jobErr.hint)
      }
    }

    setDragging(null)
    fetchData()
  }

  const reloadStages = async () => {
    const { data } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('org_id', orgId)
      .order('position')
    if (data) setStages(data)
  }

  const totalPipeline = filteredProposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = filteredProposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6 overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center h-full">
          <p className="text-fp-text">Loading...</p>
        </div>
      ) : (<>
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-fp-text text-2xl font-bold">Pipeline</h2>
            <p className="text-fp-muted text-sm mt-0.5">
              ${totalPipeline.toLocaleString()} active · ${wonPipeline.toLocaleString()} won
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={dateRange}
              onChange={e => setDateRange(Number(e.target.value))}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            >
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last year</option>
              <option value={0}>All time</option>
            </select>
            <select value={clientTypeFilter} onChange={e => setClientTypeFilter(e.target.value)}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand cursor-pointer">
              <option value="all">All Clients</option>
              <option value="commercial">Commercial</option>
              <option value="residential">Residential</option>
            </select>
            <input
              type="text"
              placeholder="Search deals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:border-fp-brand placeholder-fp-muted"
            />
            <button
              onClick={() => setShowManageStages(true)}
              className="bg-fp-card text-fp-muted hover:text-fp-text px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Manage Stages
            </button>
            <button
              onClick={() => navigate('/new')}
              className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
              + New Deal
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
          {stages.map(stage => {
            const stageProposals = getProposalsForStage(stage)
            const stageTotal = stageProposals.reduce((sum, p) => sum + (p.proposal_value || 0), 0)

            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72"
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, stage)}
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: stage.color }}
                    />
                    <span className="text-fp-text text-sm font-semibold truncate">{stage.name}</span>
                    <span className="bg-fp-inset text-fp-muted text-xs px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {stageProposals.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {stage.probability != null && (
                      <span className="text-fp-muted text-xs font-mono">{stage.probability}%</span>
                    )}
                    {stageTotal > 0 && (
                      <span className="text-fp-muted text-xs">${stageTotal.toLocaleString()}</span>
                    )}
                  </div>
                </div>

                {/* Drop Zone */}
                <div
                  className={`min-h-24 rounded-xl p-2 space-y-2 transition-colors ${
                    dragging ? 'bg-fp-card/80 border border-dashed border-fp-border' : 'bg-fp-card/40'
                  }`}
                >
                  {stageProposals.map(proposal => (
                    <div
                      key={proposal.id}
                      draggable
                      onDragStart={e => handleDragStart(e, proposal)}
                      onClick={() => navigate(`/proposal/${proposal.id}`)}
                      className="bg-fp-card border border-fp-border rounded-xl p-3 cursor-pointer hover:border-fp-brand/50 transition-colors group"
                    >
                      <p className="text-fp-text text-sm font-medium group-hover:text-[#C8622A] transition-colors leading-tight">
                        {proposal.proposal_name}
                      </p>
                      <p className="text-fp-muted text-xs mt-1">{proposal.company}</p>
                      <div className="flex justify-between items-center mt-2">
                        <div>
                          <span className="text-fp-text text-sm font-bold">
                            ${(proposal.proposal_value || 0).toLocaleString()}
                          </span>
                          {proposal.total_gross_margin_percent > 0 && (
                            <p className="text-green-500 text-xs font-semibold leading-tight">
                              +${Math.round((proposal.proposal_value || 0) * proposal.total_gross_margin_percent / 100).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {proposal.total_gross_margin_percent > 0 && (
                          <span className="text-[#C8622A] text-xs font-semibold">
                            {proposal.total_gross_margin_percent.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {proposal.close_date && (
                        <p className="text-fp-muted text-xs mt-1">
                          Close: {proposal.close_date}
                        </p>
                      )}
                      {proposal.rep_name && (
                        <p className="text-fp-muted text-xs mt-0.5">{proposal.rep_name}</p>
                      )}
                    </div>
                  ))}

                  {stageProposals.length === 0 && (
                    <div className="flex items-center justify-center h-16">
                      <p className="text-fp-muted text-xs">Drop deals here</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </>)}
      </div>

      {showManageStages && (
        <PipelineStagesModal
          stages={stages}
          orgId={orgId}
          onClose={() => setShowManageStages(false)}
          onSaved={reloadStages}
        />
      )}
    </div>
  )
}
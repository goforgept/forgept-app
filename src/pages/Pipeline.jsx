import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#8A9AB0' },
  { name: 'Contacted', color: '#3b82f6' },
  { name: 'Proposal Sent', color: '#C8622A' },
  { name: 'Negotiating', color: '#f59e0b' },
  { name: 'Won', color: '#22c55e' },
  { name: 'Lost', color: '#ef4444' },
]

export default function Pipeline({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [stages, setStages] = useState([])
  const [proposals, setProposals] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [showAddStage, setShowAddStage] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [search, setSearch] = useState('')
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
          position: i
        })))
        .select()
      stageData = newStages || []
    }

    const [proposalsRes, clientsRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company').eq('org_id', profile.org_id)
    ])

    setStages(stageData)
    setProposals(proposalsRes.data || [])
    setClients(clientsRes.data || [])
    setLoading(false)
  }

  const getProposalsForStage = (stage) => {
    const q = search.toLowerCase()
    return proposals.filter(p => {
      if (p.pipeline_stage_id) { if (p.pipeline_stage_id !== stage.id) return false }
      else {
        if (stage.name === 'Proposal Sent' && p.status !== 'Sent') return false
        else if (stage.name === 'Won' && p.status !== 'Won') return false
        else if (stage.name === 'Lost' && p.status !== 'Lost') return false
        else if (stage.name === 'Lead' && p.status !== 'Draft') return false
        else if (!['Proposal Sent','Won','Lost','Lead'].includes(stage.name)) return false
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

    setDragging(null)
    fetchData()
  }

  const addStage = async () => {
    if (!newStageName) return
    await supabase.from('pipeline_stages').insert({
      org_id: orgId,
      name: newStageName,
      color: '#8A9AB0',
      position: stages.length
    })
    setNewStageName('')
    setShowAddStage(false)
    fetchData()
  }

  const totalPipeline = proposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = proposals
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
            <input
              type="text"
              placeholder="Search deals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:border-fp-brand placeholder-fp-muted"
            />
            <button
              onClick={() => setShowAddStage(!showAddStage)}
              className="bg-fp-card text-fp-muted hover:text-fp-text px-4 py-2 rounded-lg text-sm transition-colors"
            >
              + Add Stage
            </button>
            <button
              onClick={() => navigate('/new')}
              className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
              + New Deal
            </button>
          </div>
        </div>

        {showAddStage && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newStageName}
              onChange={e => setNewStageName(e.target.value)}
              placeholder="Stage name..."
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            />
            <button
              onClick={addStage}
              className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
              Add
            </button>
          </div>
        )}

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
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: stage.color }}
                    />
                    <span className="text-fp-text text-sm font-semibold">{stage.name}</span>
                    <span className="bg-fp-inset text-fp-muted text-xs px-1.5 py-0.5 rounded-full">
                      {stageProposals.length}
                    </span>
                  </div>
                  {stageTotal > 0 && (
                    <span className="text-fp-muted text-xs">${stageTotal.toLocaleString()}</span>
                  )}
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
                        <span className="text-fp-text text-sm font-bold">
                          ${(proposal.proposal_value || 0).toLocaleString()}
                        </span>
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
    </div>
  )
}
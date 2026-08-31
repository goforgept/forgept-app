import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useProfile } from '../context/ProfileContext'
import Sidebar from '../components/Sidebar'

const METRICS = [
  { key: 'calls',      label: 'Calls',       icon: '📞' },
  { key: 'emails',     label: 'Emails',       icon: '✉️' },
  { key: 'meetings',   label: 'Meetings',     icon: '🤝' },
  { key: 'notes',      label: 'Notes',        icon: '📝' },
  { key: 'proposals',  label: 'Proposals',    icon: '📄' },
  { key: 'deals_won',  label: 'Deals Won',    icon: '🏆' },
]

const PERIODS = [
  { key: 'weekly',  label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
]

function periodStart(key) {
  const now = new Date()
  if (key === 'weekly') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(now)
    mon.setDate(diff)
    mon.setHours(0, 0, 0, 0)
    return mon.toISOString()
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

function ProgressBar({ value, target }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null
  const color = pct === null ? 'bg-fp-inset' : pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="w-full bg-fp-inset rounded-full h-1.5 mt-1.5">
      {pct !== null && (
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}

export default function SalesKPI({ isAdmin, isSalesManager, featureProposals = true, featureCRM = false }) {
  const { profile } = useProfile()
  const canManage = isAdmin || isSalesManager

  const [period, setPeriod] = useState('monthly')
  const [reps, setReps] = useState([])
  const [activities, setActivities] = useState([])
  const [meetings, setMeetings] = useState([])
  const [proposals, setProposals] = useState([])
  const [targets, setTargets] = useState([]) // rep_kpi_targets rows
  const [loading, setLoading] = useState(true)

  // Target editing state (manager only)
  const [editingRep, setEditingRep] = useState(null)
  const [targetDraft, setTargetDraft] = useState({})
  const [savingTarget, setSavingTarget] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  // Drilldown modal
  const [drilldown, setDrilldown] = useState(null) // { rep, metricKey }
  const [drilldownData, setDrilldownData] = useState([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  useEffect(() => {
    if (!profile?.org_id) return
    load()
  }, [profile?.org_id, period])

  const load = async () => {
    setLoading(true)
    const start = periodStart(period)
    const orgId = profile.org_id

    const [
      { data: repData },
      { data: actData },
      { data: mtgData },
      { data: propData },
      { data: tgtData },
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name, org_role, role').eq('org_id', orgId).order('full_name'),
      supabase.from('activities').select('user_id, type, created_at').eq('org_id', orgId).gte('created_at', start).not('source', 'eq', 'system'),
      supabase.from('tasks').select('assigned_to, created_at').eq('org_id', orgId).gte('created_at', start).not('meeting_type', 'is', null),
      supabase.from('proposals').select('user_id, status, created_at').eq('org_id', orgId).gte('created_at', start),
      supabase.from('rep_kpi_targets').select('*').eq('org_id', orgId).eq('period_type', period),
    ])

    setReps(repData || [])
    setActivities(actData || [])
    setMeetings(mtgData || [])
    setProposals(propData || [])
    setTargets(tgtData || [])
    setLoading(false)
  }

  // Compute actuals per rep
  const actuals = useMemo(() => {
    const map = {}
    ;(reps || []).forEach(r => { map[r.id] = { calls: 0, emails: 0, meetings: 0, notes: 0, proposals: 0, deals_won: 0 } })
    activities.forEach(a => {
      if (!map[a.user_id]) return
      if (a.type === 'call') map[a.user_id].calls++
      else if (a.type === 'email') map[a.user_id].emails++
      else if (a.type === 'meeting') map[a.user_id].meetings++
      else if (a.type === 'note') map[a.user_id].notes++
    })
    meetings.forEach(m => {
      if (!map[m.assigned_to]) return
      map[m.assigned_to].meetings++
    })
    proposals.forEach(p => {
      if (!map[p.user_id]) return
      map[p.user_id].proposals++
      if (p.status === 'Won') map[p.user_id].deals_won++
    })
    return map
  }, [reps, activities, meetings, proposals])

  // Target lookup helper
  const getTarget = (repId, metric) => {
    const t = targets.find(t => t.rep_id === repId && t.metric_type === metric)
    return t?.target_value ?? null
  }

  const openEdit = (rep) => {
    const draft = {}
    METRICS.forEach(m => { draft[m.key] = getTarget(rep.id, m.key) ?? '' })
    setTargetDraft(draft)
    setEditingRep(rep.id)
  }

  const saveTargets = async () => {
    setSavingTarget(true)
    const upserts = METRICS
      .filter(m => targetDraft[m.key] !== '' && targetDraft[m.key] !== null)
      .map(m => ({
        org_id: profile.org_id,
        rep_id: editingRep,
        set_by: profile.id,
        metric_type: m.key,
        target_value: parseInt(targetDraft[m.key]) || 0,
        period_type: period,
        updated_at: new Date().toISOString(),
      }))

    if (upserts.length > 0) {
      await supabase.from('rep_kpi_targets').upsert(upserts, {
        onConflict: 'org_id,rep_id,metric_type,period_type',
        ignoreDuplicates: false,
      })
    }

    // Delete zeroed-out targets
    const zeroed = METRICS.filter(m => parseInt(targetDraft[m.key]) === 0 || targetDraft[m.key] === '')
    for (const m of zeroed) {
      await supabase.from('rep_kpi_targets')
        .delete()
        .eq('org_id', profile.org_id)
        .eq('rep_id', editingRep)
        .eq('metric_type', m.key)
        .eq('period_type', period)
    }

    setEditingRep(null)
    load()
    setSavingTarget(false)
  }

  // Only show non-tech reps (admins, managers, reps)
  const salesReps = useMemo(() =>
    (reps || []).filter(r => !['technician', 'tech'].includes(r.org_role || r.role)),
  [reps])

  const isMyView = !canManage

  const displayReps = isMyView ? salesReps.filter(r => r.id === profile?.id) : salesReps

  const openDrilldown = async (rep, metricKey) => {
    const metric = METRICS.find(m => m.key === metricKey)
    if (!metric) return
    setDrilldown({ rep, metricKey })
    setDrilldownData([])
    setDrilldownLoading(true)
    const start = periodStart(period)
    const orgId = profile.org_id

    if (['calls', 'emails', 'notes', 'meeting'].includes(metricKey)) {
      const typeMap = { calls: 'call', emails: 'email', notes: 'note', meeting: 'meeting' }
      const { data } = await supabase
        .from('activities')
        .select('id, title, body, created_at, type, clients(company, client_name), client_contacts(full_name)')
        .eq('org_id', orgId)
        .eq('user_id', rep.id)
        .eq('type', typeMap[metricKey])
        .gte('created_at', start)
        .order('created_at', { ascending: false })
      setDrilldownData(data || [])
    } else if (metricKey === 'meetings') {
      const [{ data: taskMtgs }, { data: actMtgs }] = await Promise.all([
        supabase.from('tasks')
          .select('id, title, meeting_type, due_date, created_at, clients(company, client_name), client_contacts(full_name, title)')
          .eq('org_id', orgId)
          .eq('assigned_to', rep.id)
          .not('meeting_type', 'is', null)
          .gte('created_at', start)
          .order('created_at', { ascending: false }),
        supabase.from('activities')
          .select('id, title, body, created_at, clients(company, client_name), client_contacts(full_name)')
          .eq('org_id', orgId)
          .eq('user_id', rep.id)
          .eq('type', 'meeting')
          .gte('created_at', start)
          .order('created_at', { ascending: false }),
      ])
      const combined = [
        ...(taskMtgs || []).map(t => ({ ...t, _source: 'task' })),
        ...(actMtgs || []).map(a => ({ ...a, _source: 'activity' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setDrilldownData(combined)
    } else if (metricKey === 'proposals' || metricKey === 'deals_won') {
      let q = supabase.from('proposals')
        .select('id, proposal_name, proposal_value, status, created_at, clients(company, client_name)')
        .eq('org_id', orgId)
        .eq('user_id', rep.id)
        .gte('created_at', start)
        .order('created_at', { ascending: false })
      if (metricKey === 'deals_won') q = q.eq('status', 'Won')
      const { data } = await q
      setDrilldownData(data || [])
    }

    setDrilldownLoading(false)
  }

  const toggleCollapse = (repId) =>
    setCollapsed(prev => ({ ...prev, [repId]: !prev[repId] }))

  const exportRepCSV = (rep) => {
    const stats = actuals[rep.id] || {}
    const periodLabel = PERIODS.find(p => p.key === period)?.label || period
    const rows = [
      ['Rep', 'Period', 'Metric', 'Actual', 'Target', '% to Target'],
      ...METRICS.map(m => {
        const actual = stats[m.key] ?? 0
        const target = getTarget(rep.id, m.key)
        const pct = target ? Math.round((actual / target) * 100) : ''
        return [rep.full_name, periodLabel, m.label, actual, target ?? '', pct]
      })
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rep.full_name.replace(/\s+/g, '_')}_KPIs_${periodLabel.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} isSalesManager={isSalesManager} />
    <div className="flex-1 p-6 space-y-6 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-fp-text font-bold text-2xl">Sales KPIs</h1>
          <p className="text-fp-muted text-sm mt-0.5">Activity targets and actuals per rep</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${period === p.key ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-fp-muted text-sm">Loading...</div>
      ) : displayReps.length === 0 ? (
        <div className="text-fp-muted text-sm">No reps found.</div>
      ) : (
        <div className="space-y-4">
          {displayReps.map(rep => {
            const stats = actuals[rep.id] || {}
            const isEditing = editingRep === rep.id
            const isCollapsed = collapsed[rep.id] && !isEditing
            const hasAnyTarget = METRICS.some(m => getTarget(rep.id, m.key) !== null)
            return (
              <div key={rep.id} className="bg-fp-card rounded-xl border border-fp-border">
                {/* Header — always visible */}
                <div className="flex items-center justify-between p-5" style={{ paddingBottom: isCollapsed ? undefined : '1rem' }}>
                  <button
                    onClick={() => canManage && toggleCollapse(rep.id)}
                    className={`flex items-center gap-2 text-left ${canManage ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {canManage && (
                      <span className="text-fp-muted text-xs select-none">{isCollapsed ? '+' : '−'}</span>
                    )}
                    <div>
                      <p className="text-fp-text font-bold">{rep.full_name}</p>
                      <p className="text-fp-muted text-xs capitalize">{rep.org_role || rep.role || 'rep'}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {canManage && !isEditing && !isCollapsed && (
                      <>
                        <button onClick={() => exportRepCSV(rep)}
                          className="text-fp-muted hover:text-fp-text text-xs transition-colors px-3 py-1.5 rounded-lg bg-fp-inset">
                          Export CSV
                        </button>
                        <button onClick={() => openEdit(rep)}
                          className="text-fp-muted hover:text-fp-text text-xs transition-colors px-3 py-1.5 rounded-lg bg-fp-inset">
                          {hasAnyTarget ? 'Edit Targets' : 'Set Targets'}
                        </button>
                      </>
                    )}
                    {canManage && !isEditing && isCollapsed && (
                      <button onClick={() => exportRepCSV(rep)}
                        className="text-fp-muted hover:text-fp-text text-xs transition-colors px-3 py-1.5 rounded-lg bg-fp-inset">
                        Export CSV
                      </button>
                    )}
                    {canManage && isEditing && (
                      <div className="flex gap-2">
                        <button onClick={() => setEditingRep(null)} className="text-fp-muted hover:text-fp-text text-xs transition-colors">Cancel</button>
                        <button onClick={saveTargets} disabled={savingTarget}
                          className="bg-fp-brand text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                          {savingTarget ? 'Saving...' : 'Save Targets'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {!isCollapsed && isEditing ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-5 pb-5">
                    {METRICS.map(m => (
                      <div key={m.key} className="bg-fp-inset rounded-lg p-3">
                        <p className="text-fp-muted text-xs mb-2">{m.icon} {m.label} target ({period === 'weekly' ? 'week' : 'month'})</p>
                        <input
                          type="number" min="0"
                          value={targetDraft[m.key]}
                          onChange={e => setTargetDraft(prev => ({ ...prev, [m.key]: e.target.value }))}
                          placeholder="No target"
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                        />
                        <p className="text-fp-muted text-xs mt-1.5">Actual this {period === 'weekly' ? 'week' : 'month'}: <span className="text-fp-text font-semibold">{stats[m.key] ?? 0}</span></p>
                      </div>
                    ))}
                  </div>
                ) : !isCollapsed ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-5 pb-5">
                    {METRICS.map(m => {
                      const actual = stats[m.key] ?? 0
                      const target = getTarget(rep.id, m.key)
                      const pct = target ? Math.min(100, Math.round((actual / target) * 100)) : null
                      return (
                        <button
                          key={m.key}
                          onClick={() => actual > 0 && openDrilldown(rep, m.key)}
                          className={`bg-fp-inset rounded-lg p-3 text-left transition-colors ${actual > 0 ? 'hover:bg-fp-border cursor-pointer' : 'cursor-default'}`}
                        >
                          <p className="text-fp-muted text-xs mb-1">{m.icon} {m.label}</p>
                          <div className="flex items-baseline gap-1">
                            <span className={`font-bold text-xl tabular-nums ${actual > 0 ? 'text-fp-brand' : 'text-fp-text'}`}>{actual}</span>
                            {target !== null && (
                              <span className="text-fp-muted text-xs">/ {target}</span>
                            )}
                          </div>
                          {target !== null && (
                            <>
                              <ProgressBar value={actual} target={target} />
                              <p className={`text-xs mt-1 font-semibold ${pct >= 100 ? 'text-green-400' : pct >= 60 ? 'text-yellow-500' : 'text-red-400'}`}>
                                {pct}%
                              </p>
                            </>
                          )}
                          {target === null && (
                            <p className="text-fp-muted text-xs mt-1">{actual > 0 ? 'Click to view' : 'No activity'}</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
    </div>

    {/* Drilldown modal */}
    {drilldown && (
      <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4" onClick={() => setDrilldown(null)}>
        <div
          className="bg-fp-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between p-5 border-b border-fp-border shrink-0">
            <div>
              <p className="text-fp-text font-bold">
                {METRICS.find(m => m.key === drilldown.metricKey)?.icon}{' '}
                {METRICS.find(m => m.key === drilldown.metricKey)?.label}
              </p>
              <p className="text-fp-muted text-xs mt-0.5">
                {drilldown.rep.full_name} · {PERIODS.find(p => p.key === period)?.label}
              </p>
            </div>
            <button onClick={() => setDrilldown(null)} className="text-fp-muted hover:text-fp-text text-xl leading-none">×</button>
          </div>

          {/* Modal body */}
          <div className="overflow-y-auto p-5 space-y-2">
            {drilldownLoading ? (
              <p className="text-fp-muted text-sm">Loading...</p>
            ) : drilldownData.length === 0 ? (
              <p className="text-fp-muted text-sm">No records found.</p>
            ) : drilldownData.map((row, i) => {
              const isProposal = drilldown.metricKey === 'proposals' || drilldown.metricKey === 'deals_won'
              const isTask = row._source === 'task'
              const client = row.clients?.company || row.clients?.client_name || ''
              const contact = row.client_contacts?.full_name || ''
              const date = isProposal
                ? new Date(row.created_at).toLocaleDateString()
                : isTask
                  ? (row.due_date || new Date(row.created_at).toLocaleDateString())
                  : new Date(row.created_at).toLocaleDateString()

              return (
                <div key={row.id ?? i} className="bg-fp-inset rounded-lg p-3">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-fp-text text-sm font-medium leading-snug">
                      {isProposal ? row.proposal_name : row.title}
                    </p>
                    <span className="text-fp-muted text-xs shrink-0">{date}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 mt-1">
                    {client && <span className="text-fp-muted text-xs">🏢 {client}</span>}
                    {contact && <span className="text-fp-muted text-xs">🤝 {contact}</span>}
                    {isTask && row.meeting_type && <span className="text-fp-muted text-xs">📅 {row.meeting_type}</span>}
                    {isProposal && row.proposal_value > 0 && (
                      <span className="text-fp-muted text-xs">💰 ${row.proposal_value.toLocaleString()}</span>
                    )}
                    {isProposal && <span className="text-fp-muted text-xs">{row.status}</span>}
                  </div>
                  {!isProposal && row.body && (
                    <p className="text-fp-muted text-xs mt-1 italic line-clamp-2">{row.body}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

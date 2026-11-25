import { useMemo } from 'react'
import { useDash } from '../context'
import { Card, Empty, Ring, Donut, LegendRow, Row, Eyebrow } from '../ui'
import { money, plural, daysUntil, shortDate, C, SERIES } from '../util'

const CLOSED = ['Completed', 'Cancelled', 'On Hold']
const isActiveJob = (j) => !CLOSED.includes(j.status)
const progressOf = (j) => {
  const items = j.job_checklist_items || []
  const done = items.filter(i => i.completed).length
  return { done, total: items.length, pct: items.length ? Math.round(done / items.length * 100) : 0 }
}
const isOverdue = (j) => isActiveJob(j) && j.end_date && new Date(j.end_date + 'T23:59:59') < new Date()

export function OpsNumbers() {
  const { data, go } = useDash()
  const jobs = data.jobs || []
  const hours = (data.techLogs || []).reduce((s, l) => s + (l.hours_worked || 0), 0)
  const overdue = jobs.filter(isOverdue).length
  const posOut = (data.purchaseOrders || []).filter(p => p.status === 'Sent' || p.status === 'Partial').length
  const tiles = [
    { label: 'Active jobs', value: jobs.filter(isActiveJob).length, to: '/jobs' },
    { label: 'On hold', value: jobs.filter(j => j.status === 'On Hold').length, to: '/jobs', warn: true },
    { label: 'Completed', value: jobs.filter(j => j.status === 'Completed').length, to: '/jobs' },
    { label: 'Hours, last 7 days', value: hours.toFixed(1), to: '/tech-log' },
    { label: 'Overdue jobs', value: overdue, to: '/jobs', bad: overdue > 0 },
    { label: 'POs outstanding', value: posOut, to: '/purchase-orders', warn: posOut > 0 },
  ]
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
      {tiles.map(t => (
        <button key={t.label} onClick={() => go(t.to)} className="text-left bg-fp-card border border-fp-border hover:border-fp-brand/50 rounded-2xl px-4 py-4 transition-colors">
          <Eyebrow>{t.label}</Eyebrow>
          <p className={`text-[22px] font-bold tabular-nums mt-1 ${t.bad ? 'text-red-500' : t.warn && Number(t.value) > 0 ? 'text-amber-500' : 'text-fp-text'}`}>{t.value}</p>
        </button>
      ))}
    </div>
  )
}

export function OpsAlerts() {
  const { data, go } = useDash()
  const cos = data.changeOrders || []
  const overdue = (data.jobs || []).filter(isOverdue)
  if (!cos.length && !overdue.length) return null
  return (
    <Card title="Needs attention" tone="warn">
      <div className="grid gap-4 md:grid-cols-2">
        {cos.length > 0 && (
          <div className="flex flex-col">
            <Eyebrow>{plural(cos.length, 'change order')} waiting for approval</Eyebrow>
            {cos.slice(0, 6).map(co => <Row key={co.id} onClick={() => go(co.job_id ? `/jobs/${co.job_id}` : '/jobs')} title={co.jobs?.name || 'Job'} sub={co.title || co.description || 'Change order'} right={<span className="text-amber-500 text-xs font-semibold">Review</span>} />)}
          </div>
        )}
        {overdue.length > 0 && (
          <div className="flex flex-col">
            <Eyebrow>{plural(overdue.length, 'job')} past end date</Eyebrow>
            {overdue.slice(0, 6).map(j => <Row key={j.id} onClick={() => go(`/jobs/${j.id}`)} title={j.name} sub={j.clients?.company} right={<span className="text-red-500 text-xs font-semibold">{-daysUntil(j.end_date + 'T23:59:59')}d overdue</span>} />)}
          </div>
        )}
      </div>
    </Card>
  )
}

export function ActiveJobs() {
  const { data, go } = useDash()
  const byId = useMemo(() => new Map((data.proposals || []).map(p => [p.id, p])), [data.proposals])
  const jobs = (data.jobs || []).filter(isActiveJob)
  return (
    <Card title="Active jobs" sub={plural(jobs.length, 'job')} action={{ label: 'All jobs', onClick: () => go('/jobs') }}>
      {jobs.length === 0 ? <Empty>No active jobs. Jobs are created when proposals are won.</Empty> : (
        <div className="flex flex-col max-h-[440px] overflow-y-auto">
          {jobs.map(j => {
            const pr = progressOf(j), late = isOverdue(j), val = byId.get(j.proposal_id)?.proposal_value
            return (
              <Row key={j.id} onClick={() => go(`/jobs/${j.id}`)}
                lead={<Ring size={40} stroke={4.5} pct={pr.pct} color={late ? C.red : pr.pct === 100 ? C.green : C.brand} center={<span className="text-[10px]">{pr.pct}</span>} />}
                title={<>{j.name}{late && <span className="text-red-500 text-[11px] font-semibold ml-2">OVERDUE</span>}</>}
                sub={[j.clients?.company, `${pr.done}/${pr.total} tasks`, j.end_date ? `ends ${shortDate(j.end_date)}` : null].filter(Boolean).join(' · ')}
                right={val ? <span className="text-fp-text text-sm font-semibold tabular-nums">{money(val)}</span> : null} />
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function CostVsBudget() {
  const { data, go } = useDash()
  const byId = useMemo(() => new Map((data.proposals || []).map(p => [p.id, p])), [data.proposals])
  const rows = (data.jobs || []).filter(isActiveJob).map(j => ({ j, p: byId.get(j.proposal_id) })).filter(r => r.p?.proposal_value)
  return (
    <Card title="Cost vs budget" sub="Active jobs, from the won proposal">
      {rows.length === 0 ? <Empty>No budget data on active jobs.</Empty> : (
        <div className="flex flex-col max-h-[440px] overflow-y-auto">
          {rows.map(({ j, p }) => {
            const budget = p.proposal_value || 0, cost = p.total_your_cost || 0, margin = p.total_gross_margin_percent || 0
            return (
              <Row key={j.id} onClick={() => go(`/jobs/${j.id}`)}
                lead={<Ring size={40} stroke={4.5} pct={budget ? cost / budget * 100 : 0} color={margin >= 30 ? C.green : margin >= 15 ? C.orange : C.red} />}
                title={j.name} sub={`Revenue ${money(budget)} · cost ${money(cost)}`}
                right={<span className={`text-xs font-bold tabular-nums ${margin >= 30 ? 'text-green-500' : margin >= 15 ? 'text-fp-brand' : 'text-red-500'}`}>{margin.toFixed(1)}%</span>} />
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function HoursThisWeek() {
  const { data, go } = useDash()
  const segs = useMemo(() => {
    const jobName = new Map((data.jobs || []).map(j => [j.id, j.name]))
    const m = new Map()
    ;(data.techLogs || []).forEach(l => {
      const r = m.get(l.job_id) || { key: l.job_id || 'none', label: jobName.get(l.job_id) || 'Other', value: 0, logs: 0 }
      r.value += l.hours_worked || 0; r.logs++
      m.set(l.job_id, r)
    })
    return [...m.values()].sort((a, b) => b.value - a.value).map((r, i) => ({ ...r, color: SERIES[i % SERIES.length] }))
  }, [data.jobs, data.techLogs])
  const total = segs.reduce((s, x) => s + x.value, 0)
  return (
    <Card title="Hours logged" sub="Last 7 days, by job" action={{ label: 'Full log', onClick: () => go('/tech-log') }}>
      {total === 0 ? <Empty>No hours logged in the last 7 days.</Empty> : (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="mx-auto"><Donut size={132} thickness={18} segments={segs} ariaLabel={segs.map(s => `${s.label} ${s.value.toFixed(1)} hours`).join(', ')}
            center={<div><p className="text-fp-text text-lg font-bold tabular-nums">{total.toFixed(1)}</p><p className="text-fp-muted text-[11px]">hours</p></div>} /></div>
          <div className="flex-1 min-w-[180px] max-h-[220px] overflow-y-auto">
            {segs.map(s => <LegendRow key={s.key} color={s.color} label={s.label} meta={plural(s.logs, 'log')} value={`${s.value.toFixed(1)} h`} />)}
          </div>
        </div>
      )}
    </Card>
  )
}

export function Deadlines() {
  const { data, go } = useDash()
  const jobs = (data.jobs || []).filter(j => !['Completed', 'Cancelled'].includes(j.status) && j.end_date)
    .sort((a, b) => new Date(a.end_date) - new Date(b.end_date)).slice(0, 8)
  return (
    <Card title="Upcoming deadlines">
      {jobs.length === 0 ? <Empty>No jobs with end dates set.</Empty> : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {jobs.map(j => {
            const d = daysUntil(j.end_date + 'T23:59:59'), pr = progressOf(j)
            const color = d < 0 ? C.red : d <= 7 ? C.amber : C.slate
            return (
              <button key={j.id} onClick={() => go(`/jobs/${j.id}`)} className="text-left bg-fp-inset/60 hover:bg-fp-hover rounded-xl p-3 flex items-center gap-3 transition-colors">
                <Ring size={44} stroke={4.5} pct={pr.pct} color={d < 0 ? C.red : C.brand} center={<span className="text-[10px]">{pr.pct}</span>} />
                <div className="min-w-0">
                  <p className="text-fp-text text-sm font-semibold truncate">{j.name}</p>
                  <p className="text-xs font-semibold" style={{ color }}>{d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `${d}d left`} <span className="text-fp-muted font-normal">· {shortDate(j.end_date)}</span></p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

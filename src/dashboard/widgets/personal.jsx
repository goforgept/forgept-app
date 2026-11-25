import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { indexGoals, recurringGoal, ACTIVITY_METRICS } from '../../lib/goals'
import { useDash } from '../context'
import { Card, Empty, Ring, Chip } from '../ui'
import { pval, money, plural, todayYMD, STAGE_COLOR, C } from '../util'

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtTime = (t) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`
}

// ── Agenda (my meetings and tasks) ───────────────────────────────────────────
export function Agenda() {
  const { data, go } = useDash()
  const tasks = data.tasks || []
  const today = todayYMD()
  const days = useMemo(() => {
    const out = [], d = new Date()
    while (out.length < 5) {
      const dow = d.getDay()
      if (out.length === 0 || (dow !== 0 && dow !== 6)) out.push(ymd(d))
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [])
  const [sel, setSel] = useState(days[0])
  const overdue = tasks.filter(t => t.due_date < today)
  const dayItems = tasks.filter(t => t.due_date === sel).sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'))
  const count = (d) => tasks.filter(t => t.due_date === d).length

  return (
    <Card title="Agenda" action={{ label: 'Tasks', onClick: () => go('/tasks') }}>
      <div className="grid grid-cols-5 gap-1.5">
        {days.map(d => {
          const dt = new Date(d + 'T12:00:00'), active = d === sel, n = count(d)
          return (
            <button key={d} onClick={() => setSel(d)} aria-pressed={active}
              className={`rounded-xl py-2 text-center transition-colors ${active ? 'bg-fp-brand text-white' : 'hover:bg-fp-hover text-fp-text'}`}>
              <span className={`block text-[11px] font-semibold ${active ? 'text-white/80' : 'text-fp-muted'}`}>{dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
              <span className="block text-base font-bold tabular-nums">{dt.getDate()}</span>
              <span className={`block text-[9px] leading-none h-2 tracking-widest ${active ? 'text-white' : 'text-fp-brand'}`}>{'●'.repeat(Math.min(n, 4))}</span>
            </button>
          )
        })}
      </div>
      {overdue.length > 0 && (
        <button onClick={() => go('/tasks')} className="text-left text-xs font-semibold text-red-500">{plural(overdue.length, 'task')} overdue →</button>
      )}
      {dayItems.length === 0 ? <Empty>{sel === today ? 'Nothing scheduled today.' : 'Nothing scheduled.'}</Empty> : (
        <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto">
          {dayItems.map(t => {
            const meeting = !!t.meeting_type
            const color = meeting ? C.blue : t.priority === 'high' || t.priority === 'urgent' ? C.orange : C.violet
            return (
              <button key={t.id} onClick={() => go('/tasks')} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 text-left items-start">
                <span className="text-fp-muted text-xs tabular-nums pt-0.5">{fmtTime(t.start_time) || (meeting ? 'All day' : 'Task')}</span>
                <span className="border-l-[3px] pl-2.5 min-w-0" style={{ borderColor: color }}>
                  <span className="block text-fp-text text-sm font-semibold truncate">{t.title}</span>
                  <span className="block text-fp-muted text-xs truncate">{[t.meeting_type, t.clients?.company].filter(Boolean).join(' · ') || 'Task'}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ── My activity vs goals ─────────────────────────────────────────────────────
const ACT_COLOR = { calls: C.blue, emails: C.green, meetings: C.violet, notes: C.teal, proposals: C.orange, deals_won: C.amber }

function periodRange(period, offset) {
  const now = new Date()
  if (period === 'week') {
    const day = now.getDay()
    const start = new Date(now); start.setDate(now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(start.getDate() + 7)
    const label = offset === 0 ? 'This week' : offset === -1 ? 'Last week'
      : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(end - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    return { start, end, label }
  }
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  return { start, end, label: offset === 0 ? 'This month' : offset === -1 ? 'Last month' : start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
}

export function ActivityGoals() {
  const { profile, data } = useDash()
  const [period, setPeriod] = useState('week')
  const [offset, setOffset] = useState(0)
  const [actuals, setActuals] = useState(null)
  const userId = profile?.id, orgId = profile?.org_id
  const range = periodRange(period, offset)

  useEffect(() => {
    if (!userId || !orgId) return
    let cancelled = false
    const { start, end } = periodRange(period, offset)
    const s = start.toISOString(), e = end.toISOString()
    setActuals(null)
    Promise.all([
      supabase.from('activities').select('type').eq('org_id', orgId).eq('user_id', userId).gte('created_at', s).lt('created_at', e).not('source', 'eq', 'system').limit(5000),
      supabase.from('tasks').select('id').eq('org_id', orgId).eq('assigned_to', userId).gte('created_at', s).lt('created_at', e).not('meeting_type', 'is', null),
      supabase.from('proposals').select('status').eq('org_id', orgId).eq('user_id', userId).gte('created_at', s).lt('created_at', e),
    ]).then(([{ data: acts }, { data: mtgs }, { data: props }]) => {
      if (cancelled) return
      const a = { calls: 0, emails: 0, meetings: (mtgs || []).length, notes: 0, proposals: (props || []).length, deals_won: 0 }
      ;(acts || []).forEach(x => {
        if (x.type === 'call') a.calls++
        else if (x.type === 'email') a.emails++
        else if (x.type === 'meeting') a.meetings++
        else if (x.type === 'note') a.notes++
      })
      ;(props || []).forEach(p => { if (p.status === 'Won') a.deals_won++ })
      setActuals(a)
    })
    return () => { cancelled = true }
  }, [userId, orgId, period, offset])

  const goals = useMemo(() => {
    const idx = indexGoals(data.goals || [])
    return Object.fromEntries(ACTIVITY_METRICS.map(m => [m.key, recurringGoal(idx, userId, m.key, period)]))
  }, [data.goals, userId, period])

  return (
    <Card title="My activity" right={
      <div className="flex items-center gap-1.5">
        <button onClick={() => setOffset(o => o - 1)} aria-label="Previous period" className="text-fp-muted hover:text-fp-text px-1">‹</button>
        <span className="text-fp-muted text-xs w-24 text-center">{range.label}</span>
        <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset >= 0} aria-label="Next period" className="text-fp-muted hover:text-fp-text px-1 disabled:opacity-30">›</button>
        <div className="flex rounded-lg overflow-hidden border border-fp-border ml-1">
          {[['week', 'Wk'], ['month', 'Mo']].map(([k, l]) => (
            <button key={k} onClick={() => { setPeriod(k); setOffset(0) }}
              className={`px-2.5 py-1 text-xs font-semibold ${period === k ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text'}`}>{l}</button>
          ))}
        </div>
      </div>
    }>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
        {ACTIVITY_METRICS.map(m => {
          const n = actuals?.[m.key] ?? 0, goal = goals[m.key]
          return (
            <div key={m.key} className="flex items-center gap-3">
              {actuals == null
                ? <div className="w-14 h-14 rounded-full bg-fp-inset animate-pulse" />
                : <Ring size={56} pct={goal ? n / goal * 100 : 0} color={goal && n >= goal ? C.green : ACT_COLOR[m.key]} center={n} />}
              <div className="min-w-0">
                <p className="text-fp-text text-sm font-semibold">{m.label}</p>
                <p className="text-fp-muted text-xs tabular-nums">{goal ? `goal ${goal}` : 'no goal'}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── Proposals list (search + status filter) ──────────────────────────────────
export function ProposalList() {
  const { data, isTeam, go } = useDash()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [limit, setLimit] = useState(15)
  const all = data.proposals || []
  const rows = all.filter(p => status === 'All' || p.status === status).filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return [p.proposal_name, p.company, p.client_name, p.rep_name].some(v => v?.toLowerCase().includes(s))
  })
  return (
    <Card title={isTeam ? 'Recent proposals' : 'My proposals'} sub={`${rows.length} of ${all.length}`}
      right={<button onClick={() => go('/new')} className="bg-fp-brand text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90">+ New proposal</button>}>
      <div className="flex flex-col sm:flex-row gap-2">
        <input id="dash-proposal-search" type="search" placeholder="Search by name or company" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder:text-fp-muted" />
        <div className="flex gap-1 overflow-x-auto">
          {['All', 'Draft', 'Sent', 'Won', 'Lost'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${status === s ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text border border-fp-border'}`}>{s}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? <Empty>No proposals found.</Empty> : (
        <div className="flex flex-col">
          {rows.slice(0, limit).map(p => (
            <button key={p.id} onClick={() => go(`/proposal/${p.id}`)}
              className="flex items-center gap-3 text-left border-t border-fp-border/60 first:border-t-0 py-2.5 hover:bg-fp-hover/50 rounded-md px-1 -mx-1">
              <span className="flex-1 min-w-0">
                <span className="block text-fp-text text-sm font-semibold truncate">{p.proposal_name || 'Untitled'}</span>
                <span className="block text-fp-muted text-xs truncate">{[p.company, p.rep_name].filter(Boolean).join(' · ')}</span>
              </span>
              {p.total_gross_margin_percent ? <span className="hidden sm:block text-fp-muted text-xs tabular-nums">{p.total_gross_margin_percent.toFixed(1)}%</span> : null}
              <Chip color={STAGE_COLOR[p.status] || C.slate}>{p.status}</Chip>
              <span className="text-fp-text text-sm font-semibold tabular-nums w-24 text-right">{money(pval(p))}</span>
              {p.close_date && <span className="hidden md:block text-fp-muted text-xs tabular-nums w-20 text-right">{p.close_date}</span>}
            </button>
          ))}
          {rows.length > limit && <button onClick={() => setLimit(l => l + 25)} className="text-fp-muted hover:text-fp-text text-xs mt-2">Show more</button>}
        </div>
      )}
    </Card>
  )
}

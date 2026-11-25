import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'
import {
  GOAL_GROUPS, ACTIVITY_METRICS, OPS_METRICS, fetchGoals, indexGoals, monthTarget, rangeTarget, yearValue,
  recurringGoal, saveGoals, monthStart, yearStart, fmtMoney,
} from '../../lib/goals'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const cellCls = 'w-full min-w-[72px] bg-fp-inset text-fp-text border border-fp-border rounded-md px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-fp-brand disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-fp-muted/60'
const parseNum = (s) => {
  if (s === null || s === undefined) return null
  const t = String(s).replace(/[$,%\s]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const dkey = (pid, metric, periodType, periodStart) => `${pid || 'org'}|${metric}|${periodType}|${periodStart || '*'}`

export default function GoalsTab({ focusProfileId = null }) {
  const { profile } = useProfile()
  const orgId = profile?.org_id
  const isAdmin = profile?.org_role === 'admin' || profile?.role === 'admin' || profile?.org_roles?.is_admin
  const isSalesManager = [profile?.org_role, profile?.role, profile?.org_roles?.base_role].includes('sales_manager')
  const canEdit = isAdmin || isSalesManager

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [group, setGroup] = useState('revenue_won')
  const [view, setView] = useState('quarter')       // 'month' | 'quarter'
  const [actPeriod, setActPeriod] = useState('week') // activity: 'week' | 'month'
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [actuals, setActuals] = useState({})        // last-year actuals: { [pid|'org']: { revenue_won, deals_won, pipeline_created, byMonth: [12] } }
  const [drafts, setDrafts] = useState({})          // dkey → string
  const [typing, setTyping] = useState({})          // raw text of the grid cell being typed in
  const [editPast, setEditPast] = useState(false)
  const [annual, setAnnual] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const [goalRows, { data: profs }] = await Promise.all([
      fetchGoals(orgId),
      supabase.from('profiles').select('id, full_name, email, role, org_role, region_id, is_superadmin, org_roles(base_role)').eq('org_id', orgId).order('full_name'),
    ])
    const regionScoped = !isAdmin && isSalesManager && profile?.region_id && profile?.organizations?.feature_regions
    setPeople((profs || [])
      .filter(p => !p.is_superadmin)
      .filter(p => !regionScoped || p.region_id === profile.region_id)
      .map(p => ({ ...p, isTech: [p.role, p.org_role, p.org_roles?.base_role].includes('technician') })))
    setRows(goalRows)
    setDrafts({})
    setLoading(false)
  }
  useEffect(() => { load() }, [orgId])

  // Last year's actuals, for context and the "like last year" split
  useEffect(() => {
    if (!orgId) return
    const ly = year - 1
    ;(async () => {
      const out = { org: { revenue_won: 0, deals_won: 0, pipeline_created: 0, byMonth: Array(12).fill(0) } }
      const bump = (pid, k, v) => { (out[pid] ||= { revenue_won: 0, deals_won: 0, pipeline_created: 0, byMonth: Array(12).fill(0) })[k] += v }
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('proposals')
          .select('user_id, status, proposal_value, subtotal_value, created_at, close_date, updated_at')
          .eq('org_id', orgId).eq('is_current_revision', true)
          .gte('created_at', `${ly - 1}-01-01`).range(from, from + 999)
        for (const p of data || []) {
          const v = Number(p.subtotal_value ?? p.proposal_value) || 0
          if (p.created_at?.startsWith(String(ly))) { bump(p.user_id, 'pipeline_created', v); bump('org', 'pipeline_created', v) }
          const wonOn = p.close_date || p.updated_at
          if (p.status === 'Won' && wonOn?.startsWith(String(ly))) {
            bump(p.user_id, 'revenue_won', v); bump('org', 'revenue_won', v)
            bump(p.user_id, 'deals_won', 1); bump('org', 'deals_won', 1)
            out.org.byMonth[Number(wonOn.slice(5, 7)) - 1] += v
          }
        }
        if (!data || data.length < 1000) break
      }
      setActuals(out)
    })()
  }, [orgId, year])

  const idx = useMemo(() => indexGoals(rows), [rows])
  const meta = GOAL_GROUPS.find(g => g.key === group)
  const sellers = people.filter(p => !p.isTech)
  const techs = people.filter(p => p.isTech)
  const visibleSellers = focusProfileId ? people.filter(p => p.id === focusProfileId) : sellers
  const visibleTechs = focusProfileId ? people.filter(p => p.id === focusProfileId) : techs
  const dirty = Object.keys(drafts).length > 0

  const isPastMonth = (m) => !editPast && (year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth()))
  const fmt = (v) => v == null ? '' : meta?.kind === 'money' ? fmtMoney(v) : String(Math.round(v * 100) / 100)

  // ── Period metric cells ───────────────────────────────────────────────────
  const monthVal = (pid, m) => {
    const d = drafts[dkey(pid, group, 'month', monthStart(year, m))]
    if (d !== undefined) return parseNum(d)
    return monthTarget(idx, pid, group, year, m)
  }
  const colValue = (pid, col) => {
    if (view === 'month') return monthVal(pid, col)
    let t = 0, any = false
    for (let m = col * 3; m < col * 3 + 3; m++) { const v = monthVal(pid, m); if (v != null && !Number.isNaN(v)) { t += v; any = true } }
    return any ? t : null
  }
  const yearTotal = (pid) => {
    let t = 0, any = false
    for (let m = 0; m < 12; m++) { const v = monthVal(pid, m); if (v != null && !Number.isNaN(v)) { t += v; any = true } }
    return any ? t : null
  }
  const setMonths = (pid, months, total) => {
    const n = parseNum(total)
    setDrafts(prev => {
      const next = { ...prev }
      for (const m of months) {
        const per = n == null || Number.isNaN(n) ? '' : meta.kind === 'money' ? String(Math.round(n / months.length)) : String(Math.round((n / months.length) * 100) / 100)
        next[dkey(pid, group, 'month', monthStart(year, m))] = per
      }
      return next
    })
  }
  const tkey = (pid, col) => `${pid || 'org'}|${view}|${col}`
  const onCell = (pid, col, value) => {
    setTyping(prev => ({ ...prev, [tkey(pid, col)]: value }))
    setMonths(pid, view === 'month' ? [col] : [col * 3, col * 3 + 1, col * 3 + 2].filter(m => !isPastMonth(m)), value)
  }
  // Raw text while a cell is being typed in; the formatted value otherwise
  const cellDisplay = (pid, col) => typing[tkey(pid, col)] ?? fmt(colValue(pid, col))
  const clearTyping = () => setTyping({})
  const cols = view === 'month' ? MONTHS.map((l, i) => ({ label: l, i, past: isPastMonth(i) })) : [0, 1, 2, 3].map(q => ({ label: `Q${q + 1}`, i: q, past: [q * 3, q * 3 + 1, q * 3 + 2].every(isPastMonth) }))

  // Company: spread an annual number across open months
  const spread = (mode) => {
    const n = parseNum(annual)
    if (n == null || Number.isNaN(n)) { setMsg({ error: true, text: 'Enter the company target for the year first.' }); return }
    const seasonal = mode === 'seasonal' && actuals.org?.byMonth?.some(v => v > 0)
    const weights = seasonal ? actuals.org.byMonth : Array(12).fill(1)
    const total = weights.reduce((a, b) => a + b, 0)
    setDrafts(prev => {
      const next = { ...prev }
      for (let m = 0; m < 12; m++) {
        const v = n * weights[m] / total
        next[dkey(null, group, 'month', monthStart(year, m))] = meta.kind === 'money' ? String(Math.round(v)) : String(Math.round(v * 100) / 100)
      }
      return next
    })
    clearTyping()
    setMsg({ text: seasonal ? `Spread like ${year - 1}'s won revenue. Review and save.` : mode === 'seasonal' ? `No ${year - 1} sales to copy the pattern from, so it was spread evenly. Review and save.` : 'Spread evenly across the year. Review and save.' })
  }
  const splitToReps = () => {
    if (!sellers.length) return
    setDrafts(prev => {
      const next = { ...prev }
      for (let m = 0; m < 12; m++) {
        if (isPastMonth(m)) continue
        const c = monthVal(null, m)
        if (c == null || Number.isNaN(c)) continue
        const per = c / sellers.length
        for (const p of sellers) next[dkey(p.id, group, 'month', monthStart(year, m))] = meta.kind === 'money' ? String(Math.round(per)) : String(Math.round(per * 100) / 100)
      }
      return next
    })
    clearTyping()
    setMsg({ text: `Split the company target evenly across ${sellers.length} people. Review and save.` })
  }
  const copyLastYear = () => {
    const ly = year - 1
    setDrafts(prev => {
      const next = { ...prev }
      for (const pid of [null, ...sellers.map(p => p.id)]) {
        for (let m = 0; m < 12; m++) {
          if (isPastMonth(m)) continue
          const v = monthTarget(idx, pid, group, ly, m)
          if (v != null) next[dkey(pid, group, 'month', monthStart(year, m))] = meta.kind === 'money' ? String(Math.round(v)) : String(v)
        }
      }
      return next
    })
    clearTyping()
    setMsg({ text: `Copied ${ly}'s ${meta.label.toLowerCase()} targets. Review and save.` })
  }

  // ── Year / recurring cells ────────────────────────────────────────────────
  const draftOr = (k, stored) => drafts[k] !== undefined ? drafts[k] : (stored == null ? '' : String(Math.round(stored * 100) / 100))
  const setDraft = (k, v) => setDrafts(prev => ({ ...prev, [k]: v }))

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    const edits = []
    for (const [k, v] of Object.entries(drafts)) {
      const [pid, metric, periodType, ps] = k.split('|')
      const n = parseNum(v)
      if (Number.isNaN(n)) { setMsg({ error: true, text: `“${v}” isn’t a number.` }); return }
      edits.push({ profileId: pid === 'org' ? null : pid, metric, periodType, periodStart: ps === '*' ? null : ps, value: n })
    }
    setSaving(true); setMsg(null)
    const res = await saveGoals(orgId, profile.id, edits)
    setSaving(false)
    if (res.error) { setMsg({ error: true, text: res.error.includes('goal_targets') ? 'Goals table not found. Run the Goals SQL in Supabase first.' : res.error }); return }
    await load()
    clearTyping()
    setMsg({ text: 'Targets saved.' })
  }

  if (loading) return <p className="text-fp-muted text-sm">Loading…</p>

  const companyYear = yearTotal(null)
  const teamYear = sellers.reduce((s, p) => s + (yearTotal(p.id) || 0), 0)
  const gap = companyYear != null ? companyYear - teamYear : null

  return (
    <div className="space-y-6">
      {(
        <div className="flex flex-wrap items-end justify-between gap-4">
          {focusProfileId ? <p className="text-fp-muted text-sm">This person’s targets. The full team grid is in Settings → Goals &amp; Targets.</p> : <div>
            <h3 className="text-fp-text text-lg font-bold">Goals &amp; Targets</h3>
            <p className="text-fp-muted text-sm mt-1 max-w-2xl">Set targets once here. Dashboards, leaderboards and Sales KPI all measure against them. Reps see their own targets but can’t change them.</p>
          </div>}
          <div className="flex items-center gap-2">
            <label htmlFor="goals-year" className="text-fp-muted text-sm">Year</label>
            <select id="goals-year" value={year} onChange={e => { setYear(Number(e.target.value)); setDrafts({}); clearTyping() }}
              className="bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Metric tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Metric">
        {GOAL_GROUPS.map(g => (
          <button key={g.key} type="button" role="tab" aria-selected={group === g.key}
            onClick={() => { if (dirty && !window.confirm('You have unsaved changes on this tab. Switch anyway?')) return; setGroup(g.key); setDrafts({}); clearTyping(); setMsg(null); setAnnual('') }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${group === g.key ? 'bg-fp-brand/15 text-fp-brand border-fp-brand/40' : 'text-fp-muted border-fp-border hover:text-fp-text'}`}>
            {g.label}
          </button>
        ))}
      </div>

      {!canEdit && <p className="text-fp-muted text-sm">Only admins and sales managers can change targets.</p>}

      {/* ── Revenue / deals / pipeline ── */}
      {meta.scope === 'period' && (
        <>
          {!focusProfileId && (
            <div className="bg-fp-card rounded-xl p-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-3">
                <p className="text-fp-text font-semibold">Company target · {year}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input id="goals-annual" value={annual} onChange={e => setAnnual(e.target.value)} disabled={!canEdit}
                    placeholder={companyYear != null ? fmt(companyYear) : meta.kind === 'money' ? '$5,000,000' : '120'}
                    className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-base font-semibold tabular-nums w-48 focus:outline-none focus:border-fp-brand" aria-label={`Company ${meta.label} target for ${year}`} />
                  <button type="button" disabled={!canEdit} onClick={() => spread('even')} className="text-sm px-3 py-2 rounded-lg bg-fp-inset text-fp-text font-semibold disabled:opacity-50">Spread evenly</button>
                  <button type="button" disabled={!canEdit} onClick={() => spread('seasonal')} className="text-sm px-3 py-2 rounded-lg bg-fp-inset text-fp-text font-semibold disabled:opacity-50">Spread like {year - 1}</button>
                </div>
                {actuals.org && group !== 'gross_margin_pct' && (
                  <p className="text-fp-muted text-xs">{year - 1} actual: <span className="text-fp-text font-semibold tabular-nums">{fmt(actuals.org[group])}</span></p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs">Company</p><p className="text-fp-text font-bold tabular-nums mt-1">{fmt(companyYear) || '—'}</p></div>
                <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs">Assigned to people</p><p className="text-fp-text font-bold tabular-nums mt-1">{fmt(teamYear) || '—'}</p></div>
                <div className={`rounded-lg p-3 ${gap > 0 ? 'bg-fp-brand/10' : 'bg-fp-inset'}`}><p className="text-fp-muted text-xs">Not assigned</p><p className={`font-bold tabular-nums mt-1 ${gap > 0 ? 'text-fp-brand' : 'text-fp-text'}`}>{gap == null ? '—' : fmt(Math.max(gap, 0))}</p></div>
              </div>
            </div>
          )}

          <div className="bg-fp-card rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex p-0.5 rounded-lg bg-fp-inset border border-fp-border" role="group" aria-label="View">
                {[['quarter', 'Quarterly'], ['month', 'Monthly']].map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); clearTyping() }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${view === v ? 'bg-fp-card text-fp-text' : 'text-fp-muted'}`}>{l}</button>
                ))}
              </div>
              {canEdit && !focusProfileId && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={splitToReps} className="text-sm text-fp-brand font-semibold">Split company target across people</button>
                  <button type="button" onClick={copyLastYear} className="text-sm text-fp-muted hover:text-fp-text font-semibold">Copy {year - 1}</button>
                  <label className="inline-flex items-center gap-2 text-xs text-fp-muted cursor-pointer">
                    <input id="goals-edit-past" type="checkbox" checked={editPast} onChange={e => setEditPast(e.target.checked)} className="accent-[#C8622A]" /> Edit past months
                  </label>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="text-left text-fp-muted text-xs font-semibold pb-2 pr-3 min-w-[150px]">{focusProfileId ? '' : 'Person'}</th>
                    {cols.map(c => <th key={c.i} scope="col" className="text-right text-fp-muted text-xs font-semibold pb-2 px-1">{c.label}{c.past && <span className="sr-only"> (past)</span>}</th>)}
                    <th scope="col" className="text-right text-fp-muted text-xs font-semibold pb-2 pl-3">Year</th>
                    <th scope="col" className="text-right text-fp-muted text-xs font-semibold pb-2 pl-3 whitespace-nowrap">{year - 1} actual</th>
                  </tr>
                </thead>
                <tbody>
                  {!focusProfileId && (
                    <tr className="border-t border-fp-border bg-fp-inset/40">
                      <th scope="row" className="text-left py-2 pr-3 font-bold text-fp-text">Company</th>
                      {cols.map(c => (
                        <td key={c.i} className="py-1.5 px-1">
                          <input className={cellCls} value={cellDisplay(null, c.i)} disabled={!canEdit || c.past} aria-label={`Company, ${c.label}`}
                            onChange={e => onCell(null, c.i, e.target.value)} />
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right font-bold tabular-nums">{fmt(companyYear)}</td>
                      <td className="py-2 pl-3 text-right text-fp-muted tabular-nums">{fmt(actuals.org?.[group])}</td>
                    </tr>
                  )}
                  {visibleSellers.map(p => (
                    <tr key={p.id} className="border-t border-fp-border">
                      <th scope="row" className="text-left py-2 pr-3 font-semibold text-fp-text whitespace-nowrap">{p.full_name || p.email}</th>
                      {cols.map(c => (
                        <td key={c.i} className="py-1.5 px-1">
                          <input className={cellCls} value={cellDisplay(p.id, c.i)} disabled={!canEdit || c.past} aria-label={`${p.full_name || p.email}, ${c.label}`}
                            onChange={e => onCell(p.id, c.i, e.target.value)} />
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right font-semibold tabular-nums">{fmt(yearTotal(p.id))}</td>
                      <td className="py-2 pl-3 text-right text-fp-muted tabular-nums">{fmt(actuals[p.id]?.[group] ?? (actuals.org ? 0 : null))}</td>
                    </tr>
                  ))}
                  {!focusProfileId && sellers.length > 1 && (
                    <tr className="border-t-2 border-fp-border">
                      <th scope="row" className="text-left py-2 pr-3 font-bold text-fp-text">People total</th>
                      {cols.map(c => {
                        const t = sellers.reduce((s, p) => s + (colValue(p.id, c.i) || 0), 0)
                        const comp = colValue(null, c.i)
                        const short = comp != null && t < comp - 0.5
                        return <td key={c.i} className={`py-2 px-1 text-right font-semibold tabular-nums ${short ? 'text-fp-brand' : 'text-fp-text'}`} title={short ? `${fmt(comp - t)} not assigned` : undefined}>{fmt(t) || '—'}</td>
                      })}
                      <td className="py-2 pl-3 text-right font-bold tabular-nums">{fmt(teamYear)}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {view === 'quarter' && canEdit && <p className="text-fp-muted text-xs">Typing a quarter splits it evenly across its open months. Switch to Monthly to set each month.</p>}
          </div>
        </>
      )}

      {/* ── Gross margin (one % per year) ── */}
      {meta.scope === 'year' && (
        <div className="bg-fp-card rounded-xl p-5 space-y-3">
          <p className="text-fp-muted text-sm">Target gross margin on won deals for {year}. People without their own target use the company number.</p>
          <div className="grid gap-2 max-w-md">
            {[...(focusProfileId ? [] : [{ id: null, full_name: 'Company' }]), ...visibleSellers].map(p => {
              const k = dkey(p.id, 'gross_margin_pct', 'year', yearStart(year))
              const own = p.id ? (idx.get(`${p.id}|gross_margin_pct|year|${yearStart(year)}`) ?? null) : yearValue(idx, null, 'gross_margin_pct', year)
              const fallback = p.id ? yearValue(idx, null, 'gross_margin_pct', year) : null
              return (
                <label key={p.id || 'org'} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-sm">
                  <span className={p.id ? 'text-fp-text' : 'text-fp-text font-bold'}>{p.full_name || p.email}</span>
                  <span className="relative">
                    <input className={cellCls} value={draftOr(k, own)} disabled={!canEdit} placeholder={fallback != null ? String(fallback) : ''} onChange={e => setDraft(k, e.target.value)} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-fp-muted text-xs pointer-events-none">%</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Activity (recurring) ── */}
      {group === 'activity' && (
        <div className="bg-fp-card rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-fp-muted text-sm max-w-xl">The first row is the default for everyone. Fill a person’s cell only to override it; empty cells use the default (shown in grey).</p>
            <div className="inline-flex p-0.5 rounded-lg bg-fp-inset border border-fp-border" role="group" aria-label="Activity period">
              {[['week', 'Per week'], ['month', 'Per month']].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={actPeriod === v} onClick={() => setActPeriod(v)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${actPeriod === v ? 'bg-fp-card text-fp-text' : 'text-fp-muted'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr>
                <th scope="col" className="text-left text-fp-muted text-xs font-semibold pb-2 pr-3 min-w-[150px]">Person</th>
                {ACTIVITY_METRICS.map(m => <th key={m.key} scope="col" className="text-right text-fp-muted text-xs font-semibold pb-2 px-1">{m.label}</th>)}
              </tr></thead>
              <tbody>
                {[...(focusProfileId ? [] : [{ id: null, full_name: 'Everyone (default)' }]), ...visibleSellers].map(p => (
                  <tr key={p.id || 'org'} className={`border-t border-fp-border ${p.id ? '' : 'bg-fp-inset/40'}`}>
                    <th scope="row" className={`text-left py-2 pr-3 whitespace-nowrap ${p.id ? 'font-semibold' : 'font-bold'} text-fp-text`}>{p.full_name || p.email}</th>
                    {ACTIVITY_METRICS.map(m => {
                      const k = dkey(p.id, m.key, actPeriod, null)
                      const own = idx.get(`${p.id || 'org'}|${m.key}|${actPeriod}|*`)
                      const def = p.id ? recurringGoal(idx, null, m.key, actPeriod) : null
                      return (
                        <td key={m.key} className="py-1.5 px-1">
                          <input className={cellCls} value={draftOr(k, own ?? null)} placeholder={def != null ? String(def) : ''} disabled={!canEdit}
                            aria-label={`${p.full_name || p.email}, ${m.label}`} onChange={e => setDraft(k, e.target.value)} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Operations ── */}
      {group === 'operations' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-fp-card rounded-xl p-5 space-y-3">
            <p className="text-fp-text font-semibold">Company goals</p>
            {OPS_METRICS.map(m => {
              const k = dkey(null, m.key, m.period, null)
              return (
                <label key={m.key} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-sm">
                  <span className="text-fp-text">{m.label} <span className="text-fp-muted text-xs">({m.unit})</span></span>
                  <input className={cellCls} value={draftOr(k, idx.get(`org|${m.key}|${m.period}|*`) ?? null)} disabled={!canEdit} onChange={e => setDraft(k, e.target.value)} />
                </label>
              )
            })}
          </div>
          <div className="bg-fp-card rounded-xl p-5 space-y-3">
            <p className="text-fp-text font-semibold">Billable hours by tech</p>
            <p className="text-fp-muted text-xs">Empty uses the company number.</p>
            {visibleTechs.length === 0 && <p className="text-fp-muted text-sm">{focusProfileId ? 'Not set per person here.' : 'No technicians on the team yet.'}</p>}
            {visibleTechs.map(p => {
              const k = dkey(p.id, 'billable_hours', 'week', null)
              const def = recurringGoal(idx, null, 'billable_hours', 'week')
              return (
                <label key={p.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-sm">
                  <span className="text-fp-text">{p.full_name || p.email}</span>
                  <input className={cellCls} value={draftOr(k, idx.get(`${p.id}|billable_hours|week|*`) ?? null)} placeholder={def != null ? String(def) : ''} disabled={!canEdit} onChange={e => setDraft(k, e.target.value)} />
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Save bar */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="bg-fp-brand text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40">
            {saving ? 'Saving…' : 'Save targets'}
          </button>
          {dirty && <button type="button" onClick={() => { setDrafts({}); clearTyping(); setMsg(null) }} className="text-sm text-fp-muted hover:text-fp-text">Discard changes</button>}
          {dirty && <span className="text-fp-muted text-xs">Unsaved changes</span>}
          {msg && <span className={`text-sm ${msg.error ? 'text-red-400' : 'text-green-500'}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  )
}

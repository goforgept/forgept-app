// Goals & Targets: one table (goal_targets) for every target, company-wide or per person.
// profile_id NULL = company target (period metrics) or the default for everyone (recurring metrics).
// period_start NULL = a recurring goal (every week / every month).
import { supabase } from '../supabase'

export const GOAL_GROUPS = [
  { key: 'revenue_won',      label: 'Revenue won',      kind: 'money',   scope: 'period' },
  { key: 'deals_won',        label: 'Deals won',        kind: 'count',   scope: 'period' },
  { key: 'pipeline_created', label: 'Pipeline created', kind: 'money',   scope: 'period' },
  { key: 'gross_margin_pct', label: 'Gross margin',     kind: 'percent', scope: 'year' },
  { key: 'activity',         label: 'Activity',         kind: 'count',   scope: 'recurring' },
  { key: 'operations',       label: 'Operations',       kind: 'mixed',   scope: 'recurring' },
]

// Recurring activity goals (same keys Sales KPI has always used)
export const ACTIVITY_METRICS = [
  { key: 'calls',     label: 'Calls' },
  { key: 'emails',    label: 'Emails' },
  { key: 'meetings',  label: 'Meetings' },
  { key: 'notes',     label: 'Notes' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'deals_won', label: 'Deals won' },
]

export const OPS_METRICS = [
  { key: 'billable_hours',     label: 'Billable hours per tech', unit: 'h / week', period: 'week',  perPerson: true },
  { key: 'jobs_on_time_pct',   label: 'Jobs finished on time',   unit: '%',        period: 'month', perPerson: false },
  { key: 'tickets_in_sla_pct', label: 'Tickets within SLA',      unit: '%',        period: 'month', perPerson: false },
]

// ── Dates (all 'YYYY-MM-DD' strings, local calendar) ─────────────────────────
const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthStart = (y, m) => `${y}-${pad(m + 1)}-01`              // m: 0–11
export const quarterOf = (m) => Math.floor(m / 3)                       // 0–3
export const quarterStart = (y, q) => monthStart(y, q * 3)
export const yearStart = (y) => `${y}-01-01`
export const thisMonthStart = (d = new Date()) => monthStart(d.getFullYear(), d.getMonth())

/** Load every target for an org (paged; Supabase caps selects at 1000 rows). */
export async function fetchGoals(orgId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('goal_targets')
      .select('id, profile_id, metric, period_type, period_start, value')
      .eq('org_id', orgId).range(from, from + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const keyOf = (profileId, metric, periodType, periodStart) => `${profileId || 'org'}|${metric}|${periodType}|${periodStart || '*'}`

/** Index rows for fast lookups. */
export function indexGoals(rows) {
  const m = new Map()
  for (const r of rows || []) m.set(keyOf(r.profile_id, r.metric, r.period_type, r.period_start), Number(r.value))
  return m
}

/**
 * Target for one month. Uses the month's own row, else spreads a quarter or year target evenly.
 * profileId null = company. Returns null when nothing is set.
 */
export function monthTarget(idx, profileId, metric, y, m) {
  const own = idx.get(keyOf(profileId, metric, 'month', monthStart(y, m)))
  if (own !== undefined) return own
  const q = idx.get(keyOf(profileId, metric, 'quarter', quarterStart(y, quarterOf(m))))
  if (q !== undefined) return q / 3
  const yr = idx.get(keyOf(profileId, metric, 'year', yearStart(y)))
  if (yr !== undefined) return yr / 12
  return null
}

/** Sum of month targets from (y, m) for `months` months. Null when none of them is set. */
export function rangeTarget(idx, profileId, metric, y, m, months) {
  let total = 0, any = false
  for (let i = 0; i < months; i++) {
    const d = new Date(y, m + i, 1)
    const v = monthTarget(idx, profileId, metric, d.getFullYear(), d.getMonth())
    if (v !== null) { total += v; any = true }
  }
  return any ? total : null
}

/** Yearly value target (e.g. gross margin %): person's own, else company. */
export function yearValue(idx, profileId, metric, y) {
  const own = idx.get(keyOf(profileId, metric, 'year', yearStart(y)))
  if (own !== undefined) return own
  if (profileId) {
    const org = idx.get(keyOf(null, metric, 'year', yearStart(y)))
    if (org !== undefined) return org
  }
  return null
}

/** Recurring goal ('week' | 'month'): the person's override, else the default for everyone. */
export function recurringGoal(idx, profileId, metric, period) {
  const own = profileId ? idx.get(keyOf(profileId, metric, period, null)) : undefined
  if (own !== undefined) return own
  const def = idx.get(keyOf(null, metric, period, null))
  return def !== undefined ? def : null
}

/** Rows to upsert / delete for a batch of edits. edits: [{ profileId, metric, periodType, periodStart, value|null }] */
export async function saveGoals(orgId, userId, edits) {
  const upserts = [], deletes = []
  for (const e of edits) {
    if (e.value === null || e.value === '' || Number.isNaN(Number(e.value))) deletes.push(e)
    else upserts.push({ org_id: orgId, profile_id: e.profileId || null, metric: e.metric, period_type: e.periodType, period_start: e.periodStart || null, value: Number(e.value), set_by: userId, updated_at: new Date().toISOString() })
  }
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabase.from('goal_targets').upsert(upserts.slice(i, i + 500), { onConflict: 'org_id,profile_id,metric,period_type,period_start' })
    if (error) return { error: error.message }
  }
  for (const d of deletes) {
    let q = supabase.from('goal_targets').delete().eq('org_id', orgId).eq('metric', d.metric).eq('period_type', d.periodType)
    q = d.profileId ? q.eq('profile_id', d.profileId) : q.is('profile_id', null)
    q = d.periodStart ? q.eq('period_start', d.periodStart) : q.is('period_start', null)
    const { error } = await q
    if (error) return { error: error.message }
  }
  return { ok: true }
}

export const fmtMoney = (n) => n == null ? '' : '$' + Math.round(n).toLocaleString('en-US')

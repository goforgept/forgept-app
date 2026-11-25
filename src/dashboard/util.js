// Shared helpers for the dashboard and its widgets.

export const pval = (p) => p?.subtotal_value ?? p?.proposal_value ?? 0

export const money = (n) => `$${Math.round(n || 0).toLocaleString('en-US')}`
export const money2 = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** $412.8k / $1.2M style for tight spaces */
export const moneyShort = (n) => {
  const v = Math.abs(n || 0), s = n < 0 ? '-' : ''
  if (v >= 1e6) return `${s}$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
  if (v >= 1e4) return `${s}$${(v / 1e3).toFixed(0)}k`
  if (v >= 1e3) return `${s}$${(v / 1e3).toFixed(1)}k`
  return `${s}$${Math.round(v)}`
}
export const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || word + 's')}`

export const DAY = 864e5
export const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const daysUntil = (date) => Math.ceil((new Date(date) - new Date()) / DAY)
export const daysSince = (date) => Math.floor((new Date() - new Date(date)) / DAY)
/** Date-only strings ('2026-11-25') parsed at local noon so they don't shift a day */
export const localDate = (s) => (s && s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s))
export const shortDate = (s) => localDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const isOpen = (p) => p.status !== 'Won' && p.status !== 'Lost'

// ── Period filter (one set for every dashboard) ──────────────────────────────
export const PERIODS = { all: 'All time', mtd: 'Month to date', qtd: 'Quarter to date', ytd: 'Year to date', last_30: 'Last 30 days', last_90: 'Last 90 days' }
export const PERIOD_SHORT = { all: '', mtd: 'MTD', qtd: 'QTD', ytd: 'YTD', last_30: '30 days', last_90: '90 days' }
// Older saved values from the previous dashboards
const LEGACY_PERIOD = { this_month: 'mtd', this_quarter: 'qtd', this_year: 'ytd' }
export const normalizePeriod = (p) => (PERIODS[p] ? p : LEGACY_PERIOD[p] || 'all')

export function periodStart(period) {
  const now = new Date()
  if (period === 'mtd') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'qtd') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  if (period === 'ytd') return new Date(now.getFullYear(), 0, 1)
  if (period === 'last_30') return new Date(Date.now() - 30 * DAY)
  if (period === 'last_90') return new Date(Date.now() - 90 * DAY)
  return null
}

/**
 * Split proposals for a period. Open deals count from when they were sent (or created);
 * won/lost count from when they were closed (updated_at), so "won this quarter" means closed this quarter.
 */
export function splitByPeriod(proposals, period) {
  const start = periodStart(period)
  const after = (d) => !start || new Date(d) >= start
  const inPeriod = proposals.filter(p => after(p.status === 'Sent' ? (p.sent_at || p.created_at) : p.created_at))
  const won = proposals.filter(p => p.status === 'Won' && after(p.updated_at || p.created_at))
  const lost = proposals.filter(p => p.status === 'Lost' && after(p.updated_at || p.created_at))
  return { inPeriod, won, lost, open: inPeriod.filter(isOpen) }
}

export const laborDollars = (ps) => ps.reduce((s, p) => s + (p.labor_items || []).reduce((t, l) => t + (parseFloat(l.customer_price) || 0), 0), 0)
export const laborHours = (ps) => ps.reduce((s, p) => s + (p.labor_items || []).reduce((t, l) => t + (parseFloat(l.quantity) || 0), 0), 0)
export const closingWithin = (ps, days) => ps.filter(p => {
  if (!p.close_date || !isOpen(p)) return false
  const d = daysUntil(p.close_date)
  return d >= 0 && d <= days
})

// ── Palette (reads on both the dark and light themes) ────────────────────────
export const C = {
  blue: '#3B82F6', green: '#22C55E', brand: '#C8622A', orange: '#E07A42', violet: '#A78BFA',
  teal: '#14B8A6', amber: '#F59E0B', red: '#EF4444', slate: '#64748B', indigo: '#6366F1', pink: '#DB2777',
}
export const STAGE_COLOR = { Draft: C.slate, Sent: C.blue, Won: C.green, Lost: C.red }
export const SERIES = [C.blue, C.orange, C.teal, C.violet, C.amber, C.pink, C.indigo, C.green]

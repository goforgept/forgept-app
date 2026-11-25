// Dashboard layouts: tabs of widgets. Saved per person in profiles.dashboard_layout as
// { rep: Layout, team: Layout }, Layout = { v: 1, period, tabs: [{ id, name, widgets: [{ i, type, w }] }] }.
// Role defaults live here; later an admin can save org-wide defaults per role on top of these.
import { WIDGETS, canUse } from './registry'

export const uid = () => Math.random().toString(36).slice(2, 9)
const W = (type, w) => ({ i: uid(), type, w: w ?? WIDGETS[type].w })

export function defaultLayout(role, env) {
  const sales = {
    id: 'sales', name: 'Sales', widgets: [
      W('key-numbers'), W('pipeline', 8), W('target', 4),
      W('attention'), W('closing-soon'),
      W('leaderboard'), W('rep-targets'),
      W('won-trend', 8), W('top-clients', 4),
      W('receivables'), W('materials'),
      W('top-vendors', 4), W('recurring', 8),
      W('labor'),
    ],
  }
  const ops = {
    id: 'ops', name: 'Operations', widgets: [
      W('ops-numbers'), W('ops-alerts'),
      W('active-jobs'), W('cost-budget'),
      W('hours'), W('materials'),
      W('deadlines', 8), W('receivables', 4),
    ],
  }
  const mine = {
    id: 'mine', name: 'My day', widgets: [
      W('key-numbers'), W('pipeline', 8), W('agenda', 4),
      W('attention'), W('closing-soon'),
      W('activity', 8), W('target', 4),
      W('top-clients', 4), W('receivables', 4), W('materials', 4),
      W('recurring'), W('labor'), W('proposals'),
    ],
  }
  let tabs
  if (role === 'rep') tabs = [mine]
  else if (role === 'pm') tabs = [ops, sales]
  else tabs = env.canSeeOps ? [sales, ops] : [sales]
  return normalize({ v: 1, period: 'all', tabs }, env)
}

/** Drop widgets this person can't use, fix sizes, guarantee one tab. */
export function normalize(layout, env) {
  const tabs = (layout?.tabs || []).map(t => ({
    id: t.id || uid(),
    name: (t.name || 'Dashboard').slice(0, 40),
    widgets: (t.widgets || []).filter(w => canUse(w.type, env)).map(w => {
      const def = WIDGETS[w.type]
      return { i: w.i || uid(), type: w.type, w: def.sizes.includes(w.w) ? w.w : def.w }
    }),
  }))
  return { v: 1, period: layout?.period || 'all', tabs: tabs.length ? tabs : [{ id: uid(), name: 'Dashboard', widgets: [] }] }
}

// The old dashboards stored on/off switches. Carry over anything someone turned off.
const OLD_REP = { 'revenue-metrics': ['key-numbers'], 'pipeline-stage': ['pipeline'], 'kpi-metrics': ['activity'], 'top-clients': ['top-clients'] }
const OLD_ADMIN = { 'pipeline-chart': ['pipeline'], 'top-clients': ['top-clients'], 'team-leaderboard': ['leaderboard'], 'ar-summary': ['receivables', 'materials'], 'needs-attention': ['attention'] }

export function fromLegacy(layout, oldOn, dashKey) {
  if (!Array.isArray(oldOn)) return layout
  const map = dashKey === 'rep' ? OLD_REP : OLD_ADMIN
  const off = new Set(Object.entries(map).filter(([oldId]) => !oldOn.includes(oldId)).flatMap(([, types]) => types))
  if (!off.size) return layout
  // Only hide on the Sales/My day tab; operations widgets were never switchable before
  return { ...layout, tabs: layout.tabs.map(t => t.id === 'ops' ? t : { ...t, widgets: t.widgets.filter(w => !off.has(w.type)) }) }
}

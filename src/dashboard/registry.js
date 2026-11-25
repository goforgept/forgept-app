// Widget library. Adding a widget = one entry here (plus its component).
// needs: data sources it reads (data.js). sizes: allowed widths on a 12-column grid.
// when(env): whether this person can add it. env = { isTeam, isManufacturer, canSeeOps }
import { KeyNumbers, TargetProgress, PipelineDonut, ClosingSoon, NeedsAttention, Leaderboard, RepTargets, TopClients, TopVendors, WonTrend } from './widgets/sales'
import { Receivables, Materials, Recurring, LaborForecast } from './widgets/money'
import { OpsNumbers, OpsAlerts, ActiveJobs, CostVsBudget, HoursThisWeek, Deadlines } from './widgets/ops'
import { Agenda, ActivityGoals, ProposalList } from './widgets/personal'
import { VerseOfTheDay } from './widgets/verse'
import { FollowUps } from './widgets/followups'

export const SIZES = { 3: 'XS', 4: 'S', 6: 'M', 8: 'L', 12: 'Full' }

export const WIDGETS = {
  'key-numbers':    { title: 'Key numbers',          desc: 'Pipeline, won, win rate, margin, deal size, closing soon', category: 'Sales', component: KeyNumbers, needs: ['goals'], w: 12, sizes: [12] },
  'target':         { title: "This month's target",  desc: 'Won revenue and deals against the monthly target', category: 'Sales', component: TargetProgress, needs: ['goals'], w: 4, sizes: [4, 6, 12] },
  'pipeline':       { title: 'Pipeline by stage',    desc: 'Donut of drafts, sent, won and lost', category: 'Sales', component: PipelineDonut, needs: [], w: 8, sizes: [6, 8, 12] },
  'closing-soon':   { title: 'Closing soon',         desc: 'Deals with a close date in the next 30 days', category: 'Sales', component: ClosingSoon, needs: [], w: 6, sizes: [6, 8, 12] },
  'attention':      { title: 'Needs attention',      desc: 'Stale drafts, expiring and expired quotes, expired vendor pricing', category: 'Sales', component: NeedsAttention, needs: ['expiredPricing'], w: 6, sizes: [4, 6, 8, 12] },
  'followups':      { title: 'Follow-ups',           desc: 'Proposal follow-ups to review, coming up and falling through; skips by rep for managers', category: 'Sales', component: FollowUps, needs: ['followups'], w: 6, sizes: [4, 6, 8, 12] },
  'won-trend':      { title: 'Won by month',         desc: 'Won revenue for the last 12 months', category: 'Sales', component: WonTrend, needs: [], w: 8, sizes: [6, 8, 12] },
  'leaderboard':    { title: 'Rep leaderboard',      desc: 'Each rep ranked by won revenue, with open pipeline and margin', category: 'Team', component: Leaderboard, needs: [], w: 6, sizes: [4, 6, 8, 12], when: e => e.isTeam },
  'rep-targets':    { title: 'Rep targets',          desc: "This month's won revenue against each person's target", category: 'Team', component: RepTargets, needs: ['goals'], w: 6, sizes: [6, 8, 12], when: e => e.isTeam },
  'top-clients':    { title: 'Top clients',          desc: 'Clients with the most open and won business', category: 'Sales', component: TopClients, needs: ['clients'], w: 4, sizes: [4, 6, 12] },
  'top-vendors':    { title: 'Top vendors',          desc: 'Vendors by won value, with how much of what was quoted was won', category: 'Sales', component: TopVendors, needs: ['vendorLines'], w: 4, sizes: [4, 6, 12], when: e => e.isTeam },
  'agenda':         { title: 'Agenda',               desc: 'Your meetings and tasks for the next few days', category: 'Me', component: Agenda, needs: ['tasks'], w: 4, sizes: [4, 6, 12] },
  'activity':       { title: 'My activity',          desc: 'Calls, emails, meetings and more against your goals', category: 'Me', component: ActivityGoals, needs: ['goals'], w: 8, sizes: [4, 6, 8, 12] },
  'verse':          { title: 'Verse of the day',     desc: 'A Bible verse each day (King James Version)', category: 'Me', component: VerseOfTheDay, needs: [], w: 4, sizes: [4, 6, 8, 12] },
  'proposals':      { title: 'Proposals list',       desc: 'Search and filter proposals', category: 'Me', component: ProposalList, needs: [], w: 12, sizes: [6, 8, 12] },
  'receivables':    { title: 'Invoicing & AR',       desc: 'Outstanding and overdue invoices, won deals not yet invoiced', category: 'Money', component: Receivables, needs: ['invoices'], w: 6, sizes: [4, 6, 12] },
  'materials':      { title: 'Purchase orders',      desc: 'POs on order, partly received and received', category: 'Money', component: Materials, needs: ['purchaseOrders'], w: 6, sizes: [4, 6, 12], when: e => !e.isManufacturer },
  'recurring':      { title: 'Recurring revenue',    desc: 'Recurring items, renewals coming up', category: 'Money', component: Recurring, needs: ['recurring'], w: 12, sizes: [6, 8, 12] },
  'labor':          { title: 'Labor forecast',       desc: 'Labor quoted, won and closing soon, in dollars and hours', category: 'Money', component: LaborForecast, needs: [], w: 12, sizes: [8, 12], when: e => !e.isManufacturer },
  'ops-numbers':    { title: 'Operations numbers',   desc: 'Active, on hold, completed and overdue jobs, hours, open POs', category: 'Operations', component: OpsNumbers, needs: ['jobs', 'techLogs', 'purchaseOrders'], w: 12, sizes: [12], when: e => e.canSeeOps },
  'ops-alerts':     { title: 'Job alerts',           desc: 'Change orders waiting for approval and jobs past their end date', category: 'Operations', component: OpsAlerts, needs: ['jobs', 'changeOrders'], w: 12, sizes: [6, 12], when: e => e.canSeeOps },
  'active-jobs':    { title: 'Active jobs',          desc: 'Progress on every active job', category: 'Operations', component: ActiveJobs, needs: ['jobs'], w: 6, sizes: [4, 6, 8, 12], when: e => e.canSeeOps },
  'cost-budget':    { title: 'Cost vs budget',       desc: 'Cost against revenue for each active job', category: 'Operations', component: CostVsBudget, needs: ['jobs'], w: 6, sizes: [4, 6, 8, 12], when: e => e.canSeeOps },
  'hours':          { title: 'Hours logged',         desc: 'Hours from tech logs over the last 7 days, by job', category: 'Operations', component: HoursThisWeek, needs: ['jobs', 'techLogs'], w: 6, sizes: [4, 6, 12], when: e => e.canSeeOps },
  'deadlines':      { title: 'Upcoming deadlines',   desc: 'Jobs by end date', category: 'Operations', component: Deadlines, needs: ['jobs'], w: 12, sizes: [6, 8, 12], when: e => e.canSeeOps },
}

export const CATEGORIES = ['Me', 'Sales', 'Team', 'Money', 'Operations']

export const canUse = (type, env) => !!WIDGETS[type] && (!WIDGETS[type].when || WIDGETS[type].when(env))

/** Every data source the given tabs need. */
export function sourcesFor(tabs) {
  const s = new Set()
  tabs.forEach(t => t.widgets.forEach(w => (WIDGETS[w.type]?.needs || []).forEach(n => s.add(n))))
  return [...s]
}

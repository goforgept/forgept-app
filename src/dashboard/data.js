// Dashboard data: each widget declares the sources it needs (registry.js), and the page loads
// only the union of sources for the widgets on screen. New widgets add a source here once.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { fetchGoals } from '../lib/goals'
import { todayYMD, DAY } from './util'

const PROPOSAL_COLS = 'id,proposal_name,company,client_name,client_id,rep_name,rep_email,status,close_date,quote_expires_at,proposal_value,subtotal_value,total_customer_value,total_your_cost,total_gross_margin_dollars,total_gross_margin_percent,labor_items,created_at,updated_at,sent_at,user_id,collaborator_ids,has_recurring'

/** Page through a query (Supabase caps a select at 1000 rows). build(from, to) returns the query. */
async function pageAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) { console.error('dashboard load:', error.message); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Run `.in(col, ids)` in chunks so long id lists don't overflow the URL. */
async function inChunks(ids, build) {
  const out = []
  for (let i = 0; i < ids.length; i += 150) out.push(...await pageAll((f, t) => build(ids.slice(i, i + 150)).range(f, t)))
  return out
}

// ── Sources ──────────────────────────────────────────────────────────────────
// Each loader gets ctx = { orgId, userId, mine, regionUserIds, proposalIds }
// `proposalIds` is the set of proposals in scope, used to scope money and line items.
const SOURCES = {
  profiles: async ({ orgId }) => {
    const { data } = await supabase.from('profiles').select('id, full_name, email, region_id, role, org_role').eq('org_id', orgId)
    return data || []
  },
  goals: ({ orgId }) => fetchGoals(orgId),
  clients: ({ orgId }) => pageAll((f, t) => supabase.from('clients').select('id, company').eq('org_id', orgId).is('archived_at', null).range(f, t)),
  invoices: async ({ orgId, mine, regionUserIds, proposalIds }) => {
    const rows = await pageAll((f, t) => supabase.from('invoices').select('*').eq('org_id', orgId).range(f, t))
    return mine || regionUserIds ? rows.filter(i => proposalIds.has(i.proposal_id)) : rows
  },
  purchaseOrders: async ({ orgId, mine, regionUserIds, proposalIds }) => {
    const rows = await pageAll((f, t) => supabase.from('purchase_orders').select('*').eq('org_id', orgId).range(f, t))
    return mine || regionUserIds ? rows.filter(p => proposalIds.has(p.proposal_id)) : rows
  },
  recurring: ({ wonIds }) => wonIds.length === 0 ? [] : inChunks(wonIds, (ids) =>
    supabase.from('bom_line_items').select('id, item_name, customer_price_total, renewal_date, proposal_id, proposals(proposal_name, company, client_id, rep_name, user_id)')
      .eq('recurring', true).not('renewal_date', 'is', null).in('proposal_id', ids)),
  vendorLines: ({ allIds }) => allIds.length === 0 ? [] : inChunks(allIds, (ids) =>
    supabase.from('bom_line_items').select('vendor, customer_price_total, proposal_id').in('proposal_id', ids).not('vendor', 'is', null)),
  expiredPricing: async ({ proposalIds }) => {
    const { data } = await supabase.from('bom_line_items').select('proposal_id')
      .eq('pricing_status', 'RFQ Sent').lt('rfq_expires_at', todayYMD()).not('rfq_expires_at', 'is', null).limit(1000)
    return [...new Set((data || []).map(r => r.proposal_id))].filter(id => proposalIds.has(id))
  },
  jobs: ({ orgId }) => pageAll((f, t) => supabase.from('jobs').select('*, job_checklist_items(id, completed), clients(company)').eq('org_id', orgId).order('created_at', { ascending: false }).range(f, t)),
  techLogs: async ({ orgId }) => {
    const weekAgo = new Date(Date.now() - 7 * DAY).toISOString().split('T')[0]
    return pageAll((f, t) => supabase.from('tech_daily_logs').select('job_id, hours_worked, log_date, user_id, profiles(full_name)').eq('org_id', orgId).gte('log_date', weekAgo).range(f, t))
  },
  changeOrders: async ({ orgId }) => {
    const { data } = await supabase.from('change_orders').select('*, jobs(name)').eq('org_id', orgId).eq('status', 'Pending')
    return data || []
  },
  // My open tasks and meetings: overdue plus the next two weeks (agenda + "today" summary)
  tasks: async ({ orgId, userId }) => {
    const until = new Date(Date.now() + 14 * DAY).toISOString().split('T')[0]
    const { data } = await supabase.from('tasks').select('id, title, due_date, start_time, meeting_type, priority, completed, client_id, clients(company)')
      .eq('org_id', orgId).eq('assigned_to', userId).eq('completed', false).not('due_date', 'is', null).lte('due_date', until)
      .order('due_date', { ascending: true }).limit(300)
    return data || []
  },
}

/**
 * Load what the dashboard needs.
 * scope 'mine' = the signed-in person's proposals; 'team' = the whole org (or the region for a regional VP).
 * Returns { data, loading, reload, patchProposal }.
 */
export function useDashboardData({ profile, scope, needs, regionScoped }) {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const loadedKey = useRef('')
  const needKey = [...needs].sort().join(',')

  const load = useCallback(async () => {
    if (!profile?.org_id || !needKey) return
    const orgId = profile.org_id, userId = profile.id, mine = scope === 'mine'
    setLoading(true)

    // Proposals (and people, for region scoping) first: everything else is scoped by them
    const [allProposals, profiles] = await Promise.all([
      pageAll((f, t) => {
        let q = supabase.from('proposals').select(PROPOSAL_COLS).eq('org_id', orgId).eq('is_current_revision', true).is('archived_at', null)
        if (mine) q = q.eq('user_id', userId)
        return q.order('created_at', { ascending: false }).range(f, t)
      }),
      SOURCES.profiles({ orgId }),
    ])
    const regionUserIds = !mine && regionScoped && profile.region_id
      ? new Set(profiles.filter(p => p.region_id === profile.region_id).map(p => p.id))
      : null
    const proposals = regionUserIds ? allProposals.filter(p => regionUserIds.has(p.user_id)) : allProposals
    const proposalIds = new Set(proposals.map(p => p.id))
    const ctx = {
      orgId, userId, mine, regionUserIds, proposalIds,
      allIds: proposals.map(p => p.id),
      wonIds: proposals.filter(p => p.status === 'Won').map(p => p.id),
    }

    const wanted = needKey.split(',').filter(k => k && SOURCES[k] && k !== 'profiles')
    const results = await Promise.all(wanted.map(k => SOURCES[k](ctx).catch(e => { console.error(`dashboard ${k}:`, e); return [] })))
    const next = {
      proposals,
      profiles: regionUserIds ? profiles.filter(p => regionUserIds.has(p.id)) : profiles,
      regionScoped: !!regionUserIds,
    }
    wanted.forEach((k, i) => { next[k] = results[i] })
    setData(next)
    loadedKey.current = needKey
    setLoading(false)
  }, [profile?.org_id, profile?.id, profile?.region_id, scope, regionScoped, needKey])

  useEffect(() => { load() }, [load])

  const patchProposal = useCallback((id, patch) => {
    setData(d => ({ ...d, proposals: (d.proposals || []).map(p => p.id === id ? { ...p, ...patch } : p) }))
  }, [])

  return { data, loading, reload: load, patchProposal }
}

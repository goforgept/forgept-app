import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

// ─── Constants ───────────────────────────────────────────────────────────────

const WIDGET_DEFS = [
  { id: 'revenue-metrics', label: 'Revenue Metrics', desc: 'Pipeline value, won revenue, win rate, avg deal size', full: true },
  { id: 'pipeline-stage',  label: 'Pipeline by Stage', desc: 'Chart of deal count and value at each stage', full: true },
  { id: 'recent-proposals', label: 'Recent Proposals', desc: 'Your 10 most recently created proposals' },
  { id: 'team-leaderboard', label: 'Team Leaderboard', desc: 'Top reps ranked by closed-won revenue (admin)', adminOnly: true },
  { id: 'top-clients',     label: 'Top Clients',      desc: 'Top 20 clients by total proposal value' },
]
const DEFAULT_WIDGETS = ['revenue-metrics', 'pipeline-stage', 'recent-proposals', 'team-leaderboard', 'top-clients']
const STATUS_COLOR = { Draft: '#6B7280', Sent: '#3B82F6', Won: '#22C55E', Lost: '#EF4444' }
const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

// ─── Widget: Revenue Metrics ─────────────────────────────────────────────────

function RevenueMetricsWidget({ proposals }) {
  const won   = proposals.filter(p => p.status === 'Won')
  const lost  = proposals.filter(p => p.status === 'Lost')
  const active = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost')
  const wonVal = won.reduce((s, p) => s + (p.proposal_value || 0), 0)
  const activeVal = active.reduce((s, p) => s + (p.proposal_value || 0), 0)
  const winRate = (won.length + lost.length) > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : null
  const avgDeal = proposals.length > 0 ? proposals.reduce((s, p) => s + (p.proposal_value || 0), 0) / proposals.length : 0
  const closing = proposals.filter(p => {
    if (!p.close_date || p.status === 'Won' || p.status === 'Lost') return false
    const d = Math.ceil((new Date(p.close_date) - new Date()) / 864e5)
    return d >= 0 && d <= 30
  }).length
  const avgMarginSrc = proposals.filter(p => p.total_gross_margin_percent)
  const avgMargin = avgMarginSrc.length > 0
    ? avgMarginSrc.reduce((s, p) => s + p.total_gross_margin_percent, 0) / avgMarginSrc.length
    : null

  const cards = [
    { label: 'Active Pipeline', value: fmt(activeVal), color: 'text-white' },
    { label: 'Total Won',       value: fmt(wonVal),    color: 'text-green-400' },
    { label: 'Win Rate',        value: winRate !== null ? `${winRate}%` : '—', color: 'text-[#C8622A]' },
    { label: 'Avg Deal Size',   value: fmt(avgDeal),   color: 'text-blue-400' },
    { label: 'Avg Margin',      value: avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—', color: 'text-purple-400' },
    { label: 'Closing in 30d',  value: closing,        color: closing > 0 ? 'text-yellow-400' : 'text-[#8A9AB0]' },
  ]
  return (
    <div className="col-span-2">
      <p className="text-white font-bold mb-3">Revenue Metrics</p>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]/50">
            <p className="text-[#8A9AB0] text-xs mb-2">{c.label}</p>
            <p className={`${c.color} text-xl font-bold`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Widget: Pipeline by Stage ────────────────────────────────────────────────

function PipelineStageWidget({ proposals, primaryColor }) {
  const stages = ['Draft', 'Sent', 'Won', 'Lost']
  const data = stages.map(s => ({
    stage: s,
    count: proposals.filter(p => p.status === s).length,
    value: proposals.filter(p => p.status === s).reduce((sum, p) => sum + (p.proposal_value || 0), 0),
  }))

  const ChartTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm shadow-xl">
        <p className="text-white font-bold mb-1">{d.stage}</p>
        <p className="text-[#8A9AB0]">{d.count} deal{d.count !== 1 ? 's' : ''}</p>
        <p className="text-white font-semibold">{fmt(d.value)}</p>
      </div>
    )
  }

  return (
    <div className="col-span-2">
      <p className="text-white font-bold mb-4">Pipeline by Stage</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="stage" tick={{ fill: '#8A9AB0', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} tick={{ fill: '#8A9AB0', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(42,61,85,0.3)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map(d => <Cell key={d.stage} fill={STATUS_COLOR[d.stage]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-[#2a3d55]/50">
        {data.map(d => (
          <div key={d.stage} className="text-center">
            <p className="text-white text-2xl font-bold">{d.count}</p>
            <p style={{ color: STATUS_COLOR[d.stage] }} className="text-xs font-semibold mt-0.5">{d.stage}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Widget: Recent Proposals ─────────────────────────────────────────────────

function RecentProposalsWidget({ proposals, navigate }) {
  const recent = [...proposals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)
  return (
    <div>
      <p className="text-white font-bold mb-3">Recent Proposals</p>
      {recent.length === 0
        ? <p className="text-[#8A9AB0] text-sm">No proposals yet.</p>
        : <div className="space-y-2">
            {recent.map(p => (
              <div key={p.id} onClick={() => navigate(`/proposal/${p.id}`)}
                className="flex items-center justify-between bg-[#0F1C2E] rounded-lg px-3 py-2.5 cursor-pointer hover:bg-[#0a1628] transition-colors group">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-white text-sm font-medium truncate group-hover:text-[#C8622A] transition-colors">{p.proposal_name}</p>
                  <p className="text-[#8A9AB0] text-xs truncate">{p.company}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.status === 'Won' ? 'bg-green-500/20 text-green-400' :
                    p.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
                    p.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
                    'bg-[#8A9AB0]/20 text-[#8A9AB0]'}`}>{p.status}</span>
                  <span className="text-white text-xs font-semibold">{fmt(p.proposal_value)}</span>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  )
}

// ─── Widget: Team Leaderboard ─────────────────────────────────────────────────

function TeamLeaderboardWidget({ orgProposals }) {
  const byRep = {}
  orgProposals.forEach(p => {
    const name = p.rep_name || 'Unknown'
    if (!byRep[name]) byRep[name] = { name, won: 0, count: 0 }
    if (p.status === 'Won') byRep[name].won += (p.proposal_value || 0)
    byRep[name].count++
  })
  const sorted = Object.values(byRep).sort((a, b) => b.won - a.won).slice(0, 10)
  const maxWon = Math.max(...sorted.map(r => r.won), 1)

  return (
    <div>
      <p className="text-white font-bold mb-3">Team Leaderboard</p>
      {sorted.length === 0
        ? <p className="text-[#8A9AB0] text-sm">No team data yet.</p>
        : <div className="space-y-3">
            {sorted.map((rep, i) => (
              <div key={rep.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-[#8A9AB0]'}`}>#{i + 1}</span>
                    <span className="text-white text-sm font-medium">{rep.name}</span>
                  </div>
                  <span className="text-green-400 text-sm font-semibold">{fmt(rep.won)}</span>
                </div>
                <div className="w-full bg-[#0F1C2E] rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-green-500 transition-all duration-700"
                    style={{ width: `${(rep.won / maxWon) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  )
}

// ─── Widget: Top Clients ──────────────────────────────────────────────────────

function TopClientsWidget({ proposals }) {
  const byClient = {}
  proposals.forEach(p => {
    const key = p.company || 'Unknown'
    if (!byClient[key]) byClient[key] = { name: key, total: 0, won: 0, count: 0 }
    byClient[key].total += (p.proposal_value || 0)
    if (p.status === 'Won') byClient[key].won += (p.proposal_value || 0)
    byClient[key].count++
  })
  const sorted = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 20)

  return (
    <div>
      <p className="text-white font-bold mb-3">Top Clients</p>
      {sorted.length === 0
        ? <p className="text-[#8A9AB0] text-sm">No client data yet.</p>
        : <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {sorted.map((c, i) => (
              <div key={c.name} className="flex items-center bg-[#0F1C2E] rounded-lg px-3 py-2.5">
                <span className="text-[#8A9AB0] text-xs w-6 flex-shrink-0">#{i + 1}</span>
                <span className="text-white text-sm flex-1 truncate">{c.name}</span>
                <span className="text-[#8A9AB0] text-xs mr-3">{c.count} deal{c.count !== 1 ? 's' : ''}</span>
                <span className="text-white text-sm font-semibold flex-shrink-0">{fmt(c.total)}</span>
              </div>
            ))}
          </div>
      }
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals]       = useState([])
  const [orgProposals, setOrgProposals] = useState([])
  const [profile, setProfile]           = useState(null)
  const [target, setTarget]             = useState(null)
  const [invoices, setInvoices]         = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [recurringItems, setRecurringItems] = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [orgType]                       = useState(() => sessionStorage.getItem('orgType') || 'integrator')
  const [widgetConfig, setWidgetConfig] = useState(DEFAULT_WIDGETS)
  const [showCustomize, setShowCustomize] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, dashboard_widgets, organizations(org_type)')
      .eq('id', user.id).single()
    setProfile(profileData)
    if (profileData?.dashboard_widgets) setWidgetConfig(profileData.dashboard_widgets)
    if (!profileData?.org_id) { setLoading(false); return }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const [proposalsRes, targetRes, invoicesRes, posRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('org_id', profileData.org_id).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('targets').select('*').eq('profile_id', user.id).eq('period', 'monthly').gte('period_start', monthStart).maybeSingle(),
      supabase.from('invoices').select('*').eq('org_id', profileData.org_id),
      supabase.from('purchase_orders').select('*').eq('org_id', profileData.org_id),
    ])
    setProposals(proposalsRes.data || [])
    setTarget(targetRes.data || null)
    setInvoices(invoicesRes.data || [])
    setPurchaseOrders(posRes.data || [])

    // Fetch org-wide proposals for admin widgets (leaderboard, top clients)
    if (isAdmin) {
      const { data: orgProps } = await supabase
        .from('proposals')
        .select('id, proposal_name, company, rep_name, status, proposal_value, created_at')
        .eq('org_id', profileData.org_id)
        .order('created_at', { ascending: false })
      setOrgProposals(orgProps || [])
    }

    // Recurring items for renewals widget
    const propIds = (proposalsRes.data || []).filter(p => p.status === 'Won').map(p => p.id)
    if (propIds.length > 0) {
      const { data: recData } = await supabase
        .from('bom_line_items')
        .select('*, proposals(proposal_name, company, client_id)')
        .eq('recurring', true)
        .not('renewal_date', 'is', null)
        .in('proposal_id', propIds)
      setRecurringItems(recData || [])
    }
    setLoading(false)
  }

  const saveWidgetConfig = async (cfg) => {
    setWidgetConfig(cfg)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ dashboard_widgets: cfg }).eq('id', user.id)
  }

  const toggleWidget = (id) => {
    const next = widgetConfig.includes(id)
      ? widgetConfig.filter(w => w !== id)
      : [...widgetConfig, id]
    saveWidgetConfig(next)
  }

  const markAsSent = async (proposalId) => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', proposalId)
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'Sent' } : p))
  }

  // ── Derived values ──────────────────────────────────────────────
  const filtered = proposals
    .filter(p => statusFilter === 'All' || p.status === statusFilter)
    .filter(p => {
      if (!search) return true
      const s = search.toLowerCase()
      return p.proposal_name?.toLowerCase().includes(s) || p.company?.toLowerCase().includes(s) || p.client_name?.toLowerCase().includes(s)
    })

  const wonPipeline = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const targetProgress = target ? Math.min(100, Math.round((wonPipeline / target.revenue_target) * 100)) : null

  const laborQuoted = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
  const laborWon = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
  const hoursQuoted = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)
  const hoursWon = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)
  const laborClosingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const d = Math.ceil((new Date(p.close_date) - new Date()) / 864e5)
    return d <= 30 && d >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
  const hoursClosingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const d = Math.ceil((new Date(p.close_date) - new Date()) / 864e5)
    return d <= 30 && d >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)

  const needsAttention = proposals.filter(p => {
    if (p.status !== 'Draft') return false
    return Math.floor((new Date() - new Date(p.created_at)) / 864e5) >= 3
  }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const outstandingAR = invoices.filter(i => i.status === 'Sent' || i.status === 'Partial').reduce((sum, i) => sum + (i.balance_due || 0), 0)
  const overdueAR = invoices.filter(i => !i.due_date || i.status === 'Paid' ? false : new Date(i.due_date) < new Date() && (i.status === 'Sent' || i.status === 'Partial')).reduce((sum, i) => sum + (i.balance_due || 0), 0)
  const needsInvoice = proposals.filter(p => p.status === 'Won' && !invoices.some(inv => inv.proposal_id === p.id)).length
  const partialPOs = purchaseOrders.filter(p => p.status === 'Partial').length
  const pendingPOs = purchaseOrders.filter(p => p.status === 'Sent').length

  const upcomingRenewals = (() => {
    const today = new Date()
    const in90 = new Date(today.getTime() + 90 * 864e5)
    const groups = {}
    recurringItems.filter(i => { const d = new Date(i.renewal_date); return d >= today && d <= in90 }).forEach(item => {
      const key = item.proposals?.client_id || item.proposals?.company || 'unknown'
      if (!groups[key]) groups[key] = { clientId: item.proposals?.client_id, company: item.proposals?.company, items: [], earliestDate: item.renewal_date }
      groups[key].items.push(item)
      if (item.renewal_date < groups[key].earliestDate) groups[key].earliestDate = item.renewal_date
    })
    return Object.values(groups).sort((a, b) => new Date(a.earliestDate) - new Date(b.earliestDate))
  })()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Proposal data for client widgets — org-wide for admins, own for reps
  const clientProposals = isAdmin && orgProposals.length > 0 ? orgProposals : proposals

  // ── Render widget by id ─────────────────────────────────────────
  const renderWidget = (id) => {
    const primaryColor = profile?.primary_color || '#0F1C2E'
    switch (id) {
      case 'revenue-metrics':
        return <RevenueMetricsWidget key={id} proposals={proposals} />
      case 'pipeline-stage':
        return <PipelineStageWidget key={id} proposals={proposals} primaryColor={primaryColor} />
      case 'recent-proposals':
        return (
          <div key={id} className="bg-[#1a2d45] rounded-xl p-5">
            <RecentProposalsWidget proposals={proposals} navigate={navigate} />
          </div>
        )
      case 'team-leaderboard':
        if (!isAdmin) return null
        return (
          <div key={id} className="bg-[#1a2d45] rounded-xl p-5">
            <TeamLeaderboardWidget orgProposals={orgProposals.length > 0 ? orgProposals : proposals} />
          </div>
        )
      case 'top-clients':
        return (
          <div key={id} className="bg-[#1a2d45] rounded-xl p-5">
            <TopClientsWidget proposals={clientProposals} />
          </div>
        )
      default:
        return null
    }
  }

  // Split visible widgets into full-width and half-width groups for grid layout
  const visibleDefs = WIDGET_DEFS.filter(d => widgetConfig.includes(d.id) && (!d.adminOnly || isAdmin))
  const fullWidgets = visibleDefs.filter(d => d.full)
  const halfWidgets = visibleDefs.filter(d => !d.full)

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={false} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 min-w-0">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold">{greeting}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{dateStr}</p>
          </div>
          <button
            onClick={() => setShowCustomize(true)}
            className="flex items-center gap-2 bg-[#1a2d45] border border-[#2a3d55] text-[#8A9AB0] hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
            <span>⚙</span> Customize
          </button>
        </div>

        {/* ── Monthly Target ── */}
        {target && (
          <div className="bg-[#1a2d45] rounded-xl p-5 mb-6 border border-[#C8622A]/20">
            <div className="flex justify-between items-center mb-2">
              <div>
                <p className="text-white font-bold">Monthly Target</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">{fmt(wonPipeline)} won of {fmt(target.revenue_target)} goal</p>
              </div>
              <p className={`text-2xl font-bold ${targetProgress >= 100 ? 'text-green-400' : targetProgress >= 70 ? 'text-[#C8622A]' : 'text-white'}`}>{targetProgress}%</p>
            </div>
            <div className="w-full bg-[#0F1C2E] rounded-full h-3">
              <div className={`h-3 rounded-full transition-all ${targetProgress >= 100 ? 'bg-green-500' : targetProgress >= 70 ? 'bg-[#C8622A]' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, targetProgress)}%` }} />
            </div>
            {target.deals_target > 0 && (
              <p className="text-[#8A9AB0] text-xs mt-2">{proposals.filter(p => p.status === 'Won').length} of {target.deals_target} deals closed</p>
            )}
          </div>
        )}

        {/* ── Customizable Widgets ── */}
        {!loading && visibleDefs.length > 0 && (
          <div className="space-y-4 mb-6">
            {fullWidgets.map(d => (
              <div key={d.id} className="bg-[#1a2d45] rounded-xl p-5">
                <div className="grid grid-cols-2 gap-4">
                  {renderWidget(d.id)}
                </div>
              </div>
            ))}
            {halfWidgets.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {halfWidgets.map(d => renderWidget(d.id))}
              </div>
            )}
          </div>
        )}

        {/* ── AR + PO Summary ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors" onClick={() => navigate('/invoices')}>
            <p className="text-white font-bold mb-3">Invoicing & AR</p>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[#8A9AB0] text-xs mb-1">Outstanding</p><p className="text-white text-lg font-bold">{fmt(outstandingAR)}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Overdue</p><p className={`text-lg font-bold ${overdueAR > 0 ? 'text-red-400' : 'text-white'}`}>{fmt(overdueAR)}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Needs Invoice</p><p className={`text-lg font-bold ${needsInvoice > 0 ? 'text-yellow-400' : 'text-white'}`}>{needsInvoice}</p></div>
            </div>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors" onClick={() => navigate('/purchase-orders')}>
            <p className="text-white font-bold mb-3">Purchase Orders</p>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[#8A9AB0] text-xs mb-1">Total POs</p><p className="text-white text-lg font-bold">{purchaseOrders.length}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Partial</p><p className={`text-lg font-bold ${partialPOs > 0 ? 'text-yellow-400' : 'text-white'}`}>{partialPOs}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Pending</p><p className={`text-lg font-bold ${pendingPOs > 0 ? 'text-blue-400' : 'text-white'}`}>{pendingPOs}</p></div>
            </div>
          </div>
        </div>

        {/* ── Upcoming Renewals ── */}
        {upcomingRenewals.length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-5 mb-6 border border-[#C8622A]/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#C8622A]">🔄</span>
              <p className="text-white font-bold">Upcoming Renewals — next 90 days</p>
            </div>
            <div className="space-y-2">
              {upcomingRenewals.map((group, i) => {
                const totalValue = group.items.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
                const daysUntil = Math.ceil((new Date(group.earliestDate) - new Date()) / 864e5)
                return (
                  <div key={i} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3 cursor-pointer hover:bg-[#0a1628] transition-colors"
                    onClick={() => group.clientId && navigate(`/client/${group.clientId}`)}>
                    <div>
                      <p className="text-white text-sm font-medium">{group.company}</p>
                      <p className="text-[#8A9AB0] text-xs">{group.items.length} item{group.items.length !== 1 ? 's' : ''} · {group.items.map(i => i.item_name).join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-bold">{fmt(totalValue)}</p>
                      <p className={`text-xs font-semibold ${daysUntil <= 30 ? 'text-red-400' : daysUntil <= 60 ? 'text-yellow-400' : 'text-[#C8622A]'}`}>
                        {daysUntil === 0 ? 'Today' : `${daysUntil}d`} — {new Date(group.earliestDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Needs Attention ── */}
        {!loading && needsAttention.length > 0 && (
          <div className="bg-[#1a2d45] border border-yellow-500/30 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <p className="text-yellow-400 font-bold text-sm">Needs Attention — {needsAttention.length} draft{needsAttention.length > 1 ? 's' : ''} not yet sent</p>
            </div>
            <div className="space-y-2">
              {needsAttention.map(p => {
                const daysSince = Math.floor((new Date() - new Date(p.created_at)) / 864e5)
                return (
                  <div key={p.id} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/proposal/${p.id}`)}>
                      <p className="text-white text-sm font-medium">{p.proposal_name}</p>
                      <p className="text-[#8A9AB0] text-xs">{p.company} · Created {daysSince} day{daysSince !== 1 ? 's' : ''} ago</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <p className="text-white text-sm font-semibold">{fmt(p.proposal_value)}</p>
                      <button onClick={() => markAsSent(p.id)} className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors">Mark as Sent</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Labor Forecast ── */}
        {!loading && orgType !== 'manufacturer' && (laborQuoted > 0 || laborWon > 0) && (
          <div className="bg-[#1a2d45] rounded-xl p-6 mb-6">
            <div className="mb-4">
              <p className="text-white font-bold text-lg">Labor Forecast</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">Plan your crew and backlog</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">Total Labor Quoted</p>
                <p className="text-white text-xl font-bold">{fmt(laborQuoted)}</p>
                <p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursQuoted.toLocaleString()} hrs</p>
                <p className="text-[#8A9AB0] text-xs">Active pipeline</p>
              </div>
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">Total Labor Won</p>
                <p className="text-green-400 text-xl font-bold">{fmt(laborWon)}</p>
                <p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursWon.toLocaleString()} hrs</p>
                <p className="text-[#8A9AB0] text-xs">Confirmed backlog</p>
              </div>
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">Closing in 30 Days</p>
                <p className="text-[#C8622A] text-xl font-bold">{fmt(laborClosingSoon)}</p>
                <p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursClosingSoon.toLocaleString()} hrs</p>
                <p className="text-[#8A9AB0] text-xs">Plan ahead</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Proposals List ── */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">My Proposals</h2>
          <div className="flex items-center gap-4">
            <p className="text-[#8A9AB0] text-sm">{filtered.length} of {proposals.length}</p>
            <button onClick={() => navigate('/new')} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ New Proposal</button>
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Search by name or company…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <div className="flex gap-2">
            {['All', 'Draft', 'Sent', 'Won', 'Lost'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>{s}</button>
            ))}
          </div>
        </div>
        {loading ? <p className="text-[#8A9AB0]">Loading…</p> : filtered.length === 0 ? (
          <p className="text-[#8A9AB0]">No proposals found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <div key={p.id} onClick={() => navigate(`/proposal/${p.id}`)}
                className="bg-[#1a2d45] rounded-xl p-4 flex justify-between items-center cursor-pointer hover:bg-[#1f3550] transition-colors group">
                <div>
                  <p className="text-white font-semibold group-hover:text-[#C8622A] transition-colors">{p.proposal_name}</p>
                  <p className="text-[#8A9AB0] text-sm">{p.company} · {p.rep_name}</p>
                </div>
                <div className="flex items-center gap-4">
                  {p.total_gross_margin_percent && <p className="text-[#C8622A] text-sm font-semibold">{p.total_gross_margin_percent.toFixed(1)}%</p>}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${p.status === 'Won' ? 'bg-green-500/20 text-green-400' : p.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : p.status === 'Lost' ? 'bg-red-500/20 text-red-400' : 'bg-[#8A9AB0]/20 text-[#8A9AB0]'}`}>{p.status}</span>
                  <p className="text-white text-sm font-semibold">{fmt(p.proposal_value)}</p>
                  {p.close_date && <p className="text-[#8A9AB0] text-sm">{p.close_date}</p>}
                  <span className="text-[#8A9AB0] group-hover:text-[#C8622A] transition-colors">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Customize Panel ── */}
      {showCustomize && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setShowCustomize(false)} />
          <div className="w-80 bg-[#1a2d45] border-l border-[#2a3d55] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#2a3d55]">
              <p className="text-white font-bold">Customize Dashboard</p>
              <button onClick={() => setShowCustomize(false)} className="text-[#8A9AB0] hover:text-white text-xl leading-none transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <p className="text-[#8A9AB0] text-xs mb-4">Toggle widgets on or off. Changes are saved automatically.</p>
              {WIDGET_DEFS.filter(d => !d.adminOnly || isAdmin).map(d => {
                const on = widgetConfig.includes(d.id)
                return (
                  <div key={d.id} className="flex items-start justify-between gap-3 bg-[#0F1C2E] rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{d.label}</p>
                      <p className="text-[#8A9AB0] text-xs mt-0.5 leading-relaxed">{d.desc}</p>
                    </div>
                    <button onClick={() => toggleWidget(d.id)}
                      className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative mt-0.5 ${on ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="p-5 border-t border-[#2a3d55]">
              <button onClick={() => { saveWidgetConfig(DEFAULT_WIDGETS); }} className="w-full bg-[#2a3d55] text-[#8A9AB0] hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
                Reset to Default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

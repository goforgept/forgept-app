import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Dashboard({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals] = useState([])
  const [profile, setProfile] = useState(null)
  const [target, setTarget] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [orgType] = useState(() => sessionStorage.getItem('orgType') || 'integrator')
  const [recurringItems, setRecurringItems] = useState([])
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)
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

    // Fetch recurring items for this rep's proposals
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

  const markAsSent = async (proposalId) => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', proposalId)
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'Sent' } : p))
  }

  const filtered = proposals
    .filter(p => statusFilter === 'All' || p.status === statusFilter)
    .filter(p => {
      if (!search) return true
      const s = search.toLowerCase()
      return p.proposal_name?.toLowerCase().includes(s) || p.company?.toLowerCase().includes(s) || p.client_name?.toLowerCase().includes(s)
    })

  const activePipeline = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const wonPipeline = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const closingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).length
  const avgMargin = proposals.filter(p => p.total_gross_margin_percent).length > 0
    ? (proposals.reduce((sum, p) => sum + (p.total_gross_margin_percent || 0), 0) / proposals.filter(p => p.total_gross_margin_percent).length).toFixed(1)
    : null

  // Labor forecast
  const laborQuoted = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
  const laborWon = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
  const laborClosingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
  const hoursQuoted = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)
  const hoursWon = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)
  const hoursClosingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)

  // Needs attention
  const needsAttention = proposals.filter(p => {
    if (p.status !== 'Draft') return false
    return Math.floor((new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24)) >= 3
  }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // AR summary
  const outstandingAR = invoices.filter(i => i.status === 'Sent' || i.status === 'Partial').reduce((sum, i) => sum + (i.balance_due || 0), 0)
  const overdueAR = invoices.filter(i => {
    if (!i.due_date || i.status === 'Paid') return false
    return new Date(i.due_date) < new Date() && (i.status === 'Sent' || i.status === 'Partial')
  }).reduce((sum, i) => sum + (i.balance_due || 0), 0)
  const needsInvoice = proposals.filter(p => {
    if (p.status !== 'Won') return false
    return !invoices.some(inv => inv.proposal_id === p.id)
  }).length

  // PO summary
  const partialPOs = purchaseOrders.filter(p => p.status === 'Partial').length
  const pendingPOs = purchaseOrders.filter(p => p.status === 'Sent').length

  // Target progress
  const targetProgress = target ? Math.min(100, Math.round((wonPipeline / target.revenue_target) * 100)) : null

  // Upcoming renewals for this rep — next 90 days grouped by client
  const upcomingRenewals = (() => {
    const today = new Date()
    const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    const filtered = recurringItems.filter(item => {
      const rd = new Date(item.renewal_date)
      return rd >= today && rd <= in90
    })
    const groups = {}
    filtered.forEach(item => {
      const cid = item.proposals?.client_id || item.proposals?.company || 'unknown'
      if (!groups[cid]) groups[cid] = { clientId: item.proposals?.client_id, company: item.proposals?.company, items: [], earliestDate: item.renewal_date }
      groups[cid].items.push(item)
      if (item.renewal_date < groups[cid].earliestDate) groups[cid].earliestDate = item.renewal_date
    })
    return Object.values(groups).sort((a, b) => new Date(a.earliestDate) - new Date(b.earliestDate))
  })()

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={false} featureProposals={featureProposals} featureCRM={featureCRM} />
      <div className="flex-1 p-6">

        {/* Target progress */}
        {target && (
          <div className="bg-[#1a2d45] rounded-xl p-5 mb-6 border border-[#C8622A]/20">
            <div className="flex justify-between items-center mb-2">
              <div>
                <p className="text-white font-bold">Monthly Target</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">
                  ${wonPipeline.toLocaleString()} won of ${target.revenue_target.toLocaleString()} goal
                </p>
              </div>
              <p className={`text-2xl font-bold ${targetProgress >= 100 ? 'text-green-400' : targetProgress >= 70 ? 'text-[#C8622A]' : 'text-white'}`}>
                {targetProgress}%
              </p>
            </div>
            <div className="w-full bg-[#0F1C2E] rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${targetProgress >= 100 ? 'bg-green-500' : targetProgress >= 70 ? 'bg-[#C8622A]' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, targetProgress)}%` }}
              />
            </div>
            {target.deals_target > 0 && (
              <p className="text-[#8A9AB0] text-xs mt-2">
                {proposals.filter(p => p.status === 'Won').length} of {target.deals_target} deals closed
              </p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Active Pipeline</p><p className="text-white text-2xl font-bold">${activePipeline.toLocaleString()}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Won Pipeline</p><p className="text-green-400 text-2xl font-bold">${wonPipeline.toLocaleString()}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Avg Margin</p><p className="text-[#C8622A] text-2xl font-bold">{avgMargin ? `${avgMargin}%` : '—'}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Closing in 30 Days</p><p className="text-[#C8622A] text-2xl font-bold">{closingSoon}</p></div>
        </div>

        {/* AR + PO summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors" onClick={() => navigate('/invoices')}>
            <p className="text-white font-bold mb-3">Invoicing & AR</p>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[#8A9AB0] text-xs mb-1">Outstanding</p><p className="text-white text-lg font-bold">${outstandingAR.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Overdue</p><p className={`text-lg font-bold ${overdueAR > 0 ? 'text-red-400' : 'text-white'}`}>${overdueAR.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p></div>
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

        {/* Upcoming Renewals */}
        {upcomingRenewals.length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-5 mb-0 border border-[#C8622A]/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#C8622A]">🔄</span>
              <h3 className="text-white font-bold">Upcoming Renewals — next 90 days</h3>
            </div>
            <div className="space-y-2">
              {upcomingRenewals.map((group, i) => {
                const totalValue = group.items.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
                const daysUntil = Math.ceil((new Date(group.earliestDate) - new Date()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={i} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3 cursor-pointer hover:bg-[#0a1628] transition-colors"
                    onClick={() => group.clientId && navigate(`/client/${group.clientId}`)}>
                    <div>
                      <p className="text-white text-sm font-medium">{group.company}</p>
                      <p className="text-[#8A9AB0] text-xs">{group.items.length} item{group.items.length !== 1 ? 's' : ''} · {group.items.map(i => i.item_name).join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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

        {/* Needs Attention */}
        {!loading && needsAttention.length > 0 && (
          <div className="bg-[#1a2d45] border border-yellow-500/30 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <h3 className="text-yellow-400 font-bold text-sm">Needs Attention — {needsAttention.length} draft{needsAttention.length > 1 ? 's' : ''} not yet sent</h3>
            </div>
            <div className="space-y-2">
              {needsAttention.map(p => {
                const daysSince = Math.floor((new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24))
                return (
                  <div key={p.id} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/proposal/${p.id}`)}>
                      <p className="text-white text-sm font-medium">{p.proposal_name}</p>
                      <p className="text-[#8A9AB0] text-xs">{p.company} · Created {daysSince} day{daysSince !== 1 ? 's' : ''} ago</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <p className="text-white text-sm font-semibold">${(p.proposal_value || 0).toLocaleString()}</p>
                      <button onClick={() => markAsSent(p.id)} className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors whitespace-nowrap">Mark as Sent</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Labor Forecast */}
        {!loading && orgType !== 'manufacturer' && (laborQuoted > 0 || laborWon > 0) && (
          <div className="bg-[#1a2d45] rounded-xl p-6 mb-6">
            <div className="mb-4"><h3 className="text-white font-bold text-lg">Labor Forecast</h3><p className="text-[#8A9AB0] text-xs mt-0.5">Plan your crew and backlog</p></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Total Labor Quoted</p><p className="text-white text-xl font-bold">${laborQuoted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursQuoted.toLocaleString()} hrs</p><p className="text-[#8A9AB0] text-xs">Active pipeline</p></div>
              <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Total Labor Won</p><p className="text-green-400 text-xl font-bold">${laborWon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursWon.toLocaleString()} hrs</p><p className="text-[#8A9AB0] text-xs">Confirmed backlog</p></div>
              <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Closing in 30 Days</p><p className="text-[#C8622A] text-xl font-bold">${laborClosingSoon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#C8622A] text-xs font-semibold mt-1">{hoursClosingSoon.toLocaleString()} hrs</p><p className="text-[#8A9AB0] text-xs">Plan ahead</p></div>
            </div>
          </div>
        )}

        {/* Proposals */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-2xl font-bold">Proposals</h2>
          <div className="flex items-center gap-4">
            <p className="text-[#8A9AB0] text-sm">{filtered.length} of {proposals.length}</p>
            <button onClick={() => navigate('/new')} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ New Proposal</button>
          </div>
        </div>
        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Search by name or company..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <div className="flex gap-2">
            {['All', 'Draft', 'Sent', 'Won', 'Lost'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>{s}</button>
            ))}
          </div>
        </div>
        {loading ? <p className="text-[#8A9AB0]">Loading...</p> : filtered.length === 0 ? (
          <p className="text-[#8A9AB0]">No proposals yet. Click + New Proposal to get started.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(proposal => (
              <div key={proposal.id} onClick={() => navigate(`/proposal/${proposal.id}`)}
                className="bg-[#1a2d45] rounded-xl p-5 flex justify-between items-center cursor-pointer hover:bg-[#1f3550] transition-colors">
                <div>
                  <p className="text-white font-semibold">{proposal.proposal_name}</p>
                  <p className="text-[#8A9AB0] text-sm">{proposal.company} · {proposal.rep_name}</p>
                </div>
                <div className="flex items-center gap-4">
                  {proposal.total_gross_margin_percent && <p className="text-[#C8622A] text-sm font-semibold">{proposal.total_gross_margin_percent.toFixed(1)}%</p>}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' : proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' : 'bg-[#8A9AB0]/20 text-[#8A9AB0]'}`}>{proposal.status}</span>
                  <p className="text-[#8A9AB0] text-sm">{proposal.close_date}</p>
                  <span className="text-[#8A9AB0]">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function AdminDashboard({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [clients, setClients] = useState([])
  const [profiles, setProfiles] = useState([])
  const [targets, setTargets] = useState([])
  const [invoices, setInvoices] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [orgType] = useState(() => sessionStorage.getItem('orgType') || 'integrator')
  const [showSetTargetModal, setShowSetTargetModal] = useState(false)
  const [targetForm, setTargetForm] = useState({ profile_id: '', revenue_target: '', deals_target: '', period_start: new Date().toISOString().split('T')[0].slice(0, 7) + '-01' })
  const [savingTarget, setSavingTarget] = useState(false)
  const [recurringItems, setRecurringItems] = useState([])
  const [targetPeriod, setTargetPeriod] = useState('monthly')
  const navigate = useNavigate()

  useEffect(() => { fetchOrgData() }, [])

  const fetchOrgData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }

    const [proposalsRes, lineItemsRes, clientsRes, profilesRes, targetsRes, invoicesRes, posRes, recurringRes] = await Promise.all([
      supabase.from('proposals').select('id,proposal_name,company,client_name,client_email,client_id,rep_name,rep_email,industry,status,close_date,proposal_value,total_customer_value,total_your_cost,total_gross_margin_dollars,total_gross_margin_percent,labor_items,created_at,org_id,user_id,collaborator_ids,has_recurring,scope_of_work,job_description,submission_type').eq('org_id', profile.org_id).order('created_at', { ascending: false }),
      supabase.from('bom_line_items').select('vendor, customer_price_total, proposal_id'),
      supabase.from('clients').select('*').eq('org_id', profile.org_id),
      supabase.from('profiles').select('id, full_name, email').eq('org_id', profile.org_id),
      supabase.from('targets').select('*').eq('org_id', profile.org_id),
      supabase.from('invoices').select('*').eq('org_id', profile.org_id),
      supabase.from('purchase_orders').select('*').eq('org_id', profile.org_id),
      supabase.from('bom_line_items').select('*, proposals(proposal_name, company, client_id, rep_name, user_id)').eq('recurring', true).not('renewal_date', 'is', null),
    ])

    setProposals(proposalsRes.data || [])
    setLineItems(lineItemsRes.data || [])
    setClients(clientsRes.data || [])
    setProfiles(profilesRes.data || [])
    setTargets(targetsRes.data || [])
    setInvoices(invoicesRes.data || [])
    setPurchaseOrders(posRes.data || [])
    setRecurringItems(recurringRes.data || [])
    setLoading(false)
  }

  const markAsSent = async (proposalId) => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', proposalId)
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'Sent' } : p))
  }

  const saveTarget = async () => {
    setSavingTarget(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

    const existing = targets.find(t => t.profile_id === targetForm.profile_id && t.period_start === targetForm.period_start)
    if (existing) {
      await supabase.from('targets').update({ revenue_target: parseFloat(targetForm.revenue_target) || 0, deals_target: parseInt(targetForm.deals_target) || 0 }).eq('id', existing.id)
    } else {
      await supabase.from('targets').insert({ org_id: profile.org_id, profile_id: targetForm.profile_id, period: targetPeriod, period_start: targetForm.period_start, revenue_target: parseFloat(targetForm.revenue_target) || 0, deals_target: parseInt(targetForm.deals_target) || 0 })
    }
    setShowSetTargetModal(false)
    fetchOrgData()
    setSavingTarget(false)
  }

  const getStartDate = (p) => {
    const now = new Date()
    if (p === 'mtd') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (p === 'qtd') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    if (p === 'ytd') return new Date(now.getFullYear(), 0, 1)
    return null
  }

  const filteredProposals = useMemo(() => {
    const startDate = getStartDate(period)
    if (!startDate) return proposals
    return proposals.filter(p => new Date(p.created_at) >= startDate)
  }, [proposals, period])

  const activePipeline = filteredProposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const wonPipeline = filteredProposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const closingSoon = filteredProposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).length
  const avgMargin = filteredProposals.filter(p => p.total_gross_margin_percent).length > 0
    ? (filteredProposals.reduce((sum, p) => sum + (p.total_gross_margin_percent || 0), 0) / filteredProposals.filter(p => p.total_gross_margin_percent).length).toFixed(1) : null
  const wonCount = filteredProposals.filter(p => p.status === 'Won').length
  const closeRate = filteredProposals.length > 0 ? ((wonCount / filteredProposals.length) * 100).toFixed(1) : null

  // AR summary
  const outstandingAR = invoices.filter(i => i.status === 'Sent' || i.status === 'Partial').reduce((sum, i) => sum + (i.balance_due || 0), 0)
  const overdueAR = invoices.filter(i => {
    if (!i.due_date || i.status === 'Paid') return false
    return new Date(i.due_date) < new Date() && (i.status === 'Sent' || i.status === 'Partial')
  }).reduce((sum, i) => sum + (i.balance_due || 0), 0)
  const needsInvoice = proposals.filter(p => p.status === 'Won' && !invoices.some(inv => inv.proposal_id === p.id)).length
  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0)

  // PO summary
  const partialPOs = purchaseOrders.filter(p => p.status === 'Partial').length
  const pendingPOs = purchaseOrders.filter(p => p.status === 'Sent').length
  const totalPOValue = purchaseOrders.reduce((sum, p) => sum + (p.total_amount || 0), 0)

  const repStats = Object.values(
    filteredProposals.reduce((acc, p) => {
      const rep = p.rep_name || 'Unknown'
      if (!acc[rep]) acc[rep] = { name: rep, pipeline: 0, won: 0, count: 0, margins: [] }
      acc[rep].pipeline += p.proposal_value || 0
      if (p.status === 'Won') acc[rep].won += p.proposal_value || 0
      acc[rep].count += 1
      if (p.total_gross_margin_percent) acc[rep].margins.push(p.total_gross_margin_percent)
      return acc
    }, {})
  ).map(rep => ({
    ...rep,
    avgMargin: rep.margins.length > 0 ? (rep.margins.reduce((a, b) => a + b, 0) / rep.margins.length).toFixed(1) : null
  })).sort((a, b) => b.pipeline - a.pipeline)

  const closingSoonList = filteredProposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).sort((a, b) => new Date(a.close_date) - new Date(b.close_date)).slice(0, 5)

  const topClients = useMemo(() => {
    const clientMap = {}
    filteredProposals.forEach(p => {
      if (!p.client_id) return
      if (!clientMap[p.client_id]) {
        const client = clients.find(c => c.id === p.client_id)
        clientMap[p.client_id] = { id: p.client_id, name: client?.company || p.company || 'Unknown', pipeline: 0, won: 0, count: 0 }
      }
      clientMap[p.client_id].pipeline += p.proposal_value || 0
      if (p.status === 'Won') clientMap[p.client_id].won += p.proposal_value || 0
      clientMap[p.client_id].count += 1
    })
    return Object.values(clientMap).sort((a, b) => b.pipeline - a.pipeline).slice(0, 5)
  }, [filteredProposals, clients])

  const topVendors = useMemo(() => {
    const proposalIds = new Set(filteredProposals.map(p => p.id))
    const vendorMap = {}
    lineItems.filter(l => proposalIds.has(l.proposal_id) && l.vendor).forEach(l => {
      if (!vendorMap[l.vendor]) vendorMap[l.vendor] = { name: l.vendor, total: 0, count: 0 }
      vendorMap[l.vendor].total += l.customer_price_total || 0
      vendorMap[l.vendor].count += 1
    })
    return Object.values(vendorMap).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [lineItems, filteredProposals])

  const needsAttention = useMemo(() =>
    proposals.filter(p => {
      if (p.status !== 'Draft') return false
      return Math.floor((new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24)) >= 3
    }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  , [proposals])

  const laborStats = useMemo(() => {
    const getLaborTotal = (ps) => ps.reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0), 0)
    const getLaborHours = (ps) => ps.reduce((sum, p) => sum + (p.labor_items || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0), 0)
    const active = filteredProposals.filter(p => p.status !== 'Won' && p.status !== 'Lost')
    const won = filteredProposals.filter(p => p.status === 'Won')
    const closingSoonPs = filteredProposals.filter(p => {
      if (!p.close_date) return false
      const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
      return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
    })
    const dealsWithLabor = active.filter(p => (p.labor_items || []).some(l => parseFloat(l.customer_price) > 0))
    const laborQuoted = getLaborTotal(active)
    return { laborQuoted, laborWon: getLaborTotal(won), laborClosingSoon: getLaborTotal(closingSoonPs), hoursQuoted: getLaborHours(active), hoursWon: getLaborHours(won), hoursClosingSoon: getLaborHours(closingSoonPs), avgLaborPerDeal: dealsWithLabor.length > 0 ? getLaborTotal(active) / dealsWithLabor.length : 0, dealsWithLabor: dealsWithLabor.length }
  }, [filteredProposals])

  // Upcoming renewals filtered by selected period
  const upcomingRenewals = useMemo(() => {
    const today = new Date()
    const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    // For period filter, use the period's start date as the lower bound
    const periodStart = getStartDate(period)
    const filtered = recurringItems.filter(item => {
      const rd = new Date(item.renewal_date)
      if (period === 'all') return rd >= today && rd <= in90
      // Show renewals within the period window
      return rd >= today && rd <= in90 && (!periodStart || rd >= periodStart)
    })
    // Group by client_id (via proposal)
    const groups = {}
    filtered.forEach(item => {
      const cid = item.proposals?.client_id || item.proposals?.company || 'unknown'
      if (!groups[cid]) groups[cid] = { clientId: item.proposals?.client_id, company: item.proposals?.company, repName: item.proposals?.rep_name, items: [], earliestDate: item.renewal_date }
      groups[cid].items.push(item)
      if (item.renewal_date < groups[cid].earliestDate) groups[cid].earliestDate = item.renewal_date
    })
    return Object.values(groups).sort((a, b) => new Date(a.earliestDate) - new Date(b.earliestDate))
  }, [recurringItems])

  // Targets per rep for current month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const repTargets = useMemo(() => {
    return profiles.map(p => {
      const target = targets.find(t => t.profile_id === p.id && t.period_start === monthStart)
      const repProposals = proposals.filter(prop => prop.rep_name === p.full_name && prop.status === 'Won')
      const wonRevenue = repProposals.reduce((sum, prop) => sum + (prop.proposal_value || 0), 0)
      const wonDeals = repProposals.length
      return { ...p, target, wonRevenue, wonDeals, progress: target?.revenue_target > 0 ? Math.min(100, Math.round((wonRevenue / target.revenue_target) * 100)) : null }
    }).filter(p => p.target || p.wonRevenue > 0)
  }, [profiles, targets, proposals, monthStart])

  const periodLabels = { all: 'All Time', ytd: 'Year to Date', qtd: 'Quarter to Date', mtd: 'Month to Date' }
  const periodShort = { all: '', ytd: ' — YTD', qtd: ' — QTD', mtd: ' — MTD' }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={true} featureProposals={featureProposals} featureCRM={featureCRM} />
      <div className="flex-1 p-6 overflow-y-auto h-screen">

        <div className="sticky top-0 z-10 bg-[#0F1C2E] pt-2 pb-4 mb-2 border-b border-[#2a3d55]">
          <div className="flex justify-between items-center">
            <h2 className="text-white text-2xl font-bold">Team Dashboard</h2>
            <div className="flex gap-2">
              {Object.entries(periodLabels).map(([key, label]) => (
                <button key={key} onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          <div onClick={() => navigate('/proposals')} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"><p className="text-[#8A9AB0] text-xs mb-1">Active Pipeline</p><p className="text-white text-xl font-bold">${activePipeline.toLocaleString()}</p></div>
          <div onClick={() => navigate('/proposals')} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"><p className="text-[#8A9AB0] text-xs mb-1">Won Revenue</p><p className="text-green-400 text-xl font-bold">${wonPipeline.toLocaleString()}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-xs mb-1">Avg Margin</p><p className="text-[#C8622A] text-xl font-bold">{avgMargin ? `${avgMargin}%` : '—'}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-xs mb-1">Close Rate</p><p className="text-[#C8622A] text-xl font-bold">{closeRate ? `${closeRate}%` : '—'}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-xs mb-1">Closing in 30d</p><p className="text-[#C8622A] text-xl font-bold">{closingSoon}</p></div>
          <div onClick={() => navigate('/proposals')} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"><p className="text-[#8A9AB0] text-xs mb-1">Total Proposals</p><p className="text-white text-xl font-bold">{filteredProposals.length}</p></div>
        </div>

        {/* AR + PO Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors" onClick={() => navigate('/invoices')}>
            <p className="text-white font-bold mb-3">Invoicing & AR</p>
            <div className="grid grid-cols-4 gap-3">
              <div><p className="text-[#8A9AB0] text-xs mb-1">Total Invoiced</p><p className="text-white text-lg font-bold">${totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Outstanding</p><p className="text-white text-lg font-bold">${outstandingAR.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Overdue</p><p className={`text-lg font-bold ${overdueAR > 0 ? 'text-red-400' : 'text-white'}`}>${overdueAR.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Needs Invoice</p><p className={`text-lg font-bold ${needsInvoice > 0 ? 'text-yellow-400' : 'text-white'}`}>{needsInvoice}</p></div>
            </div>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors" onClick={() => navigate('/purchase-orders')}>
            <p className="text-white font-bold mb-3">Purchase Orders</p>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[#8A9AB0] text-xs mb-1">Total Value</p><p className="text-white text-lg font-bold">${totalPOValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Partial</p><p className={`text-lg font-bold ${partialPOs > 0 ? 'text-yellow-400' : 'text-white'}`}>{partialPOs}</p></div>
              <div><p className="text-[#8A9AB0] text-xs mb-1">Pending</p><p className={`text-lg font-bold ${pendingPOs > 0 ? 'text-blue-400' : 'text-white'}`}>{pendingPOs}</p></div>
            </div>
          </div>
        </div>

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
                      <p className="text-[#8A9AB0] text-xs">{p.rep_name} · {p.company} · Created {daysSince} day{daysSince !== 1 ? 's' : ''} ago</p>
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

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Rep Leaderboard */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Rep Leaderboard{periodShort[period]}</h3>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : repStats.length === 0 ? <p className="text-[#8A9AB0]">No data yet.</p> : (
              <div className="space-y-4">
                {repStats.map((rep, i) => (
                  <div key={rep.name} onClick={() => navigate(`/proposals?rep=${encodeURIComponent(rep.name)}`)}
                    className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>#{i + 1}</span>
                      <div>
                        <p className="text-white text-sm font-medium">{rep.name}</p>
                        <p className="text-[#8A9AB0] text-xs">{rep.count} proposals</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-bold">${rep.pipeline.toLocaleString()}</p>
                      <div className="flex gap-2 justify-end">
                        <p className="text-green-400 text-xs">${rep.won.toLocaleString()} won</p>
                        {rep.avgMargin && <p className="text-[#C8622A] text-xs">{rep.avgMargin}% margin</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Closing Soon */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Closing Soon</h3>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : closingSoonList.length === 0 ? <p className="text-[#8A9AB0]">Nothing closing in the next 30 days.</p> : (
              <div className="space-y-3">
                {closingSoonList.map(p => {
                  const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={p.id} onClick={() => navigate(`/proposal/${p.id}`)} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                      <div><p className="text-white text-sm font-medium">{p.proposal_name}</p><p className="text-[#8A9AB0] text-xs">{p.rep_name} · {p.company}</p></div>
                      <div className="text-right">
                        <p className="text-white text-sm font-bold">${(p.proposal_value || 0).toLocaleString()}</p>
                        <p className={`text-xs font-semibold ${days <= 7 ? 'text-red-400' : 'text-[#C8622A]'}`}>{days === 0 ? 'Today' : `${days}d left`}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Renewals */}
        {upcomingRenewals.length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-6 mb-6 border border-[#C8622A]/20">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[#C8622A] text-lg">🔄</span>
                <h3 className="text-white font-bold text-lg">Upcoming Renewals</h3>
                <span className="text-[#8A9AB0] text-xs ml-1">— next 90 days</span>
              </div>
              <div className="flex gap-6">
                <div className="text-right">
                  <p className="text-[#8A9AB0] text-xs">Total Renewal Value</p>
                  <p className="text-[#C8622A] font-bold">${upcomingRenewals.reduce((sum, g) => sum + g.items.reduce((s, i) => s + (i.customer_price_total || 0), 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#8A9AB0] text-xs">Renewals Due</p>
                  <p className="text-white font-bold">{upcomingRenewals.length} client{upcomingRenewals.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {upcomingRenewals.map((group, i) => {
                const totalValue = group.items.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
                const daysUntil = Math.ceil((new Date(group.earliestDate) - new Date()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={i} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3 cursor-pointer hover:bg-[#0a1628] transition-colors"
                    onClick={() => group.clientId && navigate(`/client/${group.clientId}`)}>
                    <div>
                      <p className="text-white text-sm font-medium">{group.company}</p>
                      <p className="text-[#8A9AB0] text-xs">{group.repName} · {group.items.length} item{group.items.length !== 1 ? 's' : ''}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {group.items.map(item => (
                          <span key={item.id} className="text-xs bg-[#1a2d45] text-[#8A9AB0] px-2 py-0.5 rounded">{item.item_name}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-4">
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

        {/* Rep Targets */}
        <div className="bg-[#1a2d45] rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-white font-bold text-lg">Rep Targets — {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
              <p className="text-[#8A9AB0] text-xs mt-0.5">Monthly revenue goals vs actuals</p>
            </div>
            <button onClick={() => setShowSetTargetModal(true)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Set Target</button>
          </div>
          {repTargets.length === 0 ? (
            <p className="text-[#8A9AB0] text-sm">No targets set yet. Click "Set Target" to assign monthly goals to your reps.</p>
          ) : (
            <div className="space-y-4">
              {repTargets.map(rep => (
                <div key={rep.id} className="bg-[#0F1C2E] rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{rep.full_name}</p>
                      <p className="text-[#8A9AB0] text-xs">${rep.wonRevenue.toLocaleString()} won{rep.target ? ` of $${rep.target.revenue_target.toLocaleString()} goal` : ''}</p>
                    </div>
                    <p className={`text-xl font-bold ${rep.progress >= 100 ? 'text-green-400' : rep.progress >= 70 ? 'text-[#C8622A]' : 'text-white'}`}>
                      {rep.progress !== null ? `${rep.progress}%` : '—'}
                    </p>
                  </div>
                  {rep.target && (
                    <div className="w-full bg-[#1a2d45] rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full transition-all ${rep.progress >= 100 ? 'bg-green-500' : rep.progress >= 70 ? 'bg-[#C8622A]' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, rep.progress || 0)}%` }} />
                    </div>
                  )}
                  {rep.target?.deals_target > 0 && (
                    <p className="text-[#8A9AB0] text-xs mt-1.5">{rep.wonDeals} of {rep.target.deals_target} deals closed</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Top Clients{periodShort[period]}</h3>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : topClients.length === 0 ? <p className="text-[#8A9AB0]">No client data yet.</p> : (
              <div className="space-y-4">
                {topClients.map((client, i) => (
                  <div key={client.id} onClick={() => navigate(`/client/${client.id}`)} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>#{i + 1}</span>
                      <div><p className="text-white text-sm font-medium">{client.name}</p><p className="text-[#8A9AB0] text-xs">{client.count} proposals</p></div>
                    </div>
                    <div className="text-right"><p className="text-white text-sm font-bold">${client.pipeline.toLocaleString()}</p><p className="text-green-400 text-xs">${client.won.toLocaleString()} won</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Top Vendors{periodShort[period]}</h3>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : topVendors.length === 0 ? <p className="text-[#8A9AB0]">No vendor data yet.</p> : (
              <div className="space-y-4">
                {topVendors.map((vendor, i) => (
                  <div key={vendor.name} onClick={() => navigate('/vendors')} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>#{i + 1}</span>
                      <div><p className="text-white text-sm font-medium">{vendor.name}</p><p className="text-[#8A9AB0] text-xs">{vendor.count} line items</p></div>
                    </div>
                    <p className="text-white text-sm font-bold">${vendor.total.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Labor Forecast */}
        {orgType !== 'manufacturer' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <div><h3 className="text-white font-bold text-lg">Labor Forecast{periodShort[period]}</h3><p className="text-[#8A9AB0] text-xs mt-0.5">Use this to plan crew scheduling and backlog</p></div>
              {laborStats.dealsWithLabor > 0 && <span className="text-[#8A9AB0] text-xs">{laborStats.dealsWithLabor} deal{laborStats.dealsWithLabor !== 1 ? 's' : ''} with labor</span>}
            </div>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : laborStats.laborQuoted === 0 && laborStats.laborWon === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No labor data yet.</p>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Total Labor Quoted</p><p className="text-white text-xl font-bold">${laborStats.laborQuoted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#C8622A] text-xs font-semibold mt-1">{laborStats.hoursQuoted.toLocaleString()} hrs</p><p className="text-[#8A9AB0] text-xs">Active pipeline</p></div>
                <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Total Labor Won</p><p className="text-green-400 text-xl font-bold">${laborStats.laborWon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#C8622A] text-xs font-semibold mt-1">{laborStats.hoursWon.toLocaleString()} hrs</p><p className="text-[#8A9AB0] text-xs">Confirmed backlog</p></div>
                <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Closing in 30 Days</p><p className="text-[#C8622A] text-xl font-bold">${laborStats.laborClosingSoon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#C8622A] text-xs font-semibold mt-1">{laborStats.hoursClosingSoon.toLocaleString()} hrs</p><p className="text-[#8A9AB0] text-xs">Plan ahead</p></div>
                <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Avg Labor per Deal</p><p className="text-white text-xl font-bold">${laborStats.avgLaborPerDeal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-[#8A9AB0] text-xs mt-1">Across active deals</p></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Set Target Modal */}
      {showSetTargetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Set Target</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Assign a revenue goal to a rep.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Period</label>
                <div className="flex gap-2">
                  {['monthly', 'quarterly', 'annual'].map(p => (
                    <button key={p} onClick={() => setTargetPeriod(p)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${targetPeriod === p ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Rep</label>
                <select value={targetForm.profile_id} onChange={e => setTargetForm(p => ({ ...p, profile_id: e.target.value }))} className={inputClass}>
                  <option value="">— Select rep —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">{targetPeriod === 'monthly' ? 'Month' : targetPeriod === 'quarterly' ? 'Quarter Start' : 'Year Start'}</label>
                <input type="month" value={targetForm.period_start?.slice(0, 7)} onChange={e => setTargetForm(p => ({ ...p, period_start: e.target.value + '-01' }))} className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Revenue Target ($)</label>
                <input type="number" value={targetForm.revenue_target} onChange={e => setTargetForm(p => ({ ...p, revenue_target: e.target.value }))} placeholder="e.g. 50000" className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Deals Target (optional)</label>
                <input type="number" value={targetForm.deals_target} onChange={e => setTargetForm(p => ({ ...p, deals_target: e.target.value }))} placeholder="e.g. 5" className={inputClass} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSetTargetModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveTarget} disabled={savingTarget || !targetForm.profile_id || !targetForm.revenue_target}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingTarget ? 'Saving...' : 'Save Target'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
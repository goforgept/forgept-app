import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function AdminDashboard() {
  const [proposals, setProposals] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    fetchOrgData()
  }, [])

  const fetchOrgData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) { setLoading(false); return }

    // Fetch proposals first so we can scope line items to this org
    const { data: proposalsData, error: proposalsError } = await supabase
      .from('proposals')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (!proposalsError) setProposals(proposalsData)

    // Scope line items explicitly to this org's proposal IDs
    const proposalIds = (proposalsData || []).map(p => p.id)

    const [lineItemsRes, clientsRes] = await Promise.all([
      proposalIds.length > 0
        ? supabase.from('bom_line_items').select('vendor, customer_price_total, proposal_id').in('proposal_id', proposalIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('clients').select('*').eq('org_id', profile.org_id)
    ])

    if (!lineItemsRes.error) setLineItems(lineItemsRes.data)
    if (!clientsRes.error) setClients(clientsRes.data)
    setLoading(false)
  }

  const getStartDate = (period) => {
    const now = new Date()
    if (period === 'mtd') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (period === 'qtd') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    if (period === 'ytd') return new Date(now.getFullYear(), 0, 1)
    return null
  }

  const filteredProposals = useMemo(() => {
    const startDate = getStartDate(period)
    if (!startDate) return proposals
    return proposals.filter(p => new Date(p.created_at) >= startDate)
  }, [proposals, period])

  const activePipeline = filteredProposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = filteredProposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const closingSoon = filteredProposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).length

  const avgMargin = filteredProposals.filter(p => p.total_gross_margin_percent).length > 0
    ? (filteredProposals.reduce((sum, p) => sum + (p.total_gross_margin_percent || 0), 0) / filteredProposals.filter(p => p.total_gross_margin_percent).length).toFixed(1)
    : null

  const wonCount = filteredProposals.filter(p => p.status === 'Won').length
  const closeRate = filteredProposals.length > 0
    ? ((wonCount / filteredProposals.length) * 100).toFixed(1)
    : null

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
    avgMargin: rep.margins.length > 0
      ? (rep.margins.reduce((a, b) => a + b, 0) / rep.margins.length).toFixed(1)
      : null
  })).sort((a, b) => b.pipeline - a.pipeline)

  const closingSoonList = filteredProposals
    .filter(p => {
      if (!p.close_date) return false
      const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
      return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
    })
    .sort((a, b) => new Date(a.close_date) - new Date(b.close_date))
    .slice(0, 5)

  const topClients = useMemo(() => {
    const clientMap = {}
    filteredProposals.forEach(p => {
      if (!p.client_id) return
      if (!clientMap[p.client_id]) {
        const client = clients.find(c => c.id === p.client_id)
        clientMap[p.client_id] = {
          id: p.client_id,
          name: client?.company || p.company || 'Unknown',
          pipeline: 0,
          won: 0,
          count: 0
        }
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
    lineItems
      .filter(l => proposalIds.has(l.proposal_id) && l.vendor)
      .forEach(l => {
        const vendor = l.vendor
        if (!vendorMap[vendor]) vendorMap[vendor] = { name: vendor, total: 0, count: 0 }
        vendorMap[vendor].total += l.customer_price_total || 0
        vendorMap[vendor].count += 1
      })
    return Object.values(vendorMap).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [lineItems, filteredProposals])

  const periodLabels = { all: 'All Time', ytd: 'Year to Date', qtd: 'Quarter to Date', mtd: 'Month to Date' }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={true} />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-2xl font-bold">Team Dashboard</h2>
          <div className="flex gap-2">
            {Object.entries(periodLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  period === key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div
            onClick={() => navigate(`/proposals?status=active`)}
            className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"
          >
            <p className="text-[#8A9AB0] text-sm mb-1">Active Pipeline</p>
            <p className="text-white text-2xl font-bold">${activePipeline.toLocaleString()}</p>
          </div>
          <div
            onClick={() => navigate(`/proposals?status=Won`)}
            className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"
          >
            <p className="text-[#8A9AB0] text-sm mb-1">Won Pipeline</p>
            <p className="text-green-400 text-2xl font-bold">${wonPipeline.toLocaleString()}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Avg Margin</p>
            <p className="text-[#C8622A] text-2xl font-bold">{avgMargin ? `${avgMargin}%` : '—'}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Close Rate</p>
            <p className="text-[#C8622A] text-2xl font-bold">{closeRate ? `${closeRate}%` : '—'}</p>
          </div>
          <div
            onClick={() => navigate(`/proposals?closing=30`)}
            className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"
          >
            <p className="text-[#8A9AB0] text-sm mb-1">Closing in 30 Days</p>
            <p className="text-[#C8622A] text-2xl font-bold">{closingSoon}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Rep Leaderboard */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Rep Leaderboard</h3>
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : repStats.length === 0 ? (
              <p className="text-[#8A9AB0]">No data yet.</p>
            ) : (
              <div className="space-y-4">
                {repStats.map((rep, i) => (
                  <div
                    key={rep.name}
                    onClick={() => navigate(`/proposals?rep=${encodeURIComponent(rep.name)}`)}
                    className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>
                        #{i + 1}
                      </span>
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
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : closingSoonList.length === 0 ? (
              <p className="text-[#8A9AB0]">Nothing closing in the next 30 days.</p>
            ) : (
              <div className="space-y-3">
                {closingSoonList.map(p => {
                  const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/proposal/${p.id}`)}
                      className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors"
                    >
                      <div>
                        <p className="text-white text-sm font-medium">{p.proposal_name}</p>
                        <p className="text-[#8A9AB0] text-xs">{p.rep_name} · {p.company}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-sm">${(p.proposal_value || 0).toLocaleString()}</p>
                        <p className={`text-xs font-semibold ${days <= 7 ? 'text-red-400' : 'text-[#C8622A]'}`}>
                          {days === 0 ? 'Today' : `${days}d left`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Top Clients */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Top Clients</h3>
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : topClients.length === 0 ? (
              <p className="text-[#8A9AB0]">No client data yet.</p>
            ) : (
              <div className="space-y-4">
                {topClients.map((client, i) => (
                  <div
                    key={client.id}
                    onClick={() => navigate(`/client/${client.id}`)}
                    className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>
                        #{i + 1}
                      </span>
                      <div>
                        <p className="text-white text-sm font-medium">{client.name}</p>
                        <p className="text-[#8A9AB0] text-xs">{client.count} proposals</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-bold">${client.pipeline.toLocaleString()}</p>
                      <p className="text-green-400 text-xs">${client.won.toLocaleString()} won</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Vendors */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Top Vendors</h3>
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : topVendors.length === 0 ? (
              <p className="text-[#8A9AB0]">No vendor data yet.</p>
            ) : (
              <div className="space-y-4">
                {topVendors.map((vendor, i) => (
                  <div
                    key={vendor.name}
                    onClick={() => navigate(`/vendors`)}
                    className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>
                        #{i + 1}
                      </span>
                      <div>
                        <p className="text-white text-sm font-medium">{vendor.name}</p>
                        <p className="text-[#8A9AB0] text-xs">{vendor.count} line items</p>
                      </div>
                    </div>
                    <p className="text-white text-sm font-bold">${vendor.total.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
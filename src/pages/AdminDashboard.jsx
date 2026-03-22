import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function AdminDashboard() {
  const [proposals, setProposals] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [clients, setClients] = useState([])
  const [tasks, setTasks] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [orgId, setOrgId] = useState(null)
  const [userId, setUserId] = useState(null)
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
    setOrgId(profile.org_id)
    setUserId(user.id)

    const { data: proposalsData, error: proposalsError } = await supabase
      .from('proposals')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (!proposalsError) setProposals(proposalsData)

    const proposalIds = (proposalsData || []).map(p => p.id)

    const [lineItemsRes, clientsRes, tasksRes, activitiesRes] = await Promise.all([
      proposalIds.length > 0
        ? supabase.from('bom_line_items').select('vendor, customer_price_total, proposal_id').in('proposal_id', proposalIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('clients').select('*').eq('org_id', profile.org_id),
      supabase.from('tasks')
        .select('*, clients(company), profiles!tasks_assigned_to_fkey(full_name)')
        .eq('org_id', profile.org_id)
        .eq('completed', false)
        .order('due_date', { ascending: true }),
      supabase.from('activities')
        .select('*, profiles(full_name), clients(company)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(8)
    ])

    if (!lineItemsRes.error) setLineItems(lineItemsRes.data)
    if (!clientsRes.error) setClients(clientsRes.data)
    if (!tasksRes.error) setTasks(tasksRes.data || [])
    if (!activitiesRes.error) setActivities(activitiesRes.data || [])
    setLoading(false)
  }

  const toggleTask = async (task) => {
    await supabase.from('tasks').update({
      completed: true,
      completed_at: new Date().toISOString()
    }).eq('id', task.id)
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  const markAsSent = async (proposalId) => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', proposalId)
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'Sent' } : p))
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
    ? (filteredProposals.reduce((sum, p) => sum + (p.total_gross_margin_percent || 0), 0) /
        filteredProposals.filter(p => p.total_gross_margin_percent).length).toFixed(1)
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
          pipeline: 0, won: 0, count: 0
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
        if (!vendorMap[l.vendor]) vendorMap[l.vendor] = { name: l.vendor, total: 0, count: 0 }
        vendorMap[l.vendor].total += l.customer_price_total || 0
        vendorMap[l.vendor].count += 1
      })
    return Object.values(vendorMap).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [lineItems, filteredProposals])

  const needsAttention = useMemo(() =>
    proposals.filter(p => {
      if (p.status !== 'Draft') return false
      const daysSince = Math.floor((new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24))
      return daysSince >= 3
    }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  , [proposals])

  const isOverdue = (task) => {
    if (!task.due_date) return false
    return new Date(task.due_date) < new Date()
  }

  const isDueToday = (task) => {
    if (!task.due_date) return false
    return task.due_date === new Date().toISOString().split('T')[0]
  }

  const todayTasks = tasks.filter(t => isDueToday(t))
  const overdueTasks = tasks.filter(t => isOverdue(t))
  const upcomingTasks = tasks.filter(t => !isDueToday(t) && !isOverdue(t)).slice(0, 3)

  const formatActivityTime = (date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString()
  }

  const activityIcon = (type) => {
    const icons = { call: '📞', email: '✉️', meeting: '🤝', note: '📝' }
    return icons[type] || '📝'
  }

  const priorityColor = (p) => {
    if (p === 'high') return 'text-red-400'
    if (p === 'low') return 'text-[#8A9AB0]'
    return 'text-[#C8622A]'
  }

  const periodLabels = { all: 'All Time', ytd: 'Year to Date', qtd: 'Quarter to Date', mtd: 'Month to Date' }
  const periodShort = { all: '', ytd: ' — YTD', qtd: ' — QTD', mtd: ' — MTD' }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={true} />

      <div className="flex-1 p-6">

        {/* Header */}
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

        {/* Stats — 6 cards */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          <div onClick={() => navigate(`/proposals?status=active`)} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors">
            <p className="text-[#8A9AB0] text-xs mb-1">Active Pipeline</p>
            <p className="text-white text-xl font-bold">${activePipeline.toLocaleString()}</p>
          </div>
          <div onClick={() => navigate(`/proposals?status=Won`)} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors">
            <p className="text-[#8A9AB0] text-xs mb-1">Won Revenue</p>
            <p className="text-green-400 text-xl font-bold">${wonPipeline.toLocaleString()}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Avg Margin</p>
            <p className="text-[#C8622A] text-xl font-bold">{avgMargin ? `${avgMargin}%` : '—'}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Close Rate</p>
            <p className="text-[#C8622A] text-xl font-bold">{closeRate ? `${closeRate}%` : '—'}</p>
          </div>
          <div onClick={() => navigate(`/proposals?closing=30`)} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors">
            <p className="text-[#8A9AB0] text-xs mb-1">Closing in 30d</p>
            <p className="text-[#C8622A] text-xl font-bold">{closingSoon}</p>
          </div>
          <div onClick={() => navigate(`/tasks`)} className="bg-[#1a2d45] rounded-xl p-5 cursor-pointer hover:bg-[#1f3550] transition-colors">
            <p className="text-[#8A9AB0] text-xs mb-1">Open Tasks</p>
            <p className={`text-xl font-bold ${overdueTasks.length > 0 ? 'text-red-400' : 'text-white'}`}>
              {tasks.length}
              {overdueTasks.length > 0 && <span className="text-xs font-normal text-red-400 ml-1">({overdueTasks.length} overdue)</span>}
            </p>
          </div>
        </div>

        {/* Needs Attention */}
        {!loading && needsAttention.length > 0 && (
          <div className="bg-[#1a2d45] border border-yellow-500/30 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <h3 className="text-yellow-400 font-bold text-sm">
                Needs Attention — {needsAttention.length} draft{needsAttention.length > 1 ? 's' : ''} not yet sent
              </h3>
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
                      <button onClick={() => markAsSent(p.id)} className="bg-[#C8622A] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors whitespace-nowrap">
                        Mark as Sent
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tasks Today + Recent Activity */}
        <div className="grid grid-cols-2 gap-6 mb-6">

          {/* Tasks Due Today */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">
                Tasks Today
                {todayTasks.length > 0 && (
                  <span className="ml-2 bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-semibold">
                    {todayTasks.length}
                  </span>
                )}
              </h3>
              <button onClick={() => navigate('/tasks')} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">
                View all →
              </button>
            </div>

            {loading ? (
              <p className="text-[#8A9AB0] text-sm">Loading...</p>
            ) : tasks.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No open tasks. You are all caught up.</p>
            ) : (
              <div className="space-y-2">
                {/* Overdue first */}
                {overdueTasks.slice(0, 2).map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                    <button
                      onClick={() => toggleTask(task)}
                      className="w-5 h-5 rounded border-2 border-[#2a3d55] hover:border-[#C8622A] flex items-center justify-center shrink-0 transition-colors"
                    />
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{task.title}</p>
                      <div className="flex gap-2 mt-0.5">
                        {task.clients?.company && <span className="text-[#C8622A] text-xs">{task.clients.company}</span>}
                        {task.profiles?.full_name && <span className="text-[#8A9AB0] text-xs">{task.profiles.full_name}</span>}
                      </div>
                    </div>
                    <span className="text-red-400 text-xs font-semibold">Overdue</span>
                  </div>
                ))}
                {/* Due today */}
                {todayTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#C8622A]/20 bg-[#C8622A]/5">
                    <button
                      onClick={() => toggleTask(task)}
                      className="w-5 h-5 rounded border-2 border-[#2a3d55] hover:border-[#C8622A] flex items-center justify-center shrink-0 transition-colors"
                    />
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{task.title}</p>
                      <div className="flex gap-2 mt-0.5">
                        {task.clients?.company && <span className="text-[#C8622A] text-xs">{task.clients.company}</span>}
                        {task.profiles?.full_name && <span className="text-[#8A9AB0] text-xs">{task.profiles.full_name}</span>}
                      </div>
                    </div>
                    <span className="text-[#C8622A] text-xs font-semibold">Today</span>
                  </div>
                ))}
                {/* Upcoming */}
                {upcomingTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#2a3d55]/50 bg-[#0F1C2E]/30">
                    <button
                      onClick={() => toggleTask(task)}
                      className="w-5 h-5 rounded border-2 border-[#2a3d55] hover:border-[#C8622A] flex items-center justify-center shrink-0 transition-colors"
                    />
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{task.title}</p>
                      <div className="flex gap-2 mt-0.5">
                        {task.clients?.company && <span className="text-[#C8622A] text-xs">{task.clients.company}</span>}
                        {task.profiles?.full_name && <span className="text-[#8A9AB0] text-xs">{task.profiles.full_name}</span>}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${priorityColor(task.priority)}`}>{task.due_date || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Recent Activity</h3>
              <button onClick={() => navigate('/clients')} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">
                View clients →
              </button>
            </div>

            {loading ? (
              <p className="text-[#8A9AB0] text-sm">Loading...</p>
            ) : activities.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No activity yet. Log calls, emails, and meetings from any client page.</p>
            ) : (
              <div className="space-y-0">
                {activities.map((activity, i) => (
                  <div key={activity.id} className="flex gap-3 relative">
                    {i < activities.length - 1 && (
                      <div className="absolute left-4 top-8 bottom-0 w-px bg-[#2a3d55]" />
                    )}
                    <div className="w-8 h-8 rounded-full bg-[#0F1C2E] border border-[#2a3d55] flex items-center justify-center text-sm shrink-0 z-10">
                      {activityIcon(activity.type)}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex justify-between items-start">
                        <p className="text-white text-sm font-medium leading-tight">{activity.title}</p>
                        <span className="text-[#8A9AB0] text-xs shrink-0 ml-2">{formatActivityTime(activity.created_at)}</span>
                      </div>
                      <div className="flex gap-2 mt-0.5">
                        {activity.clients?.company && (
                          <button
                            onClick={() => navigate(`/client/${activity.client_id}`)}
                            className="text-[#C8622A] text-xs hover:underline"
                          >
                            {activity.clients.company}
                          </button>
                        )}
                        {activity.profiles?.full_name && (
                          <span className="text-[#8A9AB0] text-xs">{activity.profiles.full_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Rep Leaderboard */}
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Rep Leaderboard{periodShort[period]}</h3>
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : repStats.length === 0 ? (
              <p className="text-[#8A9AB0]">No data yet.</p>
            ) : (
              <div className="space-y-4">
                {repStats.map((rep, i) => (
                  <div key={rep.name} onClick={() => navigate(`/proposals?rep=${encodeURIComponent(rep.name)}`)} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
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
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : closingSoonList.length === 0 ? (
              <p className="text-[#8A9AB0]">Nothing closing in the next 30 days.</p>
            ) : (
              <div className="space-y-3">
                {closingSoonList.map(p => {
                  const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={p.id} onClick={() => navigate(`/proposal/${p.id}`)} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                      <div>
                        <p className="text-white text-sm font-medium">{p.proposal_name}</p>
                        <p className="text-[#8A9AB0] text-xs">{p.rep_name} · {p.company}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-sm font-bold">${(p.proposal_value || 0).toLocaleString()}</p>
                        <div className="flex gap-2 justify-end">
                          {p.total_gross_margin_percent && <p className="text-[#C8622A] text-xs">{p.total_gross_margin_percent.toFixed(1)}%</p>}
                          <p className={`text-xs font-semibold ${days <= 7 ? 'text-red-400' : 'text-[#C8622A]'}`}>{days === 0 ? 'Today' : `${days}d left`}</p>
                        </div>
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
            <h3 className="text-white font-bold text-lg mb-4">Top Clients{periodShort[period]}</h3>
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : topClients.length === 0 ? (
              <p className="text-[#8A9AB0]">No client data yet.</p>
            ) : (
              <div className="space-y-4">
                {topClients.map((client, i) => (
                  <div key={client.id} onClick={() => navigate(`/client/${client.id}`)} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>#{i + 1}</span>
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
            <h3 className="text-white font-bold text-lg mb-4">Top Vendors{periodShort[period]}</h3>
            {loading ? (
              <p className="text-[#8A9AB0]">Loading...</p>
            ) : topVendors.length === 0 ? (
              <p className="text-[#8A9AB0]">No vendor data yet.</p>
            ) : (
              <div className="space-y-4">
                {topVendors.map((vendor, i) => (
                  <div key={vendor.name} onClick={() => navigate(`/vendors`)} className="flex justify-between items-center cursor-pointer hover:bg-[#0F1C2E] rounded-lg p-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>#{i + 1}</span>
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

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function AdminDashboard() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchAllProposals()
  }, [])

  const fetchAllProposals = async () => {
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setProposals(data)
    setLoading(false)
  }

  // Team stats
  const activePipeline = proposals
    .filter(p => p.status !== 'Won' && p.status !== 'Lost')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const wonPipeline = proposals
    .filter(p => p.status === 'Won')
    .reduce((sum, p) => sum + (p.proposal_value || 0), 0)

  const closingSoon = proposals.filter(p => {
    if (!p.close_date) return false
    const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
  }).length

  const avgMargin = proposals.filter(p => p.total_gross_margin_percent).length > 0
    ? (proposals.reduce((sum, p) => sum + (p.total_gross_margin_percent || 0), 0) / proposals.filter(p => p.total_gross_margin_percent).length).toFixed(1)
    : null

  const wonCount = proposals.filter(p => p.status === 'Won').length
  const totalProposals = proposals.length
  const closeRate = totalProposals > 0 ? ((wonCount / totalProposals) * 100).toFixed(1) : null

  // Rep leaderboard
  const repStats = Object.values(
    proposals.reduce((acc, p) => {
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

  // Closing soon list
  const closingSoonList = proposals
    .filter(p => {
      if (!p.close_date) return false
      const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
      return days <= 30 && days >= 0 && p.status !== 'Won' && p.status !== 'Lost'
    })
    .sort((a, b) => new Date(a.close_date) - new Date(b.close_date))
    .slice(0, 5)

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={true} />

      <div className="flex-1 p-6">
        <h2 className="text-white text-2xl font-bold mb-6">Team Dashboard</h2>

        {/* Top Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Active Pipeline</p>
            <p className="text-white text-2xl font-bold">${activePipeline.toLocaleString()}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
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
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Closing in 30 Days</p>
            <p className="text-[#C8622A] text-2xl font-bold">{closingSoon}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
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
                  <div key={rep.name} className="flex justify-between items-center">
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
      </div>
    </div>
  )
}
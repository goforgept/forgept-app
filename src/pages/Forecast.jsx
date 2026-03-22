import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Forecast({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [proposals, setProposals] = useState([])
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }
    const [proposalsRes, stagesRes] = await Promise.all([
      supabase.from('proposals').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false }),
      supabase.from('pipeline_stages').select('*').eq('org_id', profile.org_id).order('position')
    ])
    setProposals(proposalsRes.data || [])
    setStages(stagesRes.data || [])
    setLoading(false)
  }

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '0'

  const monthlyWon = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      const won = proposals.filter(p => p.status === 'Won' && p.created_at?.startsWith(key)).reduce((sum, p) => sum + (p.proposal_value || 0), 0)
      const total = proposals.filter(p => p.created_at?.startsWith(key)).reduce((sum, p) => sum + (p.proposal_value || 0), 0)
      months.push({ key, label, won, total })
    }
    return months
  }, [proposals])

  const stageBreakdown = useMemo(() => {
    return stages.map(stage => {
      const stageProposals = proposals.filter(p => {
        if (p.pipeline_stage_id) return p.pipeline_stage_id === stage.id
        if (stage.name === 'Proposal Sent') return !p.pipeline_stage_id && p.status === 'Sent'
        if (stage.name === 'Won') return !p.pipeline_stage_id && p.status === 'Won'
        if (stage.name === 'Lost') return !p.pipeline_stage_id && p.status === 'Lost'
        if (stage.name === 'Lead') return !p.pipeline_stage_id && p.status === 'Draft'
        return false
      })
      const value = stageProposals.reduce((sum, p) => sum + (p.proposal_value || 0), 0)
      return { ...stage, count: stageProposals.length, value }
    }).filter(s => s.count > 0)
  }, [proposals, stages])

  const stageProbability = (stageName) => {
    const map = { 'Lead': 10, 'Contacted': 25, 'Proposal Sent': 50, 'Negotiating': 75, 'Won': 100, 'Lost': 0 }
    return map[stageName] ?? 40
  }

  const weightedPipeline = useMemo(() => {
    return stageBreakdown.reduce((sum, stage) => sum + (stage.value * stageProbability(stage.name) / 100), 0)
  }, [stageBreakdown])

  const closingThisMonth = useMemo(() => {
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return proposals.filter(p => {
      if (!p.close_date || p.status === 'Won' || p.status === 'Lost') return false
      const close = new Date(p.close_date)
      return close >= now && close <= endOfMonth
    }).sort((a, b) => new Date(a.close_date) - new Date(b.close_date))
  }, [proposals])

  const closeRateByMonth = useMemo(() => {
    return monthlyWon.map(m => {
      const total = proposals.filter(p => p.created_at?.startsWith(m.key)).length
      const won = proposals.filter(p => p.status === 'Won' && p.created_at?.startsWith(m.key)).length
      return { ...m, rate: total > 0 ? Math.round((won / total) * 100) : 0, total }
    })
  }, [monthlyWon, proposals])

  const repForecast = useMemo(() => {
    const repMap = {}
    proposals.filter(p => p.status !== 'Lost').forEach(p => {
      const rep = p.rep_name || 'Unknown'
      if (!repMap[rep]) repMap[rep] = { name: rep, pipeline: 0, won: 0, count: 0 }
      repMap[rep].pipeline += p.proposal_value || 0
      if (p.status === 'Won') repMap[rep].won += p.proposal_value || 0
      repMap[rep].count += 1
    })
    return Object.values(repMap).sort((a, b) => b.pipeline - a.pipeline)
  }, [proposals])

  const totalActivePipeline = proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const totalWon = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const maxMonthlyValue = Math.max(...monthlyWon.map(m => m.total), 1)
  const maxStageValue = Math.max(...stageBreakdown.map(s => s.value), 1)

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">
        <div>
          <h2 className="text-white text-2xl font-bold">Forecast</h2>
          <p className="text-[#8A9AB0] text-sm mt-0.5">Revenue pipeline and close projections</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Active Pipeline</p>
            <p className="text-white text-2xl font-bold">${fmt(totalActivePipeline)}</p>
            <p className="text-[#8A9AB0] text-xs mt-1">{proposals.filter(p => p.status !== 'Won' && p.status !== 'Lost').length} open deals</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Weighted Forecast</p>
            <p className="text-[#C8622A] text-2xl font-bold">${fmt(weightedPipeline)}</p>
            <p className="text-[#8A9AB0] text-xs mt-1">probability-adjusted</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Won YTD</p>
            <p className="text-green-400 text-2xl font-bold">${fmt(totalWon)}</p>
            <p className="text-[#8A9AB0] text-xs mt-1">{proposals.filter(p => p.status === 'Won').length} deals closed</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-xs mb-1">Closing This Month</p>
            <p className="text-[#C8622A] text-2xl font-bold">{closingThisMonth.length}</p>
            <p className="text-[#8A9AB0] text-xs mt-1">${fmt(closingThisMonth.reduce((s, p) => s + (p.proposal_value || 0), 0))} at stake</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-6">Monthly Pipeline — Last 6 Months</h3>
            <div className="space-y-3">
              {monthlyWon.map(m => (
                <div key={m.key}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[#8A9AB0] text-xs">{m.label}</span>
                    <div className="flex gap-4">
                      <span className="text-green-400 text-xs font-semibold">${fmt(m.won)} won</span>
                      <span className="text-[#8A9AB0] text-xs">${fmt(m.total)} total</span>
                    </div>
                  </div>
                  <div className="h-6 bg-[#0F1C2E] rounded-lg overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-[#2a3d55] rounded-lg transition-all duration-500" style={{ width: `${(m.total / maxMonthlyValue) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-green-500/70 rounded-lg transition-all duration-500" style={{ width: `${(m.won / maxMonthlyValue) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-6">Pipeline by Stage</h3>
            {stageBreakdown.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No pipeline data yet. Add deals to the Pipeline board.</p>
            ) : (
              <div className="space-y-3">
                {stageBreakdown.map(stage => (
                  <div key={stage.id}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                        <span className="text-white text-xs font-medium">{stage.name}</span>
                        <span className="text-[#8A9AB0] text-xs">({stage.count})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#8A9AB0] text-xs">{stageProbability(stage.name)}% prob</span>
                        <span className="text-white text-xs font-semibold">${fmt(stage.value)}</span>
                      </div>
                    </div>
                    <div className="h-5 bg-[#0F1C2E] rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg transition-all duration-500" style={{ width: `${(stage.value / maxStageValue) * 100}%`, background: stage.color }} />
                    </div>
                  </div>
                ))}
                <div className="border-t border-[#2a3d55] pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[#8A9AB0] text-sm">Weighted Total</span>
                    <span className="text-[#C8622A] text-sm font-bold">${fmt(weightedPipeline)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-6">Close Rate — Last 6 Months</h3>
            <div className="space-y-3">
              {closeRateByMonth.map(m => (
                <div key={m.key}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[#8A9AB0] text-xs">{m.label}</span>
                    <div className="flex gap-4">
                      <span className="text-[#8A9AB0] text-xs">{m.total} proposals</span>
                      <span className="text-[#C8622A] text-xs font-semibold">{m.rate}%</span>
                    </div>
                  </div>
                  <div className="h-5 bg-[#0F1C2E] rounded-lg overflow-hidden">
                    <div className="h-full bg-[#C8622A]/70 rounded-lg transition-all duration-500" style={{ width: `${m.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Rep Forecast</h3>
            {repForecast.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {repForecast.map((rep, i) => (
                  <div key={rep.name} onClick={() => navigate(`/proposals?rep=${encodeURIComponent(rep.name)}`)}
                    className="flex justify-between items-center bg-[#0F1C2E] rounded-lg p-3 cursor-pointer hover:bg-[#0a1628] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#8A9AB0]' : i === 2 ? 'text-orange-400' : 'text-[#2a3d55]'}`}>#{i + 1}</span>
                      <div>
                        <p className="text-white text-sm font-medium">{rep.name}</p>
                        <p className="text-[#8A9AB0] text-xs">{rep.count} active deals</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-sm font-bold">${fmt(rep.pipeline)}</p>
                      <p className="text-green-400 text-xs">${fmt(rep.won)} won</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {closingThisMonth.length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">
              Closing This Month
              <span className="ml-2 text-sm font-normal text-[#8A9AB0]">— ${fmt(closingThisMonth.reduce((s, p) => s + (p.proposal_value || 0), 0))} at stake</span>
            </h3>
            <div className="space-y-2">
              {closingThisMonth.map(p => {
                const days = Math.ceil((new Date(p.close_date) - new Date()) / (1000 * 60 * 60 * 24))
                return (
                  <div key={p.id} onClick={() => navigate(`/proposal/${p.id}`)}
                    className="flex justify-between items-center bg-[#0F1C2E] rounded-lg p-4 cursor-pointer hover:bg-[#0a1628] transition-colors group">
                    <div>
                      <p className="text-white text-sm font-medium group-hover:text-[#C8622A] transition-colors">{p.proposal_name}</p>
                      <p className="text-[#8A9AB0] text-xs mt-0.5">{p.rep_name} · {p.company}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      {p.total_gross_margin_percent && (
                        <div className="text-right">
                          <p className="text-[#8A9AB0] text-xs">Margin</p>
                          <p className="text-[#C8622A] text-sm font-semibold">{p.total_gross_margin_percent.toFixed(1)}%</p>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-[#8A9AB0] text-xs">Value</p>
                        <p className="text-white text-sm font-bold">${fmt(p.proposal_value || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#8A9AB0] text-xs">Closes</p>
                        <p className={`text-sm font-bold ${days <= 7 ? 'text-red-400' : 'text-[#C8622A]'}`}>
                          {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#8A9AB0]/20 text-[#8A9AB0]">{p.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
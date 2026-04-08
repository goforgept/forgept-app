import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function Contracts({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, role, isSalesManager, isPM, isTechnician }) {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('id, org_id, org_role').eq('id', user.id).single()
    setProfile(data)
    fetchContracts(data)
  }

  const fetchContracts = async (prof) => {
    let query = supabase
      .from('contracts')
      .select('*, proposals(proposal_name, company, client_name)')
      .eq('org_id', prof.org_id)
      .order('end_date', { ascending: true })

    // Reps only see their own contracts
    if (prof.org_role !== 'admin') {
      query = query.eq('user_id', prof.id)
    }

    const { data } = await query
    setContracts(data || [])
    setLoading(false)
  }

  const daysUntil = (dateStr) => {
    if (!dateStr) return null
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const expiryBadge = (dateStr) => {
    const days = daysUntil(dateStr)
    if (days === null) return null
    if (days < 0) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Expired</span>
    if (days <= 30) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">⚠ {days}d left</span>
    if (days <= 90) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">{days}d left</span>
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">{days}d left</span>
  }

  const filtered = contracts.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  const expiringSoon = contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d >= 0 && d <= 90 }).length

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-white text-2xl font-bold">Contracts</h1>
              <p className="text-[#8A9AB0] text-sm mt-0.5">Service agreements and monitoring contracts</p>
            </div>
            {expiringSoon > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-yellow-400 text-sm font-semibold">⚠ {expiringSoon} expiring within 90 days</span>
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total', value: contracts.length, color: 'text-white' },
              { label: 'Active', value: contracts.filter(c => c.status === 'Active').length, color: 'text-green-400' },
              { label: 'SLA', value: contracts.filter(c => c.type === 'sla').length, color: 'text-[#C8622A]' },
              { label: 'Monitoring', value: contracts.filter(c => c.type === 'monitoring').length, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#1a2d45] rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
              <option value="all">All Types</option>
              <option value="sla">Service Agreement</option>
              <option value="monitoring">Monitoring</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-16"><p className="text-[#8A9AB0]">Loading contracts...</p></div>
          ) : filtered.length === 0 ? (
            <div className="bg-[#1a2d45] rounded-xl p-12 text-center">
              <p className="text-[#8A9AB0] text-lg mb-1">No contracts found</p>
              <p className="text-[#8A9AB0] text-sm">Contracts are created when a proposal is marked as Won.</p>
            </div>
          ) : (
            <div className="bg-[#1a2d45] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">Client</th>
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">Contract</th>
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">Type</th>
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">Start</th>
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">End</th>
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">Status</th>
                    <th className="text-left text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide px-5 py-3">Auto-Renew</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const days = daysUntil(c.end_date)
                    const isExpiringSoon = days !== null && days >= 0 && days <= 90
                    return (
                      <tr
                        key={c.id}
                        onClick={() => c.proposal_id && navigate(`/proposal/${c.proposal_id}`)}
                        className={`border-b border-[#2a3d55] cursor-pointer transition-colors hover:bg-[#0F1C2E] ${isExpiringSoon ? 'bg-yellow-500/5' : ''} ${i === filtered.length - 1 ? 'border-0' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <p className="text-white text-sm font-medium">{c.proposals?.company || '—'}</p>
                          <p className="text-[#8A9AB0] text-xs">{c.proposals?.client_name || ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-white text-sm">{c.name || '—'}</p>
                          <p className="text-[#8A9AB0] text-xs truncate max-w-[180px]">{c.proposals?.proposal_name || ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.type === 'sla' ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-blue-500/20 text-blue-400'}`}>
                            {c.type === 'sla' ? 'Service SLA' : 'Monitoring'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[#8A9AB0] text-sm">{c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[#8A9AB0] text-sm">{c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}</span>
                            {expiryBadge(c.end_date)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.status === 'Active' ? 'bg-green-500/20 text-green-400' : c.status === 'Expired' ? 'bg-red-500/20 text-red-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {c.auto_renew ? <span className="text-green-400 font-semibold">Yes</span> : <span className="text-[#8A9AB0]">No</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

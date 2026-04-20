import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const PLANS = [
  { name: 'Trial', rate: 0, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { name: 'Solo', rate: 49, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { name: 'Team', rate: 149, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { name: 'Business', rate: 349, color: 'text-[#C8622A]', bg: 'bg-[#C8622A]/20' },
  { name: 'Enterprise', rate: null, color: 'text-green-400', bg: 'bg-green-500/20' },
]

const ORG_TYPES = [
  { value: 'integrator', label: 'Integrator', desc: 'Trades contractor — full BOM, proposals, POs' },
  { value: 'manufacturer', label: 'Manufacturer', desc: 'Product catalog, quotes, AI email tools' },
  { value: 'distributor', label: 'Distributor', desc: 'Dealer management, price lists, quotes' },
]

const emptyBillingForm = { plan: 'Trial', billing_status: 'trial', monthly_rate: 0, trial_ends_at: '' }

export default function SuperAdmin() {
  const [orgs, setOrgs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('requests')
  const [editingBilling, setEditingBilling] = useState(null)
  const [billingForm, setBillingForm] = useState(emptyBillingForm)
  const [editingOrg, setEditingOrg] = useState(null)
  const [orgForm, setOrgForm] = useState({})
  const [unauthorized, setUnauthorized] = useState(false)
  const [stripeModal, setStripeModal] = useState(null)
  const [stripeForm, setStripeForm] = useState({ plan: 'Solo', chargeOnboarding: true })
  const [creatingSubscription, setCreatingSubscription] = useState(false)
  const [stripeResult, setStripeResult] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingOrg, setDeletingOrg] = useState(false)
  const [session, setSession] = useState(null)

  // New state
  const [allProposals, setAllProposals] = useState([])
  const [allClients, setAllClients] = useState([])
  const [expandedOrg, setExpandedOrg] = useState(null)
  const [orgNotes, setOrgNotes] = useState({})
  const [savingNote, setSavingNote] = useState(null)
  const [noteSaved, setNoteSaved] = useState(null)
  const [orgDetail, setOrgDetail] = useState({})
  const [loadingDetail, setLoadingDetail] = useState(null)
  const [metricsSortBy, setMetricsSortBy] = useState('health')

  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const user = currentSession?.user
    if (currentSession) setSession(currentSession)
    if (!user) { setUnauthorized(true); setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'superadmin') { setUnauthorized(true); setLoading(false); return }

    const [
      { data: orgsData },
      { data: profilesData },
      { data: requestsData },
      { data: proposalsData },
      { data: clientsData },
    ] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('proposals').select('id, org_id, created_at, status, proposal_value, proposal_name').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, org_id'),
    ])

    const orgsResult = orgsData || []
    setOrgs(orgsResult)
    setProfiles(profilesData || [])
    setRequests(requestsData || [])
    setAllProposals(proposalsData || [])
    setAllClients(clientsData || [])

    // Build orgNotes map from superadmin_notes column
    const notesMap = {}
    for (const org of orgsResult) {
      if (org.superadmin_notes) notesMap[org.id] = org.superadmin_notes
    }
    setOrgNotes(notesMap)

    setLoading(false)
  }

  const fetchOrgDetail = async (orgId) => {
    if (orgDetail[orgId]) return // already cached
    setLoadingDetail(orgId)
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(8)
    setOrgDetail(prev => ({ ...prev, [orgId]: { activities: activities || [] } }))
    setLoadingDetail(null)
  }

  const toggleExpandedOrg = (orgId) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null)
    } else {
      setExpandedOrg(orgId)
      fetchOrgDetail(orgId)
    }
  }

  const saveOrgNote = async (orgId) => {
    setSavingNote(orgId)
    await supabase.from('organizations').update({ superadmin_notes: orgNotes[orgId] || '' }).eq('id', orgId)
    setSavingNote(null)
    setNoteSaved(orgId)
    setTimeout(() => setNoteSaved(n => n === orgId ? null : n), 2000)
  }

  const impersonateUser = (org, user) => {
    localStorage.setItem('sa_impersonate', JSON.stringify({
      orgId: org.id,
      orgName: org.name,
      userId: user.id,
      userName: user.full_name,
    }))
    window.location.href = '/'
  }

  const getOrgHealth = (orgId) => {
    const orgProps = allProposals.filter(p => p.org_id === orgId)
    if (!orgProps.length) return { label: 'No proposals', dot: 'bg-gray-500', status: 'silent' }
    const days = Math.floor((Date.now() - new Date(orgProps[0].created_at)) / 86400000)
    if (days < 7) return { label: `Active ${days}d ago`, dot: 'bg-green-400', status: 'active' }
    if (days < 30) return { label: `${days}d ago`, dot: 'bg-yellow-400', status: 'moderate' }
    return { label: `Inactive ${days}d ago`, dot: 'bg-red-400', status: 'inactive' }
  }

  const getOrgStats = (orgId) => {
    const props = allProposals.filter(p => p.org_id === orgId)
    const last30 = props.filter(p => new Date(p.created_at) > new Date(Date.now() - 30 * 86400000))
    const won = props.filter(p => p.status === 'Won')
    return {
      total: props.length,
      last30: last30.length,
      clients: allClients.filter(c => c.org_id === orgId).length,
      won: won.length,
      wonValue: won.reduce((s, p) => s + (p.proposal_value || 0), 0),
      recentProps: props.slice(0, 5),
    }
  }

  const getOrgProfiles = (orgId) => profiles.filter(p => p.org_id === orgId)
  const getOrgAdmin = (orgId) => profiles.find(p => p.org_id === orgId && p.org_role === 'admin')

  const approveRequest = async (request) => {
    try {
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ requestId: request.id, fullName: request.full_name, email: request.email, companyName: request.company_name })
      })
      const result = await res.json()
      if (result.success) fetchData()
      else alert('Error approving request: ' + result.error)
    } catch (err) {
      alert('Error approving request: ' + err.message)
    }
  }

  const rejectRequest = async (requestId) => {
    if (!window.confirm('Reject this request?')) return
    await supabase.from('access_requests').update({ status: 'rejected' }).eq('id', requestId)
    fetchData()
  }

  const suspendOrg = async (orgId) => {
    if (!window.confirm('Suspend this organization?')) return
    await supabase.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
    fetchData()
  }

  const reactivateOrg = async (orgId) => {
    await supabase.from('organizations').update({ status: 'active' }).eq('id', orgId)
    fetchData()
  }

  const deleteOrg = async () => {
    if (!deleteModal || deleteConfirmText !== deleteModal.name) return
    setDeletingOrg(true)
    try {
      const orgId = deleteModal.id
      // Delete in order — cascade through related data
      await supabase.from('proposal_activity').delete().eq('org_id', orgId)
      await supabase.from('activities').delete().eq('org_id', orgId)
      await supabase.from('manufacturer_order_items').delete().in('order_id',
        (await supabase.from('manufacturer_orders').select('id').eq('org_id', orgId)).data?.map(o => o.id) || []
      )
      await supabase.from('manufacturer_orders').delete().eq('org_id', orgId)
      await supabase.from('invoice_payments').delete().in('invoice_id',
        (await supabase.from('invoices').select('id').eq('org_id', orgId)).data?.map(i => i.id) || []
      )
      await supabase.from('invoice_line_items').delete().in('invoice_id',
        (await supabase.from('invoices').select('id').eq('org_id', orgId)).data?.map(i => i.id) || []
      )
      await supabase.from('invoices').delete().eq('org_id', orgId)
      await supabase.from('purchase_orders').delete().eq('org_id', orgId)
      await supabase.from('bom_line_items').delete().in('proposal_id',
        (await supabase.from('proposals').select('id').eq('org_id', orgId)).data?.map(p => p.id) || []
      )
      await supabase.from('proposals').delete().eq('org_id', orgId)
      await supabase.from('clients').delete().eq('org_id', orgId)
      await supabase.from('targets').delete().eq('org_id', orgId)
      await supabase.from('templates').delete().eq('org_id', orgId)
      await supabase.from('client_emails').delete().eq('org_id', orgId)
      await supabase.from('profiles').delete().eq('org_id', orgId)
      await supabase.from('organizations').delete().eq('id', orgId)

      const deletedId = deleteModal.id
      setDeleteModal(null)
      setDeleteConfirmText('')
      setOrgs(prev => prev.filter(o => o.id !== deletedId))
      setAllProposals(prev => prev.filter(p => p.org_id !== deletedId))
      setAllClients(prev => prev.filter(c => c.org_id !== deletedId))
    } catch (err) {
      alert('Error deleting org: ' + err.message)
    }
    setDeletingOrg(false)
  }

  const startEditingOrg = (org) => {
    setEditingOrg(org.id)
    setOrgForm({
      org_type: org.org_type || 'integrator',
      feature_proposals: org.feature_proposals !== false,
      feature_crm: org.feature_crm || false,
      feature_send_proposal: org.feature_send_proposal || false,
      feature_ai_email: org.feature_ai_email || false,
      feature_purchase_orders: org.feature_purchase_orders !== false,
      feature_invoices: org.feature_invoices !== false,
      feature_ai_bom: org.feature_ai_bom || false,
      feature_site_photos: org.feature_site_photos !== false,
    })
  }

  const saveOrgSettings = async (orgId) => {
    await supabase.from('organizations').update({
      org_type: orgForm.org_type,
      feature_proposals: orgForm.feature_proposals,
      feature_crm: orgForm.feature_crm,
      feature_send_proposal: orgForm.feature_send_proposal,
      feature_ai_email: orgForm.feature_ai_email,
      feature_purchase_orders: orgForm.feature_purchase_orders,
      feature_invoices: orgForm.feature_invoices,
      feature_ai_bom: orgForm.feature_ai_bom,
      feature_site_photos: orgForm.feature_site_photos,
    }).eq('id', orgId)
    setEditingOrg(null)
    fetchData()
  }

  const startEditingBilling = (org) => {
    setEditingBilling(org.id)
    setBillingForm({
      plan: org.plan || 'Trial',
      billing_status: org.billing_status || 'trial',
      monthly_rate: org.monthly_rate || 0,
      trial_ends_at: org.trial_ends_at ? new Date(org.trial_ends_at).toISOString().split('T')[0] : ''
    })
  }

  const updateBilling = async (orgId) => {
    await supabase.from('organizations').update({
      plan: billingForm.plan,
      billing_status: billingForm.billing_status,
      monthly_rate: parseFloat(billingForm.monthly_rate) || 0,
      trial_ends_at: billingForm.trial_ends_at || null
    }).eq('id', orgId)
    setEditingBilling(null)
    setBillingForm(emptyBillingForm)
    fetchData()
  }

  const openStripeModal = (org) => {
    const admin = getOrgAdmin(org.id)
    setStripeModal({ org, admin })
    setStripeForm({ plan: org.plan && org.plan !== 'Trial' ? org.plan : 'Solo', chargeOnboarding: !org.stripe_customer_id })
    setStripeResult(null)
  }

  const createSubscription = async () => {
    if (!stripeModal) return
    setCreatingSubscription(true)
    setStripeResult(null)
    try {
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/stripe-create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ orgId: stripeModal.org.id, orgName: stripeModal.org.name, adminEmail: stripeModal.admin?.email || '', plan: stripeForm.plan, chargeOnboarding: stripeForm.chargeOnboarding })
      })
      const result = await res.json()
      if (result.error) setStripeResult({ success: false, message: result.error })
      else { setStripeResult({ success: true, message: `Subscription created! Status: ${result.status}` }); fetchData() }
    } catch (err) {
      setStripeResult({ success: false, message: err.message })
    }
    setCreatingSubscription(false)
  }

  const getPlanInfo = (planName) => PLANS.find(p => p.name === planName) || PLANS[0]

  const getBillingStatusColor = (status) => {
    if (status === 'active') return 'bg-green-500/20 text-green-400'
    if (status === 'trial') return 'bg-yellow-500/20 text-yellow-400'
    if (status === 'past_due') return 'bg-red-500/20 text-red-400'
    if (status === 'cancelled') return 'bg-[#2a3d55] text-[#8A9AB0]'
    return 'bg-[#2a3d55] text-[#8A9AB0]'
  }

  const getOrgTypeColor = (type) => {
    if (type === 'manufacturer') return 'bg-purple-500/20 text-purple-400'
    if (type === 'distributor') return 'bg-blue-500/20 text-blue-400'
    return 'bg-[#C8622A]/20 text-[#C8622A]'
  }

  const getProposalStatusColor = (status) => {
    if (status === 'Won') return 'bg-green-500/20 text-green-400'
    if (status === 'Lost') return 'bg-red-500/20 text-red-400'
    if (status === 'Sent') return 'bg-blue-500/20 text-blue-400'
    if (status === 'Draft') return 'bg-[#2a3d55] text-[#8A9AB0]'
    return 'bg-yellow-500/20 text-yellow-400'
  }

  const healthSortOrder = { active: 0, moderate: 1, inactive: 2, silent: 3 }

  const getSortedOrgsForMetrics = () => {
    return [...orgs].sort((a, b) => {
      if (metricsSortBy === 'health') {
        const ha = getOrgHealth(a.id)
        const hb = getOrgHealth(b.id)
        return (healthSortOrder[ha.status] ?? 4) - (healthSortOrder[hb.status] ?? 4)
      }
      if (metricsSortBy === 'proposals') return getOrgStats(b.id).total - getOrgStats(a.id).total
      if (metricsSortBy === 'last30') return getOrgStats(b.id).last30 - getOrgStats(a.id).last30
      if (metricsSortBy === 'clients') return getOrgStats(b.id).clients - getOrgStats(a.id).clients
      if (metricsSortBy === 'wonValue') return getOrgStats(b.id).wonValue - getOrgStats(a.id).wonValue
      if (metricsSortBy === 'users') return getOrgProfiles(b.id).length - getOrgProfiles(a.id).length
      if (metricsSortBy === 'name') return a.name.localeCompare(b.name)
      return 0
    })
  }

  const metricsRowColor = (status) => {
    if (status === 'active') return 'border-green-500/20 hover:bg-green-500/5'
    if (status === 'moderate') return 'border-yellow-500/20 hover:bg-yellow-500/5'
    if (status === 'inactive') return 'border-red-500/20 hover:bg-red-500/5'
    return 'border-[#2a3d55] hover:bg-[#2a3d55]/30'
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const mrr = orgs.filter(o => o.billing_status === 'active').reduce((sum, o) => sum + (o.monthly_rate || 0), 0)
  const activeOrgs = orgs.filter(o => o.billing_status === 'active').length
  const trialOrgs = orgs.filter(o => o.billing_status === 'trial').length

  if (unauthorized) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 text-lg font-bold mb-2">Access Denied</p>
        <p className="text-[#8A9AB0] text-sm mb-4">You don't have permission to view this page.</p>
        <button onClick={() => navigate('/')} className="text-[#C8622A] hover:text-white text-sm transition-colors">← Back to App</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full font-semibold">Super Admin</span>
        </div>
        <button onClick={() => navigate('/')} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">← Back to App</button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Total Orgs</p><p className="text-white text-2xl font-bold">{orgs.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Total Users</p><p className="text-white text-2xl font-bold">{profiles.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Pending Requests</p><p className="text-yellow-400 text-2xl font-bold">{pendingRequests.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Active Paying</p><p className="text-green-400 text-2xl font-bold">{activeOrgs}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">MRR</p><p className="text-[#C8622A] text-2xl font-bold">${mrr.toLocaleString()}</p></div>
        </div>

        <div className="flex gap-2">
          {[
            { key: 'requests', label: `Access Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
            { key: 'orgs', label: 'Organizations' },
            { key: 'billing', label: 'Billing & Plans' },
            { key: 'metrics', label: 'Metrics' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Access Requests */}
        {activeTab === 'requests' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Access Requests</h3>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : requests.length === 0 ? <p className="text-[#8A9AB0]">No requests yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      {['Name', 'Email', 'Company', 'Role', 'Notes', 'Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(req => (
                      <tr key={req.id} className="border-b border-[#2a3d55]/30">
                        <td className="text-white py-3 pr-4 font-medium">{req.full_name}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{req.email}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{req.company_name}</td>
                        <td className="py-3 pr-4">{req.role ? <span className="bg-[#2a3d55] text-white text-xs px-2 py-1 rounded">{req.role}</span> : <span className="text-[#8A9AB0]">—</span>}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4 max-w-xs truncate">{req.notes || '—'}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{new Date(req.created_at).toLocaleDateString()}</td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : req.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{req.status}</span>
                        </td>
                        <td className="py-3">
                          {req.status === 'pending' && (
                            <div className="flex gap-2">
                              <button onClick={() => approveRequest(req)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">Approve</button>
                              <button onClick={() => rejectRequest(req.id)} className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors">Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Organizations */}
        {activeTab === 'orgs' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">All Organizations</h3>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : orgs.length === 0 ? <p className="text-[#8A9AB0]">No organizations yet.</p> : (
              <div className="space-y-3">
                {orgs.map(org => {
                  const admin = getOrgAdmin(org.id)
                  const memberCount = getOrgProfiles(org.id).length
                  const status = org.status || 'active'
                  const isEditing = editingOrg === org.id
                  const isExpanded = expandedOrg === org.id
                  const health = getOrgHealth(org.id)
                  const stats = getOrgStats(org.id)

                  return (
                    <div key={org.id} className="border border-[#2a3d55] rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${health.dot}`} />
                            <p className="text-white font-semibold">{org.name}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getOrgTypeColor(org.org_type || 'integrator')}`}>{org.org_type || 'integrator'}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : status === 'suspended' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{status}</span>
                            <span className="text-[#8A9AB0] text-xs">{health.label}</span>
                          </div>
                          <p className="text-[#8A9AB0] text-xs">{admin?.full_name || '—'} · {admin?.email || '—'} · {memberCount} users</p>
                          <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_proposals !== false ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_proposals !== false ? '✓ Proposals' : '✗ Proposals'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_crm ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_crm ? '✓ CRM' : '✗ CRM'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_send_proposal ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_send_proposal ? '✓ Send Proposal' : '✗ Send Proposal'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_ai_email ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_ai_email ? '✓ AI Email' : '✗ AI Email'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_purchase_orders !== false ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_purchase_orders !== false ? '✓ POs' : '✗ POs'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_invoices !== false ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_invoices !== false ? '✓ Invoices' : '✗ Invoices'}</span>
                            <span className="bg-[#0F1C2E] text-[#8A9AB0] text-xs px-2 py-0.5 rounded border border-[#2a3d55]">{stats.total} proposals</span>
                            <span className="bg-[#0F1C2E] text-[#8A9AB0] text-xs px-2 py-0.5 rounded border border-[#2a3d55]">{stats.clients} clients</span>
                            <span className="bg-[#0F1C2E] text-[#8A9AB0] text-xs px-2 py-0.5 rounded border border-[#2a3d55]">{stats.last30} last 30d</span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <button onClick={() => toggleExpandedOrg(org.id)} className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${isExpanded ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/40' : 'bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] hover:text-white'}`}>{isExpanded ? 'Hide Details' : 'Details'}</button>
                          <button onClick={() => isEditing ? setEditingOrg(null) : startEditingOrg(org)} className="bg-[#2a3d55] text-white px-3 py-1 rounded text-xs hover:bg-[#3a4d65] transition-colors">{isEditing ? 'Cancel' : 'Edit Settings'}</button>
                          {status === 'active' && <button onClick={() => suspendOrg(org.id)} className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors">Suspend</button>}
                          {status === 'suspended' && <button onClick={() => reactivateOrg(org.id)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">Reactivate</button>}
                          <button onClick={() => { setDeleteModal(org); setDeleteConfirmText('') }} className="bg-red-900/30 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-900/50 transition-colors">Delete</button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-[#2a3d55] space-y-4">
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">Org Type</label>
                            <div className="grid grid-cols-3 gap-2">
                              {ORG_TYPES.map(type => (
                                <button key={type.value} onClick={() => setOrgForm(p => ({ ...p, org_type: type.value }))}
                                  className={`p-3 rounded-lg border text-left transition-colors ${orgForm.org_type === type.value ? 'border-[#C8622A] bg-[#C8622A]/10' : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#3a4d65]'}`}>
                                  <p className={`text-sm font-semibold ${orgForm.org_type === type.value ? 'text-[#C8622A]' : 'text-white'}`}>{type.label}</p>
                                  <p className="text-[#8A9AB0] text-xs mt-0.5">{type.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">Feature Access</label>
                            <div className="flex gap-3 flex-wrap">
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_proposals: !p.feature_proposals }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_proposals ? 'border-[#C8622A] bg-[#C8622A]/10 text-[#C8622A]' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_proposals ? '✓' : '○'}</span> Proposals
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_crm: !p.feature_crm }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_crm ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_crm ? '✓' : '○'}</span> CRM
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_send_proposal: !p.feature_send_proposal }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_send_proposal ? 'border-green-400 bg-green-500/10 text-green-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_send_proposal ? '✓' : '○'}</span> Send Proposal
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_ai_email: !p.feature_ai_email }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_ai_email ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_ai_email ? '✓' : '○'}</span> AI Email Writer
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_purchase_orders: !p.feature_purchase_orders }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_purchase_orders ? 'border-blue-400 bg-blue-500/10 text-blue-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_purchase_orders ? '✓' : '○'}</span> Purchase Orders
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_invoices: !p.feature_invoices }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_invoices ? 'border-green-400 bg-green-500/10 text-green-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_invoices ? '✓' : '○'}</span> Invoices
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_ai_bom: !p.feature_ai_bom }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_ai_bom ? 'border-purple-400 bg-purple-500/10 text-purple-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_ai_bom ? '✓' : '○'}</span> AI BOM Builder
                              </button>
                              <button onClick={() => setOrgForm(p => ({ ...p, feature_site_photos: !p.feature_site_photos }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${orgForm.feature_site_photos ? 'border-blue-400 bg-blue-500/10 text-blue-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                <span>{orgForm.feature_site_photos ? '✓' : '○'}</span> Site Photos
                              </button>
                              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold ${orgForm.feature_proposals && orgForm.feature_crm ? 'border-green-400 bg-green-500/10 text-green-400' : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'}`}>
                                {orgForm.feature_proposals && orgForm.feature_crm ? '✓ Full Suite' : '○ Full Suite'}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button onClick={() => saveOrgSettings(org.id)} className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Save Settings</button>
                          </div>
                        </div>
                      )}

                      {/* Expandable Detail Section */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-[#2a3d55] space-y-5">
                          {loadingDetail === org.id ? (
                            <p className="text-[#8A9AB0] text-sm">Loading details...</p>
                          ) : (
                            <>
                              {/* Metric Cards */}
                              <div className="grid grid-cols-4 gap-3">
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Total Proposals</p>
                                  <p className="text-white text-xl font-bold">{stats.total}</p>
                                </div>
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Won Proposals</p>
                                  <p className="text-green-400 text-xl font-bold">{stats.won}</p>
                                </div>
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Clients</p>
                                  <p className="text-white text-xl font-bold">{stats.clients}</p>
                                </div>
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Won Value</p>
                                  <p className="text-[#C8622A] text-xl font-bold">${stats.wonValue.toLocaleString()}</p>
                                </div>
                              </div>

                              {/* Recent Proposals */}
                              {stats.recentProps.length > 0 && (
                                <div>
                                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Recent Proposals</p>
                                  <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-[#2a3d55]">
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Name</th>
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Status</th>
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Value</th>
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {stats.recentProps.map(prop => (
                                          <tr key={prop.id} className="border-b border-[#2a3d55]/30 last:border-0">
                                            <td className="text-white py-2 px-3">{prop.proposal_name || '—'}</td>
                                            <td className="py-2 px-3">
                                              <span className={`px-2 py-0.5 rounded font-semibold ${getProposalStatusColor(prop.status)}`}>{prop.status || 'Draft'}</span>
                                            </td>
                                            <td className="text-[#8A9AB0] py-2 px-3">{prop.proposal_value ? `$${prop.proposal_value.toLocaleString()}` : '—'}</td>
                                            <td className="text-[#8A9AB0] py-2 px-3">{new Date(prop.created_at).toLocaleDateString()}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Team Members & Impersonation */}
                              <div>
                                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Team Members</p>
                                <div className="space-y-1.5">
                                  {getOrgProfiles(org.id).map(member => (
                                    <div key={member.id} className="flex items-center justify-between bg-[#0F1C2E] rounded-lg px-3 py-2 border border-[#2a3d55]">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-[#C8622A]/20 flex items-center justify-center text-[#C8622A] text-xs font-bold flex-shrink-0">
                                          {(member.full_name || member.email || '?')[0].toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="text-white text-xs font-medium">{member.full_name || '—'}</p>
                                          <p className="text-[#8A9AB0] text-xs">{member.email}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${member.org_role === 'admin' ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                                          {member.org_role || 'member'}
                                        </span>
                                        <button
                                          onClick={() => impersonateUser(org, member)}
                                          className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs font-semibold hover:bg-blue-500/30 transition-colors"
                                        >
                                          Impersonate
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {getOrgProfiles(org.id).length === 0 && (
                                    <p className="text-[#8A9AB0] text-xs">No team members found.</p>
                                  )}
                                </div>
                              </div>

                              {/* Recent Activity */}
                              {orgDetail[org.id]?.activities?.length > 0 && (
                                <div>
                                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Recent Activity</p>
                                  <div className="space-y-1.5">
                                    {orgDetail[org.id].activities.map(act => (
                                      <div key={act.id} className="flex items-start gap-2 bg-[#0F1C2E] rounded-lg px-3 py-2 border border-[#2a3d55]">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#C8622A] mt-1.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white text-xs">{act.title || act.type || 'Activity'}</p>
                                          <p className="text-[#8A9AB0] text-xs">{new Date(act.created_at).toLocaleString()}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Notes */}
                              <div>
                                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Internal Notes</p>
                                <textarea
                                  value={orgNotes[org.id] || ''}
                                  onChange={e => setOrgNotes(prev => ({ ...prev, [org.id]: e.target.value }))}
                                  placeholder="Add private notes about this org..."
                                  rows={3}
                                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#4a5d75]"
                                />
                                <div className="flex items-center justify-end gap-3 mt-2">
                                  {noteSaved === org.id && (
                                    <span className="text-green-400 text-xs font-semibold">Saved!</span>
                                  )}
                                  <button
                                    onClick={() => saveOrgNote(org.id)}
                                    disabled={savingNote === org.id}
                                    className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                                  >
                                    {savingNote === org.id ? 'Saving...' : 'Save Note'}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Billing & Plans */}
        {activeTab === 'billing' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-bold text-lg">Billing & Plans</h3>
              <div className="flex gap-4">
                <div className="text-center"><p className="text-[#8A9AB0] text-xs">MRR</p><p className="text-[#C8622A] font-bold">${mrr.toLocaleString()}</p></div>
                <div className="text-center"><p className="text-[#8A9AB0] text-xs">Paying</p><p className="text-green-400 font-bold">{activeOrgs}</p></div>
                <div className="text-center"><p className="text-[#8A9AB0] text-xs">Trial</p><p className="text-yellow-400 font-bold">{trialOrgs}</p></div>
              </div>
            </div>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : orgs.length === 0 ? <p className="text-[#8A9AB0]">No organizations yet.</p> : (
              <div className="space-y-3">
                {orgs.map(org => {
                  const admin = getOrgAdmin(org.id)
                  const plan = getPlanInfo(org.plan || 'Trial')
                  const isEditing = editingBilling === org.id
                  const trialDaysLeft = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)) : null
                  const hasStripe = !!org.stripe_customer_id

                  return (
                    <div key={org.id} className="border border-[#2a3d55] rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white font-semibold">{org.name}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getOrgTypeColor(org.org_type || 'integrator')}`}>{org.org_type || 'integrator'}</span>
                          </div>
                          <p className="text-[#8A9AB0] text-xs">{admin?.email || '—'}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_proposals !== false ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_proposals !== false ? '✓ Proposals' : '✗ Proposals'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_crm ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_crm ? '✓ CRM' : '✗ CRM'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_send_proposal ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_send_proposal ? '✓ Send Proposal' : '✗ Send Proposal'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_ai_email ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_ai_email ? '✓ AI Email' : '✗ AI Email'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_purchase_orders !== false ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_purchase_orders !== false ? '✓ POs' : '✗ POs'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_invoices !== false ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{org.feature_invoices !== false ? '✓ Invoices' : '✗ Invoices'}</span>
                          </div>
                          {hasStripe && <p className="text-green-400 text-xs mt-1">✓ Stripe connected</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${plan.bg} ${plan.color}`}>{org.plan || 'Trial'}</span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${getBillingStatusColor(org.billing_status)}`}>{org.billing_status || 'trial'}</span>
                          {org.monthly_rate > 0 && <span className="text-white text-sm font-bold">${org.monthly_rate}/mo</span>}
                          <button onClick={() => openStripeModal(org)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">{hasStripe ? 'Update Subscription' : 'Create Subscription'}</button>
                          <button onClick={() => isEditing ? setEditingBilling(null) : startEditingBilling(org)} className="bg-[#2a3d55] text-white px-3 py-1 rounded text-xs hover:bg-[#3a4d65] transition-colors">{isEditing ? 'Cancel' : 'Manual Edit'}</button>
                        </div>
                      </div>
                      {org.billing_status === 'trial' && trialDaysLeft !== null && (
                        <p className={`text-xs mt-2 ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>{trialDaysLeft > 0 ? `Trial ends in ${trialDaysLeft} days` : 'Trial expired'}</p>
                      )}
                      {isEditing && (
                        <div className="mt-4 grid grid-cols-4 gap-3 pt-4 border-t border-[#2a3d55]">
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Plan</label><select value={billingForm.plan} onChange={e => setBillingForm(p => ({ ...p, plan: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">{PLANS.map(p => <option key={p.name} value={p.name}>{p.name}{p.rate ? ` — $${p.rate}/mo` : p.rate === 0 ? ' — Free' : ' — Custom'}</option>)}</select></div>
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Billing Status</label><select value={billingForm.billing_status} onChange={e => setBillingForm(p => ({ ...p, billing_status: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">{['trial', 'active', 'past_due', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Monthly Rate ($)</label><input type="number" value={billingForm.monthly_rate} onChange={e => setBillingForm(p => ({ ...p, monthly_rate: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]" /></div>
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Trial End Date</label><input type="date" value={billingForm.trial_ends_at} onChange={e => setBillingForm(p => ({ ...p, trial_ends_at: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]" /></div>
                          <div className="col-span-4 flex justify-end"><button onClick={() => updateBilling(org.id)} className="bg-[#C8622A] text-white px-4 py-1.5 rounded text-xs font-semibold hover:bg-[#b5571f] transition-colors">Save Changes</button></div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Org Metrics</h3>
              <div className="flex items-center gap-2">
                <span className="text-[#8A9AB0] text-xs">Sort by:</span>
                {[
                  { key: 'health', label: 'Health' },
                  { key: 'proposals', label: 'Proposals' },
                  { key: 'last30', label: 'Last 30d' },
                  { key: 'clients', label: 'Clients' },
                  { key: 'wonValue', label: 'Won Value' },
                  { key: 'users', label: 'Users' },
                  { key: 'name', label: 'Name' },
                ].map(s => (
                  <button key={s.key} onClick={() => setMetricsSortBy(s.key)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${metricsSortBy === s.key ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      {['Org Name', 'Type', 'Plan', 'Health', 'Proposals', 'Last 30d', 'Clients', 'Won Value', 'Users', 'Trial End'].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedOrgsForMetrics().map(org => {
                      const health = getOrgHealth(org.id)
                      const stats = getOrgStats(org.id)
                      const plan = getPlanInfo(org.plan || 'Trial')
                      const trialDaysLeft = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)) : null
                      const userCount = getOrgProfiles(org.id).length

                      return (
                        <tr key={org.id} className={`border-b transition-colors cursor-pointer ${metricsRowColor(health.status)}`} onClick={() => { setActiveTab('orgs'); setExpandedOrg(org.id); fetchOrgDetail(org.id) }}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${health.dot}`} />
                              <span className="text-white font-medium">{org.name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getOrgTypeColor(org.org_type || 'integrator')}`}>{org.org_type || 'integrator'}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${plan.bg} ${plan.color}`}>{org.plan || 'Trial'}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs ${health.status === 'active' ? 'text-green-400' : health.status === 'moderate' ? 'text-yellow-400' : health.status === 'inactive' ? 'text-red-400' : 'text-[#8A9AB0]'}`}>{health.label}</span>
                          </td>
                          <td className="text-white py-3 pr-4 font-semibold">{stats.total}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4">{stats.last30}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4">{stats.clients}</td>
                          <td className="text-[#C8622A] py-3 pr-4 font-semibold">{stats.wonValue > 0 ? `$${stats.wonValue.toLocaleString()}` : '—'}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4">{userCount}</td>
                          <td className="py-3 pr-4">
                            {org.billing_status === 'trial' && trialDaysLeft !== null ? (
                              <span className={`text-xs ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                                {trialDaysLeft > 0 ? `${trialDaysLeft}d left` : 'Expired'}
                              </span>
                            ) : (
                              <span className="text-[#8A9AB0] text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Org Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-400 text-xl">⚠</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Delete Organization</h3>
            <p className="text-[#8A9AB0] text-sm mb-2 text-center">This will permanently delete <span className="text-white font-semibold">{deleteModal.name}</span> and all associated data:</p>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4 text-xs text-red-400 space-y-1">
              <p>• All proposals and BOM line items</p>
              <p>• All clients and contacts</p>
              <p>• All invoices and purchase orders</p>
              <p>• All activity, tasks, and emails</p>
              <p>• All user accounts for this org</p>
              <p className="text-white font-semibold mt-2">This cannot be undone.</p>
            </div>
            <div className="mb-4">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Type <span className="text-white font-mono">{deleteModal.name}</span> to confirm</label>
              <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={deleteModal.name}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteModal(null); setDeleteConfirmText('') }}
                className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={deleteOrg} disabled={deletingOrg || deleteConfirmText !== deleteModal.name}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                {deletingOrg ? 'Deleting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stripeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Create Stripe Subscription</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">{stripeModal.org.name} · {stripeModal.admin?.email || 'No admin email'}</p>
            <div className="space-y-4">
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Plan</label><select value={stripeForm.plan} onChange={e => setStripeForm(p => ({ ...p, plan: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"><option value="Solo">Solo — $49/mo</option><option value="Team">Team — $149/mo</option><option value="Business">Business — $349/mo</option></select></div>
              <div className="flex items-center gap-3 bg-[#0F1C2E] rounded-lg px-4 py-3">
                <input type="checkbox" id="onboarding" checked={stripeForm.chargeOnboarding} onChange={e => setStripeForm(p => ({ ...p, chargeOnboarding: e.target.checked }))} className="accent-[#C8622A]" />
                <label htmlFor="onboarding" className="text-white text-sm cursor-pointer">Charge one-time onboarding fee <span className="text-[#C8622A] font-semibold">$249</span></label>
              </div>
              <div className="bg-[#0F1C2E] rounded-lg p-3 text-xs text-[#8A9AB0]">
                <p className="font-semibold text-white mb-1">What this does:</p>
                <p>• Creates a Stripe customer for {stripeModal.org.name}</p>
                <p>• Creates a {stripeForm.plan} subscription at ${stripeForm.plan === 'Solo' ? '49' : stripeForm.plan === 'Team' ? '149' : '349'}/mo</p>
                {stripeForm.chargeOnboarding && <p>• Adds $249 onboarding fee to first invoice</p>}
                <p>• Updates billing status in ForgePt.</p>
                <p className="mt-2 text-yellow-400">Note: Customer will need to add payment method via Stripe dashboard or payment link.</p>
              </div>
              {stripeResult && <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${stripeResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{stripeResult.message}</div>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setStripeModal(null); setStripeResult(null) }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={createSubscription} disabled={creatingSubscription} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{creatingSubscription ? 'Creating...' : 'Create Subscription'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

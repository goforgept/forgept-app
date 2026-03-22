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
  const navigate = useNavigate()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUnauthorized(true); setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'superadmin') { setUnauthorized(true); setLoading(false); return }

    const { data: orgsData } = await supabase.from('organizations').select('*').order('created_at', { ascending: false })
    const { data: profilesData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    const { data: requestsData } = await supabase.from('access_requests').select('*').order('created_at', { ascending: false })

    setOrgs(orgsData || [])
    setProfiles(profilesData || [])
    setRequests(requestsData || [])
    setLoading(false)
  }

  const getOrgProfiles = (orgId) => profiles.filter(p => p.org_id === orgId)
  const getOrgAdmin = (orgId) => profiles.find(p => p.org_id === orgId && p.org_role === 'admin')

  const approveRequest = async (request) => {
    const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/approve-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
      },
      body: JSON.stringify({ requestId: request.id, fullName: request.full_name, email: request.email, companyName: request.company_name })
    })
    const result = await res.json()
    if (result.success) fetchData()
    else alert('Error approving request: ' + result.error)
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

  const startEditingOrg = (org) => {
    setEditingOrg(org.id)
    setOrgForm({
      org_type: org.org_type || 'integrator',
      feature_proposals: org.feature_proposals !== false,
      feature_crm: org.feature_crm || false,
    })
  }

  const saveOrgSettings = async (orgId) => {
    await supabase.from('organizations').update({
      org_type: orgForm.org_type,
      feature_proposals: orgForm.feature_proposals,
      feature_crm: orgForm.feature_crm,
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
        },
        body: JSON.stringify({
          orgId: stripeModal.org.id,
          orgName: stripeModal.org.name,
          adminEmail: stripeModal.admin?.email || '',
          plan: stripeForm.plan,
          chargeOnboarding: stripeForm.chargeOnboarding
        })
      })
      const result = await res.json()
      if (result.error) {
        setStripeResult({ success: false, message: result.error })
      } else {
        setStripeResult({ success: true, message: `Subscription created! Status: ${result.status}` })
        fetchData()
      }
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
        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Total Orgs</p><p className="text-white text-2xl font-bold">{orgs.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Total Users</p><p className="text-white text-2xl font-bold">{profiles.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Pending Requests</p><p className="text-yellow-400 text-2xl font-bold">{pendingRequests.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Active Paying</p><p className="text-green-400 text-2xl font-bold">{activeOrgs}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">MRR</p><p className="text-[#C8622A] text-2xl font-bold">${mrr.toLocaleString()}</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'requests', label: `Access Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
            { key: 'orgs', label: 'Organizations' },
            { key: 'billing', label: 'Billing & Plans' },
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
                        <td className="py-3 pr-4">
                          {req.role ? (
                            <span className="bg-[#2a3d55] text-white text-xs px-2 py-1 rounded">{req.role}</span>
                          ) : <span className="text-[#8A9AB0]">—</span>}
                        </td>
                        <td className="text-[#8A9AB0] py-3 pr-4 max-w-xs truncate">{req.notes || '—'}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{new Date(req.created_at).toLocaleDateString()}</td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : req.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {req.status}
                          </span>
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

                  return (
                    <div key={org.id} className="border border-[#2a3d55] rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white font-semibold">{org.name}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getOrgTypeColor(org.org_type || 'integrator')}`}>
                              {org.org_type || 'integrator'}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : status === 'suspended' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                              {status}
                            </span>
                          </div>
                          <p className="text-[#8A9AB0] text-xs">{admin?.full_name || '—'} · {admin?.email || '—'} · {memberCount} users</p>
                          <div className="flex gap-2 mt-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_proposals !== false ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                              {org.feature_proposals !== false ? '✓ Proposals' : '✗ Proposals'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_crm ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                              {org.feature_crm ? '✓ CRM' : '✗ CRM'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => isEditing ? setEditingOrg(null) : startEditingOrg(org)}
                            className="bg-[#2a3d55] text-white px-3 py-1 rounded text-xs hover:bg-[#3a4d65] transition-colors"
                          >
                            {isEditing ? 'Cancel' : 'Edit Settings'}
                          </button>
                          {status === 'active' && (
                            <button onClick={() => suspendOrg(org.id)} className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors">Suspend</button>
                          )}
                          {status === 'suspended' && (
                            <button onClick={() => reactivateOrg(org.id)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">Reactivate</button>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-[#2a3d55] space-y-4">
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">Org Type</label>
                            <div className="grid grid-cols-3 gap-2">
                              {ORG_TYPES.map(type => (
                                <button
                                  key={type.value}
                                  onClick={() => setOrgForm(p => ({ ...p, org_type: type.value }))}
                                  className={`p-3 rounded-lg border text-left transition-colors ${
                                    orgForm.org_type === type.value
                                      ? 'border-[#C8622A] bg-[#C8622A]/10'
                                      : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#3a4d65]'
                                  }`}
                                >
                                  <p className={`text-sm font-semibold ${orgForm.org_type === type.value ? 'text-[#C8622A]' : 'text-white'}`}>{type.label}</p>
                                  <p className="text-[#8A9AB0] text-xs mt-0.5">{type.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">Feature Access</label>
                            <div className="flex gap-3">
                              <button
                                onClick={() => setOrgForm(p => ({ ...p, feature_proposals: !p.feature_proposals }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                                  orgForm.feature_proposals
                                    ? 'border-[#C8622A] bg-[#C8622A]/10 text-[#C8622A]'
                                    : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'
                                }`}
                              >
                                <span>{orgForm.feature_proposals ? '✓' : '○'}</span>
                                Proposals
                              </button>
                              <button
                                onClick={() => setOrgForm(p => ({ ...p, feature_crm: !p.feature_crm }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                                  orgForm.feature_crm
                                    ? 'border-purple-400 bg-purple-500/10 text-purple-400'
                                    : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'
                                }`}
                              >
                                <span>{orgForm.feature_crm ? '✓' : '○'}</span>
                                CRM
                              </button>
                              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold ${
                                orgForm.feature_proposals && orgForm.feature_crm
                                  ? 'border-green-400 bg-green-500/10 text-green-400'
                                  : 'border-[#2a3d55] bg-[#0F1C2E] text-[#8A9AB0]'
                              }`}>
                                {orgForm.feature_proposals && orgForm.feature_crm ? '✓ Full Suite' : '○ Full Suite'}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => saveOrgSettings(org.id)}
                              className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
                            >
                              Save Settings
                            </button>
                          </div>
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
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getOrgTypeColor(org.org_type || 'integrator')}`}>
                              {org.org_type || 'integrator'}
                            </span>
                          </div>
                          <p className="text-[#8A9AB0] text-xs">{admin?.email || '—'}</p>
                          <div className="flex gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_proposals !== false ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                              {org.feature_proposals !== false ? '✓ Proposals' : '✗ Proposals'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${org.feature_crm ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                              {org.feature_crm ? '✓ CRM' : '✗ CRM'}
                            </span>
                          </div>
                          {hasStripe && <p className="text-green-400 text-xs mt-1">✓ Stripe connected</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${plan.bg} ${plan.color}`}>{org.plan || 'Trial'}</span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${getBillingStatusColor(org.billing_status)}`}>{org.billing_status || 'trial'}</span>
                          {org.monthly_rate > 0 && <span className="text-white text-sm font-bold">${org.monthly_rate}/mo</span>}
                          <button onClick={() => openStripeModal(org)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">
                            {hasStripe ? 'Update Subscription' : 'Create Subscription'}
                          </button>
                          <button onClick={() => isEditing ? setEditingBilling(null) : startEditingBilling(org)} className="bg-[#2a3d55] text-white px-3 py-1 rounded text-xs hover:bg-[#3a4d65] transition-colors">
                            {isEditing ? 'Cancel' : 'Manual Edit'}
                          </button>
                        </div>
                      </div>

                      {org.billing_status === 'trial' && trialDaysLeft !== null && (
                        <p className={`text-xs mt-2 ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                          {trialDaysLeft > 0 ? `Trial ends in ${trialDaysLeft} days` : 'Trial expired'}
                        </p>
                      )}

                      {isEditing && (
                        <div className="mt-4 grid grid-cols-4 gap-3 pt-4 border-t border-[#2a3d55]">
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-1 block">Plan</label>
                            <select value={billingForm.plan} onChange={e => setBillingForm(p => ({ ...p, plan: e.target.value }))}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                              {PLANS.map(p => <option key={p.name} value={p.name}>{p.name}{p.rate ? ` — $${p.rate}/mo` : p.rate === 0 ? ' — Free' : ' — Custom'}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-1 block">Billing Status</label>
                            <select value={billingForm.billing_status} onChange={e => setBillingForm(p => ({ ...p, billing_status: e.target.value }))}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                              {['trial', 'active', 'past_due', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-1 block">Monthly Rate ($)</label>
                            <input type="number" value={billingForm.monthly_rate} onChange={e => setBillingForm(p => ({ ...p, monthly_rate: e.target.value }))}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]" />
                          </div>
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-1 block">Trial End Date</label>
                            <input type="date" value={billingForm.trial_ends_at} onChange={e => setBillingForm(p => ({ ...p, trial_ends_at: e.target.value }))}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]" />
                          </div>
                          <div className="col-span-4 flex justify-end">
                            <button onClick={() => updateBilling(org.id)} className="bg-[#C8622A] text-white px-4 py-1.5 rounded text-xs font-semibold hover:bg-[#b5571f] transition-colors">
                              Save Changes
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stripe Subscription Modal */}
      {stripeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Create Stripe Subscription</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">{stripeModal.org.name} · {stripeModal.admin?.email || 'No admin email'}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Plan</label>
                <select value={stripeForm.plan} onChange={e => setStripeForm(p => ({ ...p, plan: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="Solo">Solo — $49/mo</option>
                  <option value="Team">Team — $149/mo</option>
                  <option value="Business">Business — $349/mo</option>
                </select>
              </div>
              <div className="flex items-center gap-3 bg-[#0F1C2E] rounded-lg px-4 py-3">
                <input type="checkbox" id="onboarding" checked={stripeForm.chargeOnboarding} onChange={e => setStripeForm(p => ({ ...p, chargeOnboarding: e.target.checked }))} className="accent-[#C8622A]" />
                <label htmlFor="onboarding" className="text-white text-sm cursor-pointer">
                  Charge one-time onboarding fee <span className="text-[#C8622A] font-semibold">$249</span>
                </label>
              </div>
              <div className="bg-[#0F1C2E] rounded-lg p-3 text-xs text-[#8A9AB0]">
                <p className="font-semibold text-white mb-1">What this does:</p>
                <p>• Creates a Stripe customer for {stripeModal.org.name}</p>
                <p>• Creates a {stripeForm.plan} subscription at ${stripeForm.plan === 'Solo' ? '49' : stripeForm.plan === 'Team' ? '149' : '349'}/mo</p>
                {stripeForm.chargeOnboarding && <p>• Adds $249 onboarding fee to first invoice</p>}
                <p>• Updates billing status in ForgePt.</p>
                <p className="mt-2 text-yellow-400">Note: Customer will need to add payment method via Stripe dashboard or payment link.</p>
              </div>
              {stripeResult && (
                <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${stripeResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {stripeResult.message}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setStripeModal(null); setStripeResult(null) }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={createSubscription} disabled={creatingSubscription} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {creatingSubscription ? 'Creating...' : 'Create Subscription'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
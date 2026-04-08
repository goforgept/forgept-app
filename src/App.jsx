import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { supabase } from './supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProposalDetail from './pages/ProposalDetail'
import NewProposal from './pages/NewProposal'
import AdminDashboard from './pages/AdminDashboard'
import ManageReps from './pages/ManageReps'
import Proposals from './pages/Proposals'
import Vendors from './pages/Vendors'
import Settings from './pages/Settings'
import ResetPassword from './pages/ResetPassword'
import Clients from './pages/Clients'
import SuperAdmin from './pages/SuperAdmin'
import ClientDetail from './pages/ClientDetail'
import PurchaseOrders from './pages/PurchaseOrders'
import FAQ from './pages/FAQ'
import Tasks from './pages/Tasks'
import Pipeline from './pages/Pipeline'
import Forecast from './pages/Forecast'
import Catalog from './pages/Catalog'
import Templates from './pages/Templates'
import Invoices from './pages/Invoices'
import ManufacturerOrders from './pages/ManufacturerOrders'
import InvoiceDetail from './pages/InvoiceDetail'
import NewInvoice from './pages/NewInvoice'
import Jobs from './pages/Jobs'
import TechLog from './pages/TechLog'
import SignProposal from './pages/SignProposal'
import JobDetail from './pages/JobDetail'
import ServiceTickets from './pages/ServiceTickets'
import ServiceTicketDetail from './pages/ServiceTicketDetail'
import Dispatch from './pages/Dispatch'
import Contracts from './pages/Contracts'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
  }, [])

  // Auto-logout after 1 hour of inactivity
  useEffect(() => {
    if (!session) return

    const IDLE_TIMEOUT = 60 * 60 * 1000 // 1 hour in ms
    let timer

    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        supabase.auth.signOut()
      }, IDLE_TIMEOUT)
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer() // start timer on mount

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [session])

  const fetchProfile = async (userId) => {
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase
        .from('profiles')
        .select('*, organizations(status, org_type, feature_proposals, feature_crm, feature_send_proposal, feature_ai_email, feature_purchase_orders, feature_invoices, feature_ai_bom, feature_site_photos, feature_sla, feature_monitoring)')
        .eq('id', userId)
        .single()

      if (data?.org_role) {
        setProfile(data)
        setLoading(false)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const { data } = await supabase
      .from('profiles')
      .select('*, organizations(status, org_type, feature_proposals, feature_crm, feature_send_proposal, feature_ai_email, feature_purchase_orders, feature_invoices, feature_ai_bom, feature_site_photos, feature_sla, feature_monitoring)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] text-sm">Loading...</p>
      </div>
    </div>
  )

  const isAdmin = profile?.org_role === 'admin' || profile?.role === 'admin'
  const isPending = profile?.organizations?.status === 'pending'
  const featureProposals = profile?.organizations?.feature_proposals !== false
  const featureCRM = profile?.organizations?.feature_crm || false
  const featureSendProposal = profile?.organizations?.feature_send_proposal || false
  const featureAiEmail = profile?.organizations?.feature_ai_email || false
  const featurePurchaseOrders = profile?.organizations?.feature_purchase_orders !== false
  const featureInvoices = profile?.organizations?.feature_invoices !== false
  const featureAiBom = profile?.organizations?.feature_ai_bom || false
  const featureSitePhotos = profile?.organizations?.feature_site_photos !== false
  const featureSla = profile?.organizations?.feature_sla || false
  const featureMonitoring = profile?.organizations?.feature_monitoring || false
  sessionStorage.setItem('featureSla', featureSla)
  sessionStorage.setItem('featureMonitoring', featureMonitoring)

  if (session && isPending) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-white text-4xl font-bold mb-2">
          ForgePt<span className="text-[#C8622A]">.</span>
        </h1>
        <div className="bg-[#1a2d45] rounded-2xl p-8 mt-6">
          <p className="text-yellow-400 text-lg font-semibold mb-3">⏳ Account Pending Approval</p>
          <p className="text-[#8A9AB0] text-sm">Your account is being reviewed. You will receive an email once approved.</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 text-[#8A9AB0] hover:text-white text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )

  const role = profile?.org_role || profile?.role || 'rep'
  const isSalesManager = role === 'sales_manager'
  const isPM = role === 'project_manager'
  const isTechnician = role === 'technician'
  const sharedProps = { isAdmin, featureProposals, featureCRM, featureSendProposal, featureAiEmail, featurePurchaseOrders, featureInvoices, featureAiBom, featureSitePhotos, featureSla, featureMonitoring, role, isSalesManager, isPM, isTechnician }

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/sign/:token" element={<SignProposal />} />
      {!session ? (
        <Route path="*" element={<Login />} />
      ) : (
        <>
          <Route path="/" element={
            isAdmin || isSalesManager
              ? <AdminDashboard {...sharedProps} />
              : isPM
              ? <AdminDashboard {...sharedProps} defaultMode="pm" />
              : isTechnician
              ? <TechLog {...sharedProps} />
              : <Dashboard {...sharedProps} />
          } />
          <Route path="/admin" element={<AdminDashboard {...sharedProps} />} />
          <Route path="/rep" element={<Dashboard {...sharedProps} />} />
          <Route path="/new" element={<NewProposal featureAiBom={featureAiBom} />} />
          <Route path="/proposal/:id" element={<ProposalDetail {...sharedProps} />} />
          <Route path="/reps" element={<ManageReps {...sharedProps} />} />
          <Route path="/proposals" element={<Proposals {...sharedProps} />} />
          <Route path="/vendors" element={<Vendors {...sharedProps} />} />
          <Route path="/settings" element={<Settings {...sharedProps} />} />
          <Route path="/clients" element={<Clients {...sharedProps} />} />
          <Route path="/superadmin" element={<SuperAdmin />} />
          <Route path="/client/:id" element={<ClientDetail {...sharedProps} />} />
          <Route path="/purchase-orders" element={<PurchaseOrders {...sharedProps} />} />
          <Route path="/faq" element={<FAQ {...sharedProps} />} />
          <Route path="/tasks" element={<Tasks {...sharedProps} />} />
          <Route path="/pipeline" element={<Pipeline {...sharedProps} />} />
          <Route path="/forecast" element={<Forecast {...sharedProps} />} />
          <Route path="/catalog" element={<Catalog {...sharedProps} />} />
          <Route path="/templates" element={<Templates isAdmin={isAdmin} />} />
          <Route path="/invoices" element={<Invoices {...sharedProps} />} />
          <Route path="/invoices/new" element={<NewInvoice {...sharedProps} />} />
          <Route path="/invoices/:id" element={<InvoiceDetail {...sharedProps} />} />
          <Route path="/orders" element={<ManufacturerOrders {...sharedProps} />} />
          <Route path="/jobs" element={<Jobs {...sharedProps} />} />
          <Route path="/jobs/:id" element={<JobDetail {...sharedProps} />} />
          <Route path="/tech-log" element={<TechLog {...sharedProps} />} />
          <Route path="/service-tickets" element={<ServiceTickets {...sharedProps} />} />
          <Route path="/service-tickets/:id" element={<ServiceTicketDetail {...sharedProps} />} />
          <Route path="/dispatch" element={<Dispatch {...sharedProps} />} />
          {(featureSla || featureMonitoring) && <Route path="/contracts" element={<Contracts {...sharedProps} />} />}
        </>
      )}
    </Routes>
  )
}

export default App
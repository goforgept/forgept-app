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

  const fetchProfile = async (userId) => {
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase
        .from('profiles')
        .select('*, organizations(status, org_type, feature_proposals, feature_crm, feature_send_proposal, feature_ai_email)')
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
      .select('*, organizations(status, org_type, feature_proposals, feature_crm, feature_send_proposal, feature_ai_email)')
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

  const sharedProps = { isAdmin, featureProposals, featureCRM, featureSendProposal, featureAiEmail }

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      {!session ? (
        <Route path="*" element={<Login />} />
      ) : (
        <>
          <Route path="/" element={isAdmin
            ? <AdminDashboard {...sharedProps} />
            : <Dashboard {...sharedProps} />}
          />
          <Route path="/admin" element={<AdminDashboard {...sharedProps} />} />
          <Route path="/rep" element={<Dashboard {...sharedProps} />} />
          <Route path="/new" element={<NewProposal />} />
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
        </>
      )}
    </Routes>
  )
}

export default App
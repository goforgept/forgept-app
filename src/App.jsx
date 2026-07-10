import { useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useProfile } from './context/ProfileContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProposalDetail from './pages/ProposalDetail'
import NewProposal from './pages/NewProposal'
import AdminDashboard from './pages/AdminDashboard'
import ManageReps from './pages/ManageReps'
import Proposals from './pages/Proposals'
import Vendors from './pages/Vendors'
import Settings from './pages/Settings'
import SquareCallback from './pages/SquareCallback'
import GoogleCallback from './pages/GoogleCallback'
import MicrosoftCallback from './pages/MicrosoftCallback'
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
import TechJobView from './pages/TechJobView'
import SignProposal from './pages/SignProposal'
import RFQResponse from './pages/RFQResponse'
import JobDetail from './pages/JobDetail'
import ServiceTickets from './pages/ServiceTickets'
import ServiceTicketDetail from './pages/ServiceTicketDetail'
import Dispatch from './pages/Dispatch'
import Contracts from './pages/Contracts'
import ProductLibrary from './pages/ProductLibrary'
import Reports from './pages/Reports'
import Designer from './pages/Designer'
import DesignerProjects from './pages/DesignerProjects'
import DrawingReview from './pages/DrawingReview'
import EmbedDesigner from './pages/EmbedDesigner'
import Roadmap from './pages/Roadmap'

function App() {
  const { session, profile, features, loading } = useProfile()
  const location = useLocation()

  if (loading) return (
    <div className="min-h-screen bg-fp-inset flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-fp-text text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-fp-muted text-sm">Loading...</p>
      </div>
    </div>
  )

  const isAdmin      = profile?.org_role === 'admin' || profile?.role === 'admin'
  const isPending    = profile?.organizations?.status === 'pending'

  sessionStorage.setItem('featureDesignerOnly', features.designerOnly)
  sessionStorage.setItem('featureSla', features.sla)
  sessionStorage.setItem('featureMonitoring', features.monitoring)
  sessionStorage.setItem('featureDrawingTool', features.drawingTool)

  if (session && isPending) return (
    <div className="min-h-screen bg-fp-inset flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-fp-text text-4xl font-bold mb-2">
          ForgePt<span className="text-[#C8622A]">.</span>
        </h1>
        <div className="bg-fp-card rounded-2xl p-8 mt-6">
          <p className="text-yellow-400 text-lg font-semibold mb-3">⏳ Account Pending Approval</p>
          <p className="text-fp-muted text-sm">Your account is being reviewed. You will receive an email once approved.</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 text-fp-muted hover:text-fp-text text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )

  const role              = profile?.org_role || profile?.role || 'rep'
  const isSalesManager    = role === 'sales_manager'
  const isPM              = role === 'project_manager'   // integrator: manages jobs/projects
  const isProductManager  = role === 'product_manager'   // manufacturer: manages product roadmap
  const isTechnician      = role === 'technician'
  const isDevTeam         = role === 'dev'

  const impersonation = (() => {
    try { return JSON.parse(localStorage.getItem('sa_impersonate') || 'null') } catch { return null }
  })()

  const sharedProps = {
    isAdmin, role, isSalesManager, isPM, isProductManager, isTechnician, isDevTeam,
    featureProposals:      features.proposals,
    featureCRM:            features.crm,
    featureSendProposal:   features.sendProposal,
    featureAiEmail:        features.aiEmail,
    featurePurchaseOrders: features.purchaseOrders,
    featureInvoices:       features.invoices,
    featureAiBom:          features.aiBom,
    featureSitePhotos:     features.sitePhotos,
    featureSla:            features.sla,
    featureMonitoring:     features.monitoring,
    featureDrawingTool:    features.drawingTool,
    featureDesignerOnly:   features.designerOnly,
    featureApi:            features.api,
    featureRegions:        features.regions,
  }

  return (
    <>
      {impersonation && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-fp-text text-xs flex items-center justify-between px-4 py-1.5">
          <span>Superadmin viewing as <strong>{impersonation.orgName}</strong> · {impersonation.userName}</span>
          <button onClick={() => { localStorage.removeItem('sa_impersonate'); window.location.reload() }} className="underline hover:no-underline ml-4">Exit</button>
        </div>
      )}
      {session?.user?.app_metadata?.must_change_password && (
        <TempPasswordBanner />
      )}
      {(() => {
        const org = profile?.organizations
        const isTrialExpired = org?.billing_status === 'trial' && org?.trial_ends_at && new Date(org.trial_ends_at) < new Date()
        if (!isTrialExpired) return null
        return (
          <div className="fixed top-0 left-0 right-0 z-[9998] bg-amber-600 text-white text-xs flex items-center justify-center gap-3 px-4 py-2">
            <span>⚠ Your free trial has ended. Contact us to continue using ForgePt.</span>
            <a href="mailto:support@forgept.com" className="underline font-semibold hover:no-underline whitespace-nowrap">Get in touch →</a>
          </div>
        )
      })()}
      <Routes location={location} key={location.key}>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/sign/:token" element={<SignProposal />} />
        <Route path="/rfq-response/:token" element={<RFQResponse />} />
        <Route path="/embed" element={<EmbedDesigner />} />
        {!session ? (
          <Route path="*" element={<Login />} />
        ) : (
          <>
            <Route path="/" element={
              features.designerOnly
                ? <Navigate to="/designer" replace />
                : isDevTeam || isProductManager
                ? <Navigate to="/roadmap" replace />
                : isAdmin || isSalesManager
                ? <AdminDashboard {...sharedProps} />
                : isPM
                ? <AdminDashboard {...sharedProps} defaultMode="pm" />
                : isTechnician
                ? <TechLog {...sharedProps} />
                : <Dashboard {...sharedProps} />
            } />
            <Route path="/admin" element={<AdminDashboard {...sharedProps} />} />
            <Route path="/rep" element={<Dashboard {...sharedProps} />} />
            <Route path="/new" element={<NewProposal />} />
            <Route path="/proposal/:id" element={<ProposalDetail {...sharedProps} />} />
            <Route path="/reps" element={<ManageReps {...sharedProps} />} />
            <Route path="/proposals" element={<Proposals {...sharedProps} />} />
            <Route path="/vendors" element={<Vendors {...sharedProps} />} />
            <Route path="/settings" element={<Settings {...sharedProps} />} />
            <Route path="/clients" element={<Clients {...sharedProps} />} />
            {profile?.is_superadmin && <Route path="/superadmin" element={<SuperAdmin />} />}
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
            <Route path="/tech/job/:id" element={<TechJobView {...sharedProps} />} />
            <Route path="/tech-log" element={<TechLog {...sharedProps} />} />
            <Route path="/service-tickets" element={<ServiceTickets {...sharedProps} />} />
            <Route path="/service-tickets/:id" element={<ServiceTicketDetail {...sharedProps} />} />
            <Route path="/dispatch" element={<Dispatch {...sharedProps} />} />
            <Route path="/integrations/square/callback" element={<SquareCallback />} />
            <Route path="/integrations/google/callback" element={<GoogleCallback />} />
            <Route path="/integrations/microsoft/callback" element={<MicrosoftCallback />} />
            {isAdmin && <Route path="/reports" element={<Reports {...sharedProps} />} />}
            <Route path="/product-library" element={<ProductLibrary {...sharedProps} />} />
            {(features.sla || features.monitoring) && <Route path="/contracts" element={<Contracts {...sharedProps} />} />}
            <Route path="/designer" element={<DesignerProjects {...sharedProps} />} />
            <Route path="/designer/:proposalId" element={<Designer {...sharedProps} />} />
            {features.designerOnly && <Route path="*" element={<Navigate to="/designer" replace />} />}
            <Route path="/designer/review/:token" element={<DrawingReview />} />
            <Route path="/roadmap" element={<Roadmap {...sharedProps} />} />
          </>
        )}
      </Routes>
    </>
  )
}

function TempPasswordBanner() {
  const navigate  = useNavigate()
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] bg-fp-brand text-white text-xs flex items-center justify-between px-4 py-2 shadow-lg">
      <span className="font-medium">
        You're using a temporary password — please change it to secure your account.
      </span>
      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
        <button
          onClick={() => { navigate('/settings'); setHidden(true) }}
          className="bg-white text-[#C8622A] font-semibold px-3 py-1 rounded text-xs hover:bg-orange-50 transition-colors">
          Change Password
        </button>
        <button onClick={() => setHidden(true)} className="text-fp-text/70 hover:text-fp-text transition-colors text-sm leading-none">✕</button>
      </div>
    </div>
  )
}

export default App

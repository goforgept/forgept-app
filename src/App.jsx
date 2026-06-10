import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import Designer from './pages/Designer'
import DesignerProjects from './pages/DesignerProjects'
import DrawingReview from './pages/DrawingReview'

function App() {
  const { session, profile, features, loading } = useProfile()
  const location = useLocation()

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] text-sm">Loading...</p>
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

  const role           = profile?.org_role || profile?.role || 'rep'
  const isSalesManager = role === 'sales_manager'
  const isPM           = role === 'project_manager'
  const isTechnician   = role === 'technician'

  const impersonation = (() => {
    try { return JSON.parse(localStorage.getItem('sa_impersonate') || 'null') } catch { return null }
  })()

  const sharedProps = {
    isAdmin, role, isSalesManager, isPM, isTechnician,
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
  }

  return (
    <>
      {impersonation && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white text-xs flex items-center justify-between px-4 py-1.5">
          <span>Superadmin viewing as <strong>{impersonation.orgName}</strong> · {impersonation.userName}</span>
          <button onClick={() => { localStorage.removeItem('sa_impersonate'); window.location.reload() }} className="underline hover:no-underline ml-4">Exit</button>
        </div>
      )}
      <Routes location={location} key={location.key}>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/sign/:token" element={<SignProposal />} />
        <Route path="/rfq-response/:token" element={<RFQResponse />} />
        {!session ? (
          <Route path="*" element={<Login />} />
        ) : (
          <>
            <Route path="/" element={
              features.designerOnly
                ? <Navigate to="/designer" replace />
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
            <Route path="/tech/job/:id" element={<TechJobView {...sharedProps} />} />
            <Route path="/tech-log" element={<TechLog {...sharedProps} />} />
            <Route path="/service-tickets" element={<ServiceTickets {...sharedProps} />} />
            <Route path="/service-tickets/:id" element={<ServiceTicketDetail {...sharedProps} />} />
            <Route path="/dispatch" element={<Dispatch {...sharedProps} />} />
            <Route path="/integrations/square/callback" element={<SquareCallback />} />
            <Route path="/integrations/google/callback" element={<GoogleCallback />} />
            <Route path="/integrations/microsoft/callback" element={<MicrosoftCallback />} />
            <Route path="/product-library" element={<ProductLibrary {...sharedProps} />} />
            {(features.sla || features.monitoring) && <Route path="/contracts" element={<Contracts {...sharedProps} />} />}
            <Route path="/designer" element={<DesignerProjects {...sharedProps} />} />
            <Route path="/designer/:proposalId" element={<Designer {...sharedProps} />} />
            {features.designerOnly && <Route path="*" element={<Navigate to="/designer" replace />} />}
            <Route path="/designer/review/:token" element={<DrawingReview />} />
          </>
        )}
      </Routes>
    </>
  )
}

export default App

import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
    // Retry up to 5 times waiting for profile to be created
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase
        .from('profiles')
        .select('*, organizations(status)')
        .eq('id', userId)
        .single()

      if (data?.org_role) {
        setProfile(data)
        setLoading(false)
        return
      }

      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Give up after 5 tries and set whatever we have
    const { data } = await supabase
      .from('profiles')
      .select('*, organizations(status)')
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        {!session ? (
          <Route path="*" element={<Login />} />
        ) : (
          <>
            <Route path="/" element={isAdmin ? <AdminDashboard /> : <Dashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/rep" element={<Dashboard />} />
            <Route path="/new" element={<NewProposal />} />
            <Route path="/proposal/:id" element={<ProposalDetail isAdmin={isAdmin} />} />
            <Route path="/reps" element={<ManageReps isAdmin={isAdmin} />} />
            <Route path="/proposals" element={<Proposals isAdmin={isAdmin} />} />
            <Route path="/vendors" element={<Vendors isAdmin={isAdmin} />} />
            <Route path="/settings" element={<Settings isAdmin={isAdmin} />} />
            <Route path="/clients" element={<Clients isAdmin={isAdmin} />} />
            <Route path="/superadmin" element={<SuperAdmin />} />
            <Route path="/client/:id" element={<ClientDetail isAdmin={isAdmin} />} />
            <Route path="/purchase-orders" element={<PurchaseOrders isAdmin={isAdmin} />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App

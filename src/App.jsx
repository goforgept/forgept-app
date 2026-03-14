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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  if (!session) return (
  <BrowserRouter>
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Login />} />
    </Routes>
  </BrowserRouter>
)

  const isAdmin = profile?.role === 'admin'

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAdmin ? <AdminDashboard /> : <Dashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/rep" element={<Dashboard />} />
        <Route path="/proposal/:id" element={<ProposalDetail isAdmin={isAdmin} />} />
        <Route path="/new" element={<NewProposal />} />
        <Route path="/reps" element={<ManageReps />} />
        <Route path="/proposals" element={<Proposals isAdmin={isAdmin} />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/settings" element={<Settings isAdmin={isAdmin} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
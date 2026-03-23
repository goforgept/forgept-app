import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import NotificationBell from './NotificationBell'

export default function Sidebar({ isAdmin, featureProposals = true, featureCRM = false }) {
  const location = useLocation()
  const [userId, setUserId] = useState(null)
  const [orgType, setOrgType] = useState('integrator')

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, organizations(org_type)')
        .eq('id', user.id)
        .single()
      if (profile?.organizations?.org_type) {
        setOrgType(profile.organizations.org_type)
      }
    }
    getUser()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const adminLinks = [
    { label: 'Dashboard', path: '/', icon: '⬛' },
    ...(orgType === 'manufacturer' ? [{ label: 'Catalog', path: '/catalog', icon: '📦' }] : []),
    ...(featureCRM ? [
      { label: 'Pipeline', path: '/pipeline', icon: '🗂️' },
      { label: 'Forecast', path: '/forecast', icon: '📈' },
      { label: 'Tasks', path: '/tasks', icon: '✅' },
    ] : []),
    ...(featureProposals ? [
      { label: 'Proposals', path: '/proposals', icon: '📋' },
    ] : []),
    { label: 'Clients', path: '/clients', icon: '🏢' },
    ...(featureProposals ? [
      { label: 'Vendors', path: '/vendors', icon: '🏭' },
      { label: 'Purchase Orders', path: '/purchase-orders', icon: '📄' },
    ] : []),
    { label: 'Team', path: '/reps', icon: '👥' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
    { label: 'Help', path: '/faq', icon: '❓' },
  ]

  const repLinks = [
    { label: 'Dashboard', path: '/', icon: '⬛' },
    ...(orgType === 'manufacturer' ? [{ label: 'Catalog', path: '/catalog', icon: '📦' }] : []),
    ...(featureCRM ? [
      { label: 'Pipeline', path: '/pipeline', icon: '🗂️' },
      { label: 'Tasks', path: '/tasks', icon: '✅' },
    ] : []),
    ...(featureProposals ? [
      { label: 'Proposals', path: '/proposals', icon: '📋' },
      { label: 'New Proposal', path: '/new', icon: '➕' },
    ] : []),
    { label: 'Clients', path: '/clients', icon: '🏢' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
    { label: 'Help', path: '/faq', icon: '❓' },
  ]

  const links = isAdmin ? adminLinks : repLinks

  return (
    <div className="w-56 min-h-screen bg-[#1a2d45] border-r border-[#2a3d55] flex flex-col">
      <div className="px-6 py-5 border-b border-[#2a3d55]">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-white text-xl font-bold">
              ForgePt<span className="text-[#C8622A]">.</span>
            </h1>
            {isAdmin && (
              <span className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block">
                Admin
              </span>
            )}
          </div>
          <NotificationBell userId={userId} />
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ label, path, icon }) => (
          <Link
            key={path}
            to={path}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-all duration-200 ${
              location.pathname === path
                ? 'bg-[#C8622A]/20 text-[#C8622A]'
                : 'text-[#8A9AB0] hover:text-white hover:bg-[#0F1C2E]'
            }`}
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-[#2a3d55]">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-[#8A9AB0] hover:text-white hover:bg-[#0F1C2E] transition-all duration-200 flex items-center gap-3"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </div>
  )
}
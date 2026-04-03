import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import NotificationBell from './NotificationBell'

const NAV_GROUPS_ADMIN = (featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, orgType) => [
  {
    key: 'sales',
    label: 'Sales',
    links: [
      { label: 'Dashboard', path: '/', icon: '📊' },
      ...(featureCRM ? [
        { label: 'Pipeline', path: '/pipeline', icon: '🗂️' },
        { label: 'Forecast', path: '/forecast', icon: '📈' },
      ] : []),
      ...(featureProposals ? [
        { label: 'Proposals', path: '/proposals', icon: '📋' },
        ...(orgType !== 'manufacturer' ? [{ label: 'Templates', path: '/templates', icon: '📄' }] : []),
      ] : []),
      { label: 'Clients', path: '/clients', icon: '🏢' },
      ...(featureCRM ? [{ label: 'Tasks', path: '/tasks', icon: '✅' }] : []),
    ]
  },
  {
    key: 'operations',
    label: 'Operations',
    links: [
      { label: 'Jobs', path: '/jobs', icon: '🔨' },
      { label: 'Tech Log', path: '/tech-log', icon: '📋' },
      { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
      { label: 'Dispatch', path: '/dispatch', icon: '🗺' },
      { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
      { label: 'Dispatch', path: '/dispatch', icon: '🗺' },
      { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
      { label: 'Dispatch', path: '/dispatch', icon: '📍' },
      ...(featureInvoices ? [{ label: 'Invoices', path: '/invoices', icon: '🧾' }] : []),
      ...(orgType !== 'manufacturer' && featureProposals ? [
        { label: 'Vendors', path: '/vendors', icon: '🏭' },
        ...(featurePurchaseOrders ? [{ label: 'Purchase Orders', path: '/purchase-orders', icon: '📄' }] : []),
      ] : []),
      ...(orgType === 'manufacturer' ? [
        { label: 'Catalog', path: '/catalog', icon: '📦' },
        { label: 'Orders', path: '/orders', icon: '📦' },
      ] : []),
    ].filter(l => l)
  },
  {
    key: 'manage',
    label: 'Manage',
    links: [
      { label: 'Team', path: '/reps', icon: '👥' },
      { label: 'Settings', path: '/settings', icon: '⚙️' },
      { label: 'Help', path: '/faq', icon: '❓' },
    ]
  }
]

const NAV_GROUPS_PM = (featurePurchaseOrders, featureInvoices) => [
  {
    key: 'operations',
    label: 'Operations',
    links: [
      { label: 'Dashboard', path: '/', icon: '📊' },
      { label: 'Jobs', path: '/jobs', icon: '🔨' },
      { label: 'Tech Log', path: '/tech-log', icon: '📋' },
      { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
      { label: 'Dispatch', path: '/dispatch', icon: '📍' },
      ...(featureInvoices ? [{ label: 'Invoices', path: '/invoices', icon: '🧾' }] : []),
      ...(featurePurchaseOrders ? [{ label: 'Purchase Orders', path: '/purchase-orders', icon: '📄' }] : []),
      { label: 'Vendors', path: '/vendors', icon: '🏭' },
    ]
  },
  {
    key: 'manage',
    label: 'Manage',
    links: [
      { label: 'Settings', path: '/settings', icon: '⚙️' },
      { label: 'Help', path: '/faq', icon: '❓' },
    ]
  }
]

const NAV_GROUPS_TECH = () => [
  {
    key: 'operations',
    label: 'Operations',
    links: [
      { label: 'Tech Log', path: '/tech-log', icon: '📋' },
      { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
      { label: 'Jobs', path: '/jobs', icon: '🔨' },
    ]
  },
  {
    key: 'manage',
    label: 'Manage',
    links: [
      { label: 'Settings', path: '/settings', icon: '⚙️' },
    ]
  }
]

const NAV_GROUPS_REP = (featureProposals, featureCRM, featureInvoices, orgType) => [
  {
    key: 'sales',
    label: 'Sales',
    links: [
      { label: 'Dashboard', path: '/', icon: '📊' },
      ...(featureCRM ? [
        { label: 'Pipeline', path: '/pipeline', icon: '🗂️' },
        { label: 'Tasks', path: '/tasks', icon: '✅' },
      ] : []),
      ...(featureProposals ? [
        { label: 'Proposals', path: '/proposals', icon: '📋' },
        { label: 'New Proposal', path: '/new', icon: '➕' },
      ] : []),
      { label: 'Clients', path: '/clients', icon: '🏢' },
    ]
  },
  {
    key: 'operations',
    label: 'Operations',
    links: [
      { label: 'Jobs', path: '/jobs', icon: '🔨' },
      { label: 'Tech Log', path: '/tech-log', icon: '📋' },
      { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
      { label: 'Dispatch', path: '/dispatch', icon: '📍' },
      ...(featureInvoices ? [{ label: 'Invoices', path: '/invoices', icon: '🧾' }] : []),
      ...(orgType === 'manufacturer' ? [
        { label: 'Catalog', path: '/catalog', icon: '📦' },
      ] : []),
    ].filter(l => l)
  },
  {
    key: 'manage',
    label: 'Manage',
    links: [
      { label: 'Settings', path: '/settings', icon: '⚙️' },
      { label: 'Help', path: '/faq', icon: '❓' },
    ]
  }
]

export default function Sidebar({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'rep', isSalesManager = false, isPM = false, isTechnician = false }) {
  const location = useLocation()
  const [userId, setUserId] = useState(null)
  const [orgType, setOrgType] = useState(() => sessionStorage.getItem('orgType') || 'integrator')
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebarCollapsed') || '{}') } catch { return {} }
  })

  useEffect(() => {
    if (sessionStorage.getItem('orgType')) return
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, organizations(org_type)')
        .eq('id', user.id)
        .single()
      const type = profile?.organizations?.org_type || 'integrator'
      sessionStorage.setItem('orgType', type)
      setOrgType(type)
    }
    getUser()
  }, [])

  const toggleGroup = (key) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('sidebarCollapsed', JSON.stringify(next))
      return next
    })
  }

  const handleSignOut = async () => {
    sessionStorage.removeItem('orgType')
    localStorage.removeItem('sidebarCollapsed')
    await supabase.auth.signOut()
  }

  const groups = isAdmin || isSalesManager
    ? NAV_GROUPS_ADMIN(featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, orgType)
    : isPM
    ? NAV_GROUPS_PM(featurePurchaseOrders, featureInvoices)
    : isTechnician
    ? NAV_GROUPS_TECH()
    : NAV_GROUPS_REP(featureProposals, featureCRM, featureInvoices, orgType)

  const visibleGroups = groups.filter(g => g.links.length > 0)

  const isActive = (path) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'))

  return (
    <div className="w-56 min-h-screen bg-[#1a2d45] border-r border-[#2a3d55] flex flex-col">
      <div className="px-6 py-5 border-b border-[#2a3d55]">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-white text-xl font-bold">
              ForgePt<span className="text-[#C8622A]">.</span>
            </h1>
            {(isAdmin || isSalesManager || isPM || isTechnician) && (
              <span className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block">
                {isAdmin ? 'Admin' : isSalesManager ? 'Sales Mgr' : isPM ? 'PM' : 'Technician'}
              </span>
            )}
          </div>
          <NotificationBell userId={userId} />
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {visibleGroups.map((group) => {
          const isOpen = !collapsed[group.key]
          const hasActive = group.links.some(l => isActive(l.path))
          return (
            <div key={group.key} className="mb-1">
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                  hasActive && !isOpen ? 'text-[#C8622A]' : 'text-[#8A9AB0] hover:text-white'
                }`}
              >
                <span>{group.label}</span>
                <span className="text-[#2a3d55] text-xs">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {group.links.map(({ label, path, icon }) => (
                    <Link
                      key={path}
                      to={path}
                      className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-all duration-150 ${
                        isActive(path)
                          ? 'bg-[#C8622A]/20 text-[#C8622A]'
                          : 'text-[#8A9AB0] hover:text-white hover:bg-[#0F1C2E]'
                      }`}
                    >
                      <span className="text-base">{icon}</span>
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import NotificationBell from './NotificationBell'

const GROUP_ICONS = {
  sales: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  operations: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  manage: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  ),
  roadmap: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  ),
  designer: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
    </svg>
  ),
}

const NAV_GROUPS_ADMIN = (featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, orgType, featureSla, featureMonitoring, featureDrawingTool, featureInventory) => [
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
      ...(orgType !== 'manufacturer' ? [
        { label: 'Jobs', path: '/jobs', icon: '🔨' },
        { label: 'Tech Log', path: '/tech-log', icon: '📋' },
        { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
        { label: 'Dispatch', path: '/dispatch', icon: '🗺' },
      ] : []),
      ...(featureInvoices ? [{ label: 'Invoices', path: '/invoices', icon: '🧾' }] : []),
      ...(orgType !== 'manufacturer' && featureProposals ? [
        { label: 'Vendors', path: '/vendors', icon: '🏭' },
        ...(featurePurchaseOrders ? [{ label: 'Purchase Orders', path: '/purchase-orders', icon: '📄' }] : []),
        ...(featureInventory ? [{ label: 'Inventory', path: '/inventory', icon: '🏭' }] : []),
      ] : []),
      ...(orgType === 'manufacturer' ? [
        { label: 'Catalog', path: '/catalog', icon: '📚' },
        { label: 'Orders', path: '/orders', icon: '🛒' },
      ] : []),
      ...((featureSla || featureMonitoring) ? [{ label: 'Contracts', path: '/contracts', icon: '📋' }] : []),
    ].filter(l => l)
  },
  {
    key: 'manage',
    label: 'Manage',
    links: [
      ...(orgType !== 'manufacturer' ? [{ label: 'Product Library', path: '/product-library', icon: '📦' }] : []),
      ...(featureDrawingTool ? [{ label: 'Designer', path: '/designer', icon: '📐' }] : []),
      ...(featureDrawingTool ? [{ label: 'Single Line', path: '/sld', icon: '⚡' }] : []),
      ...(orgType === 'manufacturer' ? [{ label: 'Roadmap', path: '/roadmap', icon: '🗺️' }] : []),
      { label: 'Reports', path: '/reports', icon: '📊' },
      { label: 'Team', path: '/reps', icon: '👥' },
      { label: 'Settings', path: '/settings', icon: '⚙️' },
      { label: 'Help', path: '/faq', icon: '❓' },
    ]
  }
]

const NAV_GROUPS_PM = (featurePurchaseOrders, featureInvoices, featureInventory) => [
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
      ...(featureInventory ? [{ label: 'Inventory', path: '/inventory', icon: '🏭' }] : []),
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

const NAV_GROUPS_PRODUCT_MANAGER = () => [
  {
    key: 'roadmap',
    label: 'Roadmap',
    links: [
      { label: 'Roadmap', path: '/roadmap', icon: '🗺️' },
      { label: 'Catalog', path: '/catalog', icon: '📚' },
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

const NAV_GROUPS_DEV = () => [
  {
    key: 'roadmap',
    label: 'Roadmap',
    links: [
      { label: 'Roadmap', path: '/roadmap', icon: '🗺️' },
      { label: 'Catalog', path: '/catalog', icon: '📚' },
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

const NAV_GROUPS_REP = (featureProposals, featureCRM, featureInvoices, orgType, featureSla, featureMonitoring, featureDrawingTool) => [
  {
    key: 'sales',
    label: 'Sales',
    links: [
      { label: 'Dashboard', path: '/', icon: '📊' },
      ...(featureCRM ? [
        { label: 'Pipeline', path: '/pipeline', icon: '🗂️' },
        { label: 'Tasks', path: '/tasks', icon: '✅' },
        { label: 'Forecast', path: '/forecast', icon: '📈' },
      ] : []),
      ...(featureProposals && orgType !== 'manufacturer' ? [
        { label: 'Proposals', path: '/proposals', icon: '📋' },
      ] : []),
      { label: 'Clients', path: '/clients', icon: '🏢' },
      ...(featureDrawingTool && orgType !== 'manufacturer' ? [{ label: 'Designer', path: '/designer', icon: '📐' }] : []),
    ]
  },
  {
    key: 'operations',
    label: 'Operations',
    links: [
      ...(orgType !== 'manufacturer' ? [
        { label: 'Jobs', path: '/jobs', icon: '🔨' },
        { label: 'Tech Log', path: '/tech-log', icon: '📋' },
        { label: 'Service Tickets', path: '/service-tickets', icon: '🎫' },
        { label: 'Dispatch', path: '/dispatch', icon: '📍' },
      ] : []),
      ...(featureInvoices ? [{ label: 'Invoices', path: '/invoices', icon: '🧾' }] : []),
      ...(orgType === 'manufacturer' ? [
        { label: 'Catalog', path: '/catalog', icon: '📚' },
        { label: 'Orders', path: '/orders', icon: '🛒' },
      ] : []),
      ...((featureSla || featureMonitoring) ? [{ label: 'Contracts', path: '/contracts', icon: '📋' }] : []),
    ].filter(l => l)
  },
  {
    key: 'manage',
    label: 'Manage',
    links: [
      ...(orgType === 'manufacturer' ? [{ label: 'Roadmap', path: '/roadmap', icon: '🗺️' }] : []),
      { label: 'Settings', path: '/settings', icon: '⚙️' },
      { label: 'Help', path: '/faq', icon: '❓' },
    ]
  }
]

export default function Sidebar({ isAdmin, isDevTeam = false, isProductManager = false, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, featureSla: featurSlaProp = false, featureMonitoring: featureMonitoringProp = false, featureDrawingTool = false, featureDesignerOnly = false, featureInventory: featureInventoryProp = false, role = 'rep', isSalesManager = false, isPM = false, isTechnician = false }) {
  const location = useLocation()
  const [userId, setUserId] = useState(null)
  const [orgType, setOrgType] = useState(() => sessionStorage.getItem('orgType') || 'integrator')
  const featureSla = featurSlaProp || sessionStorage.getItem('featureSla') === 'true'
  const featureMonitoring = featureMonitoringProp || sessionStorage.getItem('featureMonitoring') === 'true'
  const featureInventory = featureInventoryProp || sessionStorage.getItem('featureInventory') === 'true'
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

  const isDesignerOnly = featureDesignerOnly || sessionStorage.getItem('featureDesignerOnly') === 'true'
  const groups = isDesignerOnly
    ? [{
        key: 'designer',
        label: 'Designer',
        links: [
          { label: 'My Projects', path: '/designer', icon: '📐' },
          { label: 'Settings', path: '/settings', icon: '⚙️' },
        ]
      }]
    : isDevTeam
    ? NAV_GROUPS_DEV()
    : isProductManager
    ? NAV_GROUPS_PRODUCT_MANAGER()
    : isAdmin || isSalesManager
    ? NAV_GROUPS_ADMIN(featureProposals, featureCRM, featurePurchaseOrders, featureInvoices, orgType, featureSla, featureMonitoring, featureDrawingTool || sessionStorage.getItem('featureDrawingTool') === 'true', featureInventory)
    : isPM
    ? NAV_GROUPS_PM(featurePurchaseOrders, featureInvoices, featureInventory)
    : isTechnician
    ? NAV_GROUPS_TECH()
    : NAV_GROUPS_REP(featureProposals, featureCRM, featureInvoices, orgType, featureSla, featureMonitoring, featureDrawingTool || sessionStorage.getItem('featureDrawingTool') === 'true')

  const visibleGroups = groups.filter(g => g.links.length > 0)

  const isActive = (path) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'))

  return (
    <div className="w-56 h-full flex-shrink-0 bg-fp-card border-r border-fp-border flex flex-col">
      <div className="px-6 py-5 border-b border-fp-border">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-fp-text text-xl font-bold">
              ForgePt<span className="text-[#C8622A]">.</span>
            </h1>
            {(isAdmin || isSalesManager || isPM || isProductManager || isTechnician || isDevTeam) && (
              <span className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block">
                {isAdmin ? 'Admin' : isSalesManager ? 'Sales Mgr' : isPM ? 'Project Mgr' : isProductManager ? 'Product Mgr' : isTechnician ? 'Technician' : 'Dev Team'}
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
            <div key={group.key} className="mb-2">
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-fp-inset group"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[#C8622A]">{GROUP_ICONS[group.key]}</span>
                  <span className="text-xs font-semibold tracking-widest uppercase text-fp-muted group-hover:text-fp-text transition-colors">{group.label}</span>
                </span>
                <span className="text-fp-muted text-xs">{isOpen ? '▾' : '▸'}</span>
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
                          : 'text-fp-muted hover:text-fp-text hover:bg-fp-inset'
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-fp-border">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-fp-muted hover:text-fp-text hover:bg-fp-inset transition-all duration-200 flex items-center gap-3"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </div>
  )
}
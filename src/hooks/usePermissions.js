import { useProfile } from '../context/ProfileContext'

// Every area that can be permission-gated
export const PERMISSION_AREAS = [
  { key: 'dashboard',      label: 'Dashboard',           group: 'Sales' },
  { key: 'proposals',      label: 'Proposals',            group: 'Sales' },
  { key: 'clients',        label: 'Clients',              group: 'Sales' },
  { key: 'pipeline',       label: 'Pipeline & Forecast',  group: 'Sales' },
  { key: 'tasks',          label: 'Tasks',                group: 'Sales' },
  { key: 'jobs',           label: 'Jobs',                 group: 'Operations' },
  { key: 'serviceTickets', label: 'Service Tickets',      group: 'Operations' },
  { key: 'dispatch',       label: 'Dispatch',             group: 'Operations' },
  { key: 'invoices',       label: 'Invoices',             group: 'Operations' },
  { key: 'purchaseOrders', label: 'Purchase Orders',      group: 'Operations' },
  { key: 'inventory',      label: 'Inventory',            group: 'Operations' },
  { key: 'contracts',      label: 'Contracts',            group: 'Operations' },
  { key: 'vendors',        label: 'Vendors',              group: 'Operations' },
  { key: 'productLibrary', label: 'Product Library',      group: 'Manage' },
  { key: 'reports',        label: 'Reports',              group: 'Manage' },
  { key: 'settings',       label: 'Settings & Team',      group: 'Manage' },
]

// Areas where "own vs all" data scoping is meaningful
export const SCOPEABLE_AREAS = new Set([
  'proposals', 'pipeline', 'jobs', 'serviceTickets', 'tasks', 'contracts',
])

const DEFAULT_ALL_WRITE = Object.fromEntries(
  PERMISSION_AREAS.map(a => [a.key, 'write'])
)

// Default permissions for the technician base role
export const TECH_DEFAULT_PERMISSIONS = Object.fromEntries(
  PERMISSION_AREAS.map(a => [a.key, 'none'])
)
Object.assign(TECH_DEFAULT_PERMISSIONS, {
  jobs: 'write',
  serviceTickets: 'write',
  dispatch: 'read',
  tasks: 'read',
  inventory: 'read',
  settings: 'write',
})

// Default scopes for technicians — admins can restrict to 'own' via role settings
const TECH_DEFAULT_SCOPES = {
  jobs: 'all',
  serviceTickets: 'all',
  tasks: 'own',
}

export function computePermissions(orgRole, overrides, isAdmin) {
  if (isAdmin) return { ...DEFAULT_ALL_WRITE }
  if (!orgRole) return { ...DEFAULT_ALL_WRITE }
  if (orgRole.is_admin) return { ...DEFAULT_ALL_WRITE }
  const isTech = orgRole.base_role === 'technician'
  const base = isTech
    ? { ...TECH_DEFAULT_PERMISSIONS, ...(orgRole.permissions || {}) }
    : { ...DEFAULT_ALL_WRITE, ...(orgRole.permissions || {}) }
  return { ...base, ...(overrides || {}) }
}

export function computeScopes(orgRole, overrides, isAdmin) {
  if (isAdmin || !orgRole || orgRole.is_admin) return {}
  const isTech = orgRole.base_role === 'technician'
  const base = isTech ? { ...TECH_DEFAULT_SCOPES, ...(orgRole.scopes || {}) } : { ...(orgRole.scopes || {}) }
  return { ...base, ...(overrides || {}) }
}

export function usePermissions() {
  const { profile } = useProfile()
  const isAdmin = profile?.org_role === 'admin' || profile?.role === 'admin'
  const baseRole = profile?.org_roles?.base_role || profile?.org_role || profile?.role || 'rep'

  // Augment orgRole with base_role from profile.role when org_roles doesn't have one.
  // If there is no org_roles record at all but the system role is 'technician', synthesize
  // a minimal role object so computePermissions applies TECH_DEFAULT_PERMISSIONS instead
  // of falling back to DEFAULT_ALL_WRITE.
  const orgRoleWithBase = profile?.org_roles
    ? (profile.org_roles.base_role ? profile.org_roles : { ...profile.org_roles, base_role: baseRole })
    : baseRole === 'technician'
    ? { base_role: 'technician', permissions: {}, scopes: {}, is_admin: false }
    : null

  const perms  = computePermissions(orgRoleWithBase, profile?.permission_overrides, isAdmin)
  const scopes = computeScopes(orgRoleWithBase, profile?.scope_overrides, isAdmin)

  return {
    isAdmin,

    /** True if the user can see/access this area (read or write) */
    can: (area) => !area || perms[area] !== 'none',

    /** True if the user can create/edit/delete in this area */
    canWrite: (area) => !area || perms[area] === 'write',

    /** 'none' | 'read' | 'write' */
    level: (area) => perms[area] || 'write',

    /**
     * 'own' | 'all' — only meaningful for SCOPEABLE_AREAS.
     * Admins always get 'all'. Non-scopeable areas always return 'all'.
     */
    scope: (area) => {
      if (isAdmin || !SCOPEABLE_AREAS.has(area)) return 'all'
      return scopes[area] || 'all'
    },

    /** Full maps for rendering permission/scope matrices */
    all: perms,
    allScopes: scopes,

    roleName: profile?.org_roles?.name || null,
    isTechnician:    baseRole === 'technician',
    isSalesManager:  baseRole === 'sales_manager',
    isPM:            baseRole === 'project_manager',
    isProductManager: baseRole === 'product_manager',
    isDevTeam:       baseRole === 'dev',
  }
}

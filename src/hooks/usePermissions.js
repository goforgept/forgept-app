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

// Default when no custom role is assigned: full write access to everything
const DEFAULT_ALL_WRITE = Object.fromEntries(
  PERMISSION_AREAS.map(a => [a.key, 'write'])
)

/**
 * Compute effective permissions for a user.
 * Priority: admin bypass > role.is_admin bypass > role defaults + user overrides
 */
export function computePermissions(orgRole, overrides, isAdmin) {
  if (isAdmin) return { ...DEFAULT_ALL_WRITE }
  if (!orgRole) return { ...DEFAULT_ALL_WRITE }           // no custom role → full access
  if (orgRole.is_admin) return { ...DEFAULT_ALL_WRITE }  // role flagged as admin

  const base = { ...DEFAULT_ALL_WRITE, ...(orgRole.permissions || {}) }
  return { ...base, ...(overrides || {}) }
}

export function usePermissions() {
  const { profile } = useProfile()
  const isAdmin = profile?.org_role === 'admin' || profile?.role === 'admin'

  const perms = computePermissions(
    profile?.org_roles,           // joined via org_role_id (null if none assigned)
    profile?.permission_overrides,
    isAdmin
  )

  return {
    isAdmin,

    /** True if the user can see/access this area (read or write) */
    can: (area) => !area || perms[area] !== 'none',

    /** True if the user can create/edit/delete in this area */
    canWrite: (area) => !area || perms[area] === 'write',

    /** 'none' | 'read' | 'write' */
    level: (area) => perms[area] || 'write',

    /** Full map for rendering permission matrices */
    all: perms,

    /** Name of the custom role, if assigned */
    roleName: profile?.org_roles?.name || null,
  }
}

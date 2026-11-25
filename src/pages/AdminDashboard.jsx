// Team dashboard (admins, sales managers, PMs). Layout, widgets and data live in src/dashboard/.
import { useProfile } from '../context/ProfileContext'
import DashboardPage from '../dashboard/DashboardPage'

export default function AdminDashboard({ isAdmin, featureProposals = true, featureCRM = false, isSalesManager = false, isPM = false, defaultMode = null, featureRegions = false, featureInventory = false }) {
  const { profile } = useProfile()
  const pmOnly = isPM && !isAdmin && !isSalesManager
  return (
    <DashboardPage
      profile={profile}
      dashKey="team"
      scope="team"
      role={pmOnly || defaultMode === 'pm' ? 'pm' : 'admin'}
      canSetTargets={!!(isAdmin || isSalesManager)}
      canSeeOps={!!(isAdmin || isPM)}
      regionScoped={!!(featureRegions && profile?.is_regional_vp)}
      initialTab={defaultMode === 'pm' ? 'ops' : null}
      sidebarProps={{ isAdmin: true, featureProposals, featureCRM, featureInventory, isSalesManager, isPM }}
    />
  )
}

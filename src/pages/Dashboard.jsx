// Personal dashboard (reps, and admins at /rep). Layout, widgets and data live in src/dashboard/.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { useProfile } from '../context/ProfileContext'
import DashboardPage from '../dashboard/DashboardPage'

export default function Dashboard({ isAdmin, featureProposals = true, featureCRM = false }) {
  const { profile } = useProfile()
  const { isTechnician } = usePermissions()
  const navigate = useNavigate()
  useEffect(() => { if (isTechnician) navigate('/tech-log', { replace: true }) }, [isTechnician, navigate])
  if (isTechnician) return null
  return (
    <DashboardPage
      profile={profile}
      dashKey="rep"
      scope="mine"
      role="rep"
      canSetTargets={!!isAdmin}
      sidebarProps={{ isAdmin: false, featureProposals, featureCRM, isTechnician }}
    />
  )
}

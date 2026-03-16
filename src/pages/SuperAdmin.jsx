import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function SuperAdmin() {
  const [orgs, setOrgs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: orgsData } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    setOrgs(orgsData || [])
    setProfiles(profilesData || [])
    setLoading(false)
  }

  const getOrgProfiles = (orgId) => profiles.filter(p => p.org_id === orgId)
  const getOrgAdmin = (orgId) => profiles.find(p => p.org_id === orgId && p.org_role === 'admin')
  const approveOrg = async (orgId, adminEmail, adminName) => {
  await supabase
    .from('organizations')
    .update({ status: 'active' })
    .eq('id', orgId)

  // Send approval email
  await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-approval', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
    },
    body: JSON.stringify({ email: adminEmail, name: adminName })
  })

  fetchData()
}

const suspendOrg = async (orgId) => {
  if (!window.confirm('Are you sure you want to suspend this organization?')) return
  await supabase
    .from('organizations')
    .update({ status: 'suspended' })
    .eq('id', orgId)
  fetchData()
}

const reactivateOrg = async (orgId) => {
  await supabase
    .from('organizations')
    .update({ status: 'active' })
    .eq('id', orgId)
  fetchData()
}

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      {/* Header */}
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-white text-xl font-bold">
            ForgePt<span className="text-[#C8622A]">.</span>
          </h1>
          <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full font-semibold">
            Super Admin
          </span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-[#8A9AB0] hover:text-white text-sm transition-colors"
        >
          ← Back to App
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Total Orgs</p>
            <p className="text-white text-2xl font-bold">{orgs.length}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Total Users</p>
            <p className="text-white text-2xl font-bold">{profiles.length}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Pending Approval</p>
            <p className="text-yellow-400 text-2xl font-bold">
              {orgs.filter(o => o.status === 'pending').length}
            </p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Active Orgs</p>
            <p className="text-green-400 text-2xl font-bold">
              {orgs.filter(o => o.status === 'active' || !o.status).length}
            </p>
          </div>
        </div>

        {/* Orgs Table */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">All Organizations</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : orgs.length === 0 ? (
            <p className="text-[#8A9AB0]">No organizations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Company', 'Admin', 'Email', 'Users', 'Status', 'Created', 'Actions'].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orgs.map(org => {
                    const admin = getOrgAdmin(org.id)
                    const memberCount = getOrgProfiles(org.id).length
                    const status = org.status || 'active'

                    return (
                      <tr key={org.id} className="border-b border-[#2a3d55]/30">
                      <td className="py-3">
  <div className="flex gap-2">
    {status === 'pending' && (
      <button
        onClick={() => approveOrg(org.id, admin?.email, admin?.full_name)}
        className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors"
      >
        Approve
      </button>
    )}
    {status !== 'suspended' && status !== 'pending' && (
      <button
        onClick={() => suspendOrg(org.id)}
        className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors"
      >
        Suspend
      </button>
    )}
    {status === 'suspended' && (
      <button
        onClick={() => reactivateOrg(org.id)}
        className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors"
      >
        Reactivate
      </button>
    )}
  </div>
</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">
                          {new Date(org.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            {status === 'pending' && (
                              <button className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">
                                Approve
                              </button>
                            )}
                            {status !== 'suspended' && (
                              <button className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors">
                                Suspend
                              </button>
                            )}
                            {status === 'suspended' && (
                              <button className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
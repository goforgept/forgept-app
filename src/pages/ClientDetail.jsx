import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import ActivityTimeline from '../components/ActivityTimeline'
import TaskList from '../components/TaskList'

const INDUSTRIES = [
  'Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security',
  'Low Voltage', 'General Contractor', 'Roofing', 'Home Improvement',
  'Flooring', 'Painting', 'Landscaping', 'Solar', 'Fire Protection',
  'Telecom', 'IT / Networking', 'Other'
]

const emptyLocation = {
  site_name: '', address: '', city: '', state: '', zip: '',
  site_contact_name: '', site_contact_email: '', site_contact_phone: '', notes: ''
}

export default function ClientDetail({ isAdmin, featureProposals = true, featureCRM = false, featureAiEmail = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [proposals, setProposals] = useState([])
  const [profile, setProfile] = useState(null)
  const [teamProfiles, setTeamProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingClient, setEditingClient] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [savingClient, setSavingClient] = useState(false)
  const [activeTab, setActiveTab] = useState('proposals')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailForm, setEmailForm] = useState({ subject: '', context: '' })
  const [draftedEmail, setDraftedEmail] = useState('')
  const [generatingEmail, setGeneratingEmail] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [clientEmails, setClientEmails] = useState([])
  const [emailEditMode, setEmailEditMode] = useState(false)
  // Locations
  const [locations, setLocations] = useState([])
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [editingLocation, setEditingLocation] = useState(null)
  const [locationForm, setLocationForm] = useState(emptyLocation)
  const [savingLocation, setSavingLocation] = useState(false)
  // Service Tickets
  const [clientTickets, setClientTickets] = useState([])

  

  useEffect(() => {
    fetchClient()
    fetchProposals()
    fetchProfile()
    fetchLocations()
    fetchClientTickets()
  }, [])

  const fetchClient = async () => {
    const { data } = await supabase.from('clients').select('*').eq('id', id).single()
    setClient(data)
    setEditForm(data || {})
  }

  const fetchProposals = async () => {
    const { data } = await supabase.from('proposals').select('*').eq('client_id', id).order('created_at', { ascending: false })
    setProposals(data || [])
    setLoading(false)
  }

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
    if (data?.org_id) {
      const { data: team } = await supabase.from('profiles').select('id, full_name').eq('org_id', data.org_id)
      setTeamProfiles(team || [])
    }
    fetchClientEmails(user.id)
  }

  const fetchClientEmails = async (userId) => {
    const { data } = await supabase.from('client_emails').select('*').eq('client_id', id).order('sent_at', { ascending: false })
    setClientEmails(data || [])
  }

  const fetchLocations = async () => {
    const { data } = await supabase.from('client_locations').select('*').eq('client_id', id).order('site_name', { ascending: true })
    setLocations(data || [])
  }

  const fetchClientTickets = async () => {
    const { data } = await supabase
      .from('service_tickets')
      .select('*, profiles!service_tickets_assigned_tech_id_fkey(full_name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    setClientTickets(data || [])
  }

  const openAddLocation = () => {
    setEditingLocation(null)
    setLocationForm(emptyLocation)
    setShowLocationModal(true)
  }

  const openEditLocation = (loc) => {
    setEditingLocation(loc)
    setLocationForm({
      site_name: loc.site_name || '',
      address: loc.address || '',
      city: loc.city || '',
      state: loc.state || '',
      zip: loc.zip || '',
      site_contact_name: loc.site_contact_name || '',
      site_contact_email: loc.site_contact_email || '',
      site_contact_phone: loc.site_contact_phone || '',
      notes: loc.notes || ''
    })
    setShowLocationModal(true)
  }

  const saveLocation = async () => {
    if (!locationForm.site_name.trim()) return
    setSavingLocation(true)
    if (editingLocation) {
      await supabase.from('client_locations').update(locationForm).eq('id', editingLocation.id)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      await supabase.from('client_locations').insert({ ...locationForm, client_id: id, org_id: profileData.org_id })
    }
    await fetchLocations()
    setShowLocationModal(false)
    setSavingLocation(false)
  }

  const deleteLocation = async (locId) => {
    if (!window.confirm('Delete this location?')) return
    await supabase.from('client_locations').delete().eq('id', locId)
    await fetchLocations()
  }

  const draftEmail = async () => {
    setGeneratingEmail(true)
    setDraftedEmail('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ company: client?.company, clientName: client?.client_name, industry: client?.industry, context: emailForm.context, repName: profile?.full_name })
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid response: ' + text.slice(0, 200)) }
      if (data.error) throw new Error(data.error)
      if (!data.draft) throw new Error('No draft returned.')
      setDraftedEmail(data.draft)
      setEmailEditMode(false)
    } catch (err) { setDraftedEmail('Error: ' + err.message) }
    setGeneratingEmail(false)
  }

  const sendEmail = async () => {
    if (!client?.email) { alert('No email on file for this client.'); return }
    if (!draftedEmail || !emailForm.subject) { alert('Subject and email body required.'); return }
    setSendingEmail(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: 'ai_email', toEmail: client.email, toName: client.client_name || client.company, fromName: profile?.full_name || '', fromEmail: profile?.email || '', subject: emailForm.subject, body: draftedEmail, clientId: id, orgId: profile?.org_id, sentBy: profile?.id })
      })
      const result = await res.json()
      await supabase.from('client_emails').insert({ org_id: profile?.org_id, client_id: id, sent_by: profile?.id, subject: emailForm.subject, body: draftedEmail, to_email: client.email, brevo_message_id: result.messageId || null })
      await fetchClientEmails(profile?.id)
      setShowEmailModal(false)
      setEmailForm({ subject: '', context: '' })
      setDraftedEmail('')
    } catch (err) { alert('Error sending email: ' + err.message) }
    setSendingEmail(false)
  }

  const saveClient = async () => {
    setSavingClient(true)
    await supabase.from('clients').update({
      company: editForm.company, client_name: editForm.client_name, email: editForm.email, phone: editForm.phone,
      industry: editForm.industry, address: editForm.address, city: editForm.city, state: editForm.state, zip: editForm.zip, notes: editForm.notes,
    }).eq('id', id)
    await fetchClient()
    setEditingClient(false)
    setSavingClient(false)
  }

  const handleNewProposal = () => navigate(`/new?clientId=${id}`)

  const totalPipeline = proposals.filter(p => p.status !== 'Lost').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const wonPipeline = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const winRate = proposals.length > 0 ? Math.round((proposals.filter(p => p.status === 'Won').length / proposals.length) * 100) : 0
  const avgDeal = proposals.length > 0 ? proposals.reduce((sum, p) => sum + (p.proposal_value || 0), 0) / proposals.length : 0
  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'
  const fullAddress = [client?.address, client?.city, client?.state, client?.zip].filter(Boolean).join(', ')
  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[#C8622A] text-xl font-bold">{(client?.company || client?.client_name || '?')[0].toUpperCase()}</span>
              </div>
              <div>
                <button onClick={() => navigate('/clients')} className="text-[#8A9AB0] hover:text-white text-xs transition-colors mb-1">← Clients</button>
                <h2 className="text-white text-2xl font-bold">{client?.company}</h2>
                <p className="text-[#8A9AB0] mt-0.5">{client?.client_name}</p>
                {fullAddress && <p className="text-[#8A9AB0] text-sm mt-0.5">{fullAddress}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {featureAiEmail && client?.email && (
                <button onClick={() => { setShowEmailModal(true); setDraftedEmail(''); setEmailForm({ subject: '', context: '' }) }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✍️ Draft Email</button>
              )}
              <button onClick={() => setEditingClient(true)} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Edit Client</button>
              <button onClick={handleNewProposal} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ New Proposal</button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4 mt-6">
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Proposals</p><p className="text-white text-xl font-bold">{proposals.length}</p></div>
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Pipeline</p><p className="text-white text-xl font-bold">${fmt(totalPipeline)}</p></div>
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Won Revenue</p><p className="text-green-400 text-xl font-bold">${fmt(wonPipeline)}</p></div>
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Win Rate</p><p className="text-white text-xl font-bold">{winRate}%</p></div>
            <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Locations</p><p className="text-white text-xl font-bold">{locations.length}</p></div>
          </div>
        </div>

        {/* Contact strip */}
        <div className="bg-[#1a2d45] rounded-xl px-6 py-4 flex gap-8 flex-wrap">
          {client?.email && <div className="flex items-center gap-2"><span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Email</span><a href={`mailto:${client.email}`} className="text-[#C8622A] text-sm hover:underline">{client.email}</a></div>}
          {client?.phone && <div className="flex items-center gap-2"><span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Phone</span><a href={`tel:${client.phone}`} className="text-white text-sm hover:text-[#C8622A] transition-colors">{client.phone}</a></div>}
          {client?.industry && <div className="flex items-center gap-2"><span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Industry</span><span className="text-white text-sm">{client.industry}</span></div>}
          {fullAddress && <div className="flex items-center gap-2"><span className="text-[#8A9AB0] text-xs uppercase tracking-wide">Address</span><a href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noreferrer" className="text-white text-sm hover:text-[#C8622A] transition-colors">{fullAddress}</a></div>}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'proposals', label: `Proposals (${proposals.length})` },
            { key: 'locations', label: `Locations (${locations.length})` },
            { key: 'tickets', label: `Service Tickets (${clientTickets.length})` },
            { key: 'activity', label: 'Activity' },
            { key: 'tasks', label: 'Tasks' },
            { key: 'emails', label: `Emails (${clientEmails.length})` },
            { key: 'notes', label: 'Notes' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Proposals tab */}
        {activeTab === 'proposals' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            {proposals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#8A9AB0] mb-4">No proposals yet for this client.</p>
                <button onClick={handleNewProposal} className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Create First Proposal</button>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.map(proposal => (
                  <div key={proposal.id} onClick={() => navigate(`/proposal/${proposal.id}`)}
                    className="flex justify-between items-center bg-[#0F1C2E] rounded-lg p-4 cursor-pointer hover:bg-[#0a1628] transition-colors group">
                    <div>
                      <p className="text-white font-semibold group-hover:text-[#C8622A] transition-colors">{proposal.proposal_name}</p>
                      <p className="text-[#8A9AB0] text-sm mt-0.5">{proposal.rep_name} · {proposal.industry}{proposal.close_date && ` · Close: ${proposal.close_date}`}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {proposal.total_gross_margin_percent != null && (
                        <div className="text-right"><p className="text-[#8A9AB0] text-xs">Margin</p><p className="text-[#C8622A] text-sm font-semibold">{proposal.total_gross_margin_percent.toFixed(1)}%</p></div>
                      )}
                      <div className="text-right"><p className="text-[#8A9AB0] text-xs">Value</p><p className="text-white text-sm font-bold">${(proposal.proposal_value || 0).toLocaleString()}</p></div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' : proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' : 'bg-[#8A9AB0]/20 text-[#8A9AB0]'}`}>{proposal.status}</span>
                      <span className="text-[#8A9AB0] group-hover:text-white transition-colors">→</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Locations tab */}
        {activeTab === 'locations' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Locations</h3>
              <button onClick={openAddLocation} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Add Location</button>
            </div>
            {locations.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-[#8A9AB0] mb-3">No locations yet.</p>
                <p className="text-[#8A9AB0] text-sm">Add job site locations, offices, or facilities for this client.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {locations.map(loc => {
                  const addr = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')
                  return (
                    <div key={loc.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-white font-semibold">{loc.site_name}</p>
                          {addr && <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="text-[#8A9AB0] text-xs hover:text-[#C8622A] transition-colors mt-0.5 block">{addr}</a>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEditLocation(loc)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Edit</button>
                          <button onClick={() => deleteLocation(loc.id)} className="text-red-400 hover:text-red-300 text-xs transition-colors">Delete</button>
                        </div>
                      </div>
                      {(loc.site_contact_name || loc.site_contact_email || loc.site_contact_phone) && (
                        <div className="border-t border-[#2a3d55] pt-2 mt-2 space-y-1">
                          {loc.site_contact_name && <p className="text-white text-xs font-medium">{loc.site_contact_name}</p>}
                          {loc.site_contact_email && <a href={`mailto:${loc.site_contact_email}`} className="text-[#C8622A] text-xs hover:underline block">{loc.site_contact_email}</a>}
                          {loc.site_contact_phone && <p className="text-[#8A9AB0] text-xs">{loc.site_contact_phone}</p>}
                        </div>
                      )}
                      {loc.notes && <p className="text-[#8A9AB0] text-xs mt-2 italic">{loc.notes}</p>}
                      <div className="mt-3">
                        <button onClick={() => navigate(`/new?clientId=${id}&locationId=${loc.id}`)}
                          className="text-[#C8622A] text-xs hover:text-white transition-colors">+ Proposal for this location →</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Service Tickets</h3>
              <button onClick={() => navigate('/service-tickets')} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">+ New Ticket</button>
            </div>
            {clientTickets.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No service tickets for this client yet.</p>
            ) : (
              <div className="space-y-3">
                {clientTickets.map(ticket => (
                  <div key={ticket.id} onClick={() => navigate(`/service-tickets/${ticket.id}`)}
                    className="bg-[#0F1C2E] rounded-lg p-4 border border-[#2a3d55] cursor-pointer hover:border-[#C8622A]/40 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {ticket.ticket_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#1a2d45] px-2 py-0.5 rounded">{ticket.ticket_number}</span>}
                          <p className="text-white font-semibold text-sm">{ticket.title}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#8A9AB0] flex-wrap">
                          <span className={`px-2 py-0.5 rounded font-semibold ${ticket.priority === 'Urgent' ? 'bg-red-500/20 text-red-400' : ticket.priority === 'High' ? 'bg-orange-500/20 text-orange-400' : ticket.priority === 'Normal' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{ticket.priority}</span>
                          <span className={`px-2 py-0.5 rounded font-semibold ${ticket.status === 'Open' ? 'bg-blue-500/20 text-blue-400' : ticket.status === 'In Progress' ? 'bg-yellow-500/20 text-yellow-400' : ticket.status === 'Resolved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{ticket.status}</span>
                          {ticket.profiles?.full_name && <span>🔧 {ticket.profiles.full_name}</span>}
                          {ticket.scheduled_date && <span>📅 {new Date(ticket.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        </div>
                      </div>
                      <span className="text-[#8A9AB0] text-xs ml-4">{new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && <ActivityTimeline clientId={id} orgId={client?.org_id} userId={profile?.id} />}
        {activeTab === 'tasks' && <TaskList clientId={id} orgId={client?.org_id} userId={profile?.id} profiles={teamProfiles} />}

        {activeTab === 'emails' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Email History</h3>
              {featureAiEmail && client?.email && (
                <button onClick={() => { setShowEmailModal(true); setDraftedEmail(''); setEmailForm({ subject: '', context: '' }) }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✍️ Draft Email</button>
              )}
            </div>
            {clientEmails.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No emails sent yet.</p>
            ) : (
              <div className="space-y-3">
                {clientEmails.map(email => (
                  <div key={email.id} className="bg-[#0F1C2E] rounded-lg p-4 border border-[#2a3d55]">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-semibold text-sm">{email.subject}</p>
                      {email.opened_at ? <span className="text-green-400 text-xs font-semibold">✓ Opened {new Date(email.opened_at).toLocaleDateString()}</span> : <span className="text-[#8A9AB0] text-xs">Not opened yet</span>}
                    </div>
                    <p className="text-[#8A9AB0] text-xs mb-2">To: {email.to_email} · {new Date(email.sent_at).toLocaleDateString()}</p>
                    <p className="text-[#D6E4F0] text-xs leading-relaxed whitespace-pre-wrap line-clamp-3">{email.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Notes</h3>
              {!editingClient && <button onClick={() => setEditingClient(true)} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">Edit</button>}
            </div>
            {client?.notes ? <p className="text-[#8A9AB0] text-sm leading-relaxed whitespace-pre-wrap">{client.notes}</p> : <p className="text-[#8A9AB0] text-sm italic">No notes yet.</p>}
          </div>
        )}
      </div>

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">{editingLocation ? 'Edit Location' : 'Add Location'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Site Name <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={locationForm.site_name} onChange={e => setLocationForm(p => ({ ...p, site_name: e.target.value }))} placeholder="e.g. HQ, Warehouse, Nashville Office" className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                <input type="text" value={locationForm.address} onChange={e => setLocationForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">City</label><input type="text" value={locationForm.city} onChange={e => setLocationForm(p => ({ ...p, city: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">State</label><input type="text" value={locationForm.state} onChange={e => setLocationForm(p => ({ ...p, state: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label><input type="text" value={locationForm.zip} onChange={e => setLocationForm(p => ({ ...p, zip: e.target.value }))} className={inputClass} /></div>
              </div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide pt-2">Site Contact (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Contact Name</label><input type="text" value={locationForm.site_contact_name} onChange={e => setLocationForm(p => ({ ...p, site_contact_name: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Contact Email</label><input type="email" value={locationForm.site_contact_email} onChange={e => setLocationForm(p => ({ ...p, site_contact_email: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Contact Phone</label><input type="text" value={locationForm.site_contact_phone} onChange={e => setLocationForm(p => ({ ...p, site_contact_phone: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Notes / Access Info</label><textarea value={locationForm.notes} onChange={e => setLocationForm(p => ({ ...p, notes: e.target.value }))} placeholder="Gate code, parking, contact info..." rows={2} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowLocationModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveLocation} disabled={savingLocation || !locationForm.site_name.trim()} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingLocation ? 'Saving...' : 'Save Location'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">✍️ Draft Email with AI</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Sending to <span className="text-white font-medium">{client?.company}</span>{client?.client_name ? ` · ${client.client_name}` : ''} · {client?.email}</p>
            <div className="space-y-4">
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Subject Line</label><input type="text" value={emailForm.subject} onChange={e => setEmailForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Security System Upgrade" className={inputClass} /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">What do you want to accomplish?</label><textarea value={emailForm.context} onChange={e => setEmailForm(p => ({ ...p, context: e.target.value }))} rows={3} placeholder="e.g. Cold outreach about camera system for their next project." className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" /></div>
              <button onClick={draftEmail} disabled={generatingEmail || !emailForm.context} className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">{generatingEmail ? '✨ Drafting...' : '✨ Generate Draft'}</button>
              {draftedEmail && (
                <div>
                  <div className="flex justify-between items-center mb-2"><label className="text-[#8A9AB0] text-xs">Email Draft</label><button onClick={() => setEmailEditMode(!emailEditMode)} className="text-[#C8622A] text-xs hover:text-white transition-colors">{emailEditMode ? 'Preview' : 'Edit'}</button></div>
                  {emailEditMode ? <textarea value={draftedEmail} onChange={e => setDraftedEmail(e.target.value)} rows={12} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" /> : <div className="bg-[#0F1C2E] border border-[#2a3d55] rounded-lg p-4"><p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{draftedEmail}</p></div>}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowEmailModal(false); setDraftedEmail(''); setEmailEditMode(false) }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={sendEmail} disabled={sendingEmail || !draftedEmail || !emailForm.subject} className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">{sendingEmail ? 'Sending...' : 'Send Email →'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">Edit Client</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Company</label><input type="text" value={editForm.company || ''} onChange={e => setEditForm(p => ({ ...p, company: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Contact Name</label><input type="text" value={editForm.client_name || ''} onChange={e => setEditForm(p => ({ ...p, client_name: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Email</label><input type="email" value={editForm.email || ''} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Phone</label><input type="text" value={editForm.phone || ''} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label><select value={editForm.industry || ''} onChange={e => setEditForm(p => ({ ...p, industry: e.target.value }))} className={inputClass}><option value="">Select industry</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
              </div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label><input type="text" value={editForm.address || ''} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">City</label><input type="text" value={editForm.city || ''} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">State</label><input type="text" value={editForm.state || ''} onChange={e => setEditForm(p => ({ ...p, state: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label><input type="text" value={editForm.zip || ''} onChange={e => setEditForm(p => ({ ...p, zip: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Notes</label><textarea value={editForm.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={4} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingClient(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveClient} disabled={savingClient} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingClient ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
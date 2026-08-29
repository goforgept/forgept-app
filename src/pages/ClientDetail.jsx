import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'
import ActivityTimeline from '../components/ActivityTimeline'
import TaskList from '../components/TaskList'

const INDUSTRIES = [
  'Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security',
  'Low Voltage', 'General Contractor', 'Roofing', 'Home Improvement',
  'Flooring', 'Painting', 'Landscaping', 'Solar', 'Fire Protection',
  'Telecom', 'IT / Networking', 'Other'
]

const LOCATION_TYPES = ['HQ', 'Main Office', 'Warehouse', 'Job Site', 'Retail', 'Branch Office', 'Other']

const emptyLocation = {
  site_name: '', location_type: '', address: '', city: '', state: '', zip: '',
  floor_suite: '', access_notes: '', store_id: '',
  site_contact_name: '', site_contact_email: '', site_contact_phone: '', notes: ''
}

const emptyContact = {
  full_name: '', title: '', email: '', phone: '', is_primary: false, notes: '', location_id: null
}

export default function ClientDetail({ isAdmin, featureProposals = true, featureCRM = false, featureAiEmail = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [client, setClient] = useState(null)
  const [proposals, setProposals] = useState([])
  const [teamProfiles, setTeamProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingClient, setEditingClient] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [savingClient, setSavingClient] = useState(false)
  const [activeTab, setActiveTab] = useState('proposals')
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
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
  const [locationContactMode, setLocationContactMode] = useState('select') // 'select' | 'manual'
  const [locationSelectedContactId, setLocationSelectedContactId] = useState(null)
  // Contacts
  const [contacts, setContacts] = useState([])
  const [contactPanel, setContactPanel] = useState(null) // null | 'new' | contact object
  const [panelForm, setPanelForm] = useState(emptyContact)
  const [savingContact, setSavingContact] = useState(false)
  // Subscriptions
  const [subscriptions, setSubscriptions] = useState([])
  const [editingSub, setEditingSub] = useState(null)
  const [editSubForm, setEditSubForm] = useState({})
  const [savingSub, setSavingSub] = useState(false)
  // Service Tickets
  const [clientTickets, setClientTickets] = useState([])
  // Meetings
  const [clientMeetings, setClientMeetings] = useState([])
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago')
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [meetingForm, setMeetingForm] = useState({
    title: '', due_date: '', start_time: '', duration_minutes: 60,
    meeting_type: 'Sales Call', is_virtual: false, assigned_to: '',
    meeting_notes: '', customer_notified: false
  })

  

  useEffect(() => {
    fetchClient()
    fetchProposals()
    fetchLocations()
    fetchContacts()
    fetchClientTickets()
    fetchClientMeetings()
    fetchSubscriptions()
  }, [])

  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!profile?.org_id) return
    supabase.from('profiles').select('id, full_name').eq('org_id', profile.org_id)
      .then(({ data: team }) => setTeamProfiles(team || []))
    supabase.from('organizations').select('timezone').eq('id', profile.org_id).single()
      .then(({ data: orgData }) => { if (orgData?.timezone) setOrgTimezone(orgData.timezone) })
    fetchClientEmails(profile.id)
  }, [profile?.org_id])

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

  const fetchClientEmails = async (userId) => {
    const { data } = await supabase.from('client_emails').select('*').eq('client_id', id).order('sent_at', { ascending: false })
    setClientEmails(data || [])
  }

  const fetchLocations = async () => {
    const { data } = await supabase.from('client_locations').select('*').eq('client_id', id).order('site_name', { ascending: true })
    setLocations(data || [])
  }

  const fetchContacts = async () => {
    const { data } = await supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }).order('full_name', { ascending: true })
    setContacts(data || [])
  }

  const fetchSubscriptions = async () => {
    const { data: propRows } = await supabase.from('proposals').select('id').eq('client_id', id)
    const propIds = (propRows || []).map(p => p.id)
    if (!propIds.length) { setSubscriptions([]); return }
    const { data } = await supabase
      .from('bom_line_items')
      .select('id, item_name, part_number_sku, quantity, customer_price_unit, customer_price_total, billing_frequency, auto_invoice, next_invoice_date, renewal_date, proposal_id, proposals(proposal_name, company)')
      .in('proposal_id', propIds)
      .eq('recurring', true)
      .order('renewal_date', { ascending: true, nullsFirst: false })
    setSubscriptions(data || [])
  }

  const openEditSub = (item) => {
    setEditingSub(item)
    setEditSubForm({
      item_name: item.item_name || '',
      part_number_sku: item.part_number_sku || '',
      quantity: item.quantity != null ? String(item.quantity) : '1',
      customer_price_unit: item.customer_price_unit != null ? String(item.customer_price_unit) : '',
      customer_price_total: item.customer_price_total != null ? String(item.customer_price_total) : '',
      billing_frequency: item.billing_frequency || 'Annual',
      renewal_date: item.renewal_date || '',
      next_invoice_date: item.next_invoice_date || '',
      auto_invoice: item.auto_invoice || false,
    })
  }

  const saveEditSub = async () => {
    setSavingSub(true)
    const qty = parseFloat(editSubForm.quantity) || 1
    const unitPrice = parseFloat(editSubForm.customer_price_unit) || 0
    const total = editSubForm.customer_price_unit !== '' ? qty * unitPrice : (editSubForm.customer_price_total !== '' ? parseFloat(editSubForm.customer_price_total) : null)
    const updates = {
      item_name: editSubForm.item_name,
      part_number_sku: editSubForm.part_number_sku || null,
      quantity: qty,
      customer_price_unit: unitPrice || null,
      customer_price_total: total,
      billing_frequency: editSubForm.billing_frequency,
      renewal_date: editSubForm.renewal_date || null,
      next_invoice_date: editSubForm.next_invoice_date || null,
      auto_invoice: editSubForm.auto_invoice,
    }
    await supabase.from('bom_line_items').update(updates).eq('id', editingSub.id)
    setSubscriptions(prev => prev.map(s => s.id === editingSub.id ? { ...s, ...updates } : s))
    setSavingSub(false)
    setEditingSub(null)
  }

  const createInvoiceForProposal = async (proposalId, proposalName, companyName) => {
    const lines = subscriptions.filter(s => s.proposal_id === proposalId && parseFloat(s.customer_price_total) > 0)
    if (!lines.length) { alert('No recurring items with an amount found for this proposal.'); return }
    const subtotal = lines.reduce((sum, l) => sum + parseFloat(l.customer_price_total || 0), 0)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const orgId = prof?.org_id
    if (!orgId) return
    const { data: invoiceNumber } = await supabase.rpc('get_next_invoice_number', { org_id_input: orgId })
    const today = new Date().toISOString().split('T')[0]
    const dueDate = new Date(today)
    dueDate.setDate(dueDate.getDate() + 30)
    const dueDateStr = dueDate.toISOString().split('T')[0]
    const freq = lines[0].billing_frequency || 'Recurring'
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      org_id: orgId,
      proposal_id: proposalId,
      client_id: id,
      invoice_number: invoiceNumber,
      status: 'Draft',
      issued_date: today,
      due_date: dueDateStr,
      subtotal,
      tax_percent: 0,
      tax_amount: 0,
      total: subtotal,
      amount_paid: 0,
      balance_due: subtotal,
      description: `${freq} subscription — ${proposalName || companyName || ''}`.trim(),
      notes: `Invoice for ${companyName || 'client'}.`,
    }).select().single()
    if (invErr || !inv) { alert('Error creating invoice: ' + invErr?.message); return }
    await supabase.from('invoice_line_items').insert(
      lines.map(l => {
        const qty = parseFloat(l.quantity) || 1
        const unitPrice = parseFloat(l.customer_price_unit) || parseFloat(l.customer_price_total) || 0
        const total = parseFloat(l.customer_price_total) || 0
        const label = l.part_number_sku ? `[${l.part_number_sku}] ${l.item_name}` : l.item_name
        return { invoice_id: inv.id, description: `${label} (${l.billing_frequency || freq})`, quantity: qty, unit_price: unitPrice, total }
      })
    )
    navigate(`/invoices/${inv.id}`)
  }

  const fetchClientMeetings = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(full_name)')
      .eq('client_id', id)
      .not('meeting_type', 'is', null)
      .order('due_date', { ascending: false })
    setClientMeetings(data || [])
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
    setLocationContactMode('select')
    setLocationSelectedContactId(null)
    setShowLocationModal(true)
  }

  const openEditLocation = (loc) => {
    setEditingLocation(loc)
    setLocationForm({
      site_name: loc.site_name || '',
      location_type: loc.location_type || '',
      store_id: loc.store_id || '',
      address: loc.address || '',
      city: loc.city || '',
      state: loc.state || '',
      zip: loc.zip || '',
      floor_suite: loc.floor_suite || '',
      access_notes: loc.access_notes || '',
      site_contact_name: loc.site_contact_name || '',
      site_contact_email: loc.site_contact_email || '',
      site_contact_phone: loc.site_contact_phone || '',
      notes: loc.notes || ''
    })
    const linked = contacts.find(c => c.location_id === loc.id)
    if (linked) {
      setLocationContactMode('select')
      setLocationSelectedContactId(linked.id)
    } else if (loc.site_contact_name) {
      setLocationContactMode('manual')
      setLocationSelectedContactId(null)
    } else {
      setLocationContactMode('select')
      setLocationSelectedContactId(null)
    }
    setShowLocationModal(true)
  }

  const saveLocation = async () => {
    if (!locationForm.site_name.trim()) return
    setSavingLocation(true)
    let locId
    if (editingLocation) {
      await supabase.from('client_locations').update(locationForm).eq('id', editingLocation.id)
      locId = editingLocation.id
    } else {
      const { data: newLoc } = await supabase.from('client_locations')
        .insert({ ...locationForm, client_id: id, org_id: profile.org_id })
        .select('id').single()
      locId = newLoc?.id
    }
    if (locId) {
      if (locationContactMode === 'select' && locationSelectedContactId) {
        await supabase.from('client_contacts').update({ location_id: locId }).eq('id', locationSelectedContactId)
        await fetchContacts()
      } else if (locationContactMode === 'manual' && locationForm.site_contact_name.trim()) {
        await supabase.from('client_contacts').insert({
          client_id: id, org_id: profile.org_id, location_id: locId,
          full_name: locationForm.site_contact_name,
          email: locationForm.site_contact_email || null,
          phone: locationForm.site_contact_phone || null,
          is_primary: false, notes: '',
        })
        await fetchContacts()
      }
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

  const openAddContact = () => {
    setPanelForm(emptyContact)
    setContactPanel('new')
  }

  const openEditContact = (contact) => {
    setPanelForm({
      full_name: contact.full_name || '',
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      is_primary: contact.is_primary || false,
      notes: contact.notes || '',
      location_id: contact.location_id || null,
    })
    setContactPanel(contact)
  }

  const saveContact = async () => {
    if (!panelForm.full_name.trim()) return
    setSavingContact(true)
    const isNew = contactPanel === 'new'
    let savedContactId = isNew ? null : contactPanel.id
    if (!isNew) {
      await supabase.from('client_contacts').update(panelForm).eq('id', contactPanel.id)
    } else {
      const { data: newContact } = await supabase.from('client_contacts')
        .insert({ ...panelForm, client_id: id, org_id: profile.org_id })
        .select('id').single()
      savedContactId = newContact?.id
    }
    await fetchContacts()
    setContactPanel(null)
    setSavingContact(false)
    if (savedContactId) {
      const { data: { session } } = await supabase.auth.getSession()
      fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/zoho-push-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ contactId: savedContactId }),
      }).catch(() => {})
    }
  }

  const deleteContact = async (contactId) => {
    await supabase.from('client_contacts').delete().eq('id', contactId)
    await fetchContacts()
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

  const archiveClient = async () => {
    if (!window.confirm('Archive this client? They will be hidden from the client list but all their proposals and invoices will remain.')) return
    await supabase.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', id)
    navigate('/clients')
  }

  const deleteClient = async () => {
    if (!window.confirm('Permanently delete this client? This cannot be undone.')) return
    try {
      await supabase.from('client_locations').delete().eq('client_id', id)
      await supabase.from('client_contacts').delete().eq('client_id', id)
      await supabase.from('client_emails').delete().eq('client_id', id)
      await supabase.from('activities').update({ client_id: null }).eq('client_id', id)
      await supabase.from('tasks').update({ client_id: null }).eq('client_id', id)
      await supabase.from('proposals').update({ client_id: null }).eq('client_id', id)
      await supabase.from('jobs').update({ client_id: null }).eq('client_id', id)
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) { alert('Delete failed: ' + error.message); return }
      navigate('/clients')
    } catch (e) {
      alert('Delete error: ' + (e?.message || String(e)))
    }
  }

  const saveClient = async () => {
    setSavingClient(true)
    await supabase.from('clients').update({
      company: editForm.company, client_name: editForm.client_name, email: editForm.email, phone: editForm.phone,
      industry: editForm.industry, address: editForm.address, city: editForm.city, state: editForm.state, zip: editForm.zip, notes: editForm.notes, store_id: editForm.store_id || null, net_terms: editForm.net_terms || 'NET 30', payment_method: editForm.payment_method || 'Default',
    }).eq('id', id)
    await fetchClient()
    setEditingClient(false)
    setSavingClient(false)
    // Push to Zoho and QBO if connected (fire-and-forget)
    const { data: { session } } = await supabase.auth.getSession()
    const pushHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
    const pushBody = JSON.stringify({ clientId: id })
    fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/zoho-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
    fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/qbo-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
    fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/stripe-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
    fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/square-push-client', { method: 'POST', headers: pushHeaders, body: pushBody }).catch(() => {})
  }

const deleteMeeting = async (meetingId) => {
    if (!window.confirm('Delete this meeting and notify the client?')) return
    
    // Fetch the full task before deleting
    const { data: task } = await supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(full_name)')
      .eq('id', meetingId)
      .single()

    // Delete calendar event for assigned user
    if (task?.google_event_id || task?.microsoft_event_id) {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/delete-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tech_id: task.assigned_to,
          google_event_id: task.google_event_id || null,
          microsoft_event_id: task.microsoft_event_id || null,
        }),
      }).catch(e => console.error('Calendar delete error:', e))
    }

    // Send cancellation email with .ics to client
    if (task?.customer_notified && client?.email) {
      const { data: { session } } = await supabase.auth.getSession()
      const meetingDate = task.due_date ? new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      }) : ''
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a2d45;">Meeting Cancelled</h2>
          <p>Hi ${client?.client_name || client?.company},</p>
          <p>Your <strong>${task.meeting_type}</strong> scheduled for ${meetingDate} has been cancelled.</p>
          <p>Please remove it from your calendar. If you have any questions, feel free to reach out.</p>
          <p style="color: #888; font-size: 12px; margin-top: 32px;">Sent via ForgePt.</p>
        </div>
      `
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          type: 'meeting_cancellation',
          toEmail: client.email,
          toName: client?.client_name || client?.company,
          fromName: profile?.full_name || '',
          fromEmail: profile?.email || '',
          subject: `Meeting cancelled — ${task.title}`,
          body: html,
          meetingDate: task.due_date,
          meetingTime: task.start_time || '09:00',
          meetingDuration: task.duration_minutes || 60,
          meetingTitle: `${task.meeting_type}: ${task.title}`,
          meetingUid: `forgept-${meetingId}@goforgept.com`,
        }),
      }).catch(e => console.error('Cancellation email error:', e))
    }

    await supabase.from('tasks').delete().eq('id', meetingId)
    fetchClientMeetings()
  }

  const openEditMeeting = (meeting) => {
    setEditingMeeting(meeting.id)
    setMeetingForm({
      title: meeting.title || '',
      due_date: meeting.due_date || '',
      start_time: meeting.start_time || '',
      duration_minutes: meeting.duration_minutes || 60,
      meeting_type: meeting.meeting_type || 'Sales Call',
      is_virtual: meeting.is_virtual || false,
      assigned_to: meeting.assigned_to || profile.id,
      meeting_notes: meeting.meeting_notes || '',
      customer_notified: meeting.customer_notified || false,
    })
    setShowMeetingModal(true)
  }

  const saveMeeting = async () => {
    if (!meetingForm.title || !meetingForm.due_date || !meetingForm.meeting_type) return
    setSavingMeeting(true)
    try {
      if (editingMeeting) {
        await supabase.from('tasks').update({
          title: meetingForm.title,
          due_date: meetingForm.due_date,
          start_time: meetingForm.start_time || null,
          assigned_to: meetingForm.assigned_to || profile.id,
          meeting_type: meetingForm.meeting_type,
          duration_minutes: meetingForm.duration_minutes,
          is_virtual: meetingForm.is_virtual,
          meeting_notes: meetingForm.meeting_notes || null,
          customer_notified: meetingForm.customer_notified,
        }).eq('id', editingMeeting)
        setEditingMeeting(null)
        setMeetingForm({ title: '', due_date: '', start_time: '', duration_minutes: 60, meeting_type: 'Sales Call', is_virtual: false, assigned_to: profile.id, meeting_notes: '', customer_notified: false })
        setShowMeetingModal(false)
        fetchClientMeetings()
        setSavingMeeting(false)
        return
      }
      const { data: newTask } = await supabase.from('tasks').insert({
        org_id: profile.org_id,
        title: meetingForm.title,
        due_date: meetingForm.due_date,
        start_time: meetingForm.start_time || null,
        priority: 'normal',
        assigned_to: meetingForm.assigned_to || profile.id,
        created_by: profile.id,
        client_id: id,
        completed: false,
        meeting_type: meetingForm.meeting_type,
        duration_minutes: meetingForm.duration_minutes,
        is_virtual: meetingForm.is_virtual,
        customer_notified: meetingForm.customer_notified,
        meeting_notes: meetingForm.meeting_notes || null,
      }).select('*, clients(company, client_name, email)').single()

      if (newTask) {
        // Push to calendar
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            tech_id: meetingForm.assigned_to || profile.id,
            title: `📅 ${meetingForm.meeting_type}: ${meetingForm.title}`,
            description: `Meeting with ${client?.company || ''}\n${meetingForm.meeting_notes || ''}`,
            date: meetingForm.due_date,
            start_time: meetingForm.start_time || null,
            duration_hours: meetingForm.duration_minutes / 60,
            record_type: 'task',
            record_id: newTask.id,
            existing_google_event_id: null,
            existing_microsoft_event_id: null,
            is_virtual: meetingForm.is_virtual,
          }),
        })
        const calData = await res.json()
        if (calData.meeting_link) {
          await supabase.from('tasks').update({ meeting_link: calData.meeting_link }).eq('id', newTask.id)
          newTask.meeting_link = calData.meeting_link
        }

        // Send Brevo confirmation if requested
        if (meetingForm.customer_notified && client?.email) {
          const meetingDate = new Date(meetingForm.due_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
          })
          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a2d45;">Meeting Scheduled</h2>
              <p>Hi ${client?.client_name || client?.company},</p>
              <p>A <strong>${meetingForm.meeting_type}</strong> has been scheduled with you.</p>
              <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
                <tr><td style="padding: 8px; color: #666;">Meeting</td><td style="padding: 8px; font-weight: bold;">${meetingForm.title}</td></tr>
                <tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">Date</td><td style="padding: 8px;">${meetingDate}</td></tr>
                ${meetingForm.start_time ? `<tr><td style="padding: 8px; color: #666;">Time</td><td style="padding: 8px;">${meetingForm.start_time}</td></tr>` : ''}
                ${meetingForm.duration_minutes ? `<tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">Duration</td><td style="padding: 8px;">${meetingForm.duration_minutes} minutes</td></tr>` : ''}
                ${newTask.meeting_link ? `<tr><td style="padding: 8px; color: #666;">Link</td><td style="padding: 8px;"><a href="${newTask.meeting_link}" style="color: #C8622A;">${newTask.meeting_link}</a></td></tr>` : ''}
              </table>
              ${meetingForm.meeting_notes ? `<p style="color: #444;">${meetingForm.meeting_notes}</p>` : ''}
              <p style="color: #888; font-size: 12px; margin-top: 32px;">You will receive a reminder the day before. Sent via ForgePt.</p>
            </div>
          `
          await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({
              type: 'meeting_confirmation',
              toEmail: client.email,
              toName: client?.client_name || client?.company,
              fromName: profile?.full_name || '',
              fromEmail: profile?.email || '',
              subject: `${meetingForm.meeting_type} scheduled — ${meetingForm.title}`,
              body: html,
              orgId: profile?.org_id,
              sentBy: profile?.id,
              meetingTitle: `${meetingForm.meeting_type}: ${meetingForm.title}`,
              meetingDate: meetingForm.due_date,
              meetingTime: meetingForm.start_time || '09:00',
              meetingDuration: meetingForm.duration_minutes || 60,
              meetingLink: newTask.meeting_link || '',
              meetingNotes: meetingForm.meeting_notes || '',
              organizerName: profile?.full_name || '',
              organizerEmail: profile?.email || '',
              orgTimezone: orgTimezone,
            }),
          })
        }
      }

      setEditingMeeting(null)
      setMeetingForm({ title: '', due_date: '', start_time: '', duration_minutes: 60, meeting_type: 'Sales Call', is_virtual: false, assigned_to: profile.id, meeting_notes: '', customer_notified: false })
      setShowMeetingModal(false)
      fetchClientMeetings()
    } catch (err) {
      alert('Error saving meeting: ' + err.message)
    }
    setSavingMeeting(false)
  }

  const toMonthly = (total, freq) => {
    const t = parseFloat(total) || 0
    if (freq === 'Annual') return t / 12
    if (freq === 'Quarterly') return t / 3
    return t
  }

  const handleNewProposal = () => navigate(`/new?clientId=${id}`)
  const totalPipeline = proposals.filter(p => p.status !== 'Lost').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const wonPipeline = proposals.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.proposal_value || 0), 0)
  const winRate = proposals.length > 0 ? Math.round((proposals.filter(p => p.status === 'Won').length / proposals.length) * 100) : 0
  const avgDeal = proposals.length > 0 ? proposals.reduce((sum, p) => sum + (p.proposal_value || 0), 0) / proposals.length : 0
  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'
  const fullAddress = [client?.address, client?.city, client?.state, client?.zip].filter(Boolean).join(', ')
  const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  if (loading) return <div className="min-h-screen bg-fp-inset flex items-center justify-center"><p className="text-fp-text">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-fp-card rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[#C8622A] text-xl font-bold">{(client?.company || client?.client_name || '?')[0].toUpperCase()}</span>
              </div>
              <div>
                <button onClick={() => navigate('/clients')} className="text-fp-muted hover:text-fp-text text-xs transition-colors mb-1">← Clients</button>
                <h2 className="text-fp-text text-2xl font-bold">{client?.company}</h2>
                <p className="text-fp-muted mt-0.5">{client?.client_name}</p>
                {fullAddress && <p className="text-fp-muted text-sm mt-0.5">{fullAddress}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {featureAiEmail && (
                <button onClick={() => {
                  if (!client?.email) { alert('Add an email address to this client first.'); return }
                  setShowEmailModal(true); setDraftedEmail(''); setEmailForm({ subject: '', context: '' })
                }}
                  className="bg-purple-600 text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✍️ Draft Email</button>
              )}
              <button onClick={archiveClient} className="text-fp-muted text-sm hover:text-yellow-400 transition-colors px-2">Archive</button>
              <button onClick={deleteClient} className="text-fp-muted text-sm hover:text-red-400 transition-colors px-2">Delete</button>
              <button onClick={() => setEditingClient(true)} className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm hover:bg-fp-hover transition-colors">Edit Client</button>
              <button onClick={handleNewProposal} className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ New Proposal</button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4 mt-6">
            <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs mb-1">Proposals</p><p className="text-fp-text text-xl font-bold">{proposals.length}</p></div>
            <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs mb-1">Pipeline</p><p className="text-fp-text text-xl font-bold">${fmt(totalPipeline)}</p></div>
            <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs mb-1">Won Revenue</p><p className="text-green-400 text-xl font-bold">${fmt(wonPipeline)}</p></div>
            <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs mb-1">Win Rate</p><p className="text-fp-text text-xl font-bold">{winRate}%</p></div>
            <div className="bg-fp-inset rounded-lg p-3"><p className="text-fp-muted text-xs mb-1">Locations</p><p className="text-fp-text text-xl font-bold">{locations.length}</p></div>
          </div>
        </div>

        {/* Contact strip */}
        <div className="bg-fp-card rounded-xl px-6 py-4 flex gap-8 flex-wrap">
          {client?.email && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Email</span>{/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email) ? <a href={`mailto:${client.email}`} className="text-[#C8622A] text-sm hover:underline">{client.email}</a> : <span className="text-[#C8622A] text-sm">{client.email}</span>}</div>}
          {client?.phone && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Phone</span>{/^[+0-9][0-9()\-.\s#,]{0,30}$/.test(client.phone) ? <a href={`tel:${client.phone.replace(/[^0-9+]/g, '')}`} className="text-fp-text text-sm hover:text-[#C8622A] transition-colors">{client.phone}</a> : <span className="text-fp-text text-sm">{client.phone}</span>}</div>}
          {client?.industry && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Industry</span><span className="text-fp-text text-sm">{client.industry}</span></div>}
          {fullAddress && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Address</span><a href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noreferrer" className="text-fp-text text-sm hover:text-[#C8622A] transition-colors">{fullAddress}</a></div>}
          {client?.store_id && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Store ID</span><span className="text-fp-text text-sm font-mono">{client.store_id}</span></div>}
          {client?.net_terms && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Terms</span><span className="text-fp-text text-sm font-semibold">{client.net_terms}</span></div>}
          {client?.payment_method && client.payment_method !== 'Default' && <div className="flex items-center gap-2"><span className="text-fp-muted text-xs uppercase tracking-wide">Payment</span><span className={`text-sm font-semibold ${client.payment_method === 'Credit Card' ? 'text-yellow-400' : 'text-fp-text'}`}>{client.payment_method}</span></div>}
        </div>

        {/* Tabs */}
        {(() => {
          const primaryTabs = [
            { key: 'proposals', label: 'Proposals',  count: proposals.length },
            { key: 'contacts',  label: 'Contacts',   count: contacts.length },
            { key: 'locations', label: 'Locations',  count: locations.length },
            { key: 'activity',  label: 'Activity',   count: null },
          ]
          const overflowTabs = [
            { key: 'subscriptions', label: 'Subscriptions',  count: subscriptions.length },
            { key: 'tickets',       label: 'Service Tickets', count: clientTickets.length },
            { key: 'meetings',      label: 'Meetings',        count: clientMeetings.length },
            { key: 'emails',        label: 'Emails',          count: clientEmails.length },
            { key: 'tasks',         label: 'Tasks',           count: null },
            { key: 'notes',         label: 'Notes',           count: null },
          ]
          const overflowActive = overflowTabs.find(t => t.key === activeTab)

          const allTabs = [...primaryTabs, ...overflowTabs]
          const activeTabData = allTabs.find(t => t.key === activeTab)

          return (
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {primaryTabs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTab === t.key ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}

              {/* More overflow dropdown */}
              <div ref={moreRef} className="relative">
                <button
                  onClick={() => setMoreOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    overflowActive ? 'bg-fp-brand text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text'
                  }`}
                >
                  {overflowActive ? overflowActive.label : 'More'}
                  <span className="text-[10px] opacity-60">{moreOpen ? '▴' : '▾'}</span>
                </button>
                {moreOpen && (
                  <div className="absolute top-full left-0 mt-1.5 bg-fp-card border border-fp-border rounded-xl shadow-xl z-30 min-w-[200px] py-1 overflow-hidden">
                    {overflowTabs.map(t => (
                      <button key={t.key}
                        onClick={() => { setActiveTab(t.key); setMoreOpen(false) }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          activeTab === t.key ? 'text-fp-brand bg-fp-inset' : 'text-fp-muted hover:text-fp-text hover:bg-fp-inset'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {activeTabData?.count !== null && (
              <span className="text-fp-muted text-sm tabular-nums">
                Count: <span className="text-fp-text font-semibold">{activeTabData.count}</span>
              </span>
            )}
            </div>
          )
        })()}

        {/* Proposals tab */}
        {activeTab === 'proposals' && (
          <div className="bg-fp-card rounded-xl p-6">
            {proposals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-fp-muted mb-4">No proposals yet for this client.</p>
                <button onClick={handleNewProposal} className="bg-fp-brand text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Create First Proposal</button>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.map(proposal => (
                  <div key={proposal.id} onClick={() => navigate(`/proposal/${proposal.id}`)}
                    className="flex justify-between items-center bg-fp-inset rounded-lg p-4 cursor-pointer hover:bg-fp-inset transition-colors group">
                    <div>
                      <p className="text-fp-text font-semibold group-hover:text-[#C8622A] transition-colors">{proposal.proposal_name}</p>
                      <p className="text-fp-muted text-sm mt-0.5">{proposal.rep_name} · {proposal.industry}{proposal.close_date && ` · Close: ${proposal.close_date}`}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {proposal.total_gross_margin_percent != null && (
                        <div className="text-right"><p className="text-fp-muted text-xs">Margin</p><p className="text-[#C8622A] text-sm font-semibold">{proposal.total_gross_margin_percent.toFixed(1)}%</p></div>
                      )}
                      <div className="text-right"><p className="text-fp-muted text-xs">Value</p><p className="text-fp-text text-sm font-bold">${(proposal.proposal_value || 0).toLocaleString()}</p></div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${proposal.status === 'Won' ? 'bg-green-500/20 text-green-400' : proposal.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : proposal.status === 'Lost' ? 'bg-red-500/20 text-red-400' : 'bg-fp-muted/20 text-fp-muted'}`}>{proposal.status}</span>
                      <span className="text-fp-muted group-hover:text-fp-text transition-colors">→</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subscriptions tab */}
        {activeTab === 'subscriptions' && (() => {
          const totalMrr = subscriptions.reduce((sum, s) => sum + toMonthly(s.customer_price_total, s.billing_frequency), 0)
          const totalArr = totalMrr * 12
          const grouped = subscriptions.reduce((acc, s) => {
            const key = s.proposal_id
            if (!acc[key]) acc[key] = { proposalId: key, proposalName: s.proposals?.proposal_name, company: s.proposals?.company, items: [] }
            acc[key].items.push(s)
            return acc
          }, {})
          const groups = Object.values(grouped)
          return (
            <div className="space-y-4">
              {subscriptions.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-fp-card rounded-xl p-4">
                    <p className="text-fp-muted text-xs mb-1">Monthly Recurring</p>
                    <p className="text-fp-text text-xl font-bold">${totalMrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-fp-card rounded-xl p-4">
                    <p className="text-fp-muted text-xs mb-1">Annual Recurring</p>
                    <p className="text-fp-text text-xl font-bold">${totalArr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-fp-card rounded-xl p-4">
                    <p className="text-fp-muted text-xs mb-1">Active Sites</p>
                    <p className="text-fp-text text-xl font-bold">{groups.length}</p>
                  </div>
                </div>
              )}
              {groups.length === 0 ? (
                <div className="bg-fp-card rounded-xl p-12 text-center">
                  <p className="text-fp-text font-semibold mb-2">No active subscriptions</p>
                  <p className="text-fp-muted text-sm">Mark BOM line items as recurring on a Won proposal to see them here.</p>
                </div>
              ) : groups.map(group => {
                const groupTotal = group.items.reduce((sum, i) => sum + parseFloat(i.customer_price_total || 0), 0)
                const groupMrr = group.items.reduce((sum, i) => sum + toMonthly(i.customer_price_total, i.billing_frequency), 0)
                const soonest = group.items.reduce((min, i) => {
                  if (!i.renewal_date) return min
                  return (!min || i.renewal_date < min) ? i.renewal_date : min
                }, null)
                return (
                  <div key={group.proposalId} className="bg-fp-card rounded-xl overflow-hidden">
                    <div className="flex justify-between items-center px-5 py-4 border-b border-fp-border">
                      <div>
                        <p className="text-fp-text font-bold">{group.proposalName || group.company || 'Unnamed Proposal'}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-fp-muted text-xs">{group.items.length} line{group.items.length !== 1 ? 's' : ''}</p>
                          {soonest && <p className="text-fp-muted text-xs">Next renewal: {new Date(soonest + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                          <p className="text-fp-muted text-xs">${groupMrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => navigate(`/proposal/${group.proposalId}`)}
                          className="text-fp-muted hover:text-fp-text text-xs transition-colors">View Proposal →</button>
                        <button onClick={() => createInvoiceForProposal(group.proposalId, group.proposalName, group.company)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                          + Invoice
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-fp-border">
                      {group.items.map(item => {
                        const qty = parseFloat(item.quantity) || 1
                        const unitPrice = parseFloat(item.customer_price_unit) || 0
                        const total = parseFloat(item.customer_price_total) || 0
                        const daysUntil = item.renewal_date ? Math.ceil((new Date(item.renewal_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
                        return (
                          <div key={item.id} className="flex items-center justify-between px-5 py-3 gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-fp-text text-sm font-medium">{item.item_name}</p>
                                {item.part_number_sku && <span className="text-fp-muted text-xs font-mono bg-fp-inset px-1.5 py-0.5 rounded">{item.part_number_sku}</span>}
                                {item.auto_invoice
                                  ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">Auto-Invoice</span>
                                  : <span className="text-xs px-1.5 py-0.5 rounded bg-fp-inset text-fp-muted">Manual</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-fp-muted flex-wrap">
                                <span>{item.billing_frequency}</span>
                                {unitPrice > 0 && qty > 1 && <span>{qty} × ${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>}
                                {item.renewal_date && (
                                  <span className={daysUntil !== null && daysUntil <= 30 ? 'text-yellow-400' : ''}>
                                    Renews {new Date(item.renewal_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {daysUntil !== null && daysUntil <= 30 && daysUntil >= 0 ? ` · ${daysUntil}d` : ''}
                                  </span>
                                )}
                                {item.next_invoice_date && <span>Next invoice: {new Date(item.next_invoice_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <p className="text-fp-text text-sm font-bold">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              <button onClick={() => openEditSub(item)}
                                className="text-fp-muted hover:text-fp-text text-xs transition-colors">Edit</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="px-5 py-3 bg-fp-inset flex justify-between items-center">
                      <p className="text-fp-muted text-xs">Subtotal</p>
                      <p className="text-fp-text text-sm font-bold">${groupTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Contacts tab */}
        {activeTab === 'contacts' && (
          <div className="bg-fp-card rounded-xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-fp-border">
              <h3 className="text-fp-text font-bold text-lg">Contacts</h3>
              <button onClick={openAddContact} className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Add Contact</button>
            </div>
            {contacts.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-fp-border m-6 rounded-xl">
                <p className="text-fp-muted mb-2">No contacts yet.</p>
                <p className="text-fp-muted text-sm">Add owners, project managers, billing contacts, and more.</p>
              </div>
            ) : (
              <>
                <div className="hidden md:grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-4 px-6 py-2 border-b border-fp-border">
                  <div className="w-9" />
                  <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Name</p>
                  <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Email</p>
                  <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Phone</p>
                  <div className="w-4" />
                </div>
                <div className="divide-y divide-fp-border">
                  {contacts.map(contact => (
                    <div key={contact.id} onClick={() => openEditContact(contact)}
                      className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_1fr_1fr_auto] gap-4 items-center px-6 py-4 cursor-pointer hover:bg-fp-hover transition-colors group">
                      <div className="w-9 h-9 rounded-full bg-[#C8622A]/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#C8622A] text-sm font-bold">{(contact.full_name || '?')[0].toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-fp-text font-semibold text-sm group-hover:text-[#C8622A] transition-colors">{contact.full_name}</p>
                          {contact.is_primary && <span className="text-xs px-1.5 py-0.5 rounded bg-[#C8622A]/15 text-[#C8622A] font-semibold">Primary</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {contact.title && <p className="text-fp-muted text-xs">{contact.title}</p>}
                          {contact.location_id && (() => { const loc = locations.find(l => l.id === contact.location_id); return loc ? <span className="text-fp-muted text-xs">· {loc.site_name}</span> : null })()}
                        </div>
                        {/* Mobile-only email/phone */}
                        <div className="md:hidden mt-1 space-y-0.5">
                          {contact.email && <p className="text-fp-muted text-xs truncate">{contact.email}</p>}
                          {contact.phone && <p className="text-fp-muted text-xs">{contact.phone}</p>}
                        </div>
                      </div>
                      <p className="hidden md:block text-fp-muted text-sm truncate">{contact.email}</p>
                      <p className="hidden md:block text-fp-muted text-sm">{contact.phone}</p>
                      <span className="hidden md:block text-fp-muted group-hover:text-[#C8622A] transition-colors text-sm">→</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Locations tab */}
        {activeTab === 'locations' && (
          <div className="bg-fp-card rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-fp-text font-bold text-lg">Locations</h3>
              <button onClick={openAddLocation} className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Add Location</button>
            </div>
            {locations.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-fp-border rounded-xl">
                <p className="text-fp-muted mb-3">No locations yet.</p>
                <p className="text-fp-muted text-sm">Add job site locations, offices, or facilities for this client.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {locations.map(loc => {
                  const addr = [loc.address, loc.floor_suite, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')
                  const addrMapQuery = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')
                  return (
                    <div key={loc.id} className="bg-fp-inset rounded-xl p-4 border border-fp-border">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-fp-text font-semibold">{loc.site_name}</p>
                            {loc.store_id && <span className="text-xs px-1.5 py-0.5 rounded bg-fp-inset text-[#C8622A] font-mono">{loc.store_id}</span>}
                            {loc.location_type && <span className="text-xs px-1.5 py-0.5 rounded bg-fp-inset text-fp-muted">{loc.location_type}</span>}
                          </div>
                          {addr && <a href={`https://maps.google.com/?q=${encodeURIComponent(addrMapQuery)}`} target="_blank" rel="noreferrer" className="text-fp-muted text-xs hover:text-[#C8622A] transition-colors mt-0.5 block">{addr}</a>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0 ml-2">
                          <button onClick={() => openEditLocation(loc)} className="text-fp-muted hover:text-fp-text text-xs transition-colors">Edit</button>
                          <button onClick={() => deleteLocation(loc.id)} className="text-red-400 hover:text-red-300 text-xs transition-colors">Delete</button>
                        </div>
                      </div>
                      {loc.access_notes && (
                        <div className="bg-fp-card rounded-lg px-3 py-2 mb-2">
                          <p className="text-fp-muted text-xs font-semibold mb-0.5">Access</p>
                          <p className="text-fp-text text-xs">{loc.access_notes}</p>
                        </div>
                      )}
                      {(() => {
                        const siteContact = contacts.find(c => c.location_id === loc.id)
                        if (siteContact) return (
                          <div className="border-t border-fp-border pt-2 mt-2 space-y-1">
                            <p className="text-fp-muted text-xs font-semibold">Site Contact</p>
                            <p className="text-fp-text text-xs font-medium">{siteContact.full_name}{siteContact.title ? ` · ${siteContact.title}` : ''}</p>
                            {siteContact.email && <a href={`mailto:${siteContact.email.replace(/[^a-zA-Z0-9.@_%+\-]/g, '')}`} className="text-[#C8622A] text-xs hover:underline block">{siteContact.email}</a>}
                            {siteContact.phone && <a href={`tel:${siteContact.phone.replace(/[^0-9+\-().#, ]/g, '')}`} className="text-fp-muted text-xs hover:text-fp-text transition-colors block">{siteContact.phone}</a>}
                          </div>
                        )
                        if (loc.site_contact_name || loc.site_contact_email || loc.site_contact_phone) return (
                          <div className="border-t border-fp-border pt-2 mt-2 space-y-1">
                            <p className="text-fp-muted text-xs font-semibold">Site Contact</p>
                            {loc.site_contact_name && <p className="text-fp-text text-xs font-medium">{loc.site_contact_name}</p>}
                            {loc.site_contact_email && <a href={`mailto:${loc.site_contact_email.replace(/[^a-zA-Z0-9.@_%+\-]/g, '')}`} className="text-[#C8622A] text-xs hover:underline block">{loc.site_contact_email}</a>}
                            {loc.site_contact_phone && <a href={`tel:${loc.site_contact_phone.replace(/[^0-9+\-().#, ]/g, '')}`} className="text-fp-muted text-xs hover:text-fp-text transition-colors block">{loc.site_contact_phone}</a>}
                          </div>
                        )
                        return null
                      })()}
                      {loc.notes && <p className="text-fp-muted text-xs mt-2 italic">{loc.notes}</p>}
                      <div className="mt-3 pt-2 border-t border-fp-border">
                        <button onClick={() => navigate(`/new?clientId=${id}&locationId=${loc.id}`)}
                          className="text-[#C8622A] text-xs hover:text-fp-text transition-colors">+ Proposal for this location →</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="bg-fp-card rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-fp-text font-bold text-lg">Service Tickets</h3>
              <button onClick={() => navigate('/service-tickets')} className="text-fp-muted hover:text-fp-text text-sm transition-colors">+ New Ticket</button>
            </div>
            {clientTickets.length === 0 ? (
              <p className="text-fp-muted text-sm">No service tickets for this client yet.</p>
            ) : (
              <div className="space-y-3">
                {clientTickets.map(ticket => (
                  <div key={ticket.id} onClick={() => navigate(`/service-tickets/${ticket.id}`)}
                    className="bg-fp-inset rounded-lg p-4 border border-fp-border cursor-pointer hover:border-fp-brand/40 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {ticket.ticket_number && <span className="text-fp-muted text-xs font-mono bg-fp-card px-2 py-0.5 rounded">{ticket.ticket_number}</span>}
                          <p className="text-fp-text font-semibold text-sm">{ticket.title}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-fp-muted flex-wrap">
                          <span className={`px-2 py-0.5 rounded font-semibold ${ticket.priority === 'Urgent' ? 'bg-red-500/20 text-red-400' : ticket.priority === 'High' ? 'bg-orange-500/20 text-orange-400' : ticket.priority === 'Normal' ? 'bg-blue-500/20 text-blue-400' : 'bg-fp-inset text-fp-muted'}`}>{ticket.priority}</span>
                          <span className={`px-2 py-0.5 rounded font-semibold ${ticket.status === 'Open' ? 'bg-blue-500/20 text-blue-400' : ticket.status === 'In Progress' ? 'bg-yellow-500/20 text-yellow-400' : ticket.status === 'Resolved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{ticket.status}</span>
                          {ticket.profiles?.full_name && <span>🔧 {ticket.profiles.full_name}</span>}
                          {ticket.scheduled_date && <span>📅 {new Date(ticket.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        </div>
                      </div>
                      <span className="text-fp-muted text-xs ml-4">{new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
{activeTab === 'meetings' && (
          <div className="bg-fp-card rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-fp-text font-bold text-lg">Meetings</h3>
              <button onClick={() => { setEditingMeeting(null); setMeetingForm({ title: '', due_date: '', start_time: '', duration_minutes: 60, meeting_type: 'Sales Call', is_virtual: false, assigned_to: profile.id, meeting_notes: '', customer_notified: false }); setShowMeetingModal(true) }}
                className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                + Schedule Meeting
              </button>
            </div>
            {clientMeetings.length === 0 ? (
              <p className="text-fp-muted text-sm">No meetings scheduled yet.</p>
            ) : (
              <div className="space-y-3">
                {clientMeetings.map(meeting => {
                  const isPast = meeting.due_date < new Date().toISOString().split('T')[0]
                  return (
                    <div key={meeting.id} className={`bg-fp-inset rounded-xl p-4 border ${isPast ? 'border-fp-border/30 opacity-70' : 'border-fp-border'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">📅 {meeting.meeting_type}</span>
                            {meeting.is_virtual && <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">🎥 Virtual</span>}
                            {isPast && <span className="text-xs px-2 py-0.5 rounded bg-fp-inset text-fp-muted">Past</span>}
                            {meeting.completed && <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-400">✓ Done</span>}
                          </div>
                          <p className="text-fp-text font-semibold text-sm">{meeting.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-fp-muted">
                            <span>📆 {meeting.due_date}{meeting.start_time ? ` at ${meeting.start_time}` : ''}</span>
                            {meeting.duration_minutes && <span>⏱ {meeting.duration_minutes} min</span>}
                            {meeting.profiles?.full_name && <span>👤 {meeting.profiles.full_name}</span>}
                          </div>
                          {meeting.meeting_notes && <p className="text-fp-muted text-xs mt-1 italic">{meeting.meeting_notes}</p>}
                          {meeting.meeting_link && (
                            <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer"
                              className="text-[#C8622A] text-xs hover:underline mt-1 block">🔗 Join Meeting</a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {meeting.customer_notified && <span className="text-xs text-green-400">✉ Notified</span>}
                          <button onClick={() => openEditMeeting(meeting)} className="text-fp-muted hover:text-fp-text text-xs transition-colors">Edit</button>
                          <button onClick={() => deleteMeeting(meeting.id)} className="text-fp-muted hover:text-red-400 text-xs transition-colors">Delete</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && <ActivityTimeline clientId={id} orgId={client?.org_id} userId={profile?.id} contacts={contacts} />}
        {activeTab === 'tasks' && <TaskList clientId={id} orgId={client?.org_id} userId={profile?.id} profiles={teamProfiles} />}

        {activeTab === 'emails' && (
          <div className="bg-fp-card rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-fp-text font-bold text-lg">Email History</h3>
              {featureAiEmail && (
                <button onClick={() => {
                  if (!client?.email) { alert('Add an email address to this client first.'); return }
                  setShowEmailModal(true); setDraftedEmail(''); setEmailForm({ subject: '', context: '' })
                }}
                  className="bg-purple-600 text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✍️ Draft Email</button>
              )}
            </div>
            {clientEmails.length === 0 ? (
              <p className="text-fp-muted text-sm">No emails sent yet.</p>
            ) : (
              <div className="space-y-3">
                {clientEmails.map(email => (
                  <div key={email.id} className="bg-fp-inset rounded-lg p-4 border border-fp-border">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-fp-text font-semibold text-sm">{email.subject}</p>
                      {email.opened_at ? <span className="text-green-400 text-xs font-semibold">✓ Opened {new Date(email.opened_at).toLocaleDateString()}</span> : <span className="text-fp-muted text-xs">Not opened yet</span>}
                    </div>
                    <p className="text-fp-muted text-xs mb-2">To: {email.to_email} · {new Date(email.sent_at).toLocaleDateString()}</p>
                    <p className="text-fp-text text-xs leading-relaxed whitespace-pre-wrap line-clamp-3">{email.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="bg-fp-card rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-fp-text font-bold text-lg">Notes</h3>
              {!editingClient && <button onClick={() => setEditingClient(true)} className="text-fp-muted hover:text-fp-text text-sm transition-colors">Edit</button>}
            </div>
            {client?.notes ? <p className="text-fp-muted text-sm leading-relaxed whitespace-pre-wrap">{client.notes}</p> : <p className="text-fp-muted text-sm italic">No notes yet.</p>}
          </div>
        )}
      </div>
{/* Schedule Meeting Modal */}
      {showMeetingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-fp-text font-bold text-lg mb-5">📅 {editingMeeting ? 'Edit Meeting' : 'Schedule Meeting'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Meeting Title <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={meetingForm.title} onChange={e => setMeetingForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Security System Proposal Review" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Meeting Type <span className="text-[#C8622A]">*</span></label>
                  <select value={meetingForm.meeting_type} onChange={e => setMeetingForm(p => ({ ...p, meeting_type: e.target.value }))} className={inputClass}>
                    {['Site Visit', 'Sales Call', 'Follow-up Call', 'Proposal Review', 'Kickoff Meeting'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Assigned To</label>
                  <select value={meetingForm.assigned_to} onChange={e => setMeetingForm(p => ({ ...p, assigned_to: e.target.value }))} className={inputClass}>
                    {teamProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                  <input type="date" value={meetingForm.due_date} onChange={e => setMeetingForm(p => ({ ...p, due_date: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Start Time</label>
                  <input type="time" value={meetingForm.start_time} onChange={e => setMeetingForm(p => ({ ...p, start_time: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Duration</label>
                  <select value={meetingForm.duration_minutes} onChange={e => setMeetingForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))} className={inputClass}>
                    {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <button type="button" onClick={() => setMeetingForm(p => ({ ...p, is_virtual: !p.is_virtual }))}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${meetingForm.is_virtual ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
                    🎥 {meetingForm.is_virtual ? 'Virtual — link auto-generated' : 'Make Virtual'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Notes (optional)</label>
                <textarea value={meetingForm.meeting_notes} onChange={e => setMeetingForm(p => ({ ...p, meeting_notes: e.target.value }))}
                  rows={2} placeholder="Agenda, location details, prep notes..."
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" />
              </div>
              {client?.email && (
                <button onClick={() => setMeetingForm(p => ({ ...p, customer_notified: !p.customer_notified }))}
                  className="flex items-center gap-2 text-sm transition-colors">
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${meetingForm.customer_notified ? 'bg-[#C8622A] border-[#C8622A]' : 'border-fp-border'}`}>
                    {meetingForm.customer_notified && <span className="text-fp-text text-xs">✓</span>}
                  </span>
                  <span className={meetingForm.customer_notified ? 'text-fp-text' : 'text-fp-muted'}>
                    Send confirmation email to {client?.client_name || client?.company} + 24hr reminder
                  </span>
                </button>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowMeetingModal(false); setEditingMeeting(null) }} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={saveMeeting} disabled={savingMeeting || !meetingForm.title || !meetingForm.due_date}
                  className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingMeeting ? 'Saving...' : editingMeeting ? 'Save Changes' : 'Schedule Meeting'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-fp-text font-bold text-lg mb-5">{editingLocation ? 'Edit Location' : 'Add Location'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Site Name <span className="text-[#C8622A]">*</span></label>
                  <input type="text" value={locationForm.site_name} onChange={e => setLocationForm(p => ({ ...p, site_name: e.target.value }))} placeholder="e.g. HQ, Warehouse, Nashville Office" className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Store ID</label>
                  <input type="text" value={locationForm.store_id || ''} onChange={e => setLocationForm(p => ({ ...p, store_id: e.target.value }))} placeholder="e.g. STR-001" className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs mb-1 block">Location Type</label>
                  <select value={locationForm.location_type} onChange={e => setLocationForm(p => ({ ...p, location_type: e.target.value }))} className={inputClass}>
                    <option value="">— Select type —</option>
                    {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Street Address</label>
                <input type="text" value={locationForm.address} onChange={e => setLocationForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2"><label className="text-fp-muted text-xs mb-1 block">City</label><input type="text" value={locationForm.city} onChange={e => setLocationForm(p => ({ ...p, city: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">State</label><input type="text" value={locationForm.state} onChange={e => setLocationForm(p => ({ ...p, state: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">ZIP</label><input type="text" value={locationForm.zip} onChange={e => setLocationForm(p => ({ ...p, zip: e.target.value }))} className={inputClass} /></div>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Floor / Suite / Unit</label>
                <input type="text" value={locationForm.floor_suite} onChange={e => setLocationForm(p => ({ ...p, floor_suite: e.target.value }))} placeholder="e.g. Suite 200, Floor 3, Unit B" className={inputClass} />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Access Notes</label>
                <input type="text" value={locationForm.access_notes} onChange={e => setLocationForm(p => ({ ...p, access_notes: e.target.value }))} placeholder="Gate code, parking, building entry..." className={inputClass} />
              </div>
              <div className="pt-2">
                <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">Site Contact</p>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => setLocationContactMode('select')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${locationContactMode === 'select' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
                    Select Existing
                  </button>
                  <button type="button" onClick={() => setLocationContactMode('manual')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${locationContactMode === 'manual' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>
                    Add New
                  </button>
                </div>
                {locationContactMode === 'select' ? (
                  <div>
                    <select value={locationSelectedContactId || ''} onChange={e => setLocationSelectedContactId(e.target.value || null)} className={inputClass}>
                      <option value="">— No site contact —</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>{c.full_name}{c.title ? ` · ${c.title}` : ''}</option>
                      ))}
                    </select>
                    {locationSelectedContactId && (() => {
                      const c = contacts.find(x => x.id === locationSelectedContactId)
                      return c ? (
                        <div className="mt-2 bg-fp-inset rounded-lg px-3 py-2 space-y-0.5">
                          {c.title && <p className="text-fp-muted text-xs">{c.title}</p>}
                          {c.email && <p className="text-fp-muted text-xs">{c.email}</p>}
                          {c.phone && <p className="text-fp-muted text-xs">{c.phone}</p>}
                        </div>
                      ) : null
                    })()}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-fp-muted text-xs mb-1 block">Contact Name</label><input type="text" value={locationForm.site_contact_name} onChange={e => setLocationForm(p => ({ ...p, site_contact_name: e.target.value }))} placeholder="Added to contacts list on save" className={inputClass} /></div>
                    <div><label className="text-fp-muted text-xs mb-1 block">Contact Email</label><input type="email" value={locationForm.site_contact_email} onChange={e => setLocationForm(p => ({ ...p, site_contact_email: e.target.value }))} className={inputClass} /></div>
                    <div><label className="text-fp-muted text-xs mb-1 block">Contact Phone</label><input type="text" value={locationForm.site_contact_phone} onChange={e => setLocationForm(p => ({ ...p, site_contact_phone: e.target.value }))} className={inputClass} /></div>
                  </div>
                )}
              </div>
              <div><label className="text-fp-muted text-xs mb-1 block">General Notes</label><textarea value={locationForm.notes} onChange={e => setLocationForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes about this location..." rows={2} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowLocationModal(false)} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={saveLocation} disabled={savingLocation || !locationForm.site_name.trim()} className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingLocation ? 'Saving...' : 'Save Location'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contact detail / edit panel */}
      {contactPanel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setContactPanel(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-fp-card z-50 shadow-2xl flex flex-col border-l border-fp-border">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-fp-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#C8622A]/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#C8622A] font-bold text-sm">
                    {contactPanel === 'new' ? '+' : (panelForm.full_name || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-fp-text font-bold leading-tight">
                    {contactPanel === 'new' ? 'New Contact' : panelForm.full_name || 'Contact'}
                  </p>
                  {contactPanel !== 'new' && panelForm.title && (
                    <p className="text-fp-muted text-xs">{panelForm.title}</p>
                  )}
                </div>
              </div>
              <button onClick={() => setContactPanel(null)} className="text-fp-muted hover:text-fp-text transition-colors text-2xl leading-none">&times;</button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Full Name <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={panelForm.full_name}
                  onChange={e => setPanelForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Jane Smith" className={inputClass} autoFocus />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Title / Role</label>
                <input type="text" value={panelForm.title}
                  onChange={e => setPanelForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Owner, PM, Accounting..." className={inputClass} />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Email</label>
                <input type="email" value={panelForm.email}
                  onChange={e => setPanelForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="jane@example.com" className={inputClass} />
                {panelForm.email && contactPanel !== 'new' && (
                  <a href={`mailto:${panelForm.email.replace(/[^a-zA-Z0-9.@_%+\-]/g, '')}`}
                    className="text-[#C8622A] text-xs mt-1 inline-block hover:underline">Send email →</a>
                )}
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Phone</label>
                <input type="text" value={panelForm.phone}
                  onChange={e => setPanelForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="(615) 555-0100" className={inputClass} />
                {panelForm.phone && contactPanel !== 'new' && (
                  <a href={`tel:${panelForm.phone.replace(/[^0-9+\-().#, ]/g, '')}`}
                    className="text-[#C8622A] text-xs mt-1 inline-block hover:underline">Call →</a>
                )}
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Location</label>
                <select value={panelForm.location_id || ''}
                  onChange={e => setPanelForm(p => ({ ...p, location_id: e.target.value || null }))}
                  className={inputClass}>
                  <option value="">— No location —</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.site_name}{loc.city ? ` · ${loc.city}` : ''}{loc.store_id ? ` (${loc.store_id})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Notes</label>
                <textarea value={panelForm.notes}
                  onChange={e => setPanelForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Best time to call, preferences, context..." rows={4}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" />
              </div>
              <button type="button" onClick={() => setPanelForm(p => ({ ...p, is_primary: !p.is_primary }))}
                className="flex items-center gap-2 text-sm transition-colors">
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${panelForm.is_primary ? 'bg-[#C8622A] border-[#C8622A]' : 'border-fp-border'}`}>
                  {panelForm.is_primary && <span className="text-fp-text text-xs">✓</span>}
                </span>
                <span className={panelForm.is_primary ? 'text-fp-text' : 'text-fp-muted'}>Primary contact</span>
              </button>
            </div>

            {/* Panel footer */}
            <div className="px-6 py-4 border-t border-fp-border flex-shrink-0 space-y-2">
              <div className="flex gap-3">
                <button onClick={() => setContactPanel(null)}
                  className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={saveContact} disabled={savingContact || !panelForm.full_name.trim()}
                  className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingContact ? 'Saving...' : contactPanel === 'new' ? 'Add Contact' : 'Save Changes'}
                </button>
              </div>
              {contactPanel !== 'new' && (
                <button onClick={async () => { if (window.confirm('Delete this contact?')) { await deleteContact(contactPanel.id); setContactPanel(null) } }}
                  className="w-full py-2 text-red-400 hover:text-red-300 text-sm transition-colors">
                  Delete Contact
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* AI Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-fp-text font-bold text-lg mb-1">✍️ Draft Email with AI</h3>
            <p className="text-fp-muted text-sm mb-5">Sending to <span className="text-fp-text font-medium">{client?.company}</span>{client?.client_name ? ` · ${client.client_name}` : ''} · {client?.email}</p>
            <div className="space-y-4">
              <div><label className="text-fp-muted text-xs mb-1 block">Subject Line</label><input type="text" value={emailForm.subject} onChange={e => setEmailForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Security System Upgrade" className={inputClass} /></div>
              <div><label className="text-fp-muted text-xs mb-1 block">What do you want to accomplish?</label><textarea value={emailForm.context} onChange={e => setEmailForm(p => ({ ...p, context: e.target.value }))} rows={3} placeholder="e.g. Cold outreach about camera system for their next project." className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" /></div>
              <button onClick={draftEmail} disabled={generatingEmail || !emailForm.context} className="bg-purple-600 text-fp-text px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">{generatingEmail ? '✨ Drafting...' : '✨ Generate Draft'}</button>
              {draftedEmail && (
                <div>
                  <div className="flex justify-between items-center mb-2"><label className="text-fp-muted text-xs">Email Draft</label><button onClick={() => setEmailEditMode(!emailEditMode)} className="text-[#C8622A] text-xs hover:text-fp-text transition-colors">{emailEditMode ? 'Preview' : 'Edit'}</button></div>
                  {emailEditMode ? <textarea value={draftedEmail} onChange={e => setDraftedEmail(e.target.value)} rows={12} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" /> : <div className="bg-fp-inset border border-fp-border rounded-lg p-4"><p className="text-fp-text text-sm leading-relaxed whitespace-pre-wrap">{draftedEmail}</p></div>}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowEmailModal(false); setDraftedEmail(''); setEmailEditMode(false) }} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={sendEmail} disabled={sendingEmail || !draftedEmail || !emailForm.subject} className="flex-1 bg-purple-600 text-fp-text py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">{sendingEmail ? 'Sending...' : 'Send Email →'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subscription Modal */}
      {editingSub && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingSub(null)}>
          <div className="bg-fp-card rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-fp-text font-bold text-lg mb-1">Edit Subscription</h3>
            <p className="text-fp-muted text-sm mb-5">{editingSub.proposals?.company || '—'} · {editingSub.proposals?.proposal_name || ''}</p>
            <div className="space-y-4">
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Item Name</label>
                <input value={editSubForm.item_name} onChange={e => setEditSubForm(p => ({ ...p, item_name: e.target.value }))}
                  className={inputClass} />
              </div>
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Part Number / SKU</label>
                <input value={editSubForm.part_number_sku} onChange={e => setEditSubForm(p => ({ ...p, part_number_sku: e.target.value }))}
                  placeholder="Optional" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Quantity</label>
                  <input type="number" min="0" step="1" value={editSubForm.quantity}
                    onChange={e => {
                      const qty = e.target.value
                      const unit = parseFloat(editSubForm.customer_price_unit) || 0
                      const total = unit ? String((parseFloat(qty) || 0) * unit) : editSubForm.customer_price_total
                      setEditSubForm(p => ({ ...p, quantity: qty, customer_price_total: total }))
                    }}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Unit Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fp-muted text-sm">$</span>
                    <input type="number" min="0" step="0.01" value={editSubForm.customer_price_unit}
                      onChange={e => {
                        const unit = e.target.value
                        const qty = parseFloat(editSubForm.quantity) || 1
                        setEditSubForm(p => ({ ...p, customer_price_unit: unit, customer_price_total: String((parseFloat(unit) || 0) * qty) }))
                      }}
                      placeholder="0.00"
                      className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Total Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fp-muted text-sm">$</span>
                  <input type="number" min="0" step="0.01" value={editSubForm.customer_price_total}
                    onChange={e => setEditSubForm(p => ({ ...p, customer_price_total: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Frequency</label>
                  <select value={editSubForm.billing_frequency} onChange={e => setEditSubForm(p => ({ ...p, billing_frequency: e.target.value }))}
                    className={inputClass}>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Renewal Date</label>
                  <input type="date" value={editSubForm.renewal_date} onChange={e => setEditSubForm(p => ({ ...p, renewal_date: e.target.value }))}
                    className={inputClass} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-fp-inset rounded-lg px-3 py-2">
                <div>
                  <p className="text-fp-text text-sm font-medium">Auto-Invoice</p>
                  <p className="text-fp-muted text-xs">Automatically create an invoice on each cycle</p>
                </div>
                <button onClick={() => setEditSubForm(p => ({ ...p, auto_invoice: !p.auto_invoice }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${editSubForm.auto_invoice ? 'bg-blue-500' : 'bg-fp-border'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editSubForm.auto_invoice ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {editSubForm.auto_invoice && (
                <div>
                  <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1 block">Next Invoice Date</label>
                  <input type="date" value={editSubForm.next_invoice_date} onChange={e => setEditSubForm(p => ({ ...p, next_invoice_date: e.target.value }))}
                    className={inputClass} />
                  <p className="text-fp-muted text-xs mt-1">Invoice will be created on this date and advance by billing frequency each cycle.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingSub(null)} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
              <button onClick={saveEditSub} disabled={savingSub}
                className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingSub ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-fp-text font-bold text-lg mb-5">Edit Client</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-fp-muted text-xs mb-1 block">Company</label><input type="text" value={editForm.company || ''} onChange={e => setEditForm(p => ({ ...p, company: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Contact Name</label><input type="text" value={editForm.client_name || ''} onChange={e => setEditForm(p => ({ ...p, client_name: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Email</label><input type="email" value={editForm.email || ''} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Phone</label><input type="text" value={editForm.phone || ''} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Industry</label><select value={editForm.industry || ''} onChange={e => setEditForm(p => ({ ...p, industry: e.target.value }))} className={inputClass}><option value="">Select industry</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Store ID</label><input type="text" value={editForm.store_id || ''} onChange={e => setEditForm(p => ({ ...p, store_id: e.target.value }))} placeholder="e.g. STR-001" className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Payment Terms</label><select value={editForm.net_terms || 'NET 30'} onChange={e => setEditForm(p => ({ ...p, net_terms: e.target.value }))} className={inputClass}>{['Due on Receipt', 'NET 15', 'NET 30', 'NET 45', 'NET 60', 'NET 90'].map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label className="text-fp-muted text-xs mb-1 block">Payment Method</label><select value={editForm.payment_method || 'Default'} onChange={e => setEditForm(p => ({ ...p, payment_method: e.target.value }))} className={inputClass}>{['Default', 'Check', 'ACH', 'Credit Card'].map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              <div><label className="text-fp-muted text-xs mb-1 block">Street Address</label><input type="text" value={editForm.address || ''} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-fp-muted text-xs mb-1 block">City</label><input type="text" value={editForm.city || ''} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">State</label><input type="text" value={editForm.state || ''} onChange={e => setEditForm(p => ({ ...p, state: e.target.value }))} className={inputClass} /></div>
                <div><label className="text-fp-muted text-xs mb-1 block">ZIP</label><input type="text" value={editForm.zip || ''} onChange={e => setEditForm(p => ({ ...p, zip: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="text-fp-muted text-xs mb-1 block">Notes</label><textarea value={editForm.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={4} className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingClient(false)} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                <button onClick={saveClient} disabled={savingClient} className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingClient ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
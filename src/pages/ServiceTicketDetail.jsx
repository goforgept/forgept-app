import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const STATUS_COLORS = {
  'Open': 'bg-blue-500/20 text-blue-400',
  'In Progress': 'bg-yellow-500/20 text-yellow-400',
  'Resolved': 'bg-green-500/20 text-green-400',
  'Cancelled': 'bg-red-500/20 text-red-400',
}

const PRIORITY_COLORS = {
  'Low': 'bg-[#2a3d55] text-[#8A9AB0]',
  'Normal': 'bg-blue-500/20 text-blue-400',
  'High': 'bg-orange-500/20 text-orange-400',
  'Urgent': 'bg-red-500/20 text-red-400',
}

export default function ServiceTicketDetail({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [techs, setTechs] = useState([])
  const [saving, setSaving] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editingTicketNumber, setEditingTicketNumber] = useState(false)
  const [ticketNumberDraft, setTicketNumberDraft] = useState('')
  const cancelTicketNumberEdit = useRef(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [lineItems, setLineItems] = useState([])
  const [laborItems, setLaborItems] = useState([])
  const [savingItems, setSavingItems] = useState(false)
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago')
  const [photos, setPhotos] = useState([])
  const [clientLocations, setClientLocations] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoCategory, setPhotoCategory] = useState('Other')

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)
    const { data: orgData } = await supabase.from('organizations').select('timezone').eq('id', profileData.org_id).single()
    setOrgTimezone(orgData?.timezone || 'America/Chicago')

    const { data: ticketData } = await supabase
      .from('service_tickets')
      .select('*, clients(id, company, client_name, email), profiles!service_tickets_assigned_tech_id_fkey(full_name, email), jobs(id, name, job_number)')
      .eq('id', id)
      .single()
    setTicket(ticketData)
    setLineItems(ticketData?.line_items || [])
    setLaborItems(ticketData?.labor_items || [])

    const { data: techData } = await supabase
      .from('profiles').select('id, full_name, dispatch_zone')
      .eq('org_id', profileData.org_id).order('full_name')
    setTechs(techData || [])

    // Fetch client locations if client is set
    if (ticketData?.clients?.id) {
      const { data: locData } = await supabase
        .from('client_locations')
        .select('*')
        .eq('client_id', ticketData.clients.id)
        .order('site_name', { ascending: true })
      setClientLocations(locData || [])
    }

    setLoading(false)

    // Fetch ticket photos
    const { data: photoData } = await supabase
      .from('service_ticket_photos')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    const { getR2Url, BUCKETS } = await import('../r2')
    const photosWithUrls = await Promise.all((photoData || []).map(async (photo) => {
      if (photo.url?.startsWith('http')) return photo // old Supabase URL
      const signedUrl = await getR2Url(photo.storage_path, 60 * 60 * 24, BUCKETS.PHOTOS)
      return { ...photo, url: signedUrl || photo.url }
    }))
    setPhotos(photosWithUrls)

    setLoading(false)
  }

  const deleteTicket = async () => {
    await supabase.from('service_tickets').delete().eq('id', id)
    navigate('/service-tickets')
  }

  const pushToCalendar = async (updatedTicket) => {
    if (!updatedTicket?.assigned_tech_id || !updatedTicket?.scheduled_date) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tech_id: updatedTicket.assigned_tech_id,
          title: `🎫 ${updatedTicket.title}`,
          description: `Service ticket via ForgePt.\n${updatedTicket.clients?.company ? `Client: ${updatedTicket.clients.company}` : ''}`,
          date: updatedTicket.scheduled_date,
          start_time: updatedTicket.scheduled_time || null,
          duration_hours: updatedTicket.duration_hours || 2,
          record_type: 'ticket',
          record_id: updatedTicket.id,
          existing_google_event_id: updatedTicket.google_event_id || null,
          existing_microsoft_event_id: updatedTicket.microsoft_event_id || null,
          timezone: orgTimezone,
        }),
      })
    } catch (e) { console.error('Calendar push error:', e) }
  }

  const deleteCalendarEvent = async (techId, googleEventId, microsoftEventId) => {
    if (!techId || (!googleEventId && !microsoftEventId)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/delete-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tech_id: techId, google_event_id: googleEventId || null, microsoft_event_id: microsoftEventId || null }),
      })
    } catch (e) { console.error('Calendar delete error:', e) }
  }

  const updateTicket = async (field, value) => {
    setSaving(true)
    const updates = { [field]: value || null }
    if (field === 'status' && value === 'Resolved') {
      updates.resolved_at = new Date().toISOString()
    }
    // If unassigning tech or clearing date, delete the calendar event first
    const isClearing = !value
    if (isClearing && ['assigned_tech_id', 'scheduled_date'].includes(field)) {
      const techId = ticket.assigned_tech_id
      if (ticket.google_event_id || ticket.microsoft_event_id) {
        deleteCalendarEvent(techId, ticket.google_event_id, ticket.microsoft_event_id)
        updates.google_event_id = null
        updates.microsoft_event_id = null
      }
    }
    await supabase.from('service_tickets').update(updates).eq('id', id)
    const updatedTicket = { ...ticket, ...updates }
    setTicket(updatedTicket)
    // Push to calendar when date, tech, or duration changes and all are set
    if (['scheduled_date', 'assigned_tech_id', 'duration_hours'].includes(field) && !isClearing) {
      pushToCalendar(updatedTicket)
    }
    setSaving(false)
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    const existing = ticket?.notes || ''
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const entry = `[${timestamp} · ${profile?.full_name || 'Unknown'}] ${newNote.trim()}`
    const updated = existing ? `${existing}\n\n${entry}` : entry
    await supabase.from('service_tickets').update({ notes: updated }).eq('id', id)
    setTicket(prev => ({ ...prev, notes: updated }))
    setNewNote('')
    setSavingNote(false)
  }

  const saveItems = async () => {
    setSavingItems(true)
    await supabase.from('service_tickets').update({
      line_items: lineItems.length > 0 ? lineItems : null,
      labor_items: laborItems.length > 0 ? laborItems : null,
    }).eq('id', id)
    setTicket(prev => ({ ...prev, line_items: lineItems, labor_items: laborItems }))
    setSavingItems(false)
  }

  // --- Materials helpers ---
  const addMaterial = () => setLineItems(prev => [...prev, {
    id: crypto.randomUUID(), item_name: '', quantity: 1, unit: 'ea',
    your_cost_unit: '', markup_percent: 35, customer_price_unit: ''
  }])

  const updateMaterial = (i, field, value) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(field === 'your_cost_unit' ? value : updated[i].your_cost_unit) || 0
        const mkp = parseFloat(field === 'markup_percent' ? value : updated[i].markup_percent) || 0
        updated[i].customer_price_unit = (cost * (1 + mkp / 100)).toFixed(2)
      }
      return updated
    })
  }

  const removeMaterial = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i))

  // --- Labor helpers ---
  const addLabor = () => setLaborItems(prev => [...prev, {
    id: crypto.randomUUID(), role: '', quantity: '', unit: 'hr',
    your_cost: '', markup: 35, customer_price: ''
  }])

  const updateLabor = (i, field, value) => {
    setLaborItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      if (field === 'your_cost' || field === 'markup' || field === 'quantity') {
        const cost = parseFloat(field === 'your_cost' ? value : updated[i].your_cost) || 0
        const mkp = parseFloat(field === 'markup' ? value : updated[i].markup) || 0
        const qty = parseFloat(field === 'quantity' ? value : updated[i].quantity) || 0
        updated[i].customer_price = (cost * (1 + mkp / 100) * qty).toFixed(2)
      }
      return updated
    })
  }

  const removeLabor = (i) => setLaborItems(prev => prev.filter((_, idx) => idx !== i))

  const uploadTicketPhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPEG, PNG, or WEBP image.')
      return
    }
    setUploadingPhoto(true)
    try {
      const fileExt = file.name.split('.').pop()
      const storagePath = `${profile?.org_id}/${id}/${Date.now()}.${fileExt}`
      const { uploadToR2, BUCKETS } = await import('../r2')
      await uploadToR2(storagePath, file, file.type, BUCKETS.PHOTOS)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('service_ticket_photos').insert({
        ticket_id: id,
        org_id: profile?.org_id,
        uploaded_by: user.id,
        storage_path: storagePath,
        url: storagePath,
        category: photoCategory,
        caption: ''
      })
      await fetchAll()
    } catch (err) { alert('Error uploading photo: ' + err.message) }
    setUploadingPhoto(false)
  }

  const deleteTicketPhoto = async (photoId, storagePath) => {
    if (!window.confirm('Delete this photo?')) return
    // R2 cleanup handled via maintenance
    await supabase.from('service_ticket_photos').delete().eq('id', photoId)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  const updateTicketPhotoCaption = async (photoId, caption) => {
    await supabase.from('service_ticket_photos').update({ caption }).eq('id', photoId)
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption } : p))
  }

  const generateServiceReport = async (sendToClient = false) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

    // Header
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')

    if (profile?.logo_url) {
      const img = new Image()
      img.src = profile.logo_url
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      const maxW = 50, maxH = 26
      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
      doc.addImage(img, 'PNG', 14, 8 + (maxH - img.naturalHeight * ratio) / 2, img.naturalWidth * ratio, img.naturalHeight * ratio)
    } else {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text(profile?.company_name || 'ForgePt.', 14, 24)
    }

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Service Report', pageWidth - 14, 20, { align: 'right' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date().toLocaleDateString(), pageWidth - 14, 30, { align: 'right' })

    let y = 52
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(ticket.title || '', 14, y)
    y += 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    if (ticket.ticket_number) { doc.text(`Ticket #: ${ticket.ticket_number}`, 14, y); y += 5 }
    if (ticket.clients?.company) { doc.text(`Client: ${ticket.clients.company}`, 14, y); y += 5 }
    if (ticket.profiles?.full_name) { doc.text(`Technician: ${ticket.profiles.full_name}`, 14, y); y += 5 }
    if (ticket.scheduled_date) { doc.text(`Service Date: ${new Date(ticket.scheduled_date).toLocaleDateString()}`, 14, y); y += 5 }
    if (ticket.location_id) {
      const loc = clientLocations.find(l => l.id === ticket.location_id)
      if (loc) { doc.text(`Site: ${loc.site_name}${loc.address ? ` — ${loc.address}, ${loc.city || ''} ${loc.state || ''}`.trim() : ''}`, 14, y); y += 5 }
    }
    if (ticket.resolved_at) { doc.text(`Resolved: ${new Date(ticket.resolved_at).toLocaleDateString()}`, 14, y); y += 5 }
    y += 4

    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(14, y, pageWidth - 14, y)
    y += 8

    if (ticket.description) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Problem Description', 14, y)
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const descLines = doc.splitTextToSize(ticket.description, pageWidth - 28)
      for (const line of descLines) {
        if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
        doc.text(line, 14, y)
        y += 5
      }
      y += 6
    }

    if (ticket.notes) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, y, pageWidth - 14, y)
      y += 8
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Work Performed', 14, y)
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const noteEntries = ticket.notes.split('\n\n').filter(Boolean)
      for (const note of noteEntries) {
        const match = note.match(/^\[(.+?)\] (.+)$/s)
        const body = match ? match[2] : note
        const lines = doc.splitTextToSize(body, pageWidth - 28)
        for (const line of lines) {
          if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
          doc.text(line, 14, y)
          y += 5
        }
        y += 3
      }
      y += 4
    }

    const hasMaterials = lineItems.length > 0
    const hasLabor = laborItems.length > 0

    if (hasMaterials || hasLabor) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, y, pageWidth - 14, y)
      y += 8
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Materials & Labor', 14, y)
      y += 6

      const tableRows = []
      if (hasMaterials) {
        lineItems.forEach(l => {
          const total = (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)
          tableRows.push([l.item_name, `${l.quantity} ${l.unit || 'ea'}`, `$${(parseFloat(l.customer_price_unit) || 0).toFixed(2)}`, `$${total.toFixed(2)}`])
        })
      }
      if (hasLabor) {
        laborItems.forEach(l => {
          tableRows.push([l.role, `${l.quantity} ${l.unit || 'hr'}`, '—', `$${(parseFloat(l.customer_price) || 0).toFixed(2)}`])
        })
      }

      autoTable(doc, {
        startY: y,
        head: [['Description', 'Quantity', 'Unit Price', 'Total']],
        body: tableRows,
        foot: [[{ content: 'Total', colSpan: 3, styles: { halign: 'right' } }, `$${(matTotal + labTotal).toFixed(2)}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 },
        showFoot: 'lastPage'
      })
      y = doc.lastAutoTable.finalY + 10
    }

    if (profile?.payment_instructions_payable_to || profile?.payment_instructions_notes) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, y, pageWidth - 14, y)
      y += 8
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Payment Information', 14, y)
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      if (profile.payment_instructions_payable_to) { doc.text(`Payable to: ${profile.payment_instructions_payable_to}`, 14, y); y += 5 }
      if (profile.payment_instructions_zelle) { doc.text(`Zelle: ${profile.payment_instructions_zelle}`, 14, y); y += 5 }
      if (profile.payment_instructions_notes) { doc.text(profile.payment_instructions_notes, 14, y); y += 5 }
      y += 4
    }

    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(14, y, pageWidth - 14, y)
    y += 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    const resolution = `All service work has been completed. ${profile?.company_name || 'The technician'} has diagnosed, repaired, and tested the reported issue. Please contact us if any problems persist.`
    const resLines = doc.splitTextToSize(resolution, pageWidth - 28)
    for (const line of resLines) { doc.text(line, 14, y); y += 5 }
    y += 10

    doc.setDrawColor(180, 180, 180)
    doc.line(14, y, 100, y)
    doc.line(120, y, pageWidth - 14, y)
    y += 5
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('Client Signature', 14, y)
    doc.text('Date', 120, y)

    const photoCategories = ['Before', 'During', 'After', 'Issue/Defect', 'Equipment', 'Panel/Rack', 'Cable Run', 'Other']
    for (const category of photoCategories) {
      const categoryPhotos = photos.filter(p => p.category === category)
      if (categoryPhotos.length === 0) continue
      doc.addPage()
      y = 20
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(`Site Photos — ${category}`, 14, y)
      y += 4
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, y, pageWidth - 14, y)
      y += 8
      const photoWidth = (pageWidth - 42) / 2
      const photoHeight = 65
      let photoX = 14
      const pageHeight = doc.internal.pageSize.getHeight()
      for (let i = 0; i < categoryPhotos.length; i++) {
        try {
          const response = await fetch(categoryPhotos[i].url)
          const blob = await response.blob()
          const base64 = await new Promise(resolve => {
            const img2 = new Image()
            img2.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img2.naturalWidth
              canvas.height = img2.naturalHeight
              const ctx = canvas.getContext('2d')
              ctx.drawImage(img2, 0, 0)
              resolve(canvas.toDataURL('image/jpeg', 0.85))
            }
            img2.src = URL.createObjectURL(blob)
          })
          if (y + photoHeight + 10 > pageHeight - 20) { doc.addPage(); y = 20; photoX = 14 }
          doc.addImage(base64, 'JPEG', photoX, y, photoWidth, photoHeight)
          if (categoryPhotos[i].caption) {
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(80, 80, 80)
            doc.text(categoryPhotos[i].caption, photoX, y + photoHeight + 4, { maxWidth: photoWidth })
          }
          if (i % 2 === 0) { photoX = photoX + photoWidth + 14 }
          else { photoX = 14; y = y + photoHeight + 14 }
        } catch (e) { console.error('Photo error:', e) }
      }
    }

    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`${profile?.company_name || 'ForgePt.'} · Service Report`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })

    if (sendToClient && ticket.clients?.email) {
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          type: 'ai_email',
          toEmail: ticket.clients.email,
          toName: ticket.clients.client_name || ticket.clients.company,
          fromName: profile?.full_name || '',
          fromEmail: profile?.email || '',
          subject: `Service Report — ${ticket.title}`,
          body: `<p>Hi ${ticket.clients.client_name || ticket.clients.company},</p><p>Please find your service report attached for ticket #${ticket.ticket_number || ''}.</p><p>Thank you for your business.</p><p>${profile?.full_name || ''}<br/>${profile?.company_name || ''}</p>`,
        })
      })
      alert('Service report sent to client!')
    } else {
      doc.save(`Service-Report-${ticket.ticket_number || ticket.id}.pdf`)
    }
  }

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [15, 28, 46]
  }

  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
  const cellInput = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"

  const matTotal = lineItems.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const labTotal = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>
  if (!ticket) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Ticket not found.</p></div>

  const noteLines = ticket.notes ? ticket.notes.split('\n\n').filter(Boolean).reverse() : []

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6 max-w-5xl">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <button onClick={() => navigate('/service-tickets')} className="text-[#8A9AB0] hover:text-white text-xs mb-2 transition-colors">← Service Tickets</button>
              <div className="flex items-center gap-3 mb-1">
                {editingTicketNumber ? (
                  <input
                    autoFocus
                    value={ticketNumberDraft}
                    onChange={e => setTicketNumberDraft(e.target.value)}
                    onBlur={async () => {
                      if (!cancelTicketNumberEdit.current) {
                        const val = ticketNumberDraft.trim()
                        if (val && val !== ticket.ticket_number) await updateTicket('ticket_number', val)
                      }
                      cancelTicketNumberEdit.current = false
                      setEditingTicketNumber(false)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.target.blur()
                      if (e.key === 'Escape') { cancelTicketNumberEdit.current = true; e.target.blur() }
                    }}
                    className="text-xs font-mono bg-[#0F1C2E] text-white border border-[#C8622A] rounded px-2 py-0.5 w-32 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => { setTicketNumberDraft(ticket.ticket_number || ''); setEditingTicketNumber(true) }}
                    className="text-[#8A9AB0] text-xs font-mono bg-[#0F1C2E] px-2 py-0.5 rounded hover:border-[#C8622A] border border-transparent transition-colors"
                    title="Click to edit ticket number">
                    {ticket.ticket_number || 'No #'}
                  </button>
                )}
              </div>
              <h2 className="text-white text-2xl font-bold">{ticket.title}</h2>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded font-semibold ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.Normal}`}>{ticket.priority}</span>
                <span className={`text-xs px-2 py-1 rounded font-semibold ${STATUS_COLORS[ticket.status] || STATUS_COLORS.Open}`}>{ticket.status}</span>
                {ticket.clients?.company && (
                  <button onClick={() => navigate(`/client/${ticket.clients.id}`)} className="text-[#8A9AB0] text-sm hover:text-[#C8622A] transition-colors">🏢 {ticket.clients.company}</button>
                )}
                {ticket.jobs?.name && (
                  <button onClick={() => navigate(`/jobs/${ticket.jobs.id}`)} className="text-[#8A9AB0] text-sm hover:text-[#C8622A] transition-colors">🔨 {ticket.jobs.job_number ? `${ticket.jobs.job_number} — ` : ''}{ticket.jobs.name}</button>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => generateServiceReport(false)}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                  📄 Download Report
                </button>
                {ticket.clients?.email && (
                  <button onClick={() => generateServiceReport(true)}
                    className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                    ✉️ Send to Client
                  </button>
                )}
              </div>
            {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[#8A9AB0] text-xs">Delete ticket?</span>
                  <button onClick={deleteTicket} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[#8A9AB0] hover:text-white text-xs px-3 py-1.5 transition-colors">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Delete</button>
              )}
            </div>
          </div>

          {/* Quick controls */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Status</p>
              <select value={ticket.status} onChange={e => updateTicket('status', e.target.value)} disabled={saving} className={`w-full ${inputClass}`}>
                {['Open', 'In Progress', 'Resolved', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Priority</p>
              <select value={ticket.priority} onChange={e => updateTicket('priority', e.target.value)} disabled={saving} className={`w-full ${inputClass}`}>
                {['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Technician</p>
              <select value={ticket.assigned_tech_id || ''} onChange={e => updateTicket('assigned_tech_id', e.target.value)} disabled={saving} className={`w-full ${inputClass}`}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.dispatch_zone ? ` · ${t.dispatch_zone}` : ''}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Scheduled</p>
              <input type="date" value={ticket.scheduled_date || ''} onChange={e => updateTicket('scheduled_date', e.target.value)} className={`w-full ${inputClass}`} />
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Duration</p>
              <select value={ticket.duration_hours || '2'} onChange={e => updateTicket('duration_hours', parseFloat(e.target.value))} className={`w-full ${inputClass}`}>
                {['0.5','1','1.5','2','2.5','3','3.5','4','5','6','7','8'].map(h => (
                  <option key={h} value={h}>{h} {parseFloat(h) === 1 ? 'hr' : 'hrs'}</option>
                ))}
              </select>
            </div>
            {clientLocations.length > 0 && (
              <div>
                <p className="text-[#8A9AB0] text-xs mb-1">Site Location</p>
                <select value={ticket.location_id || ''} onChange={e => updateTicket('location_id', e.target.value || null)} className={`w-full ${inputClass}`}>
                  <option value="">— Select location —</option>
                  {clientLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.site_name}{loc.address ? ` — ${loc.address}` : ''}{loc.city ? `, ${loc.city}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {ticket.scheduled_time && (
            <div className="mt-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Scheduled Time</p>
              <input type="time" value={ticket.scheduled_time || ''} onChange={e => updateTicket('scheduled_time', e.target.value)} className={`w-40 ${inputClass}`} />
            </div>
          )}

          {ticket.resolved_at && (
            <p className="text-green-400 text-xs mt-3">✓ Resolved {new Date(ticket.resolved_at).toLocaleDateString()}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'labor', label: 'Labor & Materials' },
            { key: 'photos', label: `📷 Photos (${photos.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <>
            {ticket.description && (
              <div className="bg-[#1a2d45] rounded-xl p-6">
                <h3 className="text-white font-bold mb-3">Description</h3>
                <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              </div>
            )}

            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-4">Notes & Activity</h3>
              <div className="flex gap-3 mb-5">
                <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  placeholder="Add a note or update..."
                  className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
                <button onClick={addNote} disabled={savingNote || !newNote.trim()}
                  className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingNote ? '...' : 'Add'}
                </button>
              </div>
              {noteLines.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm italic">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  {noteLines.map((note, i) => {
                    const match = note.match(/^\[(.+?)\] (.+)$/s)
                    const meta = match ? match[1] : null
                    const body = match ? match[2] : note
                    return (
                      <div key={i} className="bg-[#0F1C2E] rounded-lg p-4 border border-[#2a3d55]">
                        {meta && <p className="text-[#8A9AB0] text-xs mb-1.5">{meta}</p>}
                        <p className="text-[#D6E4F0] text-sm whitespace-pre-wrap">{body}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-3">Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-[#8A9AB0] text-xs mb-0.5">Created</p><p className="text-white">{new Date(ticket.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
                {ticket.profiles?.full_name && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Assigned To</p><p className="text-white">{ticket.profiles.full_name}</p></div>}
                {ticket.clients?.company && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Client</p><p className="text-white">{ticket.clients.company}</p></div>}
                {ticket.jobs?.name && <div><p className="text-[#8A9AB0] text-xs mb-0.5">Job</p><p className="text-white">{ticket.jobs.name}</p></div>}
                {ticket.location_id && (() => {
                  const loc = clientLocations.find(l => l.id === ticket.location_id)
                  return loc ? (
                    <div className="col-span-2">
                      <p className="text-[#8A9AB0] text-xs mb-0.5">Site Location</p>
                      <p className="text-white">{loc.site_name}{loc.store_id ? <span className="text-[#C8622A] font-mono text-xs ml-2">{loc.store_id}</span> : ''}{loc.address ? ` — ${loc.address}, ${loc.city || ''} ${loc.state || ''}`.trim() : ''}</p>
                    </div>
                  ) : null
                })()}
              </div>
            </div>
          </>
        )}

        {/* ── Labor & Materials Tab ── */}
        {activeTab === 'labor' && (
          <div className="space-y-6">

            {/* Materials */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold">Materials</h3>
                <button onClick={addMaterial} className="text-[#C8622A] text-sm hover:text-white transition-colors">+ Add Material</button>
              </div>
              {lineItems.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm italic">No materials logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Item Name</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Qty</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Unit</th>
                        {!isTechnician && <>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Your Cost</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Markup %</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Unit Price</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Total</th>
                        </>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((line, i) => {
                        const lineTotal = (parseFloat(line.customer_price_unit) || 0) * (parseFloat(line.quantity) || 0)
                        return (
                          <tr key={line.id} className="border-b border-[#2a3d55]/30">
                            <td className="pr-3 py-1.5">
                              <input value={line.item_name} onChange={e => updateMaterial(i, 'item_name', e.target.value)} placeholder="Item name" className={`w-40 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5">
                              <input type="number" min="0" value={line.quantity} onChange={e => updateMaterial(i, 'quantity', e.target.value)} className={`w-16 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5">
                              <select value={line.unit} onChange={e => updateMaterial(i, 'unit', e.target.value)} className={cellInput}>
                                {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            {!isTechnician && <>
                              <td className="pr-3 py-1.5">
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={line.your_cost_unit} onChange={e => updateMaterial(i, 'your_cost_unit', e.target.value)} className={`w-20 ${cellInput}`} />
                              </td>
                              <td className="pr-3 py-1.5">
                                <input type="number" min="0" placeholder="35" value={line.markup_percent} onChange={e => updateMaterial(i, 'markup_percent', e.target.value)} className={`w-16 ${cellInput}`} />
                              </td>
                              <td className="pr-3 py-1.5">
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={line.customer_price_unit} onChange={e => updateMaterial(i, 'customer_price_unit', e.target.value)} className={`w-20 ${cellInput}`} />
                              </td>
                              <td className="pr-3 py-1.5 text-white font-medium">${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </>}
                            <td className="py-1.5">
                              <button onClick={() => removeMaterial(i)} className="text-[#8A9AB0] hover:text-red-400 transition-colors">✕</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {!isTechnician && lineItems.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan="6" className="text-[#8A9AB0] text-right pt-3 pr-3 font-semibold">Materials Total</td>
                          <td className="text-[#C8622A] font-bold pt-3">${matTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Labor */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold">Labor</h3>
                <button onClick={addLabor} className="text-[#C8622A] text-sm hover:text-white transition-colors">+ Add Labor</button>
              </div>
              {laborItems.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm italic">No labor logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Role / Description</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Qty</th>
                        <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Unit</th>
                        {!isTechnician && <>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Your Cost</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Markup %</th>
                          <th className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">Total</th>
                        </>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborItems.map((labor, i) => (
                        <tr key={labor.id} className="border-b border-[#2a3d55]/30">
                          <td className="pr-3 py-1.5">
                            <input value={labor.role} onChange={e => updateLabor(i, 'role', e.target.value)} placeholder="e.g. Low Voltage Tech" className={`w-44 ${cellInput}`} />
                          </td>
                          <td className="pr-3 py-1.5">
                            <input type="number" min="0" step="0.5" value={labor.quantity} onChange={e => updateLabor(i, 'quantity', e.target.value)} className={`w-16 ${cellInput}`} />
                          </td>
                          <td className="pr-3 py-1.5">
                            <select value={labor.unit} onChange={e => updateLabor(i, 'unit', e.target.value)} className={cellInput}>
                              {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          {!isTechnician && <>
                            <td className="pr-3 py-1.5">
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={labor.your_cost} onChange={e => updateLabor(i, 'your_cost', e.target.value)} className={`w-20 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5">
                              <input type="number" min="0" placeholder="35" value={labor.markup} onChange={e => updateLabor(i, 'markup', e.target.value)} className={`w-16 ${cellInput}`} />
                            </td>
                            <td className="pr-3 py-1.5 text-white font-medium">${(parseFloat(labor.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          </>}
                          <td className="py-1.5">
                            <button onClick={() => removeLabor(i)} className="text-[#8A9AB0] hover:text-red-400 transition-colors">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {!isTechnician && laborItems.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan="5" className="text-[#8A9AB0] text-right pt-3 pr-3 font-semibold">Labor Total</td>
                          <td className="text-[#C8622A] font-bold pt-3">${labTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Grand total — managers only */}
            {!isTechnician && (lineItems.length > 0 || laborItems.length > 0) && (
              <div className="bg-[#1a2d45] rounded-xl p-4 flex justify-between items-center">
                <div className="text-sm text-[#8A9AB0] space-y-0.5">
                  {lineItems.length > 0 && <p>Materials: <span className="text-white">${matTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>}
                  {laborItems.length > 0 && <p>Labor: <span className="text-white">${labTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>}
                </div>
                <div className="text-right">
                  <p className="text-[#8A9AB0] text-xs mb-0.5">Ticket Total</p>
                  <p className="text-[#C8622A] font-bold text-xl">${(matTotal + labTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={saveItems} disabled={savingItems}
                className="bg-[#C8622A] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingItems ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

      {/* PHOTOS TAB */}
        {activeTab === 'photos' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-white font-bold text-lg">Site Photos</h3>
                <p className="text-[#8A9AB0] text-sm mt-0.5">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <select value={photoCategory} onChange={e => setPhotoCategory(e.target.value)}
                  className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  {['Before', 'During', 'After', 'Issue/Defect', 'Equipment', 'Panel/Rack', 'Cable Run', 'Other'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <label className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors cursor-pointer">
                  {uploadingPhoto ? 'Uploading...' : '+ Upload Photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadTicketPhoto} className="hidden" disabled={uploadingPhoto} />
                </label>
              </div>
            </div>

            {photos.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-4xl mb-3">📷</p>
                <p className="text-[#8A9AB0]">No photos yet.</p>
                <p className="text-[#8A9AB0] text-sm mt-1">Upload photos to document this service ticket.</p>
              </div>
            ) : (
              <div>
                {['Before', 'During', 'After', 'Issue/Defect', 'Equipment', 'Panel/Rack', 'Cable Run', 'Other'].map(category => {
                  const categoryPhotos = photos.filter(p => p.category === category)
                  if (categoryPhotos.length === 0) return null
                  return (
                    <div key={category} className="mb-6">
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">{category} ({categoryPhotos.length})</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {categoryPhotos.map(photo => (
                          <div key={photo.id} className="bg-[#0F1C2E] rounded-xl overflow-hidden border border-[#2a3d55]">
                            <img src={photo.url} alt={photo.caption || category}
                              className="w-full h-48 object-cover cursor-pointer"
                              onClick={() => window.open(photo.url, '_blank')} />
                            <div className="p-3 space-y-2">
                              <input type="text" value={photo.caption || ''} placeholder="Add caption..."
                                onChange={e => updateTicketPhotoCaption(photo.id, e.target.value)}
                                onBlur={e => updateTicketPhotoCaption(photo.id, e.target.value)}
                                className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                              <div className="flex justify-between items-center">
                                <span className="text-[#8A9AB0] text-xs">{new Date(photo.created_at).toLocaleDateString()}</span>
                                <button onClick={() => deleteTicketPhoto(photo.id, photo.storage_path)}
                                  className="text-[#2a3d55] hover:text-red-400 text-xs transition-colors">Delete</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

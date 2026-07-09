import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import DataImportTab from '../components/DataImportTab'
import { useProfile } from '../context/ProfileContext'
import { SLA_INDUSTRIES, SLA_TIER_DEFAULTS, MONITORING_INDUSTRIES, MONITORING_DEFAULTS, _STD_BODY } from '../components/settings/slaConstants'
import GeneralTab from '../components/settings/GeneralTab'
import InvoicingTab from '../components/settings/InvoicingTab'
import IntegrationsTab from '../components/settings/IntegrationsTab'
import SlaTab from '../components/settings/SlaTab'
import RateCardTab from '../components/settings/RateCardTab'
import DesignerTab from '../components/settings/DesignerTab'
import EmailTemplatesTab from '../components/settings/EmailTemplatesTab'
import TeamSettingsTab from '../components/settings/TeamSettingsTab'
import ApiTab from '../components/settings/ApiTab'
import RegionsTab from '../components/settings/RegionsTab'
import GlobalProductsImport from '../components/GlobalProductsImport'

export default function Settings({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, featureSla = false, featureMonitoring = false, featureDesignerOnly = false, featureApi = false, role, isSalesManager, isPM, isTechnician, isDevTeam = false }) {
  const { profile, refreshProfile } = useProfile()
  const [activeTab, setActiveTab] = useState('general')
  const [laborRates, setLaborRates] = useState([])
  const [savingRates, setSavingRates] = useState(false)
  const [orgServiceSettings, setOrgServiceSettings] = useState({ trip_fee_default: '', drive_time_rate_default: '', service_billing_mode: 'trip_fee' })
  const [importType, setImportType] = useState('clients')
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState([])
  const [importHeaders, setImportHeaders] = useState([])
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [locationMatchType, setLocationMatchType] = useState('auto')
  const [locationMatchClient, setLocationMatchClient] = useState('')
  const [importClients, setImportClients] = useState([])
  const [form, setForm] = useState({
    full_name: '', email: '', company_name: '', default_markup_percent: '35', followup_days: '30,14,7,0',
    terms_and_conditions: '', primary_color: '#0F1C2E',
    bill_to_address: '', bill_to_city: '', bill_to_state: '', bill_to_zip: '',
    ship_to_address: '', ship_to_city: '', ship_to_state: '', ship_to_zip: '',
  })
  const [emailTemplates, setEmailTemplates] = useState({
    early_days: 30, early_subject: '', early_body: '',
    day14_days: 14, day14_subject: '', day14_body: '',
    day7_days: 7, day7_subject: '', day7_body: '',
    close_subject: '', close_body: '',
    rfq_subject: '', rfq_body: '',
    send_subject: '', send_body: '',
  })
  const [saving, setSaving] = useState(false)
  const [savingTemplates, setSavingTemplates] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [success, setSuccess] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' })
  const [passwordError, setPasswordError] = useState(null)
  const [passwordSuccess, setPasswordSuccess] = useState(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [supportPin, setSupportPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pinSaved, setPinSaved] = useState(false)
  const [sameAsShipTo, setSameAsShipTo] = useState(false)
  const [expandedStage, setExpandedStage] = useState('early')
  const [orgTaxRate, setOrgTaxRate] = useState('')
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago')
  const [savingTaxRate, setSavingTaxRate] = useState(false)
  const [orgId, setOrgId] = useState(null)
  const [qboConnected, setQboConnected] = useState(false)
  const [qboCompanyName, setQboCompanyName] = useState('')
  const [connectingQBO, setConnectingQBO] = useState(false)
  const [qboMessage, setQboMessage] = useState(null)
  const [invoicingForm, setInvoicingForm] = useState({
    payment_instructions_payable_to: '', payment_instructions_bank: '',
    payment_instructions_routing: '', payment_instructions_account: '',
    payment_instructions_zelle: '', payment_instructions_notes: '',
  })
  const [savingInvoicing, setSavingInvoicing] = useState(false)
  const [regionsEnabled, setRegionsEnabled] = useState(false)
  const [msrpEnabled, setMsrpEnabled] = useState(false)
  const [docFont, setDocFont] = useState('helvetica')
  const [pdfTableStyle, setPdfTableStyle] = useState('striped')
  const [slaEnabled, setSlaEnabled] = useState(false)
  const [slaAutoAttach, setSlaAutoAttach] = useState(false)
  const [monitoringEnabled, setMonitoringEnabled] = useState(false)
  const [monitoringAutoAttach, setMonitoringAutoAttach] = useState(false)
  const [slaTemplates, setSlaTemplates] = useState({})
  const [monitoringTemplates, setMonitoringTemplates] = useState({})
  const [savingSLA, setSavingSLA] = useState(false)
  const [expandedSLAIndustry, setExpandedSLAIndustry] = useState(null)
  const [expandedSLATier, setExpandedSLATier] = useState({})
  const [expandedMonIndustry, setExpandedMonIndustry] = useState(null)
  const [squareConnected, setSquareConnected] = useState(false)
  const [squareMerchantId, setSquareMerchantId] = useState('')
  const [connectingSquare, setConnectingSquare] = useState(false)
  const [squareMessage, setSquareMessage] = useState(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [googleMessage, setGoogleMessage] = useState(null)
  const [microsoftConnected, setMicrosoftConnected] = useState(false)
  const [microsoftEmail, setMicrosoftEmail] = useState('')
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false)
  const [microsoftMessage, setMicrosoftMessage] = useState(null)
  const [inboundEnabled, setInboundEnabled] = useState(false)
  const [inboundDomain, setInboundDomain] = useState('')
  const [inboundVerified, setInboundVerified] = useState(false)
  const [inboundAutoReply, setInboundAutoReply] = useState('')
  const [savingInbound, setSavingInbound] = useState(false)
  const [inboundMessage, setInboundMessage] = useState(null)
  const [verifyingInbound, setVerifyingInbound] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchProfile()
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === 'integrations') setActiveTab('integrations')
    if (params.get('qbo_success')) setQboMessage({ type: 'success', text: 'QuickBooks connected successfully!' })
    if (params.get('qbo_error')) setQboMessage({ type: 'error', text: `QuickBooks connection failed: ${params.get('qbo_error')}` })
      if (params.get('zoho') === 'connected') {
      const scope = params.get('scope')
      // Trigger a page reload of integrations tab to show connected status
      setActiveTab('integrations')
    }
    if (params.get('zoho') === 'error') {
      setActiveTab('integrations')
    }
    if (params.get('square_success')) setSquareMessage({ type: 'success', text: 'Square connected successfully! You can now generate payment links on invoices.' })
    if (params.get('square_error')) setSquareMessage({ type: 'error', text: `Square connection failed: ${params.get('square_error')}` })
    if (params.get('google_success')) setGoogleMessage({ type: 'success', text: 'Google Calendar connected successfully!' })
    if (params.get('google_error')) setGoogleMessage({ type: 'error', text: `Google connection failed: ${params.get('google_error')}` })
    if (params.get('microsoft_success')) setMicrosoftMessage({ type: 'success', text: 'Microsoft Calendar connected successfully!' })
    if (params.get('microsoft_error')) setMicrosoftMessage({ type: 'error', text: `Microsoft connection failed: ${params.get('microsoft_error')}` })
    const verifyToken = params.get('verify_inbound')
    if (verifyToken) {
      setActiveTab('integrations')
      try {
        const decoded = JSON.parse(atob(verifyToken))
        if (Date.now() > decoded.expires) {
          setInboundMessage({ type: 'error', text: 'Verification link has expired. Please send a new one.' })
        } else {
          supabase.from('organizations')
            .update({ inbound_email_verified: true, inbound_verification_token: null })
            .eq('id', decoded.org_id)
            .eq('inbound_verification_token', verifyToken)
            .then(({ error }) => {
              if (error) {
                setInboundMessage({ type: 'error', text: 'Verification failed. Please try again.' })
              } else {
                setInboundVerified(true); setInboundDomain(decoded.domain); setInboundEnabled(true)
                setInboundMessage({ type: 'success', text: `✓ Domain @${decoded.domain} verified! Inbound email routing is now active.` })
              }
            })
        }
      } catch { setInboundMessage({ type: 'error', text: 'Invalid verification link.' }) }
    }
  }, [profile?.id])

  const fetchProfile = async () => {
    const { data: extraData } = await supabase.from('profiles').select('support_pin, terms_and_conditions, email_template_early_subject, email_template_early_body, email_cadence_early, email_template_14day_subject, email_template_14day_body, email_cadence_14day, email_template_7day_subject, email_template_7day_body, email_cadence_7day, email_template_close_subject, email_template_close_body, email_template_rfq_subject, email_template_rfq_body, email_template_send_subject, email_template_send_body, payment_instructions_bank, payment_instructions_routing, payment_instructions_account, google_email, microsoft_email').eq('id', profile.id).single()
    const data = { ...profile, ...extraData }
    let pin = data?.support_pin || ''
    if (!pin) {
      pin = String(Math.floor(100000 + Math.random() * 900000))
      await supabase.from('profiles').update({ support_pin: pin }).eq('id', data.id)
    }
    setSupportPin(pin); setPinInput(pin)
    if (data?.logo_url) {
      if (data.logo_url.startsWith('http')) { setLogoUrl(data.logo_url) }
      else {
        const { getR2Url, BUCKETS } = await import('../r2')
        const url = await getR2Url(data.logo_url, 60 * 60 * 24 * 365, BUCKETS.ASSETS)
        setLogoUrl(url)
      }
    }
    setForm({
      full_name: data?.full_name || '', email: data?.email || '', company_name: data?.company_name || '',
      phone: data?.phone || '', job_title: data?.job_title || '', license_number: data?.license_number || '',
      default_markup_percent: data?.default_markup_percent || '35', followup_days: data?.followup_days || '30,14,7,0',
      terms_and_conditions: data?.terms_and_conditions || '', primary_color: data?.primary_color || '#0F1C2E',
      bill_to_address: data?.bill_to_address || '', bill_to_city: data?.bill_to_city || '',
      bill_to_state: data?.bill_to_state || '', bill_to_zip: data?.bill_to_zip || '',
      ship_to_address: data?.ship_to_address || '', ship_to_city: data?.ship_to_city || '',
      ship_to_state: data?.ship_to_state || '', ship_to_zip: data?.ship_to_zip || '',
    })
    setInvoicingForm({
      payment_instructions_payable_to: data?.payment_instructions_payable_to || '',
      payment_instructions_bank: data?.payment_instructions_bank || '',
      payment_instructions_routing: data?.payment_instructions_routing || '',
      payment_instructions_account: data?.payment_instructions_account || '',
      payment_instructions_zelle: data?.payment_instructions_zelle || '',
      payment_instructions_notes: data?.payment_instructions_notes || '',
    })
    if (data?.org_id) {
      const { data: ratesData } = await supabase.from('labor_rates').select('*').eq('org_id', data.org_id).order('sort_order', { ascending: true })
      setLaborRates(ratesData || [])
      const { data: orgSvc } = await supabase.from('organizations').select('trip_fee_default, drive_time_rate_default, service_billing_mode').eq('id', data.org_id).single()
      if (orgSvc) setOrgServiceSettings({ trip_fee_default: orgSvc.trip_fee_default || '', drive_time_rate_default: orgSvc.drive_time_rate_default || '', service_billing_mode: orgSvc.service_billing_mode || 'trip_fee' })
    }
    setEmailTemplates({
      early_days: data?.email_cadence_early ?? 30,
      early_subject: data?.email_template_early_subject || `Following up — {{proposalName}}`,
      early_body: data?.email_template_early_body || `Hi {{clientName}},\n\nI hope things are going well. I wanted to follow up on the proposal we sent over for {{proposalName}}.\n\nThe total investment for this project comes to {{proposalValue}}. We're excited about the opportunity to work with you and would love to answer any questions.\n\nIs there a good time this week to connect?\n\nLooking forward to hearing from you.\n\n{{repName}}\n{{companyName}}`,
      day14_days: data?.email_cadence_14day ?? 14,
      day14_subject: data?.email_template_14day_subject || `Quick check-in — {{proposalName}}`,
      day14_body: data?.email_template_14day_body || `Hi {{clientName}},\n\nJust wanted to check in on the proposal for {{proposalName}}.\n\n{{repName}}\n{{companyName}}`,
      day7_days: data?.email_cadence_7day ?? 7,
      day7_subject: data?.email_template_7day_subject || `One week left — {{proposalName}}`,
      day7_body: data?.email_template_7day_body || `Hi {{clientName}},\n\nWe're just one week away from the date we had targeted for {{proposalName}}.\n\n{{repName}}\n{{companyName}}`,
      close_subject: data?.email_template_close_subject || `Today's the day — {{proposalName}}`,
      close_body: data?.email_template_close_body || `Hi {{clientName}},\n\nToday is the date we had targeted to move forward on {{proposalName}}.\n\n{{repName}}\n{{companyName}}`,
      rfq_subject: data?.email_template_rfq_subject || `RFQ: {{proposalName}} — {{itemCount}} item(s)`,
      rfq_body: data?.email_template_rfq_body || `Hi {{contactName}},\n\nWe are requesting pricing on {{itemCount}} item(s) for project: {{proposalName}}. Please provide your best pricing at your earliest convenience.\n\nThank you for your time.\n\n{{repName}}\n{{companyName}}`,
      send_subject: data?.email_template_send_subject || `Proposal: {{proposalName}}`,
      send_body: data?.email_template_send_body || `Hi {{clientName}},\n\nPlease find your proposal attached. Don't hesitate to reach out with any questions.\n\nLooking forward to working with you.\n\n{{repName}}\n{{companyName}}`,
    })
    if (data?.org_id) {
      try {
        const { data: orgData } = await supabase.from('organizations').select('default_tax_rate, timezone, qbo_connected, qbo_company_name, feature_sla, sla_auto_attach, sla_templates, feature_monitoring, monitoring_auto_attach, monitoring_templates, square_connected, square_merchant_id, inbound_email_enabled, inbound_email_domain, inbound_email_verified, inbound_email_auto_reply, feature_regions, feature_msrp, doc_font, pdf_table_style').eq('id', data.org_id).single()
        setOrgTaxRate(orgData?.default_tax_rate ?? '')
        setOrgTimezone(orgData?.timezone || 'America/Chicago')
        setOrgId(data.org_id)
        setQboConnected(orgData?.qbo_connected || false); setQboCompanyName(orgData?.qbo_company_name || '')
        setSquareConnected(orgData?.square_connected || false); setSquareMerchantId(orgData?.square_merchant_id || '')
        setInboundEnabled(orgData?.inbound_email_enabled || false); setInboundDomain(orgData?.inbound_email_domain || '')
        setInboundVerified(orgData?.inbound_email_verified || false); setInboundAutoReply(orgData?.inbound_email_auto_reply || '')
        setGoogleConnected(data?.google_calendar_connected || false); setGoogleEmail(data?.google_email || '')
        setMicrosoftConnected(data?.microsoft_calendar_connected || false); setMicrosoftEmail(data?.microsoft_email || '')
        setRegionsEnabled(orgData?.feature_regions || false)
        setMsrpEnabled(orgData?.feature_msrp || false)
        setDocFont(orgData?.doc_font || 'helvetica')
        setPdfTableStyle(orgData?.pdf_table_style || 'striped')
        setSlaEnabled(orgData?.feature_sla || false); setSlaAutoAttach(orgData?.sla_auto_attach || false)
        setMonitoringEnabled(orgData?.feature_monitoring || false); setMonitoringAutoAttach(orgData?.monitoring_auto_attach || false)
        const savedSLA = orgData?.sla_templates || {}
        const mergedSLA = {}
        SLA_INDUSTRIES.forEach(ind => {
          const saved = savedSLA[ind]
          const defaults = SLA_TIER_DEFAULTS[ind] || { enabled: false, tiers: [] }
          if (!saved) { mergedSLA[ind] = defaults }
          else if (Array.isArray(saved.tiers)) { mergedSLA[ind] = saved }
          else {
            mergedSLA[ind] = {
              enabled: saved.enabled ?? defaults.enabled,
              tiers: [
                { id: 'migrated', name: saved.name || 'Service Agreement', response_time_hours: saved.response_time_hours || null, labor_rate: saved.labor_rate || 100, emergency_rate: saved.emergency_rate || null, billing_frequency: saved.billing_frequency || 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0, body: (saved.body || '').replace(/UPTIME:[^\n]*/g, '').trim() },
                ...defaults.tiers.slice(1),
              ]
            }
          }
        })
        setSlaTemplates(mergedSLA)
        const savedMon = orgData?.monitoring_templates || {}
        const mergedMon = {}
        MONITORING_INDUSTRIES.forEach(ind => { mergedMon[ind] = savedMon[ind] ? { ...MONITORING_DEFAULTS[ind], ...savedMon[ind] } : { ...(MONITORING_DEFAULTS[ind] || { enabled: false, name: `${ind} Monitoring`, monthly_fee: 49, monitored_systems: '', billing_frequency: 'Monthly', escalation_contacts: 2, body: '' }) } })
        setMonitoringTemplates(mergedMon)
      } catch (e) { /* ignore */ }
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploadingLogo(true)
    const { data: { user } } = await supabase.auth.getUser()
    const fileExt = file.name.split('.').pop()
    const orgIdVal = (await supabase.from('profiles').select('org_id').eq('id', user.id).single()).data?.org_id
    const r2Path = `${orgIdVal}/logos/${user.id}.${fileExt}`
    const { uploadToR2, getR2Url, BUCKETS } = await import('../r2')
    await uploadToR2(r2Path, file, file.type, BUCKETS.ASSETS)
    const url = await getR2Url(r2Path, 60 * 60 * 24 * 365, BUCKETS.ASSETS)
    await supabase.from('profiles').update({ logo_url: r2Path }).eq('id', user.id)
    setLogoUrl(url); setUploadingLogo(false); setSuccess('Logo uploaded successfully')
  }

  const handleSameAsShipTo = (checked) => {
    setSameAsShipTo(checked)
    if (checked) setForm(prev => ({ ...prev, bill_to_address: prev.ship_to_address, bill_to_city: prev.ship_to_city, bill_to_state: prev.ship_to_state, bill_to_zip: prev.ship_to_zip }))
  }

  const handleSave = async () => {
    setSaving(true); setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      full_name: form.full_name, company_name: form.company_name,
      phone: form.phone || null, job_title: form.job_title || null, license_number: form.license_number || null,
      default_markup_percent: parseFloat(form.default_markup_percent) || 35,
      followup_days: form.followup_days, terms_and_conditions: form.terms_and_conditions,
      primary_color: form.primary_color,
      bill_to_address: form.bill_to_address, bill_to_city: form.bill_to_city,
      bill_to_state: form.bill_to_state, bill_to_zip: form.bill_to_zip,
      ship_to_address: form.ship_to_address, ship_to_city: form.ship_to_city,
      ship_to_state: form.ship_to_state, ship_to_zip: form.ship_to_zip,
    }).eq('id', user.id)
    if (orgId) await supabase.from('organizations').update({ timezone: orgTimezone }).eq('id', orgId)
    setSuccess('Settings saved successfully'); setSaving(false)
  }

  const handleSaveTemplates = async () => {
    setSavingTemplates(true); setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      email_cadence_early: parseInt(emailTemplates.early_days) || 30,
      email_template_early_subject: emailTemplates.early_subject, email_template_early_body: emailTemplates.early_body,
      email_cadence_14day: parseInt(emailTemplates.day14_days) || 14,
      email_template_14day_subject: emailTemplates.day14_subject, email_template_14day_body: emailTemplates.day14_body,
      email_cadence_7day: parseInt(emailTemplates.day7_days) || 7,
      email_template_7day_subject: emailTemplates.day7_subject, email_template_7day_body: emailTemplates.day7_body,
      email_template_close_subject: emailTemplates.close_subject, email_template_close_body: emailTemplates.close_body,
      email_template_rfq_subject: emailTemplates.rfq_subject, email_template_rfq_body: emailTemplates.rfq_body,
      email_template_send_subject: emailTemplates.send_subject, email_template_send_body: emailTemplates.send_body,
      followup_days: `${emailTemplates.early_days},${emailTemplates.day14_days},${emailTemplates.day7_days},0`
    }).eq('id', user.id)
    setForm(prev => ({ ...prev, followup_days: `${emailTemplates.early_days},${emailTemplates.day14_days},${emailTemplates.day7_days},0` }))
    setSuccess('Email templates saved successfully'); setSavingTemplates(false)
  }

  const handleSaveInvoicing = async () => {
    setSavingInvoicing(true); setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      payment_instructions_payable_to: invoicingForm.payment_instructions_payable_to,
      payment_instructions_bank: invoicingForm.payment_instructions_bank,
      payment_instructions_routing: invoicingForm.payment_instructions_routing,
      payment_instructions_account: invoicingForm.payment_instructions_account,
      payment_instructions_zelle: invoicingForm.payment_instructions_zelle,
      payment_instructions_notes: invoicingForm.payment_instructions_notes,
    }).eq('id', user.id)
    setSuccess('Invoicing settings saved'); setSavingInvoicing(false)
  }

  const handleChangePassword = async () => {
    setPasswordError(null); setPasswordSuccess(null)
    if (!passwordForm.current) { setPasswordError('Please enter your current password'); return }
    if (!passwordForm.newPass || !passwordForm.confirm) { setPasswordError('Please fill in all fields'); return }
    if (passwordForm.newPass !== passwordForm.confirm) { setPasswordError('New passwords do not match'); return }
    if (passwordForm.newPass.length < 8) { setPasswordError('Password must be at least 8 characters'); return }
    setSavingPassword(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) { setPasswordError('No active session — please refresh and try again.'); return }

      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.newPass }),
      })
      const body = await res.json()
      if (!res.ok) { setPasswordError(body.error || 'Failed to update password'); return }
      setPasswordSuccess('Password updated successfully')
      setPasswordForm({ current: '', newPass: '', confirm: '' })
    } catch (err) {
      setPasswordError(String(err))
    } finally {
      setSavingPassword(false)
    }
  }

  const savePin = async () => {
    if (pinInput.length !== 6) return
    setSavingPin(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ support_pin: pinInput }).eq('id', user.id)
    setSupportPin(pinInput); setSavingPin(false); setPinSaved(true)
    setTimeout(() => setPinSaved(false), 2000)
  }

  const regeneratePin = async () => {
    const pin = String(Math.floor(100000 + Math.random() * 900000))
    setPinInput(pin); setSavingPin(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ support_pin: pin }).eq('id', user.id)
    setSupportPin(pin); setSavingPin(false); setPinSaved(true)
    setTimeout(() => setPinSaved(false), 2000)
  }

  const saveRateCard = async () => {
    setSavingRates(true)
    try {
      await supabase.from('labor_rates').delete().eq('org_id', profile.org_id)
      if (laborRates.length > 0) {
        await supabase.from('labor_rates').insert(laborRates.map((r, i) => ({
          org_id: profile.org_id, role: r.role,
          cost_per_hour: parseFloat(r.cost_per_hour) || 0, bill_rate_per_hour: parseFloat(r.bill_rate_per_hour) || 0,
          unit: r.unit || 'hr', sort_order: i
        })))
      }
      await supabase.from('organizations').update({
        trip_fee_default: parseFloat(orgServiceSettings.trip_fee_default) || 0,
        drive_time_rate_default: parseFloat(orgServiceSettings.drive_time_rate_default) || 0,
        service_billing_mode: orgServiceSettings.service_billing_mode,
        default_tax_rate: parseFloat(orgTaxRate) || null,
      }).eq('id', profile.org_id)
      setSuccess('Rate card saved.')
    } catch (err) { alert('Error saving rate card: ' + err.message) }
    setSavingRates(false)
  }

  const handleSaveSLA = async () => {
    setSavingSLA(true); setSuccess(null)
    await supabase.from('organizations').update({
      feature_regions: regionsEnabled,
      feature_msrp: msrpEnabled,
      feature_sla: slaEnabled, sla_auto_attach: slaAutoAttach, sla_templates: slaTemplates,
      feature_monitoring: monitoringEnabled, monitoring_auto_attach: monitoringAutoAttach, monitoring_templates: monitoringTemplates,
    }).eq('id', orgId)
    setSuccess('SLA & Monitoring settings saved'); setSavingSLA(false)
  }

  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('fp-theme') || 'dark')

  const applyTheme = (t) => {
    setCurrentTheme(t)
    localStorage.setItem('fp-theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  const inputClass = "w-full bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  const navGroups = [
    { items: [{ key: 'general', label: 'General' }] },
    ...(isAdmin && !featureDesignerOnly ? [{
      label: 'Admin',
      items: [
        { key: 'ratecard',     label: 'Rate Card' },
        { key: 'invoicing',    label: 'Invoicing' },
        { key: 'integrations', label: 'Integrations' },
        { key: 'email',        label: 'Email Templates' },
        { key: 'sla',          label: 'SLA & Contracts' },
        { key: 'data',         label: 'Data & Import' },
      ]
    }] : []),
    ...(isAdmin ? [{ items: [{ key: 'designer', label: 'Designer' }, { key: 'regions', label: 'Regions' }, { key: 'api', label: 'API' }] }] : []),
    ...(isDevTeam && !isAdmin ? [{
      label: 'Developer',
      items: [
        { key: 'api',     label: 'API Keys' },
        { key: 'catalog', label: 'Product Catalog' },
      ]
    }] : []),
    ...(featureDesignerOnly ? [{ label: 'Team', items: [{ key: 'team', label: 'Team' }] }] : []),
    { items: [{ key: 'feedback', label: 'Request a Feature' }] },
  ]

  return (
    <div className="flex min-h-screen bg-fp-bg">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />
      <div className="flex flex-1 min-w-0">
        {/* Settings nav */}
        <div className="w-52 border-r border-fp-border p-4 shrink-0">
          <p className="text-fp-text font-bold text-lg mb-5 px-3">Settings</p>
          <nav className="space-y-0.5">
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
                {group.label && (
                  <p className="text-fp-muted/60 text-xs font-semibold uppercase tracking-wider mb-1 px-3">{group.label}</p>
                )}
                {group.items.map(item => (
                  <button key={item.key}
                    onClick={() => { setActiveTab(item.key); setSuccess(null) }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === item.key
                        ? 'bg-fp-card text-fp-text font-medium border-l-2 border-fp-brand pl-[10px]'
                        : 'text-fp-muted hover:text-fp-text hover:bg-fp-card/50'
                    }`}>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 p-6 min-w-0 max-w-3xl">
          {success && <p className="text-green-400 text-sm mb-4">{success}</p>}

          {activeTab === 'general' && (
            <GeneralTab form={form} setForm={setForm} inputClass={inputClass} logoUrl={logoUrl} uploadingLogo={uploadingLogo} handleLogoUpload={handleLogoUpload}
              orgTimezone={orgTimezone} setOrgTimezone={setOrgTimezone}
              passwordForm={passwordForm} setPasswordForm={setPasswordForm} passwordError={passwordError} passwordSuccess={passwordSuccess}
              savingPassword={savingPassword} handleChangePassword={handleChangePassword}
              supportPin={supportPin} pinInput={pinInput} setPinInput={setPinInput} savingPin={savingPin} pinSaved={pinSaved} savePin={savePin} regeneratePin={regeneratePin}
              sameAsShipTo={sameAsShipTo} handleSameAsShipTo={handleSameAsShipTo} profile={profile} saving={saving} handleSave={handleSave}
              currentTheme={currentTheme} applyTheme={applyTheme}
              isAdmin={isAdmin} msrpEnabled={msrpEnabled}
              onToggleMsrp={async () => {
                const next = !msrpEnabled
                setMsrpEnabled(next)
                await supabase.from('organizations').update({ feature_msrp: next }).eq('id', orgId)
                refreshProfile()
              }}
              docFont={docFont}
              onChangeDocFont={async (font) => {
                setDocFont(font)
                await supabase.from('organizations').update({ doc_font: font }).eq('id', orgId)
              }}
              pdfTableStyle={pdfTableStyle}
              onChangePdfTableStyle={async () => {
                const next = pdfTableStyle === 'striped' ? 'plain' : 'striped'
                setPdfTableStyle(next)
                await supabase.from('organizations').update({ pdf_table_style: next }).eq('id', orgId)
              }} />
          )}

          {activeTab === 'invoicing' && isAdmin && (
            <InvoicingTab invoicingForm={invoicingForm} setInvoicingForm={setInvoicingForm} inputClass={inputClass} savingInvoicing={savingInvoicing} handleSaveInvoicing={handleSaveInvoicing} />
          )}

          {activeTab === 'integrations' && isAdmin && (
            <IntegrationsTab
              qboMessage={qboMessage} setQboMessage={setQboMessage} qboConnected={qboConnected} setQboConnected={setQboConnected} qboCompanyName={qboCompanyName} setQboCompanyName={setQboCompanyName} connectingQBO={connectingQBO} setConnectingQBO={setConnectingQBO}
              googleMessage={googleMessage} setGoogleMessage={setGoogleMessage} googleConnected={googleConnected} setGoogleConnected={setGoogleConnected} googleEmail={googleEmail} setGoogleEmail={setGoogleEmail} connectingGoogle={connectingGoogle} setConnectingGoogle={setConnectingGoogle}
              microsoftMessage={microsoftMessage} setMicrosoftMessage={setMicrosoftMessage} microsoftConnected={microsoftConnected} setMicrosoftConnected={setMicrosoftConnected} microsoftEmail={microsoftEmail} setMicrosoftEmail={setMicrosoftEmail} connectingMicrosoft={connectingMicrosoft} setConnectingMicrosoft={setConnectingMicrosoft}
              inboundMessage={inboundMessage} setInboundMessage={setInboundMessage} inboundEnabled={inboundEnabled} setInboundEnabled={setInboundEnabled} inboundDomain={inboundDomain} setInboundDomain={setInboundDomain} inboundVerified={inboundVerified} setInboundVerified={setInboundVerified}
              inboundAutoReply={inboundAutoReply} setInboundAutoReply={setInboundAutoReply} savingInbound={savingInbound} setSavingInbound={setSavingInbound} verifyingInbound={verifyingInbound} setVerifyingInbound={setVerifyingInbound}
              squareMessage={squareMessage} setSquareMessage={setSquareMessage} squareConnected={squareConnected} setSquareConnected={setSquareConnected} squareMerchantId={squareMerchantId} setSquareMerchantId={setSquareMerchantId} connectingSquare={connectingSquare} setConnectingSquare={setConnectingSquare}
              orgId={orgId} profile={profile} />
          )}

          {activeTab === 'sla' && isAdmin && (
            <SlaTab
              slaEnabled={slaEnabled} setSlaEnabled={setSlaEnabled} slaAutoAttach={slaAutoAttach} setSlaAutoAttach={setSlaAutoAttach}
              monitoringEnabled={monitoringEnabled} setMonitoringEnabled={setMonitoringEnabled} monitoringAutoAttach={monitoringAutoAttach} setMonitoringAutoAttach={setMonitoringAutoAttach}
              slaTemplates={slaTemplates} setSlaTemplates={setSlaTemplates} monitoringTemplates={monitoringTemplates} setMonitoringTemplates={setMonitoringTemplates}
              expandedSLAIndustry={expandedSLAIndustry} setExpandedSLAIndustry={setExpandedSLAIndustry}
              expandedSLATier={expandedSLATier} setExpandedSLATier={setExpandedSLATier}
              expandedMonIndustry={expandedMonIndustry} setExpandedMonIndustry={setExpandedMonIndustry}
              handleSaveSLA={handleSaveSLA} savingSLA={savingSLA} inputClass={inputClass} />
          )}

          {activeTab === 'ratecard' && isAdmin && (
            <RateCardTab laborRates={laborRates} setLaborRates={setLaborRates} form={form} setForm={setForm}
              orgServiceSettings={orgServiceSettings} setOrgServiceSettings={setOrgServiceSettings}
              orgTaxRate={orgTaxRate} setOrgTaxRate={setOrgTaxRate}
              savingRates={savingRates}
              onSave={async () => {
                await supabase.from('profiles').update({ default_markup_percent: parseFloat(form.default_markup_percent) || 35 }).eq('id', profile.id)
                await saveRateCard()
              }} />
          )}

          {activeTab === 'designer' && isAdmin && <DesignerTab />}

          {activeTab === 'regions' && isAdmin && <RegionsTab regionsEnabled={regionsEnabled} setRegionsEnabled={setRegionsEnabled} />}
          {activeTab === 'api' && (isAdmin || isDevTeam) && <ApiTab featureApi={featureApi} />}

          {activeTab === 'catalog' && isDevTeam && !isAdmin && (
            <div className="p-6">
              <h2 className="text-fp-text text-lg font-bold mb-1">Product Catalog</h2>
              <p className="text-fp-muted text-sm mb-6">Upload or manage your global product library used in embedded sessions.</p>
              <GlobalProductsImport />
            </div>
          )}

          {activeTab === 'data' && isAdmin && (
            <DataImportTab
              importType={importType} setImportType={setImportType}
              importFile={importFile} setImportFile={setImportFile}
              importPreview={importPreview} setImportPreview={setImportPreview}
              importHeaders={importHeaders} setImportHeaders={setImportHeaders}
              importing={importing} setImporting={setImporting}
              importResults={importResults} setImportResults={setImportResults}
              locationMatchType={locationMatchType} setLocationMatchType={setLocationMatchType}
              locationMatchClient={locationMatchClient} setLocationMatchClient={setLocationMatchClient}
              importClients={importClients} setImportClients={setImportClients}
              supabase={supabase} />
          )}

          {activeTab === 'email' && isAdmin && (
            <EmailTemplatesTab emailTemplates={emailTemplates} setEmailTemplates={setEmailTemplates}
              expandedStage={expandedStage} setExpandedStage={setExpandedStage}
              savingTemplates={savingTemplates} handleSaveTemplates={handleSaveTemplates} />
          )}

          {activeTab === 'team' && <TeamSettingsTab featureDesignerOnly={featureDesignerOnly} />}

          {activeTab === 'feedback' && <FeedbackTab profile={profile} />}
        </div>
      </div>
    </div>
  )
}

function FeedbackTab({ profile }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'feature' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!form.title.trim() || !profile?.org_id) return
    setSubmitting(true)
    await supabase.from('roadmap_items').insert({
      org_id:       profile.org_id,
      title:        form.title.trim(),
      description:  form.description.trim() || null,
      category:     form.category,
      status:       'backlog',
      requested_by: profile.id,
    })
    setSubmitting(false)
    setSubmitted(true)
    setForm({ title: '', description: '', category: 'feature' })
  }

  const inputClass = "w-full bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand placeholder-[#8A9AB0]"

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-fp-text font-bold text-xl mb-1">Request a Feature</h2>
        <p className="text-fp-muted text-sm">Have an idea or something you wish ForgePt could do? Let us know — we read every submission and use this to shape the product roadmap.</p>
      </div>

      {submitted ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-green-400 font-semibold text-sm">Request submitted — thank you!</p>
            <p className="text-fp-muted text-xs mt-0.5">We'll review it and update the roadmap accordingly.</p>
          </div>
          <button onClick={() => setSubmitted(false)} className="text-fp-muted hover:text-fp-text text-xs transition-colors flex-shrink-0">Submit another</button>
        </div>
      ) : (
        <div className="bg-fp-card border border-fp-border rounded-xl p-5 space-y-4">
          <div>
            <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide block mb-1">What do you need? *</label>
            <input type="text" placeholder="Short title for your request" value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide block mb-1">More Detail</label>
            <textarea rows={4} placeholder="Why would this help you or your customers?"
              value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className={`${inputClass} resize-none`} />
          </div>
          <div>
            <label className="text-fp-muted text-xs font-semibold uppercase tracking-wide block mb-1">Type</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              className="bg-fp-bg text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              <option value="feature">New Feature</option>
              <option value="improvement">Improvement to existing</option>
              <option value="bug_fix">Bug Fix</option>
              <option value="product">Product / Catalog</option>
            </select>
          </div>
          <button onClick={handleSubmit} disabled={submitting || !form.title.trim()}
            className="bg-fp-brand text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const SLA_INDUSTRIES = ['Security','Audio/Visual','IT / Networking','Low Voltage','Fire Protection','HVAC','Electrical','Telecom','Solar','Mechanical','Plumbing','General Contractor','Other']
const MONITORING_INDUSTRIES = ['Security','IT / Networking','Fire Protection','Low Voltage','Telecom','Audio/Visual','HVAC']

const _MAINT_BODY = 'This Preventive Maintenance Agreement is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will perform {{maintenanceCalls}} scheduled maintenance visit(s) per year including inspection, testing, and minor adjustments.\n\nBILLING: Initial fee of ${{initialFee}} billed with project. Recurring service billed at ${{recurringFee}} ({{billingFrequency}}).\n\nLABOR: Additional service calls billed at ${{laborRate}}/hr during standard business hours.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.'
const _STD_BODY = 'This Service Level Agreement is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nRESPONSE TIME: Provider guarantees a {{responseTime}} response time for all service requests.\n\nBILLING: Services billed {{billingFrequency}} at ${{laborRate}}/hr. Emergency/after-hours calls billed at ${{emergencyRate}}/hr.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.'
const _PRI_BODY = 'This Priority Service Level Agreement is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nRESPONSE TIME: Provider guarantees a {{responseTime}} priority response for all service requests.\n\nINCLUDED MAINTENANCE: {{maintenanceCalls}} included maintenance visit(s) per year. Recurring fee: ${{recurringFee}} ({{billingFrequency}}).\n\nBILLING: Labor at ${{laborRate}}/hr. Emergency calls at ${{emergencyRate}}/hr.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.'

const SLA_TIER_DEFAULTS = {
  'Security':           { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 110, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 199, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 4,    labor_rate: 125, emergency_rate: 175,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
    { id: 'priority',   name: 'Priority SLA',             response_time_hours: 2,    labor_rate: 125, emergency_rate: 155,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 1, initial_fee: 0, recurring_fee: 349, body: _PRI_BODY },
  ]},
  'Audio/Visual':       { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 100, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 149, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 8,    labor_rate: 115, emergency_rate: 165,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'IT / Networking':    { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 120, emergency_rate: null, billing_frequency: 'Monthly',   maintenance_calls_per_year: 4, initial_fee: 0, recurring_fee: 299, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 4,    labor_rate: 135, emergency_rate: 195,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
    { id: 'priority',   name: 'Priority SLA',             response_time_hours: 2,    labor_rate: 135, emergency_rate: 175,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 499, body: _PRI_BODY },
  ]},
  'Low Voltage':        { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 95,  emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 1, initial_fee: 0, recurring_fee: 149, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 8,    labor_rate: 110, emergency_rate: 155,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'Fire Protection':    { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 115, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 249, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 4,    labor_rate: 130, emergency_rate: 185,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
    { id: 'priority',   name: 'Priority SLA',             response_time_hours: 2,    labor_rate: 130, emergency_rate: 165,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 449, body: _PRI_BODY },
  ]},
  'HVAC':               { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 105, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 199, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 24,   labor_rate: 120, emergency_rate: 170,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'Electrical':         { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 110, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 1, initial_fee: 0, recurring_fee: 149, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 8,    labor_rate: 125, emergency_rate: 180,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'Telecom':            { enabled: true,  tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 105, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 199, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 4,    labor_rate: 120, emergency_rate: 170,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
    { id: 'priority',   name: 'Priority SLA',             response_time_hours: 2,    labor_rate: 120, emergency_rate: 150,  billing_frequency: 'Monthly',   maintenance_calls_per_year: 1, initial_fee: 0, recurring_fee: 399, body: _PRI_BODY },
  ]},
  'Solar':              { enabled: false, tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 95,  emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 149, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 24,   labor_rate: 110, emergency_rate: 155,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'Mechanical':         { enabled: false, tiers: [
    { id: 'maintenance', name: 'Preventive Maintenance',  response_time_hours: null, labor_rate: 100, emergency_rate: null, billing_frequency: 'Annually',  maintenance_calls_per_year: 2, initial_fee: 0, recurring_fee: 179, body: _MAINT_BODY },
    { id: 'standard',   name: 'Standard SLA',             response_time_hours: 24,   labor_rate: 115, emergency_rate: 165,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'Plumbing':           { enabled: false, tiers: [
    { id: 'standard',   name: 'Standard Service Agreement', response_time_hours: 24,  labor_rate: 110, emergency_rate: 160,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'General Contractor': { enabled: false, tiers: [
    { id: 'standard',   name: 'Standard Service Agreement', response_time_hours: 48,  labor_rate: 105, emergency_rate: 150,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
  'Other':              { enabled: false, tiers: [
    { id: 'standard',   name: 'Standard Service Agreement', response_time_hours: 24,  labor_rate: 100, emergency_rate: 150,  billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0,   body: _STD_BODY },
  ]},
}

const MONITORING_DEFAULTS = {
  'Security':        { enabled: true,  name: 'Security Monitoring Contract',   monthly_fee: 49,  monitored_systems: 'Cameras, Access Control, Intrusion Alarm',            billing_frequency: 'Monthly', escalation_contacts: 2, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide continuous monitoring of {{monitoredSystems}}.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contact(s) for alerts and dispatch authorization.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
  'IT / Networking': { enabled: true,  name: 'Network Monitoring Contract',    monthly_fee: 99,  monitored_systems: 'Network Infrastructure, Servers, Endpoints',            billing_frequency: 'Monthly', escalation_contacts: 2, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide 24/7 monitoring of {{monitoredSystems}} with proactive alerting for critical events.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contact(s) for alert notification and response.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
  'Fire Protection': { enabled: true,  name: 'Fire Alarm Monitoring Contract', monthly_fee: 35,  monitored_systems: 'Fire Alarms, Smoke Detectors, Suppression Systems',      billing_frequency: 'Monthly', escalation_contacts: 3, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide central station monitoring of {{monitoredSystems}} with immediate dispatch protocols.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contacts for alarm notification and dispatch.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
  'Low Voltage':     { enabled: true,  name: 'Systems Monitoring Contract',    monthly_fee: 45,  monitored_systems: 'Low Voltage Systems, Access Control, AV Equipment',     billing_frequency: 'Monthly', escalation_contacts: 2, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide remote monitoring of {{monitoredSystems}} with proactive issue identification.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contact(s) for notification and dispatch.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
  'Telecom':         { enabled: true,  name: 'Telecom Monitoring Contract',    monthly_fee: 75,  monitored_systems: 'Voice Systems, Data Infrastructure, Network Equipment', billing_frequency: 'Monthly', escalation_contacts: 2, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide continuous monitoring of {{monitoredSystems}} with alerting for outages and performance degradation.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contact(s) for notification.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
  'Audio/Visual':    { enabled: false, name: 'AV Systems Monitoring',          monthly_fee: 39,  monitored_systems: 'AV Systems, Displays, Control Systems',                  billing_frequency: 'Monthly', escalation_contacts: 1, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide remote monitoring of {{monitoredSystems}} with proactive alerts for system failures.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contact(s) for notification.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
  'HVAC':            { enabled: false, name: 'HVAC Monitoring Contract',       monthly_fee: 59,  monitored_systems: 'HVAC Units, Thermostats, Air Quality Sensors',           billing_frequency: 'Monthly', escalation_contacts: 1, body: 'This Monitoring Contract is between {{companyName}} ("Provider") and {{clientName}} ("Client") for {{proposalName}}.\n\nSERVICES: Provider will provide remote monitoring of {{monitoredSystems}} with alerts for performance issues.\n\nBILLING: Monitoring services billed at ${{monthlyFee}}/month, invoiced {{billingFrequency}}.\n\nESCALATION: Client shall designate {{escalationContacts}} authorized contact(s) for notification.\n\nTERM: One (1) year from execution, auto-renewing unless cancelled with 30-days written notice.\n\nClient Signature: ___________________________      Date: ___________' },
}

export default function Settings({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, featureSla = false, featureMonitoring = false, role, isSalesManager, isPM, isTechnician }) {
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('general')
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company_name: '',
    default_markup_percent: '35',
    followup_days: '30,14,7,0',
    terms_and_conditions: '',
    primary_color: '#0F1C2E',
    bill_to_address: '',
    bill_to_city: '',
    bill_to_state: '',
    bill_to_zip: '',
    ship_to_address: '',
    ship_to_city: '',
    ship_to_state: '',
    ship_to_zip: '',
  })
  const [emailTemplates, setEmailTemplates] = useState({
    early_days: 30,
    early_subject: '',
    early_body: '',
    day14_days: 14,
    day14_subject: '',
    day14_body: '',
    day7_days: 7,
    day7_subject: '',
    day7_body: '',
    close_subject: '',
    close_body: '',
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
  const [sameAsShipTo, setSameAsShipTo] = useState(false)
  const [expandedStage, setExpandedStage] = useState('early')
  const [orgTaxRate, setOrgTaxRate] = useState('')
  const [savingTaxRate, setSavingTaxRate] = useState(false)
  const [orgId, setOrgId] = useState(null)
  const [qboConnected, setQboConnected] = useState(false)
  const [qboCompanyName, setQboCompanyName] = useState('')
  const [connectingQBO, setConnectingQBO] = useState(false)
  const [qboMessage, setQboMessage] = useState(null)
  const [invoicingForm, setInvoicingForm] = useState({
    payment_instructions_payable_to: '',
    payment_instructions_bank: '',
    payment_instructions_routing: '',
    payment_instructions_account: '',
    payment_instructions_zelle: '',
    payment_instructions_notes: '',
  })
  const [savingInvoicing, setSavingInvoicing] = useState(false)
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

  useEffect(() => {
    fetchProfile()
    // Check for QBO OAuth callback result
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === 'integrations') setActiveTab('integrations')
    if (params.get('qbo_success')) setQboMessage({ type: 'success', text: 'QuickBooks connected successfully!' })
    if (params.get('qbo_error')) setQboMessage({ type: 'error', text: `QuickBooks connection failed: ${params.get('qbo_error')}` })
    if (params.get('square_success')) setSquareMessage({ type: 'success', text: 'Square connected successfully! You can now generate payment links on invoices.' })
    if (params.get('square_error')) setSquareMessage({ type: 'error', text: `Square connection failed: ${params.get('square_error')}` })
  }, [])

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
    setLogoUrl(data?.logo_url || null)
    setForm({
      full_name: data?.full_name || '',
      email: data?.email || '',
      company_name: data?.company_name || '',
      default_markup_percent: data?.default_markup_percent || '35',
      followup_days: data?.followup_days || '30,14,7,0',
      terms_and_conditions: data?.terms_and_conditions || '',
      primary_color: data?.primary_color || '#0F1C2E',
      bill_to_address: data?.bill_to_address || '',
      bill_to_city: data?.bill_to_city || '',
      bill_to_state: data?.bill_to_state || '',
      bill_to_zip: data?.bill_to_zip || '',
      ship_to_address: data?.ship_to_address || '',
      ship_to_city: data?.ship_to_city || '',
      ship_to_state: data?.ship_to_state || '',
      ship_to_zip: data?.ship_to_zip || '',
    })
    setInvoicingForm({
      payment_instructions_payable_to: data?.payment_instructions_payable_to || '',
      payment_instructions_bank: data?.payment_instructions_bank || '',
      payment_instructions_routing: data?.payment_instructions_routing || '',
      payment_instructions_account: data?.payment_instructions_account || '',
      payment_instructions_zelle: data?.payment_instructions_zelle || '',
      payment_instructions_notes: data?.payment_instructions_notes || '',
    })
    setEmailTemplates({
      early_days: data?.email_cadence_early ?? 30,
      early_subject: data?.email_template_early_subject || `Following up — {{proposalName}}`,
      early_body: data?.email_template_early_body || `Hi {{clientName}},\n\nI hope things are going well. I wanted to follow up on the proposal we sent over for {{proposalName}}.\n\nThe total investment for this project comes to {{proposalValue}}. We're excited about the opportunity to work with you and would love to answer any questions.\n\nIs there a good time this week to connect?\n\nLooking forward to hearing from you.\n\n{{repName}}\n{{companyName}}`,
      day14_days: data?.email_cadence_14day ?? 14,
      day14_subject: data?.email_template_14day_subject || `Quick check-in — {{proposalName}}`,
      day14_body: data?.email_template_14day_body || `Hi {{clientName}},\n\nJust wanted to check in on the proposal for {{proposalName}}. We're getting close to the date we discussed and I want to make sure we have everything lined up.\n\nIf you have any questions about the scope of work or pricing, I'm happy to jump on a quick call.\n\nLet me know if there is anything I can do to move things forward.\n\n{{repName}}\n{{companyName}}`,
      day7_days: data?.email_cadence_7day ?? 7,
      day7_subject: data?.email_template_7day_subject || `One week left — {{proposalName}}`,
      day7_body: data?.email_template_7day_body || `Hi {{clientName}},\n\nWe're just one week away from the date we had targeted for {{proposalName}}. I wanted to reach out and make sure you have everything you need to make a decision.\n\nWe're ready to move forward on our end whenever you are.\n\n{{repName}}\n{{companyName}}`,
      close_subject: data?.email_template_close_subject || `Today's the day — {{proposalName}}`,
      close_body: data?.email_template_close_body || `Hi {{clientName}},\n\nToday is the date we had targeted to move forward on {{proposalName}}. I wanted to reach out personally to see where things stand.\n\nWe have everything ready on our end and are excited to get started. If now is not the right time, no pressure — I just want to make sure we stay in touch.\n\n{{repName}}\n{{companyName}}`,
    })

    // Fetch org data (tax rate + QBO status)
    if (data?.org_id) {
      try {
        const { data: orgData } = await supabase.from('organizations').select('default_tax_rate, qbo_connected, qbo_company_name, feature_sla, sla_auto_attach, sla_templates, feature_monitoring, monitoring_auto_attach, monitoring_templates, square_connected, square_merchant_id').eq('id', data.org_id).single()
        setOrgTaxRate(orgData?.default_tax_rate ?? '')
        setOrgId(data.org_id)
        setQboConnected(orgData?.qbo_connected || false)
        setQboCompanyName(orgData?.qbo_company_name || '')
        setSquareConnected(orgData?.square_connected || false)
        setSquareMerchantId(orgData?.square_merchant_id || '')
        setSlaEnabled(orgData?.feature_sla || false)
        setSlaAutoAttach(orgData?.sla_auto_attach || false)
        setMonitoringEnabled(orgData?.feature_monitoring || false)
        setMonitoringAutoAttach(orgData?.monitoring_auto_attach || false)
        const savedSLA = orgData?.sla_templates || {}
        const mergedSLA = {}
        SLA_INDUSTRIES.forEach(ind => {
          const saved = savedSLA[ind]
          const defaults = SLA_TIER_DEFAULTS[ind] || { enabled: false, tiers: [] }
          if (!saved) {
            mergedSLA[ind] = defaults
          } else if (Array.isArray(saved.tiers)) {
            mergedSLA[ind] = saved
          } else {
            // Migrate old flat format → single migrated tier + rest of defaults
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
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    const { data: { user } } = await supabase.auth.getUser()
    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}.${fileExt}`
    const { error: uploadError } = await supabase.storage.from('Logos').upload(fileName, file, { upsert: true })
    if (uploadError) { alert('Error uploading logo: ' + uploadError.message); setUploadingLogo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('Logos').getPublicUrl(fileName)
    await supabase.from('profiles').update({ logo_url: publicUrl }).eq('id', user.id)
    setLogoUrl(publicUrl)
    setUploadingLogo(false)
    setSuccess('Logo uploaded successfully')
  }

  const handleSameAsShipTo = (checked) => {
    setSameAsShipTo(checked)
    if (checked) {
      setForm(prev => ({
        ...prev,
        bill_to_address: prev.ship_to_address,
        bill_to_city: prev.ship_to_city,
        bill_to_state: prev.ship_to_state,
        bill_to_zip: prev.ship_to_zip,
      }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      full_name: form.full_name,
      company_name: form.company_name,
      default_markup_percent: parseFloat(form.default_markup_percent) || 35,
      followup_days: form.followup_days,
      terms_and_conditions: form.terms_and_conditions,
      primary_color: form.primary_color,
      bill_to_address: form.bill_to_address,
      bill_to_city: form.bill_to_city,
      bill_to_state: form.bill_to_state,
      bill_to_zip: form.bill_to_zip,
      ship_to_address: form.ship_to_address,
      ship_to_city: form.ship_to_city,
      ship_to_state: form.ship_to_state,
      ship_to_zip: form.ship_to_zip,
    }).eq('id', user.id)
    if (orgId) {
      await supabase.from('organizations').update({ default_tax_rate: parseFloat(orgTaxRate) || null }).eq('id', orgId)
    }
    setSuccess('Settings saved successfully')
    setSaving(false)
  }

  const handleSaveTemplates = async () => {
    setSavingTemplates(true)
    setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      email_cadence_early: parseInt(emailTemplates.early_days) || 30,
      email_template_early_subject: emailTemplates.early_subject,
      email_template_early_body: emailTemplates.early_body,
      email_cadence_14day: parseInt(emailTemplates.day14_days) || 14,
      email_template_14day_subject: emailTemplates.day14_subject,
      email_template_14day_body: emailTemplates.day14_body,
      email_cadence_7day: parseInt(emailTemplates.day7_days) || 7,
      email_template_7day_subject: emailTemplates.day7_subject,
      email_template_7day_body: emailTemplates.day7_body,
      email_template_close_subject: emailTemplates.close_subject,
      email_template_close_body: emailTemplates.close_body,
      // Keep followup_days in sync
      followup_days: `${emailTemplates.early_days},${emailTemplates.day14_days},${emailTemplates.day7_days},0`
    }).eq('id', user.id)
    const syncedFollowupDays = `${emailTemplates.early_days},${emailTemplates.day14_days},${emailTemplates.day7_days},0`
    setForm(prev => ({ ...prev, followup_days: syncedFollowupDays }))
    setSuccess('Email templates saved successfully')
    setSavingTemplates(false)
  }

  const handleSaveInvoicing = async () => {
    setSavingInvoicing(true)
    setSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      payment_instructions_payable_to: invoicingForm.payment_instructions_payable_to,
      payment_instructions_bank: invoicingForm.payment_instructions_bank,
      payment_instructions_routing: invoicingForm.payment_instructions_routing,
      payment_instructions_account: invoicingForm.payment_instructions_account,
      payment_instructions_zelle: invoicingForm.payment_instructions_zelle,
      payment_instructions_notes: invoicingForm.payment_instructions_notes,
    }).eq('id', user.id)
    setSuccess('Invoicing settings saved')
    setSavingInvoicing(false)
  }

  const handleChangePassword = async () => {
    setPasswordError(null)
    setPasswordSuccess(null)
    if (!passwordForm.newPass || !passwordForm.confirm) { setPasswordError('Please fill in all fields'); return }
    if (passwordForm.newPass !== passwordForm.confirm) { setPasswordError('New passwords do not match'); return }
    if (passwordForm.newPass.length < 8) { setPasswordError('Password must be at least 8 characters'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass })
    if (error) { setPasswordError(error.message); setSavingPassword(false); return }
    setPasswordSuccess('Password updated successfully')
    setPasswordForm({ current: '', newPass: '', confirm: '' })
    setSavingPassword(false)
  }

  const connectSquare = async () => {
    setConnectingSquare(true); setSquareMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profileData?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/square-oauth-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE` },
        body: JSON.stringify({ org_id: profileData.org_id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setSquareMessage({ type: 'error', text: data.error || 'Could not start Square connection.' })
    } catch (err) { setSquareMessage({ type: 'error', text: err.message }) }
    setConnectingSquare(false)
  }

  const disconnectSquare = async () => {
    if (!window.confirm('Disconnect Square? Existing payment links will still work, but you won\'t be able to create new ones.')) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    await supabase.from('organizations').update({
      square_connected: false, square_access_token: null, square_refresh_token: null,
      square_merchant_id: null, square_location_id: null,
    }).eq('id', profileData.org_id)
    setSquareConnected(false); setSquareMerchantId('')
    setSquareMessage({ type: 'success', text: 'Square disconnected.' })
  }

  const addSLATier = (ind) => {
    const newTier = { id: crypto.randomUUID(), name: 'New Tier', response_time_hours: 8, labor_rate: 100, emergency_rate: 150, billing_frequency: 'Quarterly', maintenance_calls_per_year: 0, initial_fee: 0, recurring_fee: 0, body: _STD_BODY }
    setSlaTemplates(p => ({ ...p, [ind]: { ...p[ind], tiers: [...(p[ind]?.tiers || []), newTier] } }))
    setExpandedSLATier(p => ({ ...p, [ind]: newTier.id }))
  }

  const removeSLATier = (ind, tierId) => {
    if (!window.confirm('Remove this tier?')) return
    setSlaTemplates(p => ({ ...p, [ind]: { ...p[ind], tiers: (p[ind]?.tiers || []).filter(t => t.id !== tierId) } }))
    setExpandedSLATier(p => ({ ...p, [ind]: null }))
  }

  const updateSLATier = (ind, tierId, field, value) => {
    setSlaTemplates(p => ({ ...p, [ind]: { ...p[ind], tiers: (p[ind]?.tiers || []).map(t => t.id === tierId ? { ...t, [field]: value } : t) } }))
  }

  const handleSaveSLA = async () => {
    setSavingSLA(true)
    setSuccess(null)
    await supabase.from('organizations').update({
      feature_sla: slaEnabled,
      sla_auto_attach: slaAutoAttach,
      sla_templates: slaTemplates,
      feature_monitoring: monitoringEnabled,
      monitoring_auto_attach: monitoringAutoAttach,
      monitoring_templates: monitoringTemplates,
    }).eq('id', orgId)
    setSuccess('SLA & Monitoring settings saved')
    setSavingSLA(false)
  }

  const insertVariable = (stageKey, field, variable) => {
    const key = `${stageKey}_${field}`
    setEmailTemplates(prev => ({ ...prev, [key]: (prev[key] || '') + variable }))
  }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
  const variables = ['{{clientName}}', '{{proposalName}}', '{{proposalValue}}', '{{companyName}}', '{{repName}}']

  const stages = [
    { key: 'early', label: 'Early Follow-up', daysKey: 'early_days', subjectKey: 'early_subject', bodyKey: 'early_body', color: 'text-blue-400', desc: 'Sent when the proposal is furthest from close date' },
    { key: 'day14', label: '14-Day Follow-up', daysKey: 'day14_days', subjectKey: 'day14_subject', bodyKey: 'day14_body', color: 'text-yellow-400', desc: 'Mid-range check-in' },
    { key: 'day7', label: '7-Day Follow-up', daysKey: 'day7_days', subjectKey: 'day7_subject', bodyKey: 'day7_body', color: 'text-orange-400', desc: 'Urgency ramp-up as close date approaches' },
    { key: 'close', label: 'Close Date Email', daysKey: null, subjectKey: 'close_subject', bodyKey: 'close_body', color: 'text-red-400', desc: 'Sent on the close date itself' },
  ]

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} role={role} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 max-w-4xl">
        <h2 className="text-white text-2xl font-bold mb-6">Settings</h2>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'general', label: 'General' },
            ...(isAdmin ? [{ key: 'integrations', label: 'Integrations' }] : []),
            ...(isAdmin ? [{ key: 'email', label: 'Email Templates' }] : []),
            ...(isAdmin ? [{ key: 'invoicing', label: 'Invoicing' }] : []),
            ...(isAdmin ? [{ key: 'sla', label: 'SLA & Contracts' }] : []),
          ].map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSuccess(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {success && <p className="text-green-400 text-sm mb-4">{success}</p>}

        {/* ── GENERAL TAB ── */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Profile */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-4">Profile</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
                  <input type="text" value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                  <input type="text" value={form.email} disabled className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
                  <input type="text" value={profile?.role || ''} disabled className="w-full bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] rounded-lg px-3 py-2 text-sm cursor-not-allowed" />
                </div>
              </div>
            </div>

            {/* Change Password */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-4">Change Password</h3>
              {passwordError && <p className="text-red-400 text-sm mb-4">{passwordError}</p>}
              {passwordSuccess && <p className="text-green-400 text-sm mb-4">{passwordSuccess}</p>}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">New Password</label>
                  <input type="password" value={passwordForm.newPass} onChange={e => setPasswordForm(prev => ({ ...prev, newPass: e.target.value }))} placeholder="••••••••" className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Confirm New Password</label>
                  <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))} placeholder="••••••••" className={inputClass} />
                </div>
              </div>
              <button onClick={handleChangePassword} disabled={savingPassword || !passwordForm.newPass || !passwordForm.confirm}
                className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>

            {/* Proposal Branding */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-1">Proposal Branding</h3>
              <p className="text-[#8A9AB0] text-sm mb-4">Appears on all PDF proposals and purchase orders.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Company Name</label>
                  <input type="text" value={form.company_name} onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))} placeholder="Your company name" className={inputClass} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Company Logo</label>
                  {logoUrl && <div className="mb-3"><img src={logoUrl} alt="Company logo" className="h-16 object-contain bg-white rounded-lg p-2" /></div>}
                  <label className="cursor-pointer">
                    <div className="bg-[#0F1C2E] border border-dashed border-[#2a3d55] rounded-lg px-4 py-3 text-sm text-[#8A9AB0] hover:border-[#C8622A] transition-colors inline-block">
                      {uploadingLogo ? 'Uploading...' : logoUrl ? '↑ Replace Logo' : '↑ Upload Logo'}
                    </div>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  <p className="text-[#8A9AB0] text-xs mt-1">PNG or JPG recommended.</p>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Default Markup %</label>
                  <input type="number" value={form.default_markup_percent} onChange={e => setForm(prev => ({ ...prev, default_markup_percent: e.target.value }))} className="w-40 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Default Tax Rate %</label>
                  <input type="number" step="0.01" placeholder="e.g. 8.5" value={orgTaxRate} onChange={e => setOrgTaxRate(e.target.value)} className="w-40 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                  <p className="text-[#8A9AB0] text-xs mt-1">Applied as default to new proposals.</p>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Brand Color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-12 h-10 rounded cursor-pointer border border-[#2a3d55] bg-transparent" />
                    <input type="text" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-32 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                  </div>
                  <p className="text-[#8A9AB0] text-xs mt-1">Used in PDF proposals and purchase orders.</p>
                </div>
              </div>
            </div>

            {/* Bill To / Ship To */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-1">Bill To / Ship To</h3>
              <p className="text-[#8A9AB0] text-sm mb-5">Your company's addresses printed on every purchase order.</p>
              <div className="space-y-5">
                <div>
                  <h4 className="text-white text-sm font-semibold mb-3">Ship To</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                      <input type="text" value={form.ship_to_address} onChange={e => setForm(prev => ({ ...prev, ship_to_address: e.target.value }))} placeholder="123 Main St" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="text-[#8A9AB0] text-xs mb-1 block">City</label><input type="text" value={form.ship_to_city} onChange={e => setForm(prev => ({ ...prev, ship_to_city: e.target.value }))} placeholder="Nashville" className={inputClass} /></div>
                      <div><label className="text-[#8A9AB0] text-xs mb-1 block">State</label><input type="text" value={form.ship_to_state} onChange={e => setForm(prev => ({ ...prev, ship_to_state: e.target.value }))} placeholder="TN" className={inputClass} /></div>
                      <div><label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label><input type="text" value={form.ship_to_zip} onChange={e => setForm(prev => ({ ...prev, ship_to_zip: e.target.value }))} placeholder="37201" className={inputClass} /></div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white text-sm font-semibold">Bill To</h4>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={sameAsShipTo} onChange={e => handleSameAsShipTo(e.target.checked)} className="accent-[#C8622A]" />
                      <span className="text-[#8A9AB0] text-xs">Same as Ship To</span>
                    </label>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[#8A9AB0] text-xs mb-1 block">Street Address</label>
                      <input type="text" value={form.bill_to_address} onChange={e => setForm(prev => ({ ...prev, bill_to_address: e.target.value }))} placeholder="123 Main St" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="text-[#8A9AB0] text-xs mb-1 block">City</label><input type="text" value={form.bill_to_city} onChange={e => setForm(prev => ({ ...prev, bill_to_city: e.target.value }))} placeholder="Nashville" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                      <div><label className="text-[#8A9AB0] text-xs mb-1 block">State</label><input type="text" value={form.bill_to_state} onChange={e => setForm(prev => ({ ...prev, bill_to_state: e.target.value }))} placeholder="TN" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                      <div><label className="text-[#8A9AB0] text-xs mb-1 block">ZIP</label><input type="text" value={form.bill_to_zip} onChange={e => setForm(prev => ({ ...prev, bill_to_zip: e.target.value }))} placeholder="37201" disabled={sameAsShipTo} className={`${inputClass} ${sameAsShipTo ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-1">Terms and Conditions</h3>
              <p className="text-[#8A9AB0] text-sm mb-4">Appears at the bottom of every PDF proposal.</p>
              <textarea value={form.terms_and_conditions} onChange={e => setForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))} placeholder="Enter your standard terms and conditions here..." rows={8} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
            </div>

            <button onClick={handleSave} disabled={saving} className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}

        {/* ── INVOICING TAB ── */}
        {activeTab === 'invoicing' && isAdmin && (
          <div className="space-y-6">
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold mb-1">Payment Instructions</h3>
              <p className="text-[#8A9AB0] text-sm mb-5">These appear on every invoice PDF so clients know how to pay you.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Make Checks Payable To</label>
                  <input type="text" value={invoicingForm.payment_instructions_payable_to}
                    onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_payable_to: e.target.value }))}
                    placeholder="Your company legal name" className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Bank Name</label>
                    <input type="text" value={invoicingForm.payment_instructions_bank}
                      onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_bank: e.target.value }))}
                      placeholder="e.g. First National Bank" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Zelle / Venmo</label>
                    <input type="text" value={invoicingForm.payment_instructions_zelle}
                      onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_zelle: e.target.value }))}
                      placeholder="email or phone number" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Routing Number</label>
                    <input type="text" value={invoicingForm.payment_instructions_routing}
                      onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_routing: e.target.value }))}
                      placeholder="Optional" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Account Number</label>
                    <input type="text" value={invoicingForm.payment_instructions_account}
                      onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_account: e.target.value }))}
                      placeholder="Optional" className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Additional Notes</label>
                  <textarea value={invoicingForm.payment_instructions_notes}
                    onChange={e => setInvoicingForm(p => ({ ...p, payment_instructions_notes: e.target.value }))}
                    rows={3} placeholder="e.g. Net 30 terms. Late payments subject to 1.5% monthly finance charge."
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
                </div>
              </div>
            </div>
            <button onClick={handleSaveInvoicing} disabled={savingInvoicing}
              className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingInvoicing ? 'Saving...' : 'Save Invoicing Settings'}
            </button>
          </div>
        )}

        {/* ── INTEGRATIONS TAB ── */}
        {activeTab === 'integrations' && isAdmin && (
          <div className="space-y-4">
            {qboMessage && (
              <div className={`rounded-xl px-5 py-4 text-sm font-medium ${qboMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {qboMessage.text}
              </div>
            )}

            {/* QuickBooks */}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#2CA01C]/10 rounded-xl flex items-center justify-center text-2xl">🟢</div>
                  <div>
                    <h3 className="text-white font-bold">QuickBooks Online</h3>
                    <p className="text-[#8A9AB0] text-sm mt-0.5">Sync won proposals directly to QBO as invoices. Customers are created automatically.</p>
                    {qboConnected && qboCompanyName && (
                      <p className="text-green-400 text-xs mt-1">✓ Connected to <span className="font-semibold">{qboCompanyName}</span></p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {qboConnected ? (
                    <div className="flex items-center gap-3">
                      <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1 rounded-full">✓ Connected</span>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Disconnect QuickBooks?')) return
                          const { data: { user } } = await supabase.auth.getUser()
                          const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
                          await supabase.from('organizations').update({
                            qbo_connected: false, qbo_access_token: null, qbo_refresh_token: null,
                            qbo_realm_id: null, qbo_company_name: null
                          }).eq('id', profileData.org_id)
                          setQboConnected(false)
                          setQboCompanyName('')
                          setQboMessage({ type: 'success', text: 'QuickBooks disconnected.' })
                        }}
                        className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors"
                      >Disconnect</button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setConnectingQBO(true)
                        setQboMessage(null)
                        try {
                          const { data: { user } } = await supabase.auth.getUser()
                          const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
                          if (!profileData?.org_id) throw new Error('Could not find your organization.')
                          const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/qbo-oauth-start', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ org_id: profileData.org_id })
                          })
                          const data = await res.json()
                          if (data.url) window.location.href = data.url
                          else setQboMessage({ type: 'error', text: data.error || 'Could not start QuickBooks connection.' })
                        } catch (err) {
                          setQboMessage({ type: 'error', text: err.message })
                        }
                        setConnectingQBO(false)
                      }}
                      disabled={connectingQBO}
                      className="bg-[#2CA01C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#259018] transition-colors disabled:opacity-50"
                    >
                      {connectingQBO ? 'Connecting...' : 'Connect QuickBooks'}
                    </button>
                  )}
                </div>
              </div>
              {qboConnected && (
                <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">What syncs</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#8A9AB0]">
                    <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Won proposals → QBO Invoice</div>
                    <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Line items with descriptions</div>
                    <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Labor line items</div>
                    <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Sales tax if applicable</div>
                    <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Auto-create customer if new</div>
                    <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Quote number → Invoice #</div>
                  </div>
                </div>
              )}
            </div>

            {/* Google — Coming Soon */}
            <div className="bg-[#1a2d45] rounded-xl p-6 opacity-60">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-2xl">📅</div>
                  <div>
                    <h3 className="text-white font-bold">Google Calendar & Meet</h3>
                    <p className="text-[#8A9AB0] text-sm mt-0.5">Auto-create calendar events and Meet links when proposals are Won.</p>
                  </div>
                </div>
                <span className="bg-[#2a3d55] text-[#8A9AB0] text-xs font-semibold px-3 py-1 rounded-full">Coming Soon</span>
              </div>
            </div>

            {/* Microsoft — Coming Soon */}
            <div className="bg-[#1a2d45] rounded-xl p-6 opacity-60">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center text-2xl">🗓</div>
                  <div>
                    <h3 className="text-white font-bold">Microsoft Outlook & Teams</h3>
                    <p className="text-[#8A9AB0] text-sm mt-0.5">Sync proposals to Outlook calendar and create Teams meetings automatically.</p>
                  </div>
                </div>
                <span className="bg-[#2a3d55] text-[#8A9AB0] text-xs font-semibold px-3 py-1 rounded-full">Coming Soon</span>
              </div>
            </div>

            {squareMessage && (
              <div className={`rounded-xl px-5 py-4 text-sm font-medium ${squareMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {squareMessage.text}
              </div>
            )}
            <div className="bg-[#1a2d45] rounded-xl p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#3E4348]/30 rounded-xl flex items-center justify-center text-2xl">💳</div>
                  <div>
                    <h3 className="text-white font-bold">Square Payments</h3>
                    <p className="text-[#8A9AB0] text-sm mt-0.5">Generate Square payment links on invoices so clients can pay by card or ACH online.</p>
                    {squareConnected && squareMerchantId && <p className="text-green-400 text-xs mt-1">✓ Connected · Merchant <span className="font-semibold font-mono">{squareMerchantId}</span></p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {squareConnected ? (
                    <div className="flex items-center gap-3">
                      <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1 rounded-full">✓ Connected</span>
                      <button onClick={disconnectSquare} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Disconnect</button>
                    </div>
                  ) : (
                    <button onClick={connectSquare} disabled={connectingSquare}
                      className="bg-[#3E4348] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#4E5358] transition-colors disabled:opacity-50">
                      {connectingSquare ? 'Connecting...' : 'Connect Square'}
                    </button>
                  )}
                </div>
              </div>
              {squareConnected ? (
                <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">What syncs</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#8A9AB0]">
                    {['Invoice → Square Invoice','Line items + tax','Payment link on invoice detail','Auto-create customer in Square','Card + ACH accepted','Due date synced'].map(t => (
                      <div key={t} className="flex items-center gap-2"><span className="text-green-400">✓</span> {t}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                  <p className="text-[#8A9AB0] text-xs">You'll be redirected to Square to authorize ForgePt. to create invoices and accept payments on your behalf.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SLA & CONTRACTS TAB ── */}
        {activeTab === 'sla' && isAdmin && (
          <div className="space-y-6">

            {/* Feature Toggles */}
            <div className="bg-[#1a2d45] rounded-xl p-6 space-y-5">
              <h3 className="text-white font-bold">Feature Settings</h3>

              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white text-sm font-semibold">Enable SLA Contracts</p>
                  <p className="text-[#8A9AB0] text-xs mt-0.5">Show a Service Level Agreement section on proposals and allow templates per industry.</p>
                </div>
                <button onClick={() => setSlaEnabled(p => !p)}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${slaEnabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${slaEnabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {slaEnabled && (
                <div className="flex items-start justify-between pl-4 border-l-2 border-[#C8622A]/30">
                  <div>
                    <p className="text-white text-sm font-semibold">Auto-attach SLA to New Proposals</p>
                    <p className="text-[#8A9AB0] text-xs mt-0.5">When a proposal is opened, automatically attach the matching industry SLA template if one exists.</p>
                  </div>
                  <button onClick={() => setSlaAutoAttach(p => !p)}
                    className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${slaAutoAttach ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${slaAutoAttach ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              )}

              <div className="border-t border-[#2a3d55] pt-5 flex items-start justify-between">
                <div>
                  <p className="text-white text-sm font-semibold">Enable Monitoring Contracts</p>
                  <p className="text-[#8A9AB0] text-xs mt-0.5">Show a separate Monitoring Contract section on proposals. Disable for industries that don't use monitoring (roofing, painting, etc.).</p>
                </div>
                <button onClick={() => setMonitoringEnabled(p => !p)}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${monitoringEnabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${monitoringEnabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {monitoringEnabled && (
                <div className="flex items-start justify-between pl-4 border-l-2 border-[#C8622A]/30">
                  <div>
                    <p className="text-white text-sm font-semibold">Auto-attach Monitoring to New Proposals</p>
                    <p className="text-[#8A9AB0] text-xs mt-0.5">Automatically attach the matching monitoring contract template when a proposal is opened.</p>
                  </div>
                  <button onClick={() => setMonitoringAutoAttach(p => !p)}
                    className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${monitoringAutoAttach ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${monitoringAutoAttach ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              )}
            </div>

            {/* SLA Templates */}
            {slaEnabled && (
              <div>
                <div className="mb-3">
                  <h3 className="text-white font-bold">SLA Tiers by Industry</h3>
                  <p className="text-[#8A9AB0] text-sm mt-1">Each industry can have multiple tiers (e.g. Maintenance, Standard, Priority). Variables: <span className="font-mono text-[#C8622A] text-xs">{'{{clientName}} {{companyName}} {{proposalName}} {{responseTime}} {{tierName}} {{billingFrequency}} {{laborRate}} {{emergencyRate}} {{maintenanceCalls}} {{initialFee}} {{recurringFee}}'}</span></p>
                </div>
                <div className="space-y-2">
                  {SLA_INDUSTRIES.map(ind => {
                    const t = slaTemplates[ind] || { enabled: false, tiers: [] }
                    const tiers = t.tiers || []
                    const isOpen = expandedSLAIndustry === ind
                    return (
                      <div key={ind} className="bg-[#1a2d45] rounded-xl overflow-hidden border border-[#2a3d55]">
                        {/* Industry header */}
                        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#1f3550] transition-colors"
                          onClick={() => setExpandedSLAIndustry(isOpen ? null : ind)}>
                          <div className="flex items-center gap-3">
                            <button onClick={e => { e.stopPropagation(); setSlaTemplates(prev => ({ ...prev, [ind]: { ...prev[ind], enabled: !prev[ind]?.enabled } })) }}
                              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${t.enabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${t.enabled ? 'left-5' : 'left-0.5'}`} />
                            </button>
                            <div>
                              <p className="text-white text-sm font-semibold">{ind}</p>
                              <p className="text-[#8A9AB0] text-xs">{tiers.length} tier{tiers.length !== 1 ? 's' : ''}{tiers.length > 0 ? ` · ${tiers.map(t => t.name).join(', ')}` : ''}</p>
                            </div>
                          </div>
                          <span className="text-[#8A9AB0] text-xs">{isOpen ? '▲' : '▼'}</span>
                        </div>

                        {/* Tier list */}
                        {isOpen && (
                          <div className="border-t border-[#2a3d55] p-4 space-y-2">
                            {tiers.map(tier => {
                              const isTierOpen = expandedSLATier[ind] === tier.id
                              return (
                                <div key={tier.id} className="bg-[#0F1C2E] rounded-lg overflow-hidden">
                                  {/* Tier row */}
                                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#0a1828] transition-colors"
                                    onClick={() => setExpandedSLATier(p => ({ ...p, [ind]: isTierOpen ? null : tier.id }))}>
                                    <div className="flex items-center gap-3">
                                      <span className="bg-[#C8622A]/20 text-[#C8622A] text-xs font-semibold px-2 py-0.5 rounded">{tier.name || 'Untitled'}</span>
                                      <span className="text-[#8A9AB0] text-xs">
                                        {tier.response_time_hours ? `${tier.response_time_hours}hr response` : 'Maintenance'}
                                        {tier.recurring_fee > 0 ? ` · $${tier.recurring_fee}/${tier.billing_frequency}` : ''}
                                        {tier.maintenance_calls_per_year > 0 ? ` · ${tier.maintenance_calls_per_year} visits/yr` : ''}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <button onClick={e => { e.stopPropagation(); removeSLATier(ind, tier.id) }}
                                        className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Remove</button>
                                      <span className="text-[#8A9AB0] text-xs">{isTierOpen ? '▲' : '▼'}</span>
                                    </div>
                                  </div>

                                  {/* Tier edit form */}
                                  {isTierOpen && (
                                    <div className="border-t border-[#2a3d55] px-4 py-4 space-y-4">
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Tier Name</label>
                                          <input type="text" value={tier.name || ''} onChange={e => updateSLATier(ind, tier.id, 'name', e.target.value)} className={inputClass} />
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Response Time (hrs) <span className="text-[#8A9AB0] font-normal">— blank = N/A</span></label>
                                          <input type="number" value={tier.response_time_hours || ''} placeholder="N/A" onChange={e => updateSLATier(ind, tier.id, 'response_time_hours', e.target.value ? Number(e.target.value) : null)} className={inputClass} />
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Billing Frequency</label>
                                          <select value={tier.billing_frequency || 'Quarterly'} onChange={e => updateSLATier(ind, tier.id, 'billing_frequency', e.target.value)} className={inputClass}>
                                            <option>Monthly</option><option>Quarterly</option><option>Annually</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Labor Rate ($/hr)</label>
                                          <input type="number" value={tier.labor_rate || ''} onChange={e => updateSLATier(ind, tier.id, 'labor_rate', Number(e.target.value))} className={inputClass} />
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Emergency Rate ($/hr) <span className="text-[#8A9AB0] font-normal">— blank = N/A</span></label>
                                          <input type="number" value={tier.emergency_rate || ''} placeholder="N/A" onChange={e => updateSLATier(ind, tier.id, 'emergency_rate', e.target.value ? Number(e.target.value) : null)} className={inputClass} />
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Maintenance Visits/Year</label>
                                          <input type="number" min="0" value={tier.maintenance_calls_per_year ?? 0} onChange={e => updateSLATier(ind, tier.id, 'maintenance_calls_per_year', Number(e.target.value))} className={inputClass} />
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Initial Fee ($) <span className="text-[#8A9AB0] font-normal">billed with job</span></label>
                                          <input type="number" min="0" value={tier.initial_fee ?? 0} onChange={e => updateSLATier(ind, tier.id, 'initial_fee', Number(e.target.value))} className={inputClass} />
                                        </div>
                                        <div>
                                          <label className="text-[#8A9AB0] text-xs mb-1 block">Recurring Fee ($) <span className="text-[#8A9AB0] font-normal">per billing cycle</span></label>
                                          <input type="number" min="0" value={tier.recurring_fee ?? 0} onChange={e => updateSLATier(ind, tier.id, 'recurring_fee', Number(e.target.value))} className={inputClass} />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Language</label>
                                        <textarea rows={8} value={tier.body || ''} onChange={e => updateSLATier(ind, tier.id, 'body', e.target.value)}
                                          className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#C8622A] resize-none font-mono" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}

                            <button onClick={() => addSLATier(ind)}
                              className="w-full py-2 border border-dashed border-[#2a3d55] text-[#8A9AB0] hover:text-white hover:border-[#C8622A] rounded-lg text-sm transition-colors">
                              + Add Tier
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Monitoring Templates */}
            {monitoringEnabled && (
              <div>
                <div className="mb-3">
                  <h3 className="text-white font-bold">Monitoring Contract Templates by Industry</h3>
                  <p className="text-[#8A9AB0] text-sm mt-1">Configure monitoring contracts per industry. Variables: <span className="font-mono text-[#C8622A] text-xs">{'{{clientName}} {{companyName}} {{proposalName}} {{monitoredSystems}} {{monthlyFee}} {{billingFrequency}} {{escalationContacts}}'}</span></p>
                </div>
                <div className="space-y-2">
                  {MONITORING_INDUSTRIES.map(ind => {
                    const t = monitoringTemplates[ind] || {}
                    const isOpen = expandedMonIndustry === ind
                    return (
                      <div key={ind} className="bg-[#1a2d45] rounded-xl overflow-hidden border border-[#2a3d55]">
                        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#1f3550] transition-colors"
                          onClick={() => setExpandedMonIndustry(isOpen ? null : ind)}>
                          <div className="flex items-center gap-3">
                            <button onClick={e => { e.stopPropagation(); setMonitoringTemplates(prev => ({ ...prev, [ind]: { ...prev[ind], enabled: !prev[ind]?.enabled } })) }}
                              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${t.enabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${t.enabled ? 'left-5' : 'left-0.5'}`} />
                            </button>
                            <div>
                              <p className="text-white text-sm font-semibold">{ind}</p>
                              {t.name && <p className="text-[#8A9AB0] text-xs">{t.name}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-[#8A9AB0]">
                            {t.monthly_fee && <span>${t.monthly_fee}/mo</span>}
                            {t.billing_frequency && <span>{t.billing_frequency}</span>}
                            <span>{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="border-t border-[#2a3d55] p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-[#8A9AB0] text-xs mb-1 block">Template Name</label>
                                <input type="text" value={t.name || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], name: e.target.value } }))} className={inputClass} />
                              </div>
                              <div>
                                <label className="text-[#8A9AB0] text-xs mb-1 block">Billing Frequency</label>
                                <select value={t.billing_frequency || 'Monthly'} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], billing_frequency: e.target.value } }))} className={inputClass}>
                                  <option>Monthly</option><option>Quarterly</option><option>Annual</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[#8A9AB0] text-xs mb-1 block">Monthly Fee ($)</label>
                                <input type="number" value={t.monthly_fee || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], monthly_fee: e.target.value } }))} className={inputClass} />
                              </div>
                              <div>
                                <label className="text-[#8A9AB0] text-xs mb-1 block">Escalation Contacts</label>
                                <input type="number" min="1" value={t.escalation_contacts || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], escalation_contacts: e.target.value } }))} className={inputClass} />
                              </div>
                            </div>
                            <div>
                              <label className="text-[#8A9AB0] text-xs mb-1 block">Monitored Systems</label>
                              <input type="text" value={t.monitored_systems || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], monitored_systems: e.target.value } }))} placeholder="e.g. Cameras, Access Control, Alarm" className={inputClass} />
                            </div>
                            <div>
                              <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Language</label>
                              <textarea rows={10} value={t.body || ''} onChange={e => setMonitoringTemplates(p => ({ ...p, [ind]: { ...p[ind], body: e.target.value } }))}
                                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none font-mono" />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <button onClick={handleSaveSLA} disabled={savingSLA}
              className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingSLA ? 'Saving...' : 'Save SLA & Monitoring Settings'}
            </button>
          </div>
        )}

        {/* ── EMAIL TEMPLATES TAB ── */}
        {activeTab === 'email' && isAdmin && (
          <div className="space-y-6">
            <div className="bg-[#1a2d45] rounded-xl p-5">
              <h3 className="text-white font-bold mb-1">Follow-up Email Templates</h3>
              <p className="text-[#8A9AB0] text-sm mb-4">Customize the emails sent to clients at each stage. Use variables to personalize each message.</p>
              <div className="flex flex-wrap gap-2">
                {variables.map(v => (
                  <span key={v} className="bg-[#0F1C2E] text-[#C8622A] text-xs px-2 py-1 rounded font-mono border border-[#2a3d55]">{v}</span>
                ))}
              </div>
              <p className="text-[#8A9AB0] text-xs mt-2">Click any variable above to see how it looks — these get replaced with real values when emails are sent.</p>
            </div>

            {stages.map(stage => (
              <div key={stage.key} className="bg-[#1a2d45] rounded-xl overflow-hidden border border-[#2a3d55]">
                <div
                  className="flex justify-between items-center p-5 cursor-pointer hover:bg-[#1f3550] transition-colors"
                  onClick={() => setExpandedStage(expandedStage === stage.key ? null : stage.key)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-current ${stage.color}`} />
                    <div>
                      <p className="text-white font-semibold">{stage.label}</p>
                      <p className="text-[#8A9AB0] text-xs">{stage.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {stage.daysKey && (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <span className="text-[#8A9AB0] text-xs">Send at</span>
                        <input
                          type="number"
                          value={emailTemplates[stage.daysKey]}
                          onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.daysKey]: e.target.value }))}
                          className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] text-center"
                        />
                        <span className="text-[#8A9AB0] text-xs">days before close</span>
                      </div>
                    )}
                    {!stage.daysKey && <span className="text-[#8A9AB0] text-xs">Sent on close date</span>}
                    <span className="text-[#8A9AB0] text-sm">{expandedStage === stage.key ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expandedStage === stage.key && (
                  <div className="border-t border-[#2a3d55] p-5 space-y-4">
                    <div>
                      <label className="text-[#8A9AB0] text-xs mb-1 block">Subject Line</label>
                      <input
                        type="text"
                        value={emailTemplates[stage.subjectKey]}
                        onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.subjectKey]: e.target.value }))}
                        className={inputClass}
                        placeholder="Email subject..."
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[#8A9AB0] text-xs">Email Body</label>
                        <div className="flex gap-1">
                          {variables.map(v => (
                            <button
                              key={v}
                              onClick={() => setEmailTemplates(prev => ({ ...prev, [stage.bodyKey]: (prev[stage.bodyKey] || '') + v }))}
                              className="bg-[#0F1C2E] text-[#C8622A] text-xs px-2 py-0.5 rounded border border-[#2a3d55] hover:border-[#C8622A] transition-colors font-mono"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={emailTemplates[stage.bodyKey]}
                        onChange={e => setEmailTemplates(prev => ({ ...prev, [stage.bodyKey]: e.target.value }))}
                        rows={10}
                        className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none font-mono"
                        placeholder="Email body..."
                      />
                      <p className="text-[#8A9AB0] text-xs mt-1">Click a variable button above to insert it at the end of the body.</p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <button onClick={handleSaveTemplates} disabled={savingTemplates} className="bg-[#C8622A] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingTemplates ? 'Saving...' : 'Save Email Templates'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
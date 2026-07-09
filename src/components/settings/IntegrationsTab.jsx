import { supabase } from '../../supabase'
import { useState } from 'react'

const INTEGRATIONS = [
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    category: 'Accounting',
    description: 'Sync won proposals directly to QBO as invoices with line items, labor, and tax.',
    icon: '🟢',
    iconBg: 'bg-[#2CA01C]/10',
    accentColor: 'bg-[#2CA01C]',
    what: ['Push any proposal to QBO as an invoice on demand', 'Line items with descriptions', 'Labor line items', 'Sales tax if applicable', 'Auto-create customer if new', 'Quote number → Invoice #', 'Payment status syncs back when paid in QBO', 'New clients push to QBO automatically'],
    steps: [
      'Click Connect QuickBooks below.',
      'Sign in to your QuickBooks account and approve permissions.',
      'You\'ll be redirected back to ForgePt automatically.',
      'Open any proposal and click "Send to QuickBooks" to push it as an invoice.',
    ],
  },
  {
    id: 'google',
    name: 'Google Calendar & Meet',
    category: 'Calendar',
    description: 'Sync job schedules, service tickets, and rep meetings to Google Calendar with Meet links.',
    icon: '📅',
    iconBg: 'bg-blue-500/10',
    accentColor: 'bg-blue-600',
    what: ['Job schedules → Calendar events', 'Service ticket appointments', 'Tech daily schedules', 'Rep meetings with Meet links', 'Customer reminders via email', 'Auto-updates when rescheduled'],
    steps: [
      'Click Connect Google below.',
      'Sign in to your Google account and approve calendar permissions.',
      'You\'ll be redirected back to ForgePt automatically.',
      'Schedules will now sync to your Google Calendar.',
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft Outlook & Teams',
    category: 'Calendar',
    description: 'Sync job schedules, service tickets, and rep meetings to Outlook with Teams links.',
    icon: '🗓',
    iconBg: 'bg-blue-600/10',
    accentColor: 'bg-blue-700',
    what: ['Job schedules → Outlook events', 'Service ticket appointments', 'Tech daily schedules', 'Rep meetings with Teams links', 'Customer reminders via email', 'Auto-updates when rescheduled'],
    steps: [
      'Click Connect Microsoft below.',
      'Sign in to your Microsoft account and approve calendar permissions.',
      'You\'ll be redirected back to ForgePt automatically.',
      'Schedules will now sync to your Outlook Calendar.',
    ],
  },
  {
    id: 'inbound',
    name: 'Inbound Email → Tickets',
    category: 'Email Routing',
    description: 'Automatically create service tickets from emails forwarded to tickets@goforgept.com.',
    icon: '📨',
    iconBg: 'bg-orange-500/10',
    accentColor: 'bg-fp-brand',
    what: ['Emails from your domain create tickets automatically', 'Sender matched to existing client records', 'Auto-reply sent to acknowledge receipt', 'Ticket created with email body as description'],
    steps: [
      'Toggle on Inbound Email and enter your company domain.',
      'Click Send Verification — a link will be sent to your ForgePt email.',
      'Click the verification link to confirm your domain.',
      'Set up a forward rule in your email client so your support inbox forwards to tickets@goforgept.com.',
    ],
  },
  {
    id: 'zoho',
    name: 'Zoho',
    category: 'CRM / Accounting',
    description: 'Connect Zoho CRM and Books to sync clients, deals, and invoices.',
    icon: '🔴',
    iconBg: 'bg-red-500/10',
    accentColor: 'bg-red-600',
    what: ['Import Zoho Accounts → ForgePt Clients', 'New clients sync both ways automatically', 'Proposal status → Zoho Deal stage', 'Rep attribution by email match'],
    steps: [
      'Click Connect Zoho CRM below.',
      'Sign in to your Zoho account and approve permissions.',
      'You\'ll be redirected back to ForgePt automatically.',
      'Run the initial client import to sync existing contacts.',
    ],
  },
  {
    id: 'square',
    name: 'Square Payments',
    category: 'Payments',
    description: 'Generate Square payment links on invoices so clients can pay by card or ACH online.',
    icon: '💳',
    iconBg: 'bg-[#3E4348]/30',
    accentColor: 'bg-[#3E4348]',
    what: ['Invoice → Square Invoice', 'Line items + tax', 'Payment link on invoice detail', 'Auto-create customer in Square', 'Card + ACH accepted', 'Due date synced'],
    steps: [
      'Click Connect Square below.',
      'Sign in to your Square account and approve permissions.',
      'You\'ll be redirected back to ForgePt automatically.',
      'Payment links will appear on invoices.',
    ],
  },
]

export default function IntegrationsTab({
  qboMessage, setQboMessage, qboConnected, setQboConnected, qboCompanyName, setQboCompanyName, connectingQBO, setConnectingQBO,
  googleMessage, setGoogleMessage, googleConnected, setGoogleConnected, googleEmail, setGoogleEmail, connectingGoogle, setConnectingGoogle,
  microsoftMessage, setMicrosoftMessage, microsoftConnected, setMicrosoftConnected, microsoftEmail, setMicrosoftEmail, connectingMicrosoft, setConnectingMicrosoft,
  inboundMessage, setInboundMessage, inboundEnabled, setInboundEnabled, inboundDomain, setInboundDomain, inboundVerified, setInboundVerified,
  inboundAutoReply, setInboundAutoReply, savingInbound, setSavingInbound, verifyingInbound, setVerifyingInbound,
  squareMessage, setSquareMessage, squareConnected, setSquareConnected, squareMerchantId, setSquareMerchantId, connectingSquare, setConnectingSquare,
  orgId, profile,
}) {
  const [selected, setSelected] = useState(null)
  const [zohoConnecting, setZohoConnecting] = useState(null)
  const [zohoMessage, setZohoMessage] = useState(null)
  const [zohoStatus, setZohoStatus] = useState({ crm: false, books: false })
  const [zohoSyncing, setZohoSyncing] = useState(false)
  const [zohoLastSync, setZohoLastSync] = useState(null)

  useState(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!p?.org_id) return
      const { data: org } = await supabase.from('organizations').select('zoho_crm_connected, zoho_books_connected, zoho_last_sync_at').eq('id', p.org_id).single()
      if (org) {
        setZohoStatus({ crm: org.zoho_crm_connected || false, books: org.zoho_books_connected || false })
        setZohoLastSync(org.zoho_last_sync_at || null)
      }
    }
    load()
  }, [])

  const syncZohoCRM = async () => {
    setZohoSyncing(true); setZohoMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/zoho-sync-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (data.success) {
        const { accounts, contacts } = data
        const total = accounts.added + accounts.updated + contacts.added + contacts.updated
        setZohoLastSync(new Date().toISOString())
        setZohoMessage({
          type: total > 0 ? 'success' : 'error',
          text: total > 0
            ? `Synced: ${accounts.added} new clients, ${accounts.updated} updated · ${contacts.added} new contacts, ${contacts.updated} updated`
            : 'Zoho returned 0 records. Check that your Zoho account has Accounts and Contacts data and the token is still valid — try disconnecting and reconnecting.'
        })
      } else {
        setZohoMessage({ type: 'error', text: data.error || 'Sync failed' })
      }
    } catch (err) { setZohoMessage({ type: 'error', text: err.message }) }
    setZohoSyncing(false)
  }

  const connectZoho = async (scope) => {
    setZohoConnecting(scope); setZohoMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/zoho-oauth-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ scope })
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setZohoMessage({ type: 'error', text: data.error || 'Could not start Zoho connection.' })
    } catch (err) { setZohoMessage({ type: 'error', text: err.message }) }
    setZohoConnecting(null)
  }

  const disconnectZoho = async (scope) => {
    if (!window.confirm(`Disconnect Zoho ${scope === 'crm' ? 'CRM' : 'Books'}?`)) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const update = scope === 'crm' ? { zoho_crm_connected: false } : { zoho_books_connected: false }
    if (!zohoStatus.crm && !zohoStatus.books) Object.assign(update, { zoho_access_token: null, zoho_refresh_token: null, zoho_connected: false })
    await supabase.from('organizations').update(update).eq('id', p.org_id)
    setZohoStatus(prev => ({ ...prev, [scope]: false }))
    setZohoMessage({ type: 'success', text: `Zoho ${scope === 'crm' ? 'CRM' : 'Books'} disconnected.` })
  }

  const connectQBO = async () => {
    setConnectingQBO(true); setQboMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!p?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/qbo-oauth-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: p.org_id })
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setQboMessage({ type: 'error', text: data.error || 'Could not start QuickBooks connection.' })
    } catch (err) { setQboMessage({ type: 'error', text: err.message }) }
    setConnectingQBO(false)
  }

  const disconnectQBO = async () => {
    if (!window.confirm('Disconnect QuickBooks?')) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    await supabase.from('organizations').update({ qbo_connected: false, qbo_access_token: null, qbo_refresh_token: null, qbo_realm_id: null, qbo_company_name: null }).eq('id', p.org_id)
    setQboConnected(false); setQboCompanyName('')
    setQboMessage({ type: 'success', text: 'QuickBooks disconnected.' })
  }

  const connectGoogle = async () => {
    setConnectingGoogle(true); setGoogleMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!p?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/google-oauth-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: p.org_id, user_id: user.id })
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setGoogleMessage({ type: 'error', text: data.error || 'Could not start Google connection.' })
    } catch (err) { setGoogleMessage({ type: 'error', text: err.message }) }
    setConnectingGoogle(false)
  }

  const disconnectGoogle = async () => {
    if (!window.confirm('Disconnect Google Calendar? Existing events will remain but new schedules won\'t sync.')) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ google_calendar_connected: false, google_access_token: null, google_refresh_token: null, google_calendar_id: null, google_email: null }).eq('id', user.id)
    setGoogleConnected(false); setGoogleEmail('')
    setGoogleMessage({ type: 'success', text: 'Google Calendar disconnected.' })
  }

  const connectMicrosoft = async () => {
    setConnectingMicrosoft(true); setMicrosoftMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!p?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/microsoft-oauth-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: p.org_id, user_id: user.id })
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setMicrosoftMessage({ type: 'error', text: data.error || 'Could not start Microsoft connection.' })
    } catch (err) { setMicrosoftMessage({ type: 'error', text: err.message }) }
    setConnectingMicrosoft(false)
  }

  const disconnectMicrosoft = async () => {
    if (!window.confirm('Disconnect Microsoft Calendar? Existing events will remain but new schedules won\'t sync.')) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ microsoft_calendar_connected: false, microsoft_access_token: null, microsoft_refresh_token: null, microsoft_email: null, microsoft_display_name: null }).eq('id', user.id)
    setMicrosoftConnected(false); setMicrosoftEmail('')
    setMicrosoftMessage({ type: 'success', text: 'Microsoft Calendar disconnected.' })
  }

  const connectSquare = async () => {
    setConnectingSquare(true); setSquareMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!p?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/square-oauth-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ org_id: p.org_id }),
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
    const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    await supabase.from('organizations').update({ square_connected: false, square_access_token: null, square_refresh_token: null, square_merchant_id: null, square_location_id: null }).eq('id', p.org_id)
    setSquareConnected(false); setSquareMerchantId('')
    setSquareMessage({ type: 'success', text: 'Square disconnected.' })
  }

  const saveInboundSettings = async () => {
    setSavingInbound(true); setInboundMessage(null)
    await supabase.from('organizations').update({
      inbound_email_enabled: inboundEnabled,
      inbound_email_domain: inboundDomain.trim().toLowerCase() || null,
      inbound_email_auto_reply: inboundAutoReply.trim() || null,
    }).eq('id', orgId)
    setInboundMessage({ type: 'success', text: 'Inbound email settings saved.' })
    setSavingInbound(false)
  }

  const sendVerificationEmail = async () => {
    if (!inboundDomain.trim()) return
    setVerifyingInbound(true); setInboundMessage(null)
    try {
      const { data: existing } = await supabase.from('organizations').select('id').eq('inbound_email_domain', inboundDomain.trim().toLowerCase()).neq('id', orgId).single()
      if (existing) { setInboundMessage({ type: 'error', text: 'This domain is already registered to another organization.' }); setVerifyingInbound(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-inbound-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ org_id: orgId, domain: inboundDomain.trim().toLowerCase() })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setInboundMessage({ type: 'success', text: `Verification email sent to ${profile?.email}. Click the link to activate inbound routing for ${inboundDomain}.` })
    } catch (err) { setInboundMessage({ type: 'error', text: err.message }) }
    setVerifyingInbound(false)
  }

  const msgBanner = (msg) => msg ? (
    <div className={`rounded-xl px-5 py-4 text-sm font-medium mb-4 ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
      {msg.text}
    </div>
  ) : null

  const isConnected = (id) => {
    if (id === 'quickbooks') return qboConnected
    if (id === 'google') return googleConnected
    if (id === 'microsoft') return microsoftConnected
    if (id === 'inbound') return inboundVerified && inboundEnabled
    if (id === 'zoho') return zohoStatus.crm || zohoStatus.books
    if (id === 'square') return squareConnected
    return false
  }

  const connectedLabel = (id) => {
    if (id === 'quickbooks' && qboCompanyName) return `Connected to ${qboCompanyName}`
    if (id === 'google' && googleEmail) return `Connected as ${googleEmail}`
    if (id === 'microsoft' && microsoftEmail) return `Connected as ${microsoftEmail}`
    if (id === 'inbound' && inboundDomain) return `Routing @${inboundDomain}`
    if (id === 'zoho') {
      const parts = [zohoStatus.crm && 'CRM', zohoStatus.books && 'Books'].filter(Boolean)
      return parts.length ? `${parts.join(' + ')} connected` : null
    }
    if (id === 'square' && squareMerchantId) return `Merchant ${squareMerchantId}`
    return null
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div>
        <div className="mb-5">
          <h2 className="text-fp-text text-xl font-bold">Integrations</h2>
          <p className="text-fp-muted text-sm mt-0.5">{INTEGRATIONS.length} available · {INTEGRATIONS.filter(i => isConnected(i.id)).length} connected</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTEGRATIONS.map(intg => {
            const connected = isConnected(intg.id)
            const label = connectedLabel(intg.id)
            return (
              <div key={intg.id}
                onClick={() => setSelected(intg.id)}
                className="bg-fp-card rounded-xl p-5 cursor-pointer hover:bg-fp-hover hover:border-fp-brand/40 border border-fp-border transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${intg.iconBg} flex items-center justify-center text-xl flex-shrink-0`}>
                      {intg.icon}
                    </div>
                    <div>
                      <p className="text-fp-text font-semibold group-hover:text-fp-brand transition-colors leading-tight">{intg.name}</p>
                      <p className="text-fp-muted text-xs mt-0.5">{intg.category}</p>
                    </div>
                  </div>
                  {connected
                    ? <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0">Connected</span>
                    : <span className="bg-fp-inset text-fp-muted text-xs px-2.5 py-1 rounded-full flex-shrink-0">Not connected</span>
                  }
                </div>
                <p className="text-fp-muted text-sm leading-relaxed mb-3">{intg.description}</p>
                {label && <p className="text-green-400 text-xs">✓ {label}</p>}
                <div className="flex items-center justify-end mt-3 pt-3 border-t border-fp-border">
                  <span className="text-fp-muted group-hover:text-fp-brand text-xs transition-colors flex items-center gap-1">
                    {connected ? 'Manage' : 'Set up'} <span className="text-base leading-none">→</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  const intg = INTEGRATIONS.find(i => i.id === selected)
  const connected = isConnected(selected)
  const label = connectedLabel(selected)

  const getMsg = () => {
    if (selected === 'quickbooks') return qboMessage
    if (selected === 'google') return googleMessage
    if (selected === 'microsoft') return microsoftMessage
    if (selected === 'inbound') return inboundMessage
    if (selected === 'zoho') return zohoMessage
    if (selected === 'square') return squareMessage
    return null
  }

  return (
    <div>
      {/* Back nav */}
      <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-fp-muted hover:text-fp-text text-sm transition-colors mb-5">
        <span className="text-base">←</span> Integrations
      </button>

      {msgBanner(getMsg())}

      {/* Hero */}
      <div className="bg-fp-card rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl ${intg.iconBg} flex items-center justify-center text-3xl flex-shrink-0`}>
              {intg.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-fp-text text-xl font-bold">{intg.name}</h2>
                <span className="bg-fp-inset text-fp-muted text-xs px-2 py-0.5 rounded-full">{intg.category}</span>
                {connected && <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">✓ Connected</span>}
              </div>
              <p className="text-fp-muted text-sm mt-1">{intg.description}</p>
              {label && <p className="text-green-400 text-xs mt-1">✓ {label}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* What syncs */}
      <div className="bg-fp-card rounded-xl p-6 mb-4">
        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">What syncs</p>
        <div className="grid grid-cols-2 gap-2">
          {intg.what.map(t => (
            <div key={t} className="flex items-center gap-2 text-sm text-fp-muted">
              <span className="text-green-400 flex-shrink-0">✓</span> {t}
            </div>
          ))}
        </div>
      </div>

      {/* Setup steps */}
      <div className="bg-fp-card rounded-xl p-6 mb-4">
        <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">Setup</p>
        <div className="space-y-3">
          {intg.steps.map((step, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${intg.accentColor} text-fp-text`}>{i + 1}</span>
              <span className="text-fp-muted">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action area */}
      {selected === 'quickbooks' && (
        <div className="bg-fp-card rounded-xl p-6">
          {qboConnected ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-fp-text font-semibold">QuickBooks Online</p>
                {qboCompanyName && <p className="text-fp-muted text-sm mt-0.5">Connected to <span className="text-fp-text">{qboCompanyName}</span></p>}
              </div>
              <button onClick={disconnectQBO} className="text-fp-muted hover:text-red-400 text-sm transition-colors">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectQBO} disabled={connectingQBO}
              className="w-full bg-[#2CA01C] text-fp-text py-2.5 rounded-lg text-sm font-semibold hover:bg-[#259018] transition-colors disabled:opacity-50">
              {connectingQBO ? 'Connecting...' : 'Connect QuickBooks'}
            </button>
          )}
        </div>
      )}

      {selected === 'google' && (
        <div className="bg-fp-card rounded-xl p-6">
          {googleConnected ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-fp-text font-semibold">Google Calendar & Meet</p>
                {googleEmail && <p className="text-fp-muted text-sm mt-0.5">Connected as <span className="text-fp-text">{googleEmail}</span></p>}
              </div>
              <button onClick={disconnectGoogle} className="text-fp-muted hover:text-red-400 text-sm transition-colors">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectGoogle} disabled={connectingGoogle}
              className="w-full bg-blue-600 text-fp-text py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {connectingGoogle ? 'Connecting...' : 'Connect Google'}
            </button>
          )}
        </div>
      )}

      {selected === 'microsoft' && (
        <div className="bg-fp-card rounded-xl p-6">
          {microsoftConnected ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-fp-text font-semibold">Microsoft Outlook & Teams</p>
                {microsoftEmail && <p className="text-fp-muted text-sm mt-0.5">Connected as <span className="text-fp-text">{microsoftEmail}</span></p>}
              </div>
              <button onClick={disconnectMicrosoft} className="text-fp-muted hover:text-red-400 text-sm transition-colors">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectMicrosoft} disabled={connectingMicrosoft}
              className="w-full bg-blue-700 text-fp-text py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50">
              {connectingMicrosoft ? 'Connecting...' : 'Connect Microsoft'}
            </button>
          )}
        </div>
      )}

      {selected === 'inbound' && (
        <div className="bg-fp-card rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-fp-text font-semibold">Inbound Email Routing</p>
              {inboundVerified && inboundDomain && <p className="text-green-400 text-xs mt-0.5">✓ Verified · routing @{inboundDomain}</p>}
              {inboundDomain && !inboundVerified && <p className="text-yellow-400 text-xs mt-0.5">⏳ Pending verification for @{inboundDomain}</p>}
            </div>
            <button onClick={() => setInboundEnabled(p => !p)}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${inboundEnabled ? 'bg-fp-brand' : 'bg-fp-inset'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${inboundEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          {inboundEnabled && (
            <>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Your Company Domain</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fp-muted text-sm">@</span>
                    <input type="text" value={inboundDomain} onChange={e => { setInboundDomain(e.target.value); setInboundVerified(false) }}
                      placeholder="acmeav.com"
                      className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                  </div>
                  <button onClick={sendVerificationEmail} disabled={verifyingInbound || !inboundDomain.trim() || inboundVerified}
                    className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm font-semibold hover:bg-fp-hover transition-colors disabled:opacity-50 whitespace-nowrap">
                    {verifyingInbound ? 'Sending...' : inboundVerified ? '✓ Verified' : 'Send Verification'}
                  </button>
                </div>
                <p className="text-fp-muted text-xs mt-1">Emails forwarded to <span className="text-fp-text font-mono">tickets@goforgept.com</span> from this domain will create tickets.</p>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Auto-Reply Message <span className="font-normal">(optional)</span></label>
                <textarea value={inboundAutoReply} onChange={e => setInboundAutoReply(e.target.value)} rows={4}
                  placeholder={`Hi there,\n\nThank you for reaching out. We've received your request and will be in touch shortly.`}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none" />
              </div>
              <button onClick={saveInboundSettings} disabled={savingInbound}
                className="bg-fp-brand text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingInbound ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          )}
        </div>
      )}

      {selected === 'zoho' && (
        <div className="bg-fp-card rounded-xl p-6 space-y-4">
          {/* CRM */}
          <div className="bg-fp-inset rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-fp-text font-semibold text-sm">Zoho CRM</h4>
              {zohoStatus.crm && <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">✓ Connected</span>}
            </div>
            <p className="text-fp-muted text-xs mb-3">Sync clients and contacts. New proposals automatically create deals with the correct stage.</p>
            <div className="space-y-1 text-xs text-fp-muted mb-3">
              {['Import existing Zoho Accounts → ForgePt Clients','New clients sync both ways automatically','Proposal status → Zoho Deal stage','Rep attribution by email match'].map(t => (
                <div key={t} className="flex items-center gap-1.5"><span className="text-green-400">✓</span>{t}</div>
              ))}
            </div>
            {zohoStatus.crm ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button onClick={syncZohoCRM} disabled={zohoSyncing}
                    className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {zohoSyncing ? 'Syncing...' : '↻ Sync Now'}
                  </button>
                  {zohoLastSync && (
                    <span className="text-fp-muted text-xs">Last sync: {new Date(zohoLastSync).toLocaleString()}</span>
                  )}
                </div>
                <p className="text-fp-muted text-xs">Two-way sync is active. Changes in Zoho update ForgePt automatically. Client and contact saves push back to Zoho.</p>
                <button onClick={() => disconnectZoho('crm')} className="text-red-400 hover:text-red-300 text-xs transition-colors">Disconnect Zoho CRM</button>
              </div>
            ) : (
              <button onClick={() => connectZoho('crm')} disabled={zohoConnecting === 'crm'}
                className="w-full bg-red-600/80 text-fp-text py-2 rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
                {zohoConnecting === 'crm' ? 'Connecting...' : 'Connect Zoho CRM'}
              </button>
            )}
          </div>
          {/* Books */}
          <div className="bg-fp-inset rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-fp-text font-semibold text-sm">Zoho Books</h4>
              {zohoStatus.books && <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">✓ Connected</span>}
              <span className="bg-fp-inset text-fp-muted text-xs px-2 py-0.5 rounded-full">Coming Soon</span>
            </div>
            <p className="text-fp-muted text-xs mb-3">Sync invoices and estimates between ForgePt and Zoho Books for seamless accounting.</p>
            <div className="space-y-1 text-xs text-fp-muted">
              {['Won proposals → Zoho Books estimates','Invoices sync both ways','Payment status updates automatically','Tax rates synced from Zoho Books'].map(t => (
                <div key={t} className="flex items-center gap-1.5"><span className="text-fp-muted">○</span>{t}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected === 'square' && (
        <div className="bg-fp-card rounded-xl p-6">
          {squareConnected ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-fp-text font-semibold">Square Payments</p>
                {squareMerchantId && <p className="text-fp-muted text-sm mt-0.5">Merchant <span className="text-fp-text font-mono">{squareMerchantId}</span></p>}
              </div>
              <button onClick={disconnectSquare} className="text-fp-muted hover:text-red-400 text-sm transition-colors">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectSquare} disabled={connectingSquare}
              className="w-full bg-[#3E4348] text-fp-text py-2.5 rounded-lg text-sm font-semibold hover:bg-[#4E5358] transition-colors disabled:opacity-50">
              {connectingSquare ? 'Connecting...' : 'Connect Square'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { supabase } from '../../supabase'
import { useState } from 'react'

export default function IntegrationsTab({
  qboMessage, setQboMessage, qboConnected, setQboConnected, qboCompanyName, setQboCompanyName, connectingQBO, setConnectingQBO,
  googleMessage, setGoogleMessage, googleConnected, setGoogleConnected, googleEmail, setGoogleEmail, connectingGoogle, setConnectingGoogle,
  microsoftMessage, setMicrosoftMessage, microsoftConnected, setMicrosoftConnected, microsoftEmail, setMicrosoftEmail, connectingMicrosoft, setConnectingMicrosoft,
  inboundMessage, setInboundMessage, inboundEnabled, setInboundEnabled, inboundDomain, setInboundDomain, inboundVerified, setInboundVerified,
  inboundAutoReply, setInboundAutoReply, savingInbound, setSavingInbound, verifyingInbound, setVerifyingInbound,
  squareMessage, setSquareMessage, squareConnected, setSquareConnected, squareMerchantId, setSquareMerchantId, connectingSquare, setConnectingSquare,
  orgId, profile,
}) {
  const [showZohoModal, setShowZohoModal] = useState(false)
  const [zohoConnecting, setZohoConnecting] = useState(null) // 'crm' | 'books' | null
  const [zohoMessage, setZohoMessage] = useState(null)
  const [zohoStatus, setZohoStatus] = useState({
    crm: false, books: false
  })

  // Load Zoho status on mount
  useState(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      const { data: org } = await supabase.from('organizations')
        .select('zoho_crm_connected, zoho_books_connected')
        .eq('id', profile.org_id).single()
      if (org) setZohoStatus({ crm: org.zoho_crm_connected || false, books: org.zoho_books_connected || false })
    }
    load()
  }, [])

  const connectZoho = async (scope) => {
    setZohoConnecting(scope)
    setZohoMessage(null)
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
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const update = scope === 'crm'
      ? { zoho_crm_connected: false }
      : { zoho_books_connected: false }
    // If both disconnected clear tokens
    if (!zohoStatus.crm && !zohoStatus.books) {
      Object.assign(update, { zoho_access_token: null, zoho_refresh_token: null, zoho_connected: false })
    }
    await supabase.from('organizations').update(update).eq('id', profile.org_id)
    setZohoStatus(prev => ({ ...prev, [scope]: false }))
    setZohoMessage({ type: 'success', text: `Zoho ${scope === 'crm' ? 'CRM' : 'Books'} disconnected.` })
  }

  const connectQBO = async () => {
    setConnectingQBO(true); setQboMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profileData?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/qbo-oauth-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: profileData.org_id })
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
    const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    await supabase.from('organizations').update({
      qbo_connected: false, qbo_access_token: null, qbo_refresh_token: null,
      qbo_realm_id: null, qbo_company_name: null
    }).eq('id', profileData.org_id)
    setQboConnected(false); setQboCompanyName('')
    setQboMessage({ type: 'success', text: 'QuickBooks disconnected.' })
  }

  const connectGoogle = async () => {
    setConnectingGoogle(true); setGoogleMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profileData?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/google-oauth-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: profileData.org_id, user_id: user.id })
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
    await supabase.from('profiles').update({
      google_calendar_connected: false, google_access_token: null, google_refresh_token: null,
      google_calendar_id: null, google_email: null,
    }).eq('id', user.id)
    setGoogleConnected(false); setGoogleEmail('')
    setGoogleMessage({ type: 'success', text: 'Google Calendar disconnected.' })
  }

  const connectMicrosoft = async () => {
    setConnectingMicrosoft(true); setMicrosoftMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profileData?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/microsoft-oauth-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: profileData.org_id, user_id: user.id })
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
    await supabase.from('profiles').update({
      microsoft_calendar_connected: false, microsoft_access_token: null, microsoft_refresh_token: null,
      microsoft_email: null, microsoft_display_name: null,
    }).eq('id', user.id)
    setMicrosoftConnected(false); setMicrosoftEmail('')
    setMicrosoftMessage({ type: 'success', text: 'Microsoft Calendar disconnected.' })
  }

  const connectSquare = async () => {
    setConnectingSquare(true); setSquareMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profileData?.org_id) throw new Error('Could not find your organization.')
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/square-oauth-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
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
      const { data: existing } = await supabase.from('organizations').select('id')
        .eq('inbound_email_domain', inboundDomain.trim().toLowerCase()).neq('id', orgId).single()
      if (existing) {
        setInboundMessage({ type: 'error', text: 'This domain is already registered to another organization.' })
        setVerifyingInbound(false); return
      }
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
    <div className={`rounded-xl px-5 py-4 text-sm font-medium ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
      {msg.text}
    </div>
  ) : null

  return (
    <div className="space-y-4">
      {msgBanner(qboMessage)}

      {/* QuickBooks */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#2CA01C]/10 rounded-xl flex items-center justify-center text-2xl">🟢</div>
            <div>
              <h3 className="text-white font-bold">QuickBooks Online</h3>
              <p className="text-[#8A9AB0] text-sm mt-0.5">Sync won proposals directly to QBO as invoices.</p>
              {qboConnected && qboCompanyName && <p className="text-green-400 text-xs mt-1">✓ Connected to <span className="font-semibold">{qboCompanyName}</span></p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {qboConnected ? (
              <div className="flex items-center gap-3">
                <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1 rounded-full">✓ Connected</span>
                <button onClick={disconnectQBO} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Disconnect</button>
              </div>
            ) : (
              <button onClick={connectQBO} disabled={connectingQBO}
                className="bg-[#2CA01C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#259018] transition-colors disabled:opacity-50">
                {connectingQBO ? 'Connecting...' : 'Connect QuickBooks'}
              </button>
            )}
          </div>
        </div>
        {qboConnected && (
          <div className="mt-4 pt-4 border-t border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">What syncs</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#8A9AB0]">
              {['Won proposals → QBO Invoice','Line items with descriptions','Labor line items','Sales tax if applicable','Auto-create customer if new','Quote number → Invoice #'].map(t => (
                <div key={t} className="flex items-center gap-2"><span className="text-green-400">✓</span> {t}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {msgBanner(googleMessage)}

      {/* Google Calendar */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-2xl">📅</div>
            <div>
              <h3 className="text-white font-bold">Google Calendar & Meet</h3>
              <p className="text-[#8A9AB0] text-sm mt-0.5">Sync job schedules, service tickets, and rep meetings to Google Calendar.</p>
              {googleConnected && googleEmail && <p className="text-green-400 text-xs mt-1">✓ Connected as <span className="font-semibold">{googleEmail}</span></p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {googleConnected ? (
              <div className="flex items-center gap-3">
                <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1 rounded-full">✓ Connected</span>
                <button onClick={disconnectGoogle} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Disconnect</button>
              </div>
            ) : (
              <button onClick={connectGoogle} disabled={connectingGoogle}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                {connectingGoogle ? 'Connecting...' : 'Connect Google'}
              </button>
            )}
          </div>
        </div>
        {googleConnected && (
          <div className="mt-4 pt-4 border-t border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">What syncs</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#8A9AB0]">
              {['Job schedules → Calendar events','Service ticket appointments','Tech daily schedules','Rep meetings with Meet links','Customer reminders via email','Auto-updates when rescheduled'].map(t => (
                <div key={t} className="flex items-center gap-2"><span className="text-green-400">✓</span> {t}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {msgBanner(microsoftMessage)}

      {/* Microsoft Calendar */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center text-2xl">🗓</div>
            <div>
              <h3 className="text-white font-bold">Microsoft Outlook & Teams</h3>
              <p className="text-[#8A9AB0] text-sm mt-0.5">Sync job schedules, service tickets, and rep meetings to Outlook.</p>
              {microsoftConnected && microsoftEmail && <p className="text-green-400 text-xs mt-1">✓ Connected as <span className="font-semibold">{microsoftEmail}</span></p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {microsoftConnected ? (
              <div className="flex items-center gap-3">
                <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1 rounded-full">✓ Connected</span>
                <button onClick={disconnectMicrosoft} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Disconnect</button>
              </div>
            ) : (
              <button onClick={connectMicrosoft} disabled={connectingMicrosoft}
                className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50">
                {connectingMicrosoft ? 'Connecting...' : 'Connect Microsoft'}
              </button>
            )}
          </div>
        </div>
        {microsoftConnected && (
          <div className="mt-4 pt-4 border-t border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">What syncs</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#8A9AB0]">
              {['Job schedules → Outlook events','Service ticket appointments','Tech daily schedules','Rep meetings with Teams links','Customer reminders via email','Auto-updates when rescheduled'].map(t => (
                <div key={t} className="flex items-center gap-2"><span className="text-green-400">✓</span> {t}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {msgBanner(inboundMessage)}

      {/* Inbound Email */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-2xl">📨</div>
            <div>
              <h3 className="text-white font-bold">Inbound Email → Tickets</h3>
              <p className="text-[#8A9AB0] text-sm mt-0.5">Automatically create service tickets from emails sent to tickets@goforgept.com.</p>
              {inboundVerified && inboundDomain && <p className="text-green-400 text-xs mt-1">✓ Verified · Routing emails from <span className="font-semibold">@{inboundDomain}</span></p>}
              {inboundDomain && !inboundVerified && <p className="text-yellow-400 text-xs mt-1">⏳ Pending verification for <span className="font-semibold">@{inboundDomain}</span></p>}
            </div>
          </div>
          <button onClick={() => setInboundEnabled(p => !p)}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${inboundEnabled ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${inboundEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        {inboundEnabled && (
          <div className="space-y-4 border-t border-[#2a3d55] pt-5">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Your Company Domain</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9AB0] text-sm">@</span>
                  <input type="text" value={inboundDomain} onChange={e => { setInboundDomain(e.target.value); setInboundVerified(false) }}
                    placeholder="acmeav.com"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <button onClick={sendVerificationEmail} disabled={verifyingInbound || !inboundDomain.trim() || inboundVerified}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors disabled:opacity-50 whitespace-nowrap">
                  {verifyingInbound ? 'Sending...' : inboundVerified ? '✓ Verified' : 'Send Verification'}
                </button>
              </div>
              <p className="text-[#8A9AB0] text-xs mt-1">Enter <span className="text-white">your company's domain</span> e.g. <span className="text-white font-mono">acmeav.com</span>. Emails forwarded to <span className="text-white font-mono">tickets@goforgept.com</span> from this domain will create tickets automatically.</p>
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Auto-Reply Message <span className="font-normal">(optional)</span></label>
              <textarea value={inboundAutoReply} onChange={e => setInboundAutoReply(e.target.value)} rows={4}
                placeholder={`Hi there,\n\nThank you for reaching out. We've received your request and will be in touch shortly.`}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
            </div>
            <div className="bg-[#0F1C2E] rounded-xl p-4">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Setup Instructions</p>
              <div className="space-y-1.5 text-xs text-[#8A9AB0]">
                <p>1. Enter your domain above and click <span className="text-white">Send Verification</span></p>
                <p>2. Click the verification link sent to <span className="text-white">{profile?.email}</span></p>
                <p>3. Set up a forward rule in your email client so your support inbox forwards to <span className="text-white font-mono">tickets@goforgept.com</span></p>
              </div>
            </div>
            <button onClick={saveInboundSettings} disabled={savingInbound}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {savingInbound ? 'Saving...' : 'Save Inbound Settings'}
            </button>
          </div>
        )}
      </div>

      {msgBanner(zohoMessage)}

      {/* Zoho */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-2xl">🔴</div>
            <div>
              <h3 className="text-white font-bold">Zoho</h3>
              <p className="text-[#8A9AB0] text-sm mt-0.5">Connect Zoho CRM and Books to sync clients, deals and invoices.</p>
              <div className="flex items-center gap-3 mt-1">
                {zohoStatus.crm && <span className="text-green-400 text-xs">✓ CRM Connected</span>}
                {zohoStatus.books && <span className="text-green-400 text-xs">✓ Books Connected</span>}
              </div>
            </div>
          </div>
          <button onClick={() => setShowZohoModal(true)}
            className="bg-red-600/80 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors">
            {zohoStatus.crm || zohoStatus.books ? 'Manage' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Zoho Modal */}
      {showZohoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-2xl w-full max-w-lg shadow-2xl">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a3d55]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-xl">🔴</div>
                <div>
                  <h3 className="text-white font-bold">Zoho Integration</h3>
                  <p className="text-[#8A9AB0] text-xs">Connect your Zoho products to ForgePt.</p>
                </div>
              </div>
              <button onClick={() => setShowZohoModal(false)} className="text-[#8A9AB0] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* CRM */}
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-semibold text-sm">Zoho CRM</h4>
                      {zohoStatus.crm && <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">✓ Connected</span>}
                    </div>
                    <p className="text-[#8A9AB0] text-xs mb-3">Sync clients and contacts. New proposals automatically create deals in Zoho CRM with the correct stage.</p>
                    <div className="space-y-1 text-xs text-[#8A9AB0] mb-3">
                      {['Import existing Zoho Accounts → ForgePt Clients','New clients sync both ways automatically','Proposal status → Zoho Deal stage','Rep attribution by email match'].map(t => (
                        <div key={t} className="flex items-center gap-1.5"><span className="text-green-400">✓</span>{t}</div>
                      ))}
                    </div>
                  </div>
                </div>
                {zohoStatus.crm ? (
                  <button onClick={() => disconnectZoho('crm')}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors">
                    Disconnect Zoho CRM
                  </button>
                ) : (
                  <button onClick={() => connectZoho('crm')} disabled={zohoConnecting === 'crm'}
                    className="w-full bg-red-600/80 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
                    {zohoConnecting === 'crm' ? 'Connecting...' : 'Connect Zoho CRM'}
                  </button>
                )}
              </div>

              {/* Books */}
              <div className="bg-[#0F1C2E] rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-semibold text-sm">Zoho Books</h4>
                      {zohoStatus.books && <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">✓ Connected</span>}
                      <span className="bg-[#2a3d55] text-[#8A9AB0] text-xs px-2 py-0.5 rounded-full">Coming Soon</span>
                    </div>
                    <p className="text-[#8A9AB0] text-xs mb-3">Sync invoices and estimates between ForgePt and Zoho Books for seamless accounting.</p>
                    <div className="space-y-1 text-xs text-[#8A9AB0]">
                      {['Won proposals → Zoho Books estimates','Invoices sync both ways','Payment status updates automatically','Tax rates synced from Zoho Books'].map(t => (
                        <div key={t} className="flex items-center gap-1.5"><span className="text-[#4a5a6a]">○</span>{t}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-[#0F1C2E]/50 rounded-xl p-4">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Setup Instructions</p>
                <div className="space-y-1.5 text-xs text-[#8A9AB0]">
                  <p>1. Click <span className="text-white">Connect Zoho CRM</span> above</p>
                  <p>2. Sign in to your Zoho account and approve permissions</p>
                  <p>3. You'll be redirected back to ForgePt automatically</p>
                  <p>4. Run the initial client import to sync existing contacts</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {msgBanner(squareMessage)}

      {/* Square */}
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
  )
}

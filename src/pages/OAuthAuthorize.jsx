import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useProfile } from '../context/ProfileContext'

export default function OAuthAuthorize() {
  const [searchParams] = useSearchParams()
  const { profile, session, loading } = useProfile()

  const clientId            = searchParams.get('client_id')
  const redirectUri         = searchParams.get('redirect_uri')
  const state               = searchParams.get('state')
  const codeChallenge       = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')

  const [clientName, setClientName] = useState('')
  const [approving, setApproving]   = useState(false)
  const [err, setErr]               = useState(null)

  useEffect(() => {
    if (!loading && session && clientId) loadClientName()
  }, [loading, session, clientId])

  const loadClientName = async () => {
    const { data } = await supabase
      .from('oauth_clients')
      .select('client_name')
      .eq('client_id', clientId)
      .maybeSingle()
    setClientName(data?.client_name || 'An AI assistant')
  }

  const handleApprove = async () => {
    setApproving(true)
    setErr(null)
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

    const { error } = await supabase.from('oauth_codes').insert({
      code,
      client_id:      clientId,
      redirect_uri:   redirectUri,
      code_challenge: codeChallenge,
      user_id:        profile.id,
      org_id:         profile.org_id,
      scope:          ['agent:mcp'],
    })

    if (error) {
      setErr('Something went wrong. Please try again.')
      setApproving(false)
      return
    }

    const dest = new URL(redirectUri)
    dest.searchParams.set('code', code)
    if (state) dest.searchParams.set('state', state)
    window.location.href = dest.toString()
  }

  const handleDeny = () => {
    const dest = new URL(redirectUri)
    dest.searchParams.set('error', 'access_denied')
    if (state) dest.searchParams.set('state', state)
    window.location.href = dest.toString()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-fp-inset flex items-center justify-center">
        <p className="text-fp-muted text-sm">Loading...</p>
      </div>
    )
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <div className="min-h-screen bg-fp-inset flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 font-semibold mb-2">Invalid authorization request.</p>
          <p className="text-fp-muted text-sm">This link is missing required parameters.</p>
        </div>
      </div>
    )
  }

  if (!session) {
    // Preserve the entire OAuth query string so Login can redirect back
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('oauth_return', window.location.search)
    }
    return (
      <div className="min-h-screen bg-fp-inset flex items-center justify-center px-4">
        <div className="bg-fp-card border border-fp-border rounded-2xl p-8 max-w-sm w-full text-center">
          <h1 className="text-fp-text text-xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <p className="text-fp-muted text-sm mb-6">Sign in to authorize your AI agent.</p>
          <a
            href={`/?oauth_return=${encodeURIComponent(window.location.search)}`}
            className="block w-full py-3 bg-fp-brand text-white rounded-xl text-sm font-semibold hover:bg-[#b5571f] transition-colors"
          >
            Sign In to ForgePt
          </a>
        </div>
      </div>
    )
  }

  const capabilities = [
    'Read and search your clients and proposals',
    'Create and update proposals on your behalf',
    'Log tasks and service activity',
    'Access your organization\'s data as you',
  ]

  return (
    <div className="min-h-screen bg-fp-inset flex items-center justify-center px-4 py-8">
      <div className="bg-fp-card border border-fp-border rounded-2xl p-8 max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-fp-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-fp-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.798-1.414 2.798H4.213c-1.444 0-2.414-1.798-1.414-2.798L4.2 15.3" />
            </svg>
          </div>
          <h1 className="text-fp-text text-xl font-bold">Connect {clientName || 'AI Agent'}</h1>
          <p className="text-fp-muted text-sm mt-1">
            is requesting access to your ForgePt account.
          </p>
        </div>

        {/* Connecting as */}
        <div className="bg-fp-inset border border-fp-border rounded-xl p-4 mb-5">
          <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-1.5">Connecting as</p>
          <p className="text-fp-text font-semibold text-sm">{profile?.full_name || profile?.email}</p>
          <p className="text-fp-muted text-xs mt-0.5">{profile?.organizations?.name}</p>
        </div>

        {/* Capabilities */}
        <div className="mb-6">
          <p className="text-fp-text text-sm font-semibold mb-3">This connection will allow:</p>
          <ul className="space-y-2">
            {capabilities.map(cap => (
              <li key={cap} className="flex items-start gap-2.5 text-fp-muted text-sm">
                <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                {cap}
              </li>
            ))}
          </ul>
        </div>

        {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            className="flex-1 py-3 border border-fp-border text-fp-muted rounded-xl text-sm hover:text-fp-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 py-3 bg-fp-brand text-white rounded-xl text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
          >
            {approving ? 'Authorizing…' : 'Allow Access'}
          </button>
        </div>

        <p className="text-fp-muted text-xs text-center mt-4">
          You can revoke this connection anytime in Settings → AI Agent.
        </p>
      </div>
    </div>
  )
}

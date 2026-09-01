import { useState } from 'react'
import { supabase } from '../supabase'
import { APP_BASE_URL } from '../config'

export default function Login() {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [mfaFactorId, setMfaFactorId] = useState(null)
  const [mfaChallengeId, setMfaChallengeId] = useState(null)
  const [mfaCode, setMfaCode] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (totp) {
        const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        setMfaFactorId(totp.id)
        setMfaChallengeId(challenge?.id)
        setTab('mfa')
      }
    }
    setLoading(false)
  }

  const handleMfaVerify = async (code) => {
    const c = code ?? mfaCode
    if (c.length !== 6) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: mfaChallengeId, code: c })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleRequestAccess = async () => {
    setLoading(true)
    setError(null)

    if (!fullName || !email || !companyName) {
      setError('Name, email and company are required')
      setLoading(false)
      return
    }

    const { error } = await supabase
      .from('access_requests')
      .insert({
        full_name: fullName,
        email,
        company_name: companyName,
        notes,
        role,
        status: 'pending'
      })

    if (error) {
      setError('Error submitting request: ' + error.message)
      setLoading(false)
      return
    }

    const { error: notifyError } = await supabase.functions.invoke('notify-new-request', {
      body: { fullName, email, companyName, notes, role }
    })
    if (notifyError) console.error('notify-new-request failed:', notifyError)

    setSuccess("Request submitted! We'll be in touch within 1 business day to schedule your walkthrough.")
    setFullName('')
    setEmail('')
    setCompanyName('')
    setRole('')
    setNotes('')
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email) { setError('Enter your email address first'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_BASE_URL}/reset-password`
    })
    if (error) setError(error.message)
    else setSuccess('Password reset email sent — check your inbox')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-fp-inset flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-fp-text text-4xl font-bold">
            ForgePt<span className="text-[#C8622A]">.</span>
          </h1>
          <p className="text-fp-muted mt-2">Design it. Scope it. Close it.</p>
        </div>

        <div className="bg-fp-card rounded-2xl p-8">
          {tab !== 'mfa' && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => { setTab('login'); setError(null); setSuccess(null) }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === 'login' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setTab('request'); setError(null); setSuccess(null) }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === 'request' ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'
                }`}
              >
                Request Access
              </button>
            </div>
          )}

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          {success && <p className="text-green-400 text-sm mb-4">{success}</p>}

          {tab === 'mfa' ? (
            <div className="space-y-5">
              <div className="text-center">
                <div className="text-3xl mb-2">🔐</div>
                <p className="text-fp-text font-semibold">Two-factor authentication</p>
                <p className="text-fp-muted text-sm mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={mfaCode}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setMfaCode(v)
                  if (v.length === 6) handleMfaVerify(v)
                }}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-3 text-center tracking-[0.4em] text-xl focus:outline-none focus:border-fp-brand"
                placeholder="000000"
              />
              <button
                onClick={() => handleMfaVerify()}
                disabled={loading || mfaCode.length !== 6}
                className="w-full bg-fp-brand text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          ) : tab === 'login' ? (
            <div className="space-y-4">
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  placeholder="••••••••"
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-fp-brand text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                onClick={handleForgotPassword}
                className="w-full text-fp-muted hover:text-fp-text text-sm transition-colors"
              >
                Forgot password?
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-fp-muted text-sm">Tell us about your business and we will get you set up.</p>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  placeholder="Acme Electrical"
                />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Your Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                >
                  <option value="">Select your role</option>
                  {['Business Owner', 'Estimator', 'Project Manager', 'Sales Rep', 'Office Manager', 'Manufacturer / Supplier', 'Distributor', 'Other'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="text-fp-muted text-xs mb-1 block">Tell us about your business (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none"
                  placeholder="What trade do you work in? How many reps on your team?"
                />
              </div>
              <button
                onClick={handleRequestAccess}
                disabled={loading}
                className="w-full bg-fp-brand text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Request Access'}
              </button>
              <p className="text-fp-muted text-xs text-center">
                We typically respond within 1 business day.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
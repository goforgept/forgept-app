import { useState } from 'react'
import { supabase } from '../supabase'

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

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
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

    await supabase.functions.invoke('notify-new-request', {
      body: { fullName, email, companyName, notes, role }
    })

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
      redirectTo: 'https://app.goforgept.com/reset-password'
    })
    if (error) setError(error.message)
    else setSuccess('Password reset email sent — check your inbox')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-white text-4xl font-bold">
            ForgePt<span className="text-[#C8622A]">.</span>
          </h1>
          <p className="text-[#8A9AB0] mt-2">Manage. Propose. Close.</p>
        </div>

        <div className="bg-[#1a2d45] rounded-2xl p-8">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setTab('login'); setError(null); setSuccess(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'login' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('request'); setError(null); setSuccess(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'request' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'
              }`}
            >
              Request Access
            </button>
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          {success && <p className="text-green-400 text-sm mb-4">{success}</p>}

          {tab === 'login' ? (
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="••••••••"
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-[#C8622A] text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                onClick={handleForgotPassword}
                className="w-full text-[#8A9AB0] hover:text-white text-sm transition-colors"
              >
                Forgot password?
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[#8A9AB0] text-sm">Tell us about your business and we will get you set up.</p>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="Acme Electrical"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Your Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                >
                  <option value="">Select your role</option>
                  {['Business Owner', 'Estimator', 'Project Manager', 'Sales Rep', 'Office Manager', 'Manufacturer / Supplier', 'Distributor', 'Other'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Tell us about your business (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
                  placeholder="What trade do you work in? How many reps on your team?"
                />
              </div>
              <button
                onClick={handleRequestAccess}
                disabled={loading}
                className="w-full bg-[#C8622A] text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Request Access'}
              </button>
              <p className="text-[#8A9AB0] text-xs text-center">
                We typically respond within 1 business day.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
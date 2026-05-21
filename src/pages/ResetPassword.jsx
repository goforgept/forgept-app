import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [success, setSuccess]     = useState(false)
  const [ready, setReady]         = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the recovery token in the URL is valid.
    // detectSessionInUrl:true in supabase.js handles parsing the token automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // In case the event already fired before this component mounted, check for an
    // existing session (Supabase will have set it from the URL token on init).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    // If after 8 seconds there's still no recovery session, the link is likely expired.
    const timeout = setTimeout(() => {
      setReady(r => { if (!r) setLinkExpired(true); return r })
    }, 8000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const handleReset = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true)
    setLoading(false)
    // Sign out so the user logs in fresh with their new password
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center px-4">
      <div className="bg-[#1a2d45] p-8 rounded-xl w-full max-w-md">
        <h1 className="text-white text-3xl font-bold mb-1">
          ForgePt<span className="text-[#C8622A]">.</span>
        </h1>
        <p className="text-[#8A9AB0] text-sm mb-8">Set your new password</p>

        {success ? (
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-900/30 border border-green-700/40 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-green-400 font-semibold">Password updated!</p>
            <p className="text-[#8A9AB0] text-sm">Sign in with your new password to continue.</p>
            <a href="/" className="inline-block mt-2 text-[#C8622A] hover:text-white text-sm font-semibold transition-colors">
              Go to sign in →
            </a>
          </div>

        ) : linkExpired ? (
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <p className="text-red-400 font-semibold">Link expired or invalid</p>
            <p className="text-[#8A9AB0] text-sm">Password reset links expire after 1 hour. Request a new one from the sign-in page.</p>
            <a href="/" className="inline-block mt-2 text-[#C8622A] hover:text-white text-sm font-semibold transition-colors">
              Back to sign in →
            </a>
          </div>

        ) : !ready ? (
          <div className="text-center space-y-3">
            <svg className="w-7 h-7 animate-spin text-[#C8622A] mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-[#8A9AB0] text-sm">Verifying your reset link…</p>
          </div>

        ) : (
          <>
            {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#C8622A]"
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C8622A] text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

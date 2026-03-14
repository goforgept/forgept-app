import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleReset = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="bg-[#1a2d45] p-8 rounded-xl w-full max-w-md">
        <h1 className="text-white text-3xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] mb-8">Set your new password</p>

        {success ? (
          <div className="text-center">
            <p className="text-green-400 mb-4">Password updated successfully.</p>
            <a href="/" className="text-[#C8622A] hover:text-white text-sm transition-colors">
              Go to dashboard →
            </a>
          </div>
        ) : (
          <>
            {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-sm mb-1 block">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#8A9AB0] rounded-lg px-4 py-3 focus:outline-none focus:border-[#C8622A]"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C8622A] text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
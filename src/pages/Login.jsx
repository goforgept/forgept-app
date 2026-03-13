import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="bg-[#1a2d45] p-8 rounded-xl w-full max-w-md">
        <h1 className="text-white text-3xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] mb-8">Sign in to your account</p>

        {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-sm mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0F1C2E] text-white border border-[#8A9AB0] rounded-lg px-4 py-3 focus:outline-none focus:border-[#C8622A]"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="text-[#8A9AB0] text-sm mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0F1C2E] text-white border border-[#8A9AB0] rounded-lg px-4 py-3 focus:outline-none focus:border-[#C8622A]"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C8622A] text-white py-3 rounded-lg font-semibold hover:bg-[#b5571f] transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

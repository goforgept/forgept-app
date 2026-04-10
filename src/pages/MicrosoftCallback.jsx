import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function MicrosoftCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (!code || error) {
      navigate(`/settings?tab=integrations&microsoft_error=${error || 'missing_code'}`)
      return
    }

    // Forward params to edge function as query params — same pattern as Square and Google
    const edgeFnUrl = `https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/microsoft-oauth-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    window.location.href = edgeFnUrl
  }, [])

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] text-sm">Connecting Microsoft Calendar...</p>
        <div className="mt-4 w-6 h-6 border-2 border-[#C8622A] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )
}
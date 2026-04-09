import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SquareCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // The actual OAuth exchange happens in the Edge Function
    // This page just shows a brief loading state then redirects
    // The Edge Function itself redirects to /settings?tab=integrations&square_success=1
    // so this page should never actually render in normal flow
    // but handle it gracefully in case of direct navigation
    navigate('/settings?tab=integrations')
  }, [])

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] text-sm">Connecting Square...</p>
      </div>
    </div>
  )
}
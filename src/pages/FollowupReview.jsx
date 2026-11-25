import { useParams, useSearchParams, Link } from 'react-router-dom'
import FollowupEditor from '../components/FollowupEditor'

/** Public page behind the links in the day-before follow-up email. Works without signing in. */
export default function FollowupReview() {
  const { token } = useParams()
  const [params] = useSearchParams()
  return (
    <div className="min-h-screen bg-fp-bg px-4 py-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="text-fp-text text-xl font-bold">ForgePt<span className="text-fp-brand">.</span></span>
          <Link to="/" className="text-fp-muted text-sm hover:text-fp-text">Open ForgePt →</Link>
        </div>
        <div className="bg-fp-card border border-fp-border rounded-2xl p-5 sm:p-6">
          <h1 className="text-fp-text text-lg font-bold mb-4">Proposal follow-up</h1>
          <FollowupEditor token={token} initialAction={params.get('action')} />
        </div>
      </div>
    </div>
  )
}

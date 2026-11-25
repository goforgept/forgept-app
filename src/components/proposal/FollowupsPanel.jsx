import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../supabase'
import FollowupEditor from '../FollowupEditor'
import { STATUS_STYLE, STEP_LABEL, longDate } from '../../lib/followups'

/** Upcoming and past follow-ups for this proposal (all revisions share one schedule). */
export default function FollowupsPanel({ proposal, canEdit }) {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [openToken, setOpenToken] = useState(null)
  const chainId = proposal?.original_proposal_id || proposal?.id

  const load = useCallback(async () => {
    if (!chainId) return
    const { data, error } = await supabase.from('scheduled_followups')
      .select('id, step, status, send_on, subject, ai_generated, edited_by, skipped_by, skip_reason, cancel_reason, sent_at, action_token')
      .eq('chain_id', chainId).order('send_on', { ascending: true })
    if (error) { console.error('follow-ups:', error.message); setRows([]); return }
    setRows(data || [])
    const ids = [...new Set((data || []).flatMap(r => [r.edited_by, r.skipped_by]).filter(Boolean))]
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((ps || []).map(p => [p.id, p.full_name])))
    }
  }, [chainId])

  useEffect(() => { load() }, [load, proposal?.close_date, proposal?.status, proposal?.disable_followup_emails])

  if (!proposal || rows === null) return null

  const upcoming = rows.filter(r => r.status === 'scheduled' || r.status === 'sending')
  const past = rows.filter(r => !upcoming.includes(r)).sort((a, b) => (b.sent_at || b.send_on).localeCompare(a.sent_at || a.send_on))

  let empty = null
  if (!rows.length) {
    if (proposal.disable_followup_emails) empty = 'Follow-up emails are turned off for this proposal.'
    else if (proposal.status !== 'Sent') empty = 'Follow-ups are scheduled once the proposal is sent.'
    else if (!proposal.close_date) empty = 'Set a close date to schedule follow-ups.'
    else empty = 'Follow-ups will appear here within the hour.'
  }

  const Row = ({ r }) => {
    const paused = r.status === 'scheduled' && proposal.disable_followup_emails
    const st = paused ? { label: 'Paused', cls: 'bg-amber-500/15 text-amber-400' } : STATUS_STYLE[r.status] || STATUS_STYLE.scheduled
    const detail = paused ? 'Won’t send while follow-ups are off'
      : r.status === 'skipped' ? `Skipped by ${names[r.skipped_by] || 'the rep'}${r.skip_reason ? `: ${r.skip_reason}` : ''}`
      : r.status === 'cancelled' ? `Not sent: ${r.cancel_reason}`
      : r.status === 'sent' ? `Sent ${new Date(r.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : r.subject ? `“${r.subject}”${r.edited_by ? ` · edited by ${names[r.edited_by] || 'rep'}` : r.ai_generated ? ' · AI draft' : ''}`
      : 'Drafted the day before it sends'
    return (
      <li className="flex items-center gap-3 py-2.5 border-b border-fp-border last:border-0">
        <div className="w-24 shrink-0">
          <p className="text-fp-text text-sm font-medium">{longDate(r.send_on)}</p>
          <p className="text-fp-muted text-xs">{STEP_LABEL[r.step]}</p>
        </div>
        <p className="flex-1 min-w-0 text-fp-muted text-sm truncate" title={detail}>{detail}</p>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
        {canEdit && (
          <button onClick={() => setOpenToken(r.action_token)} className="text-fp-brand text-sm font-medium hover:opacity-80 w-12 text-right">
            {r.status === 'scheduled' ? 'Edit' : 'View'}
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="bg-fp-card rounded-xl px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-fp-text font-semibold">Follow-up emails</h3>
        <p className="text-fp-muted text-xs">You get a preview the day before each one</p>
      </div>
      {!empty && proposal.disable_followup_emails && upcoming.length > 0 && (
        <p className="text-amber-400 text-xs bg-amber-500/10 rounded-lg px-3 py-2 my-2">Follow-ups are off for this proposal. Nothing sends and you get no previews until you turn them back on; any that come due meanwhile are skipped.</p>
      )}
      {empty ? <p className="text-fp-muted text-sm py-2">{empty}</p> : (
        <ul>
          {upcoming.map(r => <Row key={r.id} r={r} />)}
          {past.map(r => <Row key={r.id} r={r} />)}
        </ul>
      )}

      {openToken && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center px-4 py-6 overflow-y-auto" onClick={() => setOpenToken(null)}>
          <div role="dialog" aria-label="Follow-up email" className="bg-fp-card border border-fp-border rounded-2xl p-5 sm:p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-1 -mr-1">
              <button onClick={() => setOpenToken(null)} aria-label="Close" className="text-fp-muted hover:text-fp-text text-xl leading-none px-2">×</button>
            </div>
            <FollowupEditor token={openToken} onChanged={load} />
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { followupAction, SKIP_REASONS, STATUS_STYLE, longDate } from '../lib/followups'

/**
 * Review / edit / skip / send-now for one scheduled follow-up, addressed by its action token.
 * Used by the public review page (links in the day-before email) and the proposal page panel.
 * `initialAction` = 'skip' | 'send' opens that step first (it still needs a click to confirm —
 * email link scanners open links, so nothing happens on load).
 */
export default function FollowupEditor({ token, initialAction, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [mode, setMode] = useState(initialAction === 'skip' ? 'skip' : initialAction === 'send' ? 'send' : 'edit')
  const [reason, setReason] = useState('')

  const apply = (d) => {
    setData(d)
    setSubject(d.followup.subject || '')
    setBody(d.followup.body || '')
  }

  useEffect(() => {
    let live = true
    followupAction(token, 'get').then(d => { if (live) apply(d) }).catch(e => live && setError(e.message))
    return () => { live = false }
  }, [token])

  const run = async (action, extra, done) => {
    setBusy(action); setError(''); setNotice('')
    try {
      const d = await followupAction(token, action, extra)
      apply(d); setNotice(done); setMode('edit'); onChanged?.()
    } catch (e) { setError(e.message) }
    setBusy('')
  }

  if (!data) {
    return error
      ? <p role="alert" className="text-red-400 text-sm">{error}</p>
      : <p className="text-fp-muted text-sm">Loading follow-up…</p>
  }

  const f = data.followup, p = data.proposal
  const open = f.status === 'scheduled'
  const dirty = subject !== (f.subject || '') || body !== (f.body || '')
  const st = STATUS_STYLE[f.status] || STATUS_STYLE.scheduled

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-fp-muted text-xs uppercase tracking-wide">{f.step_label} · {p.name}</p>
          <p className="text-fp-text text-sm mt-1">
            To <strong>{p.client_name || p.client_email}</strong>{p.client_email && p.client_name ? <span className="text-fp-muted"> &lt;{p.client_email}&gt;</span> : null}
          </p>
          {open && <p className="text-fp-muted text-sm">Sends {longDate(f.send_on)} at {f.send_time} ({f.timezone.replace('_', ' ')}) unless you skip it.</p>}
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span>
      </div>

      {f.warning && <p className="text-amber-400 text-sm bg-amber-500/10 rounded-lg px-3 py-2">{f.warning}</p>}
      {notice && <p role="status" className="text-green-400 text-sm">{notice}</p>}
      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}

      {!open && (
        <div className="text-fp-muted text-sm bg-fp-inset rounded-lg px-3 py-2">
          {f.status === 'sent' && <>Sent {new Date(f.sent_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.</>}
          {f.status === 'skipped' && <>Skipped by {f.skipped_by || 'the rep'}{f.skip_reason ? `: ${f.skip_reason}` : '.'}</>}
          {f.status === 'cancelled' && <>Not sent: {f.cancel_reason}.</>}
          {f.status === 'failed' && <>Couldn’t be sent{f.error ? ` (${f.error})` : ''}. Send it yourself from your email.</>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="fu-subject" className="text-fp-muted text-xs font-medium">Subject</label>
        <input id="fu-subject" value={subject} onChange={e => setSubject(e.target.value)} disabled={!open || !!busy}
          className="h-10 px-3 rounded-lg bg-fp-inset border border-fp-border text-fp-text text-sm disabled:opacity-70" />
        <label htmlFor="fu-body" className="text-fp-muted text-xs font-medium mt-1">Message</label>
        <textarea id="fu-body" value={body} onChange={e => setBody(e.target.value)} disabled={!open || !!busy} rows={12}
          className="px-3 py-2.5 rounded-lg bg-fp-inset border border-fp-border text-fp-text text-sm leading-relaxed disabled:opacity-70" />
        <p className="text-fp-muted text-xs">
          {f.ai_generated && !f.edited_by ? 'AI-written draft. Read it over before it goes. ' : ''}
          {f.edited_by ? `Edited by ${f.edited_by}. ` : ''}
          Your logo goes at the top; replies come to you.
        </p>
      </div>

      {open && mode === 'edit' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run('save', { subject, body }, 'Saved. This version will be sent.')} disabled={!dirty || !!busy}
            className="h-10 px-4 rounded-lg bg-fp-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          <button onClick={() => setMode('send')} disabled={!!busy}
            className="h-10 px-4 rounded-lg border border-fp-border text-fp-text text-sm hover:bg-fp-hover">Send now</button>
          <button onClick={() => setMode('skip')} disabled={!!busy}
            className="h-10 px-4 rounded-lg border border-fp-border text-fp-text text-sm hover:bg-fp-hover">Skip this one</button>
          <button onClick={() => window.confirm('Replace this message with a fresh draft? Your edits will be lost.') && run('redraft', {}, 'Rewritten.')} disabled={!!busy}
            className="h-10 px-3 text-fp-muted text-sm hover:text-fp-text">{busy === 'redraft' ? 'Rewriting…' : 'Start over'}</button>
        </div>
      )}

      {open && mode === 'send' && (
        <div className="flex flex-col gap-3 bg-fp-inset rounded-lg p-4">
          <p className="text-fp-text text-sm">Send this to {p.client_email} now{dirty ? ', with your changes' : ''}?</p>
          <div className="flex gap-2">
            <button onClick={async () => {
              if (dirty) { try { await followupAction(token, 'save', { subject, body }) } catch (e) { setError(e.message); return } }
              run('send_now', {}, 'Sent.')
            }} disabled={!!busy}
              className="h-10 px-4 rounded-lg bg-fp-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">{busy === 'send_now' ? 'Sending…' : 'Send it'}</button>
            <button onClick={() => setMode('edit')} disabled={!!busy} className="h-10 px-4 text-fp-muted text-sm hover:text-fp-text">Back</button>
          </div>
        </div>
      )}

      {open && mode === 'skip' && (
        <div className="flex flex-col gap-3 bg-fp-inset rounded-lg p-4">
          <p className="text-fp-text text-sm">Skip this follow-up? The next one stays scheduled. The skip is logged on the proposal.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Reason">
            {SKIP_REASONS.map(r => (
              <button key={r} onClick={() => setReason(reason === r ? '' : r)} aria-pressed={reason === r}
                className={`px-3 py-1.5 rounded-full text-xs border ${reason === r ? 'bg-fp-brand text-white border-fp-brand' : 'border-fp-border text-fp-text hover:bg-fp-hover'}`}>{r}</button>
            ))}
          </div>
          <label htmlFor="fu-reason" className="sr-only">Reason (optional)</label>
          <input id="fu-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={300}
            className="h-10 px-3 rounded-lg bg-fp-card border border-fp-border text-fp-text text-sm" />
          <div className="flex gap-2">
            <button onClick={() => run('skip', { reason }, 'Skipped. It won’t be sent.')} disabled={!!busy}
              className="h-10 px-4 rounded-lg bg-fp-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">{busy === 'skip' ? 'Skipping…' : 'Skip it'}</button>
            <button onClick={() => setMode('edit')} disabled={!!busy} className="h-10 px-4 text-fp-muted text-sm hover:text-fp-text">Back</button>
          </div>
        </div>
      )}
    </div>
  )
}

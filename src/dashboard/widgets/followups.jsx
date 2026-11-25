import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { useDash } from '../context'
import { Card, Empty, Row, Eyebrow, Chip } from '../ui'
import { C, DAY, todayYMD } from '../util'
import FollowupEditor from '../../components/FollowupEditor'
import { STEP_LABEL, longDate } from '../../lib/followups'

const ymd = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toLocaleDateString('en-CA')

/** Proposal follow-ups: what's going out, what needs a look, and what's falling through. */
export function FollowUps() {
  const { data, isTeam, go } = useDash()
  const [patched, setPatched] = useState({})   // rows refreshed after an action in the modal
  const [open, setOpen] = useState(null)       // { token, action, id }

  const proposals = data.proposals || []
  const byChain = useMemo(() => new Map(proposals.map(p => [p.original_proposal_id || p.id, p])), [proposals])
  const names = useMemo(() => new Map((data.profiles || []).map(p => [p.id, p.full_name])), [data.profiles])
  const rows = useMemo(() => (data.followups || []).map(r => patched[r.id] || r), [data.followups, patched])

  const today = todayYMD(), in14 = ymd(14), weekAgo = ymd(-7), monthAgo = ymd(-30)
  const prop = (r) => byChain.get(r.chain_id)
  const paused = (r) => r.status === 'scheduled' && prop(r)?.disable_followup_emails
  const day = (iso) => (iso || '').slice(0, 10)

  // ── What needs doing ──
  const review = rows.filter(r => r.status === 'scheduled' && r.notified_at && !paused(r))
  const coming = rows.filter(r => r.status === 'scheduled' && !r.notified_at && r.send_on <= in14)
  const failed = rows.filter(r => r.status === 'failed')
  const noEmail = rows.filter(r => r.status === 'cancelled' && r.cancel_reason === 'Client has no email address' && r.send_on >= monthAgo)
  const noCloseDate = proposals.filter(p => p.status === 'Sent' && !p.close_date && !p.disable_followup_emails)
  const problems = failed.length + noEmail.length + noCloseDate.length

  // ── This week ──
  const week = {
    scheduled: rows.filter(r => r.status === 'scheduled' && r.send_on <= ymd(7)).length,
    sent: rows.filter(r => r.status === 'sent' && day(r.sent_at) >= weekAgo).length,
    skipped: rows.filter(r => r.status === 'skipped' && day(r.skipped_at) >= weekAgo).length,
    notSent: rows.filter(r => (r.status === 'cancelled' || r.status === 'failed') && r.send_on >= weekAgo && r.send_on <= today).length,
  }

  // ── By rep (team view), last 30 days ──
  const byRep = useMemo(() => {
    if (!isTeam) return []
    const m = new Map()
    for (const r of rows) {
      const uid = prop(r)?.user_id
      if (!uid || !(r.status === 'sent' || r.status === 'skipped')) continue
      const e = m.get(uid) || { uid, sent: 0, skipped: 0, reasons: {} }
      if (r.status === 'sent') e.sent++
      else { e.skipped++; const why = r.skip_reason || 'No reason given'; e.reasons[why] = (e.reasons[why] || 0) + 1 }
      m.set(uid, e)
    }
    return [...m.values()].map(e => ({
      ...e, name: names.get(e.uid) || 'Unknown',
      rate: Math.round(100 * e.skipped / Math.max(1, e.sent + e.skipped)),
      topReason: Object.entries(e.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    })).sort((a, b) => b.skipped - a.skipped || b.sent - a.sent)
  }, [rows, isTeam, names, byChain])

  const who = (r) => {
    const p = prop(r)
    return [p?.company || p?.client_name, isTeam ? names.get(p?.user_id) : null].filter(Boolean).join(' · ')
  }

  const refresh = async (id) => {
    const { data: row } = await supabase.from('scheduled_followups')
      .select('id, chain_id, proposal_id, step, status, send_on, subject, ai_generated, edited_by, notified_at, sent_at, skipped_by, skipped_at, skip_reason, cancel_reason, error, action_token')
      .eq('id', id).maybeSingle()
    if (row) setPatched(m => ({ ...m, [id]: row }))
  }

  const nothing = !review.length && !coming.length && !problems && !byRep.length

  return (
    <Card title="Follow-ups" sub="Proposal follow-up emails"
      right={review.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-fp-brand bg-fp-brand/15 tabular-nums" title="Waiting for review">{review.length}</span>}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fp-muted tabular-nums" aria-label="This week">
        <span><strong className="text-fp-text">{week.scheduled}</strong> scheduled</span>
        <span><strong className="text-fp-text">{week.sent}</strong> sent</span>
        <span><strong className="text-fp-text">{week.skipped}</strong> skipped</span>
        <span><strong className={week.notSent ? 'text-amber-500' : 'text-fp-text'}>{week.notSent}</strong> not sent</span>
        <span className="text-fp-muted/70">this week</span>
      </div>

      {nothing ? <Empty>No follow-ups coming up. They're scheduled when a proposal is sent with a close date.</Empty> : (
        <div className="flex flex-col gap-4">
          <Group label="Sending soon, review" color={C.orange} items={review} render={r => (
            <div key={r.id} className="flex flex-col gap-1.5 py-1">
              <Row onClick={() => setOpen({ token: r.action_token, id: r.id })} title={prop(r)?.proposal_name || 'Proposal'}
                sub={`${STEP_LABEL[r.step]} · ${longDate(r.send_on)}${who(r) ? ` · ${who(r)}` : ''}`}
                right={<span className="text-fp-muted text-xs max-w-[12rem] truncate inline-block align-middle" title={r.subject}>“{r.subject}”</span>} />
              <div className="flex gap-2">
                <Btn primary onClick={() => setOpen({ token: r.action_token, id: r.id })}>Review</Btn>
                <Btn onClick={() => setOpen({ token: r.action_token, id: r.id, action: 'skip' })}>Skip</Btn>
                <Btn onClick={() => setOpen({ token: r.action_token, id: r.id, action: 'send' })}>Send now</Btn>
              </div>
            </div>
          )} />

          <Group label="Coming up" color={C.slate} items={coming} render={r => (
            <Row key={r.id} onClick={() => setOpen({ token: r.action_token, id: r.id })} title={prop(r)?.proposal_name || 'Proposal'}
              sub={`${STEP_LABEL[r.step]}${who(r) ? ` · ${who(r)}` : ''}`}
              right={paused(r) ? <Chip color={C.amber}>Paused</Chip> : <span className="text-fp-muted text-xs">{longDate(r.send_on)}</span>} />
          )} />

          {problems > 0 && (
            <div className="flex flex-col gap-3">
              <Group label="Couldn't send" color={C.red} items={failed} render={r => (
                <Row key={r.id} onClick={() => go(`/proposal/${r.proposal_id}`)} title={prop(r)?.proposal_name || 'Proposal'}
                  sub={`${STEP_LABEL[r.step]} · ${longDate(r.send_on)}${who(r) ? ` · ${who(r)}` : ''}`} right={<span className="text-red-500 text-xs font-semibold">Failed</span>} />
              )} />
              <Group label="Client has no email" color={C.amber} items={noEmail} render={r => (
                <Row key={r.id} onClick={() => go(`/proposal/${r.proposal_id}`)} title={prop(r)?.proposal_name || 'Proposal'}
                  sub={`${STEP_LABEL[r.step]} not sent${who(r) ? ` · ${who(r)}` : ''}`} right={<span className="text-amber-500 text-xs font-semibold">Add email</span>} />
              )} />
              <Group label="Sent, but no close date (no follow-ups)" color={C.amber} items={noCloseDate} render={p => (
                <Row key={p.id} onClick={() => go(`/proposal/${p.id}`)} title={p.proposal_name || 'Untitled'}
                  sub={[p.company, isTeam ? p.rep_name : null].filter(Boolean).join(' · ')} right={<span className="text-amber-500 text-xs font-semibold">Set date</span>} />
              )} />
            </div>
          )}

          {byRep.length > 0 && (
            <div className="flex flex-col gap-1">
              <Eyebrow>By rep · last 30 days</Eyebrow>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm tabular-nums">
                  <thead><tr className="text-fp-muted text-xs text-left">
                    <th className="font-medium px-1 py-1">Rep</th><th className="font-medium px-1 py-1 text-right">Sent</th>
                    <th className="font-medium px-1 py-1 text-right">Skipped</th><th className="font-medium px-1 py-1">Top skip reason</th>
                  </tr></thead>
                  <tbody>
                    {byRep.map(e => (
                      <tr key={e.uid} className="border-t border-fp-border">
                        <td className="px-1 py-1.5 text-fp-text truncate max-w-[9rem]">{e.name}</td>
                        <td className="px-1 py-1.5 text-right text-fp-text">{e.sent}</td>
                        <td className={`px-1 py-1.5 text-right ${e.rate >= 50 && e.skipped >= 3 ? 'text-amber-500 font-semibold' : 'text-fp-text'}`}>{e.skipped}{e.skipped ? <span className="text-fp-muted text-xs"> ({e.rate}%)</span> : null}</td>
                        <td className="px-1 py-1.5 text-fp-muted text-xs truncate max-w-[12rem]">{e.topReason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center px-4 py-6 overflow-y-auto" onClick={() => { refresh(open.id); setOpen(null) }}>
          <div role="dialog" aria-label="Follow-up email" className="bg-fp-card border border-fp-border rounded-2xl p-5 sm:p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-1 -mr-1">
              <button onClick={() => { refresh(open.id); setOpen(null) }} aria-label="Close" className="text-fp-muted hover:text-fp-text text-xl leading-none px-2">×</button>
            </div>
            <FollowupEditor token={open.token} initialAction={open.action} onChanged={() => refresh(open.id)} />
          </div>
        </div>
      )}
    </Card>
  )
}

function Group({ label, color, items, render }) {
  const [all, setAll] = useState(false)
  if (!items.length) return null
  const shown = all ? items : items.slice(0, 4)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /><Eyebrow>{label} · {items.length}</Eyebrow></div>
      {shown.map(render)}
      {items.length > 4 && <button onClick={() => setAll(v => !v)} className="text-fp-muted hover:text-fp-text text-xs text-left">{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  )
}

function Btn({ primary, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors ${primary ? 'bg-fp-brand text-white hover:opacity-90' : 'text-fp-text border border-fp-border hover:bg-fp-hover'}`}>{children}</button>
  )
}

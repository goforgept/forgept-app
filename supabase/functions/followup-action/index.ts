// Rep actions on one scheduled follow-up: get (review), save (edit), skip, send_now, redraft.
//
// Authorized by the row's action_token — an unguessable id that is only ever emailed to the
// proposal's rep and shown to signed-in members of the same org — so the review link in the
// preview email works on a phone without signing in. If a signed-in user calls it, the action is
// logged as theirs; otherwise as the proposal owner's.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"
import {
  adminClient, must, currentProposal, blocker, draft, sendRow, activity, hourLabel,
  loadRep, STEP_LABEL,
} from "../_shared/followups.ts"

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { token, action, subject, body, reason } = await req.json().catch(() => ({}))
    if (!UUID.test(token || '')) return json({ error: 'This link is invalid.' }, 404)

    const db = adminClient()
    const row = must(await db.from('scheduled_followups').select('*').eq('action_token', token).maybeSingle(), 'load follow-up') as any
    if (!row) return json({ error: 'This link is invalid or the follow-up was removed.' }, 404)

    const p = await currentProposal(db, row.chain_id)
    if (!p) return json({ error: 'The proposal for this follow-up no longer exists.' }, 404)

    // Who is acting: a signed-in member of this org, else the proposal's rep (the link holder)
    let actorId = p.user_id
    if (req.headers.get('Authorization')) {
      const { user, profile } = await validateUser(req)
      if (user && profile?.org_id === row.org_id) actorId = user.id
    }
    const { data: actor } = await db.from('profiles').select('full_name').eq('id', actorId).maybeSingle()
    const actorName = actor?.full_name || 'the rep'
    const now = new Date().toISOString()
    const open = row.status === 'scheduled'

    if (action === 'save') {
      if (!open) return json({ error: `This follow-up was already ${row.status}.` }, 409)
      const s = String(subject || '').trim(), b = String(body || '').trim()
      if (!s || !b) return json({ error: 'Subject and message can’t be empty.' }, 400)
      if (s.length > 200 || b.length > 10000) return json({ error: 'That message is too long.' }, 400)
      must(await db.from('scheduled_followups').update({ subject: s, body: b, edited_by: actorId, edited_at: now, updated_at: now })
        .eq('id', row.id).eq('status', 'scheduled'), 'save follow-up')
    }

    else if (action === 'redraft') {
      if (!open) return json({ error: `This follow-up was already ${row.status}.` }, 409)
      const { data: org } = await db.from('organizations').select('followup_ai').eq('id', row.org_id).maybeSingle()
      const profile = await loadRep(db, p.user_id, p.org_id)
      const d = await draft(db, row, p, profile, !!org?.followup_ai)
      must(await db.from('scheduled_followups').update({ ...d, edited_by: null, edited_at: null, updated_at: now })
        .eq('id', row.id).eq('status', 'scheduled'), 'redraft follow-up')
    }

    else if (action === 'skip') {
      if (!open) return json({ error: `This follow-up was already ${row.status}.` }, 409)
      const why = String(reason || '').trim().slice(0, 300) || null
      const done = must(await db.from('scheduled_followups')
        .update({ status: 'skipped', skipped_by: actorId, skipped_at: now, skip_reason: why, updated_at: now })
        .eq('id', row.id).eq('status', 'scheduled').select('id'), 'skip follow-up') as any[]
      if (done.length) {
        await activity(db, {
          proposal_id: p.id, client_id: p.client_id, org_id: p.org_id, user_id: actorId, source: 'user',
          title: `${STEP_LABEL[row.step as keyof typeof STEP_LABEL]} follow-up skipped by ${actorName}${why ? `: ${why}` : ''}`,
        })
      }
    }

    else if (action === 'send_now') {
      if (!open) return json({ error: `This follow-up was already ${row.status}.` }, 409)
      const r = await sendRow(db, { ...row, proposal_id: p.id }, { actorId })
      if (r.status !== 'sent') return json({ error: r.reason ? `Not sent: ${r.reason}.` : 'Not sent.' }, 409)
    }

    else if (action && action !== 'get') return json({ error: 'Unknown action' }, 400)

    // ── Return the current state (drafting it first if it hasn't been written yet) ──
    let fresh = must(await db.from('scheduled_followups').select('*').eq('id', row.id).single(), 'reload follow-up') as any
    if (fresh.status === 'scheduled' && (!fresh.subject || !fresh.body)) {
      const { data: org } = await db.from('organizations').select('followup_ai').eq('id', row.org_id).maybeSingle()
      const profile = await loadRep(db, p.user_id, p.org_id)
      const d = await draft(db, fresh, p, profile, !!org?.followup_ai)
      fresh = must(await db.from('scheduled_followups').update({ ...d, updated_at: now }).eq('id', row.id).select('*').single(), 'save draft') as any
    }

    const { data: org } = await db.from('organizations').select('timezone, followup_send_hour').eq('id', row.org_id).maybeSingle()
    const names: Record<string, string> = {}
    const ids = [fresh.edited_by, fresh.skipped_by].filter(Boolean)
    if (ids.length) {
      const { data } = await db.from('profiles').select('id, full_name').in('id', ids)
      for (const n of data || []) names[n.id] = n.full_name
    }
    const why = blocker(p)

    return json({
      followup: {
        step: fresh.step, step_label: STEP_LABEL[fresh.step as keyof typeof STEP_LABEL], status: fresh.status,
        send_on: fresh.send_on, send_time: hourLabel(Number.isInteger(org?.followup_send_hour) ? org!.followup_send_hour : 9),
        timezone: org?.timezone || 'America/Chicago',
        subject: fresh.subject, body: fresh.body, ai_generated: fresh.ai_generated,
        edited_by: names[fresh.edited_by] || null, edited_at: fresh.edited_at,
        skipped_by: names[fresh.skipped_by] || null, skip_reason: fresh.skip_reason, sent_at: fresh.sent_at,
        cancel_reason: fresh.cancel_reason, error: fresh.error,
        warning: why && why !== 'hold' ? why : why === 'hold' ? 'This proposal is being revised. The follow-up waits until the revision is sent.' : null,
      },
      proposal: { id: p.id, name: p.proposal_name, client_name: p.client_name, client_email: p.client_email, company: p.company },
    })
  } catch (e: any) {
    console.error('followup-action failed:', e)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})

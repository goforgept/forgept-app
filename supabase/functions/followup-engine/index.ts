// Hourly proposal follow-up engine (pg_cron → this function, CRON_SECRET auth).
//
// Every hour, for every org:
//   1. PLAN     — make sure each current, sent proposal with a close date has its follow-up rows
//                 (one per step in the rep's cadence), and keep send dates in step with the close date.
// At the org's send hour (organizations.followup_send_hour, in organizations.timezone):
//   2. SEND     — send today's rows (only ones the rep was shown the day before).
//   3. PREPARE  — draft tomorrow's rows (template or AI) and email the rep a preview with
//                 Review / Skip / Send now. If the rep does nothing, step 2 sends it the next day.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { isCronRequest } from "../_shared/cron.ts"
import {
  adminClient, must, localDate, localHour, addDays, businessDay, cadence, draft, currentProposal, blocker, PAUSE_REASON,
  sendRow, sendPreview, notify, loadRep, STEP_LABEL,
} from "../_shared/followups.ts"

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (!isCronRequest(req)) return json({ error: 'Unauthorized' }, 401)
  const db = adminClient()
  // Optional: {"force_org": "<uuid>"} runs send/prepare for one org regardless of the hour (testing)
  const body = await req.json().catch(() => ({}))
  const stats = { orgs: 0, planned: 0, rescheduled: 0, cancelled: 0, sent: 0, failed: 0, previews: 0, errors: [] as string[] }

  try {
    const orgs = must(await db.from('organizations').select('id, timezone, followup_send_hour, followup_ai'), 'load orgs') as any[]

    // Unstick rows left mid-send by a crash more than an hour ago
    await db.from('scheduled_followups').update({ status: 'failed', error: 'Interrupted while sending' })
      .eq('status', 'sending').lt('updated_at', new Date(Date.now() - 3600_000).toISOString())

    for (const org of orgs) {
      try {
        const tz = org.timezone || 'America/Chicago'
        const sendHour = Number.isInteger(org.followup_send_hour) ? org.followup_send_hour : 9
        const today = localDate(tz), tomorrow = localDate(tz, 1)
        const atSendHour = localHour(tz) === sendHour || body.force_org === org.id

        const did = await plan(db, org.id, today)
        stats.planned += did.created; stats.rescheduled += did.moved; stats.cancelled += did.cancelled
        if (!atSendHour) continue
        stats.orgs++

        // ── SEND today's (and any overdue) rows the rep has already seen ──
        const due = must(await db.from('scheduled_followups').select('*')
          .eq('org_id', org.id).eq('status', 'scheduled').lte('send_on', today).not('notified_at', 'is', null), 'load due') as any[]
        for (const row of due) {
          const r = await sendRow(db, row)
          if (r.status === 'sent') stats.sent++
          else if (r.status === 'failed') stats.failed++
          else if (r.status === 'cancelled') stats.cancelled++
        }

        // ── PREPARE tomorrow's (and any not-yet-previewed late rows) ──
        const upcoming = must(await db.from('scheduled_followups').select('*')
          .eq('org_id', org.id).eq('status', 'scheduled').lte('send_on', tomorrow).is('notified_at', null), 'load upcoming') as any[]
        for (const row of upcoming) {
          const p = await currentProposal(db, row.chain_id)
          const why = blocker(p)
          if (why && PAUSE_REASON[why]) {
            // Paused or being revised: no preview. Once its send day arrives, record it as not sent.
            if (row.send_on <= today) {
              await db.from('scheduled_followups').update({ status: 'cancelled', cancel_reason: PAUSE_REASON[why], updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'scheduled')
              stats.cancelled++
            }
            continue
          }
          if (why) {
            await db.from('scheduled_followups').update({ status: 'cancelled', cancel_reason: why, updated_at: new Date().toISOString() }).eq('id', row.id)
            stats.cancelled++
            if (why === 'Client has no email address') {
              await notify(db, {
                org_id: org.id, user_id: p.user_id, type: 'followup_failed',
                title: `Follow-up not sent — no client email`,
                body: `${p.proposal_name}: add an email for ${p.client_name || 'the client'} to keep follow-ups going.`,
                link: `/proposal/${p.id}`, dedup_key: `followup_noemail:${row.id}`,
              })
            }
            continue
          }
          const profile = await loadRep(db, p.user_id, p.org_id)
          // Keep a rep's own edits; otherwise draft fresh so it reflects the proposal as it is today
          const content = row.edited_by ? { subject: row.subject, body: row.body, ai_generated: row.ai_generated } : await draft(db, row, p, profile, !!org.followup_ai)
          const send_on = row.send_on < tomorrow ? tomorrow : row.send_on   // always give a day's notice
          const updated = { ...content, send_on, proposal_id: p.id, updated_at: new Date().toISOString() }
          must(await db.from('scheduled_followups').update(updated).eq('id', row.id).eq('status', 'scheduled'), 'save draft')

          // Tell the rep — email and bell. The send pass only sends rows marked notified, so a
          // follow-up never goes out unless at least one of these actually reached the rep.
          const full = { ...row, ...updated }
          let emailed = false
          if (profile?.email) {
            try { await sendPreview(full, p, profile, { tz, hour: sendHour }); emailed = true; stats.previews++ }
            catch (e) { console.error(`preview email failed for ${row.id}:`, e) }
          }
          const belled = await notify(db, {
            org_id: org.id, user_id: p.user_id, type: 'followup_preview',
            title: `Follow-up sends tomorrow — ${p.company || p.client_name || p.proposal_name}`,
            body: `${STEP_LABEL[row.step as keyof typeof STEP_LABEL]}: "${full.subject}". Review, edit or skip it.`,
            link: `/followup/${row.action_token}`, dedup_key: `followup_preview:${row.id}:${send_on}`,
          })
          if (emailed || belled) {
            must(await db.from('scheduled_followups').update({ notified_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'scheduled'), 'mark notified')
          } else {
            // Neither got through: leave it un-notified; tomorrow's run previews it again and moves the send a day
            stats.errors.push(`preview not delivered for follow-up ${row.id}`)
          }
        }
      } catch (e: any) {
        console.error(`follow-ups failed for org ${org.id}:`, e)
        stats.errors.push(`${org.id}: ${e?.message || e}`)
      }
    }
    return json({ success: stats.errors.length === 0, ...stats })
  } catch (e: any) {
    console.error('followup-engine failed:', e)
    return json({ error: e?.message || String(e), ...stats }, 500)
  }
})

/** Create missing rows and keep scheduled ones in step with each proposal's close date. */
async function plan(db: any, orgId: string, today: string) {
  const out = { created: 0, moved: 0, cancelled: 0 }

  // Current, sent, unarchived proposals with a close date — paged past PostgREST's 1000-row cap
  const proposals: any[] = []
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from('proposals')
      .select('id, original_proposal_id, user_id, close_date, disable_followup_emails')
      .eq('org_id', orgId).eq('status', 'Sent').is('archived_at', null)
      .not('is_current_revision', 'is', false).not('close_date', 'is', null)
      .order('id').range(from, from + 999), 'load proposals') as any[]
    proposals.push(...page)
    if (page.length < 1000) break
  }
  const live = proposals.filter(p => !p.disable_followup_emails)
  if (!live.length) return out

  const repIds = [...new Set(live.map(p => p.user_id).filter(Boolean))]
  const reps: Record<string, any> = {}
  for (let i = 0; i < repIds.length; i += 150) {
    for (const id of repIds.slice(i, i + 150)) reps[id] = await loadRep(db, id, orgId)
  }

  const chainOf = (p: any) => p.original_proposal_id || p.id
  const existing: Record<string, any> = {}
  const chains = [...new Set(live.map(chainOf))]
  for (let i = 0; i < chains.length; i += 150) {
    const rows = must(await db.from('scheduled_followups').select('id, chain_id, step, status, send_on, proposal_id')
      .in('chain_id', chains.slice(i, i + 150)), 'load schedule') as any[]
    for (const r of rows) existing[`${r.chain_id}:${r.step}`] = r
  }

  const inserts: any[] = []
  for (const p of live) {
    if (!p.user_id) continue
    const chain = chainOf(p)
    for (const { step, days } of cadence(reps[p.user_id])) {
      const sendOn = businessDay(addDays(p.close_date, -days))
      const row = existing[`${chain}:${step}`]
      if (!row) {
        // Only schedule what's still ahead, so there's always a day's preview and no backlog blast
        if (sendOn > today) inserts.push({ org_id: orgId, proposal_id: p.id, chain_id: chain, step, days_before: days, send_on: sendOn })
        continue
      }
      if (row.status !== 'scheduled') continue   // sent / skipped / cancelled steps never come back
      if (row.send_on === sendOn && row.proposal_id === p.id) continue
      if (sendOn <= today) {
        must(await db.from('scheduled_followups').update({ status: 'cancelled', cancel_reason: 'Close date moved past this step', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'scheduled'), 'cancel moved')
        out.cancelled++
      } else {
        const patch: any = { proposal_id: p.id, days_before: days, updated_at: new Date().toISOString() }
        if (row.send_on !== sendOn) { patch.send_on = sendOn; patch.notified_at = null; out.moved++ }
        must(await db.from('scheduled_followups').update(patch).eq('id', row.id).eq('status', 'scheduled'), 'reschedule')
      }
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    must(await db.from('scheduled_followups').upsert(inserts.slice(i, i + 500), { onConflict: 'chain_id,step', ignoreDuplicates: true }), 'create schedule')
  }
  out.created = inserts.length
  return out
}

// Proposal follow-ups: shared logic for the hourly engine (followup-engine) and the
// rep's review / skip / send-now actions (followup-action).
//
// A follow-up is a row in scheduled_followups. Rows are keyed by (chain_id, step), where
// chain_id is the proposal's original id, so a revised proposal carries on with the same
// schedule instead of restarting it. The row's subject/body are exactly what the client gets.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@1.14.0"
import { sendEmail } from "./email.ts"
import { checkAndIncrementAIUsage } from "./ai-usage.ts"

export const APP_URL = 'https://app.goforgept.com'

export const STEPS = ['early', '14day', '7day', 'close'] as const
export type Step = typeof STEPS[number]

export const STEP_LABEL: Record<Step, string> = {
  early: 'First check-in',
  '14day': 'Check-in',
  '7day': 'One week out',
  close: 'Close day',
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
}

/** Throw on a Supabase error so failures are loud, never silently treated as "nothing to do". */
export function must<T>(res: { data: T | null; error: any }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message || JSON.stringify(res.error)}`)
  return res.data as T
}

// ── Dates in the org's time zone ──────────────────────────────────────────

export function localDate(tz: string, offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function localHour(tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date())
  return parseInt(h) % 24
}
export function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
/** Move a Saturday or Sunday back to the Friday before, so follow-ups go out on business days
 *  and still land ahead of the close date. */
export function businessDay(ymd: string): string {
  const dow = new Date(ymd + 'T12:00:00Z').getUTCDay()
  return dow === 6 ? addDays(ymd, -1) : dow === 0 ? addDays(ymd, -2) : ymd
}
export function hourLabel(h: number): string {
  const hr = ((h + 11) % 12) + 1
  return `${hr}:00 ${h < 12 ? 'AM' : 'PM'}`
}
export function niceDate(ymd: string): string {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// ── Rep cadence + templates (Settings → Email Templates) ──────────────────

export const PROFILE_FIELDS = 'id, org_id, full_name, email, company_name, logo_url, email_cadence_early, email_cadence_14day, email_cadence_7day, email_template_early_subject, email_template_early_body, email_template_14day_subject, email_template_14day_body, email_template_7day_subject, email_template_7day_body, email_template_close_subject, email_template_close_body'

const TEMPLATE_FIELDS = PROFILE_FIELDS.split(', ').filter(f => f.startsWith('email_'))

// Templates are edited in Settings → Email Templates, which only admins can open, and saved on
// that admin's profile. So a rep's own saved values win, and anything they haven't set comes
// from the org's admins (the one with the most template fields filled in).
const orgDefaultsCache = new Map<string, Promise<Record<string, any>>>()
function orgTemplateDefaults(db: SupabaseClient, orgId: string) {
  if (!orgDefaultsCache.has(orgId)) {
    orgDefaultsCache.set(orgId, (async () => {
      const { data } = await db.from('profiles').select(TEMPLATE_FIELDS.join(', ')).eq('org_id', orgId).eq('org_role', 'admin')
      const filled = (p: any) => TEMPLATE_FIELDS.filter(f => p[f] !== null && p[f] !== '').length
      return ((data || []) as any[]).sort((a, b) => filled(b) - filled(a))[0] || {}
    })())
  }
  return orgDefaultsCache.get(orgId)!
}

/** The rep's profile with company-wide template and cadence values filled in where theirs are blank. */
export async function loadRep(db: SupabaseClient, userId: string, orgId: string): Promise<any> {
  const rep = must(await db.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle(), 'load rep') as any || {}
  const org = await orgTemplateDefaults(db, orgId)
  const merged = { ...rep }
  for (const f of TEMPLATE_FIELDS) if (merged[f] === null || merged[f] === undefined || merged[f] === '') merged[f] = org[f] ?? null
  return merged
}

/** Days before close for each step, per the rep's cadence. Duplicate days are dropped (first wins). */
export function cadence(profile: any): { step: Step; days: number }[] {
  const raw: { step: Step; days: number }[] = [
    { step: 'early', days: num(profile?.email_cadence_early, 30) },
    { step: '14day', days: num(profile?.email_cadence_14day, 14) },
    { step: '7day', days: num(profile?.email_cadence_7day, 7) },
    { step: 'close', days: 0 },
  ]
  const seen = new Set<number>()
  return raw.filter(s => s.days >= 0 && !seen.has(s.days) && seen.add(s.days))
}
function num(v: any, d: number) { const n = parseInt(v); return isNaN(n) ? d : n }

const DEFAULT_TEMPLATES: Record<Step, { subject: string; body: string }> = {
  early: {
    subject: 'Following up — {{proposalName}}',
    body: "Hi {{clientName}},\n\nI hope things are going well. I wanted to follow up on the proposal we sent over for {{proposalName}}.\n\nThe total investment for this project comes to {{proposalValue}}. We're excited about the opportunity to work with you and would love to answer any questions.\n\nIs there a good time this week to connect?\n\nLooking forward to hearing from you.\n\n{{repName}}\n{{companyName}}",
  },
  '14day': {
    subject: 'Quick check-in — {{proposalName}}',
    body: "Hi {{clientName}},\n\nJust wanted to check in on the proposal for {{proposalName}}.\n\n{{repName}}\n{{companyName}}",
  },
  '7day': {
    subject: 'One week left — {{proposalName}}',
    body: "Hi {{clientName}},\n\nWe're just one week away from the date we had targeted for {{proposalName}}.\n\n{{repName}}\n{{companyName}}",
  },
  close: {
    subject: "Today's the day — {{proposalName}}",
    body: "Hi {{clientName}},\n\nToday is the date we had targeted to move forward on {{proposalName}}.\n\n{{repName}}\n{{companyName}}",
  },
}

export function templateFor(profile: any, step: Step): { subject: string; body: string } {
  const d = DEFAULT_TEMPLATES[step]
  return {
    subject: profile?.[`email_template_${step}_subject`] || d.subject,
    body: profile?.[`email_template_${step}_body`] || d.body,
  }
}

export function money(n: any): string {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function templateVars(proposal: any, profile: any): Record<string, string> {
  return {
    clientName: proposal.client_name || 'there',
    proposalName: proposal.proposal_name || 'your project',
    proposalValue: money(proposal.total_customer_value || proposal.proposal_value),
    companyName: profile?.company_name || 'our team',
    repName: profile?.full_name || proposal.rep_name || '',
  }
}

export function fillTemplate(t: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), t)
}

// ── AI drafts ─────────────────────────────────────────────────────────────

const AI_SYSTEM = `You write proposal follow-up emails for a sales rep at a trades / AV / security integration company. The email goes to the client exactly as you write it, under the rep's name, after the rep reviews it.

Write like a capable, courteous professional:
- Plain text only. 60 to 140 words in the body. Short paragraphs.
- Open with "Hi <client first name>," and close with the rep's name and company on their own lines.
- No emoji, no exclamation marks, no hype or pressure tactics, no "just circling back" filler.
- Use only facts given in the data. Never invent dates, prices, discounts, deadlines, availability, product details or promises. Quote the proposal value only as given, if at all.
- Use the recent activity and scope to make the email specific (for example, refer to the work being proposed, or to a recent conversation), but do not reveal internal notes, margins, costs or anything that reads as internal.
- Don't repeat earlier follow-ups' wording. Fit the step: an early check-in invites questions; close-day is a polite, direct ask about next steps.
- Never mention that the email was automated or written by AI. No placeholders or brackets.
- The subject is short (under 70 characters) and specific to the project.`

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['subject', 'body'],
  additionalProperties: false,
}

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Ask Claude for a draft. Returns null on any failure so callers fall back to the template. */
async function aiDraft(db: SupabaseClient, row: any, proposal: any, profile: any, baseline: { subject: string; body: string }) {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return null
  const limit = await checkAndIncrementAIUsage(proposal.org_id)
  if (limit) { console.warn(`AI follow-up skipped for org ${proposal.org_id}: ${limit}`); return null }

  const chainIds = [row.chain_id]
  const [{ data: acts }, { data: earlier }] = await Promise.all([
    db.from('activities').select('type, title, created_at, source')
      .eq('proposal_id', proposal.id).neq('source', 'system')
      .order('created_at', { ascending: false }).limit(8),
    db.from('scheduled_followups').select('step, subject, sent_at')
      .in('chain_id', chainIds).eq('status', 'sent').order('sent_at', { ascending: true }),
  ])

  const data = {
    step: STEP_LABEL[row.step as Step],
    days_until_close: row.days_before,
    proposal_name: proposal.proposal_name,
    client_name: proposal.client_name,
    client_company: proposal.company,
    proposal_value: money(proposal.total_customer_value || proposal.proposal_value),
    target_close_date: proposal.close_date,
    proposal_sent_on: proposal.sent_at?.slice(0, 10) || null,
    industry: proposal.industry || null,
    scope_summary: stripHtml(proposal.scope_of_work || proposal.job_description || '').slice(0, 1500) || null,
    recent_activity: (acts || []).map((a: any) => `${a.created_at.slice(0, 10)} · ${a.type} · ${a.title}`),
    earlier_follow_up_subjects: (earlier || []).map((e: any) => e.subject).filter(Boolean),
    rep_name: profile?.full_name || proposal.rep_name,
    rep_company: profile?.company_name || proposal.company,
    rep_template_for_this_step: baseline,
  }

  try {
    const client = new Anthropic()
    const res: any = await (client.beta.messages.create as any)({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: `Write the follow-up email using this data:\n\n${JSON.stringify(data, null, 2)}` }],
    })
    if (res.stop_reason !== 'end_turn') { console.warn(`AI follow-up stop_reason ${res.stop_reason}`); return null }
    const text = (res.content || []).find((b: any) => b.type === 'text')?.text
    const parsed = JSON.parse(text || '{}')
    const subject = String(parsed.subject || '').trim()
    const body = String(parsed.body || '').trim()
    if (!subject || !body || /\{\{|\[[A-Z ]+\]/.test(subject + body)) return null
    return { subject: subject.slice(0, 150), body }
  } catch (e) {
    console.error('AI follow-up draft failed:', e)
    return null
  }
}

/** Fill in subject/body for a row: AI when the org opted in (falling back to template), else template. */
export async function draft(db: SupabaseClient, row: any, proposal: any, profile: any, useAI: boolean) {
  const t = templateFor(profile, row.step)
  const vars = templateVars(proposal, profile)
  const baseline = { subject: fillTemplate(t.subject, vars), body: fillTemplate(t.body, vars) }
  if (useAI) {
    const ai = await aiDraft(db, row, proposal, profile, baseline)
    if (ai) return { ...ai, ai_generated: true }
  }
  return { ...baseline, ai_generated: false }
}

// ── Is it still OK to send? ───────────────────────────────────────────────

/** The chain's current revision (the one follow-ups are about). */
export async function currentProposal(db: SupabaseClient, chainId: string) {
  const rows = must(await db.from('proposals')
    .select('id, org_id, user_id, client_id, proposal_name, company, client_name, client_email, rep_name, rep_email, status, close_date, sent_at, archived_at, disable_followup_emails, is_current_revision, original_proposal_id, total_customer_value, proposal_value, industry, scope_of_work, job_description')
    .or(`id.eq.${chainId},original_proposal_id.eq.${chainId}`), 'load proposal chain') as any[]
  return rows.find(r => r.is_current_revision !== false) || rows[0] || null
}

/** Temporary states: nothing sends or previews, later steps resume once cleared, and a step whose
 *  send day arrives while in one of these is recorded as not sent (with this reason). */
export const PAUSE_REASON: Record<string, string> = {
  paused: 'Follow-ups were turned off for this proposal on the send day',
  hold: 'Proposal was being revised on the send day',
}

/** null when sendable; 'paused' / 'hold' while temporarily stopped; otherwise the reason it never can. */
export function blocker(p: any): string | null {
  if (!p) return 'Proposal was deleted'
  if (p.archived_at) return 'Proposal was archived'
  if (p.status === 'Won') return 'Deal was won'
  if (p.status === 'Lost') return 'Deal was lost'
  if (p.disable_followup_emails) return 'paused'
  if (p.status === 'Draft') return 'hold'
  if (p.status !== 'Sent') return `Proposal is ${p.status}`
  if (!p.client_email) return 'Client has no email address'
  return null
}

// ── Sending ───────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
export function textToHtml(s: string) { return esc(s).replace(/\n/g, '<br/>') }

export function clientEmailHtml(body: string, profile: any, proposal: any) {
  const company = profile?.company_name || proposal.company || ''
  const header = profile?.logo_url
    ? `<div style="padding:20px 28px;border-bottom:1px solid #eee;"><img src="${esc(profile.logo_url)}" alt="${esc(company)}" style="max-height:44px;max-width:200px;object-fit:contain;" /></div>`
    : ''
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;font-size:15px;line-height:1.55;">
    ${header}
    <div style="padding:24px 28px;">${textToHtml(body)}</div>
  </div>`
}

/** Bell notification. Returns true when it was stored (or already existed). */
export async function notify(db: SupabaseClient, n: { org_id: string; user_id: string; type: string; title: string; body?: string; link?: string; dedup_key: string }): Promise<boolean> {
  const { error } = await db.from('notifications').upsert({ ...n, read: false }, { onConflict: 'dedup_key', ignoreDuplicates: true })
  if (error) { console.error('notification insert failed:', error.message); return false }
  return true
}

export async function activity(db: SupabaseClient, a: { proposal_id: string; client_id?: string | null; org_id: string; user_id: string | null; title: string; source: 'system' | 'user' }) {
  const { error } = await db.from('activities').insert({ ...a, client_id: a.client_id || null, type: 'followup_email' })
  if (error) console.error('activity insert failed:', error.message)
}

/** Send one follow-up now. Re-checks the proposal first. Returns the row's new status. */
export async function sendRow(db: SupabaseClient, row: any, opts: { actorId?: string | null; manual?: boolean } = {}): Promise<{ status: string; reason?: string }> {
  const p = await currentProposal(db, row.chain_id)
  const why = blocker(p)
  if (why) {
    // "Send now" while paused/revising: refuse, leave it scheduled
    if (opts.manual && PAUSE_REASON[why]) {
      return { status: 'scheduled', reason: why === 'paused' ? 'follow-ups are turned off for this proposal' : 'the proposal is being revised' }
    }
    const reason = PAUSE_REASON[why] || why
    await db.from('scheduled_followups').update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'scheduled')
    return { status: 'cancelled', reason }
  }

  const profile = await loadRep(db, p.user_id, p.org_id)

  // Claim the row first so two runs (cron + "Send now") can never both send it
  const claimed = must(await db.from('scheduled_followups')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'scheduled').select('id'), 'claim follow-up') as any[]
  if (!claimed.length) return { status: 'unchanged', reason: 'Already handled' }

  let subject = row.subject, body = row.body
  if (!subject || !body) {
    const d = await draft(db, row, p, profile, false)
    subject = d.subject; body = d.body
  }

  try {
    await sendEmail({
      to: p.client_email,
      subject,
      html: clientEmailHtml(body, profile, p),
      replyTo: profile?.email || p.rep_email || undefined,
      fromName: profile?.full_name || p.rep_name || 'ForgePt.',
    })
  } catch (e: any) {
    await db.from('scheduled_followups').update({ status: 'failed', error: String(e?.message || e).slice(0, 500), proposal_id: p.id, updated_at: new Date().toISOString() }).eq('id', row.id)
    await notify(db, {
      org_id: p.org_id, user_id: p.user_id, type: 'followup_failed',
      title: `Follow-up couldn't be sent — ${p.company || p.client_name || p.proposal_name}`,
      body: 'The email service rejected it. Open the proposal to send it yourself.',
      link: `/proposal/${p.id}`, dedup_key: `followup_failed:${row.id}`,
    })
    return { status: 'failed', reason: String(e?.message || e) }
  }

  const now = new Date().toISOString()
  await db.from('scheduled_followups').update({ status: 'sent', sent_at: now, subject, body, proposal_id: p.id, updated_at: now }).eq('id', row.id)
  await activity(db, {
    proposal_id: p.id, client_id: p.client_id, org_id: p.org_id, user_id: opts.actorId || p.user_id,
    title: `${STEP_LABEL[row.step as Step]} follow-up sent to ${p.client_name || p.client_email}: "${subject}"`,
    source: 'system',
  })
  await notify(db, {
    org_id: p.org_id, user_id: p.user_id, type: 'followup_sent',
    title: `Follow-up sent to ${p.client_name || p.client_email}`,
    body: `${p.proposal_name} · "${subject}"`,
    link: `/proposal/${p.id}`, dedup_key: `followup_sent:${row.id}`,
  })
  return { status: 'sent' }
}

// ── The day-before preview for the rep ────────────────────────────────────

export async function sendPreview(row: any, p: any, profile: any, org: { tz: string; hour: number }) {
  const link = `${APP_URL}/followup/${row.action_token}`
  const btn = (href: string, label: string, primary = false) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;${primary ? 'background:#C8622A;color:#fff;' : 'background:#fff;color:#0F1C2E;border:1px solid #cbd5e1;'}">${label}</a>`
  const when = `${niceDate(row.send_on)} at ${hourLabel(org.hour)}`
  await sendEmail({
    to: profile.email,
    subject: `Sends tomorrow: follow-up to ${p.client_name || p.client_email} — ${p.proposal_name}`,
    fromName: 'ForgePt.',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;font-size:14px;line-height:1.5;">
      <div style="background:#0F1C2E;padding:16px 24px;"><span style="color:#fff;font-size:18px;font-weight:bold;">ForgePt<span style="color:#C8622A;">.</span></span></div>
      <div style="padding:24px;">
        <p style="margin:0 0 6px;">Hi ${esc((profile.full_name || '').split(' ')[0] || 'there')},</p>
        <p style="margin:0 0 16px;">This follow-up goes to <strong>${esc(p.client_name || '')}</strong> &lt;${esc(p.client_email)}&gt; on <strong>${esc(when)}</strong> (${esc(org.tz.replace('_', ' '))}). If you do nothing, it sends as written.</p>
        <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:18px;">
          <div style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">
            <strong>${esc(STEP_LABEL[row.step as Step])}</strong> · ${esc(p.proposal_name)}${row.ai_generated ? ' · AI-written draft' : ''}
          </div>
          <div style="padding:14px 16px;"><div style="font-weight:bold;margin-bottom:10px;">${esc(row.subject)}</div>${textToHtml(row.body)}</div>
        </div>
        ${btn(link, 'Review or edit', true)}${btn(`${link}?action=skip`, 'Skip this one')}${btn(`${link}?action=send`, 'Send now')}
        <p style="color:#94a3b8;font-size:12px;margin-top:18px;">Skips are logged on the proposal. Turn follow-ups off for a deal from the proposal page.</p>
      </div>
    </div>`,
  })
}

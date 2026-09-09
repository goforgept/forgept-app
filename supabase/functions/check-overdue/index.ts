import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function orgLocalDate(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function orgLocalHour(tz: string): string {
  // formatToParts gives us the named 'hour' value reliably in 24h regardless of locale quirks
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).formatToParts(new Date())
  const h = parts.find(p => p.type === 'hour')?.value ?? '0'
  return h.padStart(2, '0')
}

function orgLocalTime(tz: string): string {
  // formatToParts reliably gives 24h hour + minute regardless of locale quirks
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const h = (parts.find(p => p.type === 'hour')?.value ?? '0').padStart(2, '0')
  const m = (parts.find(p => p.type === 'minute')?.value ?? '0').padStart(2, '0')
  return `${h}:${m}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  let authorized = false
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      authorized = payload?.role === 'service_role'
    }
  } catch { /* invalid JWT */ }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const inserted: string[] = []

  try {
    // Load all orgs with their timezone + admin user ids in one pass
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, timezone')

    // Build orgId → { today, hour, time, tz }
    const orgTime: Record<string, { today: string; hour: string; nowTime: string; tz: string }> = {}
    for (const org of (orgs || [])) {
      const tz = org.timezone || 'America/Chicago'
      orgTime[org.id] = { today: orgLocalDate(tz), hour: orgLocalHour(tz), nowTime: orgLocalTime(tz), tz }
    }

    // Load admins grouped by org
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, org_id')
      .in('org_role', ['admin'])

    const adminsByOrg: Record<string, string[]> = {}
    for (const a of (admins || [])) {
      if (!a.org_id) continue
      if (!adminsByOrg[a.org_id]) adminsByOrg[a.org_id] = []
      adminsByOrg[a.org_id].push(a.id)
    }

    const allNotifications: any[] = []

    // ── 1. OVERDUE SERVICE TICKETS ─────────────────────────────────────────
    const { data: tickets } = await supabase
      .from('service_tickets')
      .select('id, ticket_number, title, org_id, assigned_tech_id, scheduled_date')
      .not('status', 'in', '("Resolved","Cancelled")')
      .not('scheduled_date', 'is', null)

    for (const ticket of (tickets || [])) {
      const ot = orgTime[ticket.org_id]
      if (!ot || ticket.scheduled_date >= ot.today) continue
      const recipients = new Set<string>([
        ...(ticket.assigned_tech_id ? [ticket.assigned_tech_id] : []),
        ...(adminsByOrg[ticket.org_id] || []),
      ])
      for (const userId of recipients) {
        allNotifications.push({
          org_id: ticket.org_id, user_id: userId,
          type: 'ticket_overdue', title: 'Service Ticket Overdue',
          body: `Ticket #${ticket.ticket_number || ''}: "${ticket.title}" was scheduled for ${ticket.scheduled_date} and is past due.`,
          link: `/service-tickets/${ticket.id}`,
          dedup_key: `overdue:ticket:${ticket.id}:${ot.today}`,
        })
      }
    }

    // ── 2. OVERDUE INVOICES ────────────────────────────────────────────────
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, org_id, due_date, proposals(company, client_name)')
      .in('status', ['Sent', 'Partially Paid'])
      .not('due_date', 'is', null)

    for (const inv of (invoices || [])) {
      const ot = orgTime[inv.org_id]
      if (!ot || inv.due_date >= ot.today) continue
      const client = (inv.proposals as any)?.company || (inv.proposals as any)?.client_name || 'Unknown'
      for (const userId of (adminsByOrg[inv.org_id] || [])) {
        allNotifications.push({
          org_id: inv.org_id, user_id: userId,
          type: 'invoice_overdue', title: 'Invoice Overdue',
          body: `Invoice #${inv.invoice_number || ''} for ${client} was due ${inv.due_date} and is unpaid.`,
          link: `/invoices/${inv.id}`,
          dedup_key: `overdue:invoice:${inv.id}:${ot.today}`,
        })
      }
    }

    // ── 3. PROPOSALS PAST CLOSE DATE ──────────────────────────────────────
    const { data: proposals } = await supabase
      .from('proposals')
      .select('id, quote_number, proposal_name, company, client_name, org_id, close_date')
      .in('status', ['Draft', 'Sent'])
      .not('close_date', 'is', null)

    for (const p of (proposals || [])) {
      const ot = orgTime[p.org_id]
      if (!ot || p.close_date >= ot.today) continue
      const client = p.company || p.client_name || 'Unknown'
      for (const userId of (adminsByOrg[p.org_id] || [])) {
        allNotifications.push({
          org_id: p.org_id, user_id: userId,
          type: 'proposal_past_close', title: 'Proposal Past Close Date',
          body: `Proposal "${p.proposal_name || ''}" for ${client} passed its close date of ${p.close_date}.`,
          link: `/proposals/${p.id}`,
          dedup_key: `overdue:proposal:${p.id}:${ot.today}`,
        })
      }
    }

    // ── 4. OVERDUE TASKS ──────────────────────────────────────────────────
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, org_id, assigned_to, due_date, start_time')
      .eq('completed', false)
      .not('due_date', 'is', null)

    for (const task of (tasks || [])) {
      const ot = orgTime[task.org_id]
      if (!ot) continue

      let isOverdue = false
      if (task.start_time) {
        // Has a specific time — overdue if date is past, or same day and time has passed
        if (task.due_date < ot.today) {
          isOverdue = true
        } else if (task.due_date === ot.today && task.start_time <= ot.nowTime) {
          isOverdue = true
        }
      } else {
        isOverdue = task.due_date < ot.today
      }

      if (!isOverdue) continue

      const recipients = new Set<string>([
        ...(task.assigned_to ? [task.assigned_to] : []),
        ...(adminsByOrg[task.org_id] || []),
      ])
      const dedupDate = task.due_date
      for (const userId of recipients) {
        allNotifications.push({
          org_id: task.org_id, user_id: userId,
          type: 'task_overdue', title: 'Task Overdue',
          body: `"${task.title}" was due ${task.due_date}${task.start_time ? ` at ${task.start_time}` : ''} and is not completed.`,
          link: `/tasks`,
          dedup_key: `overdue:task:${task.id}:${dedupDate}`,
        })
      }
    }

    // ── 5. TASKS DUE NOW (within current hour window) ─────────────────────
    // Hourly cron: find tasks due today at a start_time within the current hour
    for (const task of (tasks || [])) {
      if (!task.start_time) continue
      const ot = orgTime[task.org_id]
      if (!ot || task.due_date !== ot.today) continue

      const taskHour = task.start_time.slice(0, 2) // 'HH' from 'HH:MM'
      if (taskHour !== ot.hour) continue

      const recipients = new Set<string>([
        ...(task.assigned_to ? [task.assigned_to] : []),
        ...(adminsByOrg[task.org_id] || []),
      ])
      for (const userId of recipients) {
        allNotifications.push({
          org_id: task.org_id, user_id: userId,
          type: 'task_due', title: 'Task Due Now',
          body: `"${task.title}" is due today at ${task.start_time}.`,
          link: `/tasks`,
          dedup_key: `due:task:${task.id}:${ot.today}:${ot.hour}`,
        })
      }
    }

    // Pre-filter: remove any notifications whose dedup_key already exists in the DB
    // so we never hit the unique constraint at all (Prefer:resolution=ignore-duplicates
    // uses the PK as conflict target, not the dedup index, causing full-chunk failures)
    let toInsert = allNotifications
    const keyed = allNotifications.filter(n => n.dedup_key)
    if (keyed.length > 0) {
      const uniqueKeys = [...new Set(keyed.map(n => n.dedup_key))]
      const { data: existing } = await supabase
        .from('notifications')
        .select('dedup_key')
        .in('dedup_key', uniqueKeys)
      const seen = new Set((existing || []).map((e: any) => e.dedup_key))
      toInsert = allNotifications.filter(n => !n.dedup_key || !seen.has(n.dedup_key))
    }

    if (toInsert.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const dbHeaders   = {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      }
      const CHUNK = 50
      let insertErrors = 0
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const res = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: dbHeaders,
          body: JSON.stringify(toInsert.slice(i, i + CHUNK)),
        })
        if (!res.ok) {
          const txt = await res.text()
          console.error('notifications insert error:', txt)
          insertErrors++
        }
      }
      inserted.push(`${toInsert.length} new notifications inserted (${allNotifications.length - toInsert.length} skipped as duplicates)${insertErrors ? `, ${insertErrors} batch errors` : ''}`)
    } else if (allNotifications.length > 0) {
      inserted.push(`0 new notifications (${allNotifications.length} already sent)`)
    }

    return new Response(
      JSON.stringify({ success: true, results: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('check-overdue error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

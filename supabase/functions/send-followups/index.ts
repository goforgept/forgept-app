import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { sendEmail } from "../_shared/email.ts"
import { isCronRequest } from "../_shared/cron.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDER_NAME = 'ForgePt.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authorized = isCronRequest(req)
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const dbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // Proposal follow-ups moved to followup-engine (hourly, with a day-before preview for the rep).
    // This daily job now only sends the task digest and flags overdue invoices.

    // ── PART 2: DAILY TASK DIGEST ─────────────────────────────────────────

    // Get all incomplete tasks due today or overdue
    const tasksRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?completed=eq.false&select=*,profiles!tasks_assigned_to_fkey(id,email,full_name,org_id),clients(company)`,
      { headers: dbHeaders }
    )
    const allTasks = await tasksRes.json()

    // Group tasks by assigned rep
    const tasksByRep: Record<string, any> = {}

    for (const task of allTasks) {
      if (!task.due_date) continue
      const dueDate = new Date(task.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const isOverdue = dueDate < today
      const isDueToday = task.due_date === todayStr
      if (!isOverdue && !isDueToday) continue

      const rep = task.profiles
      if (!rep?.email) continue

      if (!tasksByRep[rep.id]) {
        tasksByRep[rep.id] = {
          rep,
          overdue: [],
          today: []
        }
      }

      if (isOverdue) tasksByRep[rep.id].overdue.push(task)
      else tasksByRep[rep.id].today.push(task)
    }

    let taskDigestsSent = 0

    for (const repId of Object.keys(tasksByRep)) {
      const { rep, overdue, today: todayTasks } = tasksByRep[repId]
      const totalCount = overdue.length + todayTasks.length
      if (totalCount === 0) continue

      // Write notifications to DB for bell icon (upsert on dedup_key to avoid duplicates)
      const notificationsToUpsert = []

      for (const task of [...overdue, ...todayTasks]) {
        notificationsToUpsert.push({
          org_id: rep.org_id,
          user_id: rep.id,
          type: 'task_due',
          title: task.due_date < todayStr ? `Overdue: ${task.title}` : `Due today: ${task.title}`,
          body: task.clients?.company ? `Related to ${task.clients.company}` : null,
          link: task.client_id ? `/client/${task.client_id}` : '/tasks',
          read: false,
          dedup_key: `task_due:${task.id}:${todayStr}`
        })
      }

      if (notificationsToUpsert.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...dbHeaders, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify(notificationsToUpsert)
        })
      }

      // Build task digest email
      const overdueRows = overdue.map((t: any) => `
        <tr style="background:#fff5f5;">
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#ef4444;">⚠ Overdue</strong><br/>
            ${t.title}
          </td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#888;">${t.clients?.company || '—'}</td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#ef4444;">${t.due_date}</td>
        </tr>
      `).join('')

      const todayRows = todayTasks.map((t: any) => `
        <tr style="background:#fffbf5;">
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#C8622A;">● Due Today</strong><br/>
            ${t.title}
          </td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#888;">${t.clients?.company || '—'}</td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#C8622A;">Today</td>
        </tr>
      `).join('')

      try {
        await sendEmail({
          to:      rep.email,
          subject: `Your task digest — ${totalCount} task${totalCount !== 1 ? 's' : ''} need${totalCount === 1 ? 's' : ''} attention`,
          html:    `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
              <div style="background:#0F1C2E;padding:20px 28px;">
                <span style="color:#ffffff;font-size:20px;font-weight:bold;">ForgePt<span style="color:#C8622A;">.</span></span>
              </div>
              <div style="padding:28px;">
                <h2 style="color:#0F1C2E;margin-top:0;">Good morning, ${rep.full_name?.split(' ')[0] || 'there'} 👋</h2>
                <p>Here is your task summary for today. You have <strong>${totalCount} task${totalCount !== 1 ? 's' : ''}</strong> that need your attention.</p>

                <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                  <tr style="background:#0F1C2E;color:white;">
                    <th style="padding:10px;text-align:left;">Task</th>
                    <th style="padding:10px;text-align:left;">Client</th>
                    <th style="padding:10px;text-align:left;">Due</th>
                  </tr>
                  ${overdueRows}
                  ${todayRows}
                </table>

                <p>
                  <a href="https://app.goforgept.com/tasks" style="background:#C8622A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
                    View All Tasks →
                  </a>
                </p>
                <br/>
                <p style="color:#888;font-size:12px;">Powered by ForgePt. · <a href="https://app.goforgept.com" style="color:#888;">app.goforgept.com</a></p>
              </div>
            </div>
          `,
          fromName: SENDER_NAME,
        })
        taskDigestsSent++
      } catch (e) {
        console.error(`Task digest failed for ${rep.email}:`, e)
      }
    }

    // ── PART 3: OVERDUE INVOICE NOTIFICATIONS ────────────────────────────────
    let overdueInvoicesMarked = 0
    try {
      // Fetch invoices past due that aren't already marked Overdue or Paid
      const overdueRes = await fetch(
        `${supabaseUrl}/rest/v1/invoices?due_date=lt.${todayStr}&status=not.in.(Paid,Overdue,Cancelled)&balance_due=gt.0&select=id,invoice_number,total,due_date,org_id,proposal_id,proposals(user_id,company,client_name)`,
        { headers: dbHeaders }
      )
      const overdueInvoices: any[] = await overdueRes.json()

      for (const inv of (Array.isArray(overdueInvoices) ? overdueInvoices : [])) {
        // Mark invoice as Overdue
        await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${inv.id}`, {
          method: 'PATCH',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'Overdue' })
        })
        overdueInvoicesMarked++

        const company = inv.proposals?.company || inv.proposals?.client_name || 'a client'
        const amount = `$${(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        const dueDate = new Date(inv.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const notifTitle = `Overdue invoice — ${company}`
        const notifBody = `${inv.invoice_number ? `#${inv.invoice_number} · ` : ''}${amount} · was due ${dueDate}`
        const notifLink = `/invoices/${inv.id}`
        const dedupKey = `invoice_overdue:${inv.id}:${todayStr}`

        // Notify the rep who owns the proposal
        const repUserId = inv.proposals?.user_id
        const recipientIds: string[] = []
        if (repUserId) recipientIds.push(repUserId)

        // Also notify org admins (deduplicated)
        const adminsRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?org_id=eq.${inv.org_id}&org_role=eq.admin&select=id`,
          { headers: dbHeaders }
        )
        const admins: any[] = await adminsRes.json()
        for (const a of (Array.isArray(admins) ? admins : [])) {
          if (!recipientIds.includes(a.id)) recipientIds.push(a.id)
        }

        if (recipientIds.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: 'POST',
            headers: { ...dbHeaders, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify(recipientIds.map(uid => ({
              org_id: inv.org_id,
              user_id: uid,
              type: 'invoice_overdue',
              title: notifTitle,
              body: notifBody,
              link: notifLink,
              read: false,
              dedup_key: `${dedupKey}:${uid}`,
            })))
          })
        }
      }
    } catch (e) {
      console.error('Overdue invoice check failed:', e)
    }

    return new Response(
      JSON.stringify({ success: true, taskDigestsSent, overdueInvoicesMarked }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

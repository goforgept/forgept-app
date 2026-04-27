import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDER_EMAIL = 'followups@goforgept.com'
const SENDER_NAME = 'ForgePt.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Cron function — protected by secret key
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

  const dbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // ── PART 1: PROPOSAL FOLLOW-UPS ──────────────────────────────────────

    const proposalsRes = await fetch(
      `${supabaseUrl}/rest/v1/proposals?status=eq.Sent&select=*`,
      { headers: dbHeaders }
    )
    const proposals = await proposalsRes.json()

    let emailsSent = 0
    let skipped = 0
    let errors = 0

    for (const proposal of proposals) {
      try {
        if (!proposal.close_date || !proposal.user_id) continue

        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${proposal.user_id}&select=*`,
          { headers: dbHeaders }
        )
        const profiles = await profileRes.json()
        const profile = profiles[0]
        if (!profile) continue

        const followupDays = (profile.followup_days || '30,14,7,0')
          .split(',')
          .map((d: string) => parseInt(d.trim()))
          .filter((d: number) => !isNaN(d))
          .sort((a: number, b: number) => a - b) // ascending: [0, 7, 14, 30]

        const closeDate = new Date(proposal.close_date + 'T00:00:00Z')
        const daysUntilClose = Math.round(
          (closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )

        // Find which threshold "window" this day belongs to.
        // Each threshold owns the range (prev_threshold, threshold].
        // This ensures a missed exact day still gets caught on the next cron run.
        let activeThreshold: number | null = null
        for (let i = 0; i < followupDays.length; i++) {
          const threshold = followupDays[i]
          const prevThreshold = i > 0 ? followupDays[i - 1] : -1
          if (daysUntilClose <= threshold && daysUntilClose > prevThreshold) {
            activeThreshold = threshold
            break
          }
        }

        if (activeThreshold === null) continue

        const logRes = await fetch(
          `${supabaseUrl}/rest/v1/followup_log?proposal_id=eq.${proposal.id}&days_until_close=eq.${activeThreshold}`,
          { headers: dbHeaders }
        )
        const log = await logRes.json()
        if (log.length > 0) { skipped++; continue }

        const companyName = profile.company_name || proposal.company || 'our team'
        const repName = profile.full_name || proposal.rep_name || 'Your representative'
        const repEmail = profile.email || proposal.rep_email || SENDER_EMAIL
        const clientName = proposal.client_name || 'there'
        const proposalValue = (
          proposal.total_customer_value || proposal.proposal_value || 0
        ).toLocaleString('en-US', { minimumFractionDigits: 2 })

        const logoHeader = profile.logo_url
          ? `<div style="background:#0F1C2E;padding:20px 28px;text-align:left;">
               <img src="${profile.logo_url}" alt="${companyName}" style="max-height:48px;max-width:200px;object-fit:contain;" />
             </div>`
          : `<div style="background:#0F1C2E;padding:20px 28px;">
               <span style="color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">${companyName}</span>
             </div>`

        let clientSubject = ''
        let clientBody = ''

        if (daysUntilClose > 14) {
          clientSubject = `Following up — ${proposal.proposal_name}`
          clientBody = `
            <p>Hi ${clientName},</p>
            <p>I hope things are going well. I wanted to follow up on the proposal we sent over for <strong>${proposal.proposal_name}</strong>.</p>
            <p>The total investment for this project comes to <strong>$${proposalValue}</strong>. We're excited about the opportunity to work with ${proposal.company} and would love to answer any questions you might have.</p>
            <p>Is there a good time this week to connect and talk through the details?</p>
            <p>Looking forward to hearing from you.</p>
          `
        } else if (daysUntilClose > 0) {
          clientSubject = `Quick check-in — ${proposal.proposal_name}`
          clientBody = `
            <p>Hi ${clientName},</p>
            <p>Just wanted to check in on the proposal for <strong>${proposal.proposal_name}</strong>. We're getting close to the date we had discussed and I want to make sure we have everything lined up for you.</p>
            <p>If you have any questions about the scope of work or pricing, I'm happy to jump on a quick call. We want to make sure this project gets started on the right foot.</p>
            <p>Let me know if there is anything I can do to move things forward.</p>
          `
        } else {
          clientSubject = `Today's the day — ${proposal.proposal_name}`
          clientBody = `
            <p>Hi ${clientName},</p>
            <p>Today is the date we had targeted to move forward on <strong>${proposal.proposal_name}</strong>. I wanted to reach out personally to see where things stand.</p>
            <p>We have everything ready on our end and are excited to get started. If now is not the right time, no pressure at all — I just want to make sure we stay in touch.</p>
            <p>Either way, I'd love to hear from you today.</p>
          `
        }

        const emailFooter = `
          <br/>
          <p>Best regards,<br/><strong>${repName}</strong><br/>${companyName}<br/>${repEmail}</p>
          <br/>
          <p style="color:#aaa;font-size:11px;">This email was sent on behalf of ${repName} at ${companyName}.</p>
        `

        if (proposal.client_email) {
          const clientEmailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
            body: JSON.stringify({
              sender: { name: repName, email: SENDER_EMAIL },
              to: [{ email: proposal.client_email, name: clientName }],
              replyTo: { email: repEmail },
              subject: clientSubject,
              htmlContent: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                  ${logoHeader}
                  <div style="padding:28px;">
                    ${clientBody}
                    ${emailFooter}
                  </div>
                </div>
              `
            })
          })
          if (clientEmailRes.ok) emailsSent++
          else console.error(`Client email failed for ${proposal.id}:`, await clientEmailRes.text())
        }

        let repSubject = ''
        let repUrgency = ''

        if (daysUntilClose === 0) {
          repSubject = `Today is the day — ${proposal.proposal_name}`
          repUrgency = 'Today is the close date for this proposal. A follow-up email has been sent to the client.'
        } else if (daysUntilClose <= 7) {
          repSubject = `${daysUntilClose} days left — ${proposal.proposal_name}`
          repUrgency = `There are only ${daysUntilClose} days left until the close date. A follow-up email has been sent to the client.`
        } else {
          repSubject = `Follow-up sent — ${proposal.proposal_name}`
          repUrgency = `A follow-up email has been sent to ${clientName} at ${proposal.company}. The close date is ${daysUntilClose} days away.`
        }

        const repEmailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
          body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            to: [{ email: repEmail, name: repName }],
            subject: repSubject,
            htmlContent: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                ${logoHeader}
                <div style="padding:28px;">
                  <h2 style="color:#0F1C2E;margin-top:0;">Proposal Follow-up Reminder</h2>
                  <p>Hi ${repName},</p>
                  <p>${repUrgency}</p>
                  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                    <tr style="background:#0F1C2E;color:white;">
                      <th style="padding:10px;text-align:left;">Proposal</th>
                      <th style="padding:10px;text-align:left;">Client</th>
                      <th style="padding:10px;text-align:left;">Value</th>
                      <th style="padding:10px;text-align:left;">Close Date</th>
                    </tr>
                    <tr style="background:#f5f5f5;">
                      <td style="padding:10px;">${proposal.proposal_name}</td>
                      <td style="padding:10px;">${proposal.client_name} — ${proposal.company}</td>
                      <td style="padding:10px;">$${proposalValue}</td>
                      <td style="padding:10px;">${proposal.close_date}</td>
                    </tr>
                  </table>
                  <p><a href="https://app.goforgept.com/proposal/${proposal.id}" style="background:#C8622A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">View Proposal</a></p>
                  <br/>
                  <p style="color:#888;font-size:12px;">Powered by ForgePt.</p>
                </div>
              </div>
            `
          })
        })
        if (repEmailRes.ok) emailsSent++
        else console.error(`Rep email failed for ${proposal.id}:`, await repEmailRes.text())

        await fetch(`${supabaseUrl}/rest/v1/followup_log`, {
          method: 'POST',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ proposal_id: proposal.id, days_until_close: activeThreshold })
        })

      } catch (proposalErr) {
        console.error(`Error processing proposal ${proposal.id}:`, proposalErr)
        errors++
        continue
      }
    }

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

      // Write notifications to DB for bell icon
      const notificationsToInsert = []

      for (const task of [...overdue, ...todayTasks]) {
        notificationsToInsert.push({
          org_id: rep.org_id,
          user_id: rep.id,
          type: 'task_due',
          title: task.due_date < todayStr ? `Overdue: ${task.title}` : `Due today: ${task.title}`,
          body: task.clients?.company ? `Related to ${task.clients.company}` : null,
          link: task.client_id ? `/client/${task.client_id}` : '/tasks',
          read: false
        })
      }

      if (notificationsToInsert.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify(notificationsToInsert)
        })
      }

      // Build task digest email
      const overdueRows = overdue.map(t => `
        <tr style="background:#fff5f5;">
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#ef4444;">⚠ Overdue</strong><br/>
            ${t.title}
          </td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#888;">${t.clients?.company || '—'}</td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#ef4444;">${t.due_date}</td>
        </tr>
      `).join('')

      const todayRows = todayTasks.map(t => `
        <tr style="background:#fffbf5;">
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#C8622A;">● Due Today</strong><br/>
            ${t.title}
          </td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#888;">${t.clients?.company || '—'}</td>
          <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#C8622A;">Today</td>
        </tr>
      `).join('')

      const digestEmailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: SENDER_EMAIL },
          to: [{ email: rep.email, name: rep.full_name || rep.email }],
          subject: `Your task digest — ${totalCount} task${totalCount !== 1 ? 's' : ''} need${totalCount === 1 ? 's' : ''} attention`,
          htmlContent: `
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
          `
        })
      })

      if (digestEmailRes.ok) taskDigestsSent++
      else console.error(`Task digest failed for ${rep.email}:`, await digestEmailRes.text())
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent, skipped, errors, taskDigestsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

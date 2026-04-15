import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDER_EMAIL = 'followups@goforgept.com'
const SENDER_NAME = 'ForgePt.'

const fillTemplate = (template: string, vars: Record<string, string>) => {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  // Convert newlines to HTML
  return result.replace(/\n/g, '<br/>')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    const body = await req.json().catch(() => ({}))

    // ── Direct send: ai_email, meeting confirmation, share notifications etc ──
    // These require auth since they're called by logged-in users
    if (body.type === 'ai_email' || body.type === 'share_notification' || body.type === 'meeting_confirmation' || body.type === 'meeting_cancellation') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { toEmail, toName, fromName, fromEmail, subject, body: emailBody, orgId } = body

      if (!toEmail || !subject || !emailBody) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Build .ics attachment for meeting confirmations
      let attachment = undefined
      if ((body.type === 'meeting_confirmation' || body.type === 'meeting_cancellation') && body.meetingDate) {
        const { meetingDate, meetingTime, meetingDuration, meetingTitle, meetingLink, meetingNotes, organizerName, organizerEmail } = body

        const startTime = meetingTime || '09:00'
        const [startHour, startMin] = startTime.split(':').map(Number)
        const durationMins = parseInt(meetingDuration) || 60

        const startDate = new Date(`${meetingDate}T${startTime}:00`)
        const timezone = body.orgTimezone || 'America/Chicago'

        const formatICSLocal = (d: Date) => {
          const pad = (n: number) => String(n).padStart(2, '0')
          return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
        }

        const startDateLocal = new Date(`${meetingDate}T${startTime}:00`)
        const endDateLocal = new Date(startDateLocal.getTime() + durationMins * 60 * 1000)

        const uid = body.meetingUid || `forgept-${Date.now()}@goforgept.com`

        const icsLines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//ForgePt//Meeting//EN',
          'CALSCALE:GREGORIAN',
          body.type === 'meeting_cancellation' ? 'METHOD:CANCEL' : 'METHOD:REQUEST',
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${formatICSLocal(new Date())}`,
          `DTSTART;TZID=${timezone}:${formatICSLocal(startDateLocal)}`,
          `DTEND;TZID=${timezone}:${formatICSLocal(endDateLocal)}`,
          `SUMMARY:${meetingTitle || 'Meeting'}`,
          `DESCRIPTION:${(meetingNotes || '').replace(/\n/g, '\\n')}${meetingLink ? `\\n\\nJoin: ${meetingLink}` : ''}`,
          meetingLink ? `URL:${meetingLink}` : '',
          `ORGANIZER;CN=${organizerName || 'ForgePt'}:mailto:${organizerEmail || SENDER_EMAIL}`,
          `ATTENDEE;CN=${toName || toEmail}:mailto:${toEmail}`,
          body.type === 'meeting_cancellation' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
          'SEQUENCE:0',
          'END:VEVENT',
          'END:VCALENDAR',
        ].filter(Boolean).join('\r\n')

        const icsBase64 = btoa(unescape(encodeURIComponent(icsLines)))
        attachment = [{
          content: icsBase64,
          name: 'meeting.ics',
          type: 'text/calendar; method=REQUEST',
        }]
      }

      const brevoPayload: Record<string, unknown> = {
        sender: { name: fromName || 'ForgePt.', email: SENDER_EMAIL },
        to: [{ email: toEmail, name: toName || toEmail }],
        replyTo: fromEmail ? { email: fromEmail } : undefined,
        subject,
        htmlContent: emailBody,
      }

      if (attachment) brevoPayload.attachment = attachment

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
        body: JSON.stringify(brevoPayload)
      })

      const result = await res.json()
      if (!res.ok) {
        console.error('Brevo direct send error:', result)
        return new Response(JSON.stringify({ error: result.message || 'Brevo error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, messageId: result.messageId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── Scheduled follow-up flow below ──
    const proposalsRes = await fetch(
      `${supabaseUrl}/rest/v1/proposals?status=eq.Sent&select=*`,
      { headers: dbHeaders }
    )
    const proposals = await proposalsRes.json()

    if (!proposals.length) {
      return new Response(JSON.stringify({ message: 'No sent proposals' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

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

        // Build cadence from custom days or fallback defaults
        const earlyDays = profile.email_cadence_early ?? 30
        const day14Days = profile.email_cadence_14day ?? 14
        const day7Days = profile.email_cadence_7day ?? 7
        const followupDays = [earlyDays, day14Days, day7Days, 0]

        const closeDate = new Date(proposal.close_date)
        closeDate.setHours(0, 0, 0, 0)
        const daysUntilClose = Math.round(
          (closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (!followupDays.includes(daysUntilClose)) continue

        const logRes = await fetch(
          `${supabaseUrl}/rest/v1/followup_log?proposal_id=eq.${proposal.id}&days_until_close=eq.${daysUntilClose}`,
          { headers: dbHeaders }
        )
        const log = await logRes.json()
        if (log.length > 0) { skipped++; continue }

        const companyName = profile.company_name || proposal.company || 'our team'
        const repName = proposal.rep_name || 'Your representative'
        const repEmail = profile.email || proposal.rep_email || SENDER_EMAIL
        const clientName = proposal.client_name || 'there'
        const proposalValue = `$${(proposal.total_customer_value || proposal.proposal_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

        const templateVars = {
          clientName,
          proposalName: proposal.proposal_name || '',
          proposalValue,
          companyName,
          repName,
        }

        const logoHeader = profile.logo_url
          ? `<div style="background:#0F1C2E;padding:20px 28px;text-align:left;"><img src="${profile.logo_url}" alt="${companyName}" style="max-height:48px;max-width:200px;object-fit:contain;" /></div>`
          : `<div style="background:#0F1C2E;padding:20px 28px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">${companyName}</span></div>`

        // Determine which stage this is and pick subject/body
        let clientSubject = ''
        let clientBodyRaw = ''

        if (daysUntilClose === 0) {
          clientSubject = profile.email_template_close_subject || `Today's the day — {{proposalName}}`
          clientBodyRaw = profile.email_template_close_body || `Hi {{clientName}},\n\nToday is the date we had targeted to move forward on {{proposalName}}. I wanted to reach out personally to see where things stand.\n\nWe have everything ready on our end and are excited to get started. If now is not the right time, no pressure at all — I just want to make sure we stay in touch.\n\n{{repName}}\n{{companyName}}`
        } else if (daysUntilClose <= day7Days) {
          clientSubject = profile.email_template_7day_subject || `One week left — {{proposalName}}`
          clientBodyRaw = profile.email_template_7day_body || `Hi {{clientName}},\n\nWe're just one week away from the date we had targeted for {{proposalName}}. I wanted to reach out and make sure you have everything you need to make a decision.\n\nWe're ready to move forward on our end whenever you are.\n\n{{repName}}\n{{companyName}}`
        } else if (daysUntilClose <= day14Days) {
          clientSubject = profile.email_template_14day_subject || `Quick check-in — {{proposalName}}`
          clientBodyRaw = profile.email_template_14day_body || `Hi {{clientName}},\n\nJust wanted to check in on the proposal for {{proposalName}}. We're getting close to the date we discussed and I want to make sure we have everything lined up.\n\nIf you have any questions about the scope of work or pricing, I'm happy to jump on a quick call.\n\nLet me know if there is anything I can do to move things forward.\n\n{{repName}}\n{{companyName}}`
        } else {
          clientSubject = profile.email_template_early_subject || `Following up — {{proposalName}}`
          clientBodyRaw = profile.email_template_early_body || `Hi {{clientName}},\n\nI hope things are going well. I wanted to follow up on the proposal we sent over for {{proposalName}}.\n\nThe total investment for this project comes to {{proposalValue}}. We're excited about the opportunity to work with you and would love to answer any questions.\n\nIs there a good time this week to connect?\n\nLooking forward to hearing from you.\n\n{{repName}}\n{{companyName}}`
        }

        const clientSubjectFilled = fillTemplate(clientSubject, templateVars)
        const clientBodyFilled = fillTemplate(clientBodyRaw, templateVars)

        const emailFooter = `<br/><p style="color:#aaa;font-size:11px;">This email was sent on behalf of ${repName} at ${companyName}.</p>`

        if (proposal.client_email) {
          const clientEmailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
            body: JSON.stringify({
              sender: { name: repName, email: SENDER_EMAIL },
              to: [{ email: proposal.client_email, name: clientName }],
              replyTo: { email: repEmail },
              subject: clientSubjectFilled,
              htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">${logoHeader}<div style="padding:28px;">${clientBodyFilled}${emailFooter}</div></div>`
            })
          })
          if (clientEmailRes.ok) emailsSent++
          else console.error(`Client email failed for ${proposal.id}:`, await clientEmailRes.text())
        }

        // Rep notification email
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
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">${logoHeader}<div style="padding:28px;"><h2 style="color:#0F1C2E;margin-top:0;">Proposal Follow-up Reminder</h2><p>Hi ${repName},</p><p>${repUrgency}</p><table style="width:100%;border-collapse:collapse;margin:20px 0;"><tr style="background:#0F1C2E;color:white;"><th style="padding:10px;text-align:left;">Proposal</th><th style="padding:10px;text-align:left;">Client</th><th style="padding:10px;text-align:left;">Value</th><th style="padding:10px;text-align:left;">Close Date</th></tr><tr style="background:#f5f5f5;"><td style="padding:10px;">${proposal.proposal_name}</td><td style="padding:10px;">${proposal.client_name} — ${proposal.company}</td><td style="padding:10px;">${proposalValue}</td><td style="padding:10px;">${proposal.close_date}</td></tr></table><p><a href="https://app.goforgept.com/proposal/${proposal.id}" style="background:#C8622A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">View Proposal</a></p><br/><p style="color:#888;font-size:12px;">Powered by ForgePt.</p></div></div>`
          })
        })
        if (repEmailRes.ok) emailsSent++
        else console.error(`Rep email failed for ${proposal.id}:`, await repEmailRes.text())

        await fetch(`${supabaseUrl}/rest/v1/followup_log`, {
          method: 'POST',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ proposal_id: proposal.id, days_until_close: daysUntilClose })
        })

      } catch (proposalErr) {
        console.error(`Error processing proposal ${proposal.id}:`, proposalErr)
        errors++
        continue
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent, skipped, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
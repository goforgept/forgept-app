import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    const proposalsRes = await fetch(
      `${supabaseUrl}/rest/v1/proposals?status=eq.Sent&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
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

    for (const proposal of proposals) {
      if (!proposal.close_date || !proposal.user_id) continue

      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${proposal.user_id}&select=*`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      )
      const profiles = await profileRes.json()
      const profile = profiles[0]
      if (!profile) continue

      const followupDays = (profile.followup_days || '30,14,7,0')
        .split(',')
        .map((d: string) => parseInt(d.trim()))
        .filter((d: number) => !isNaN(d))

      const closeDate = new Date(proposal.close_date)
      closeDate.setHours(0, 0, 0, 0)
      const daysUntilClose = Math.round((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (!followupDays.includes(daysUntilClose)) continue

      const companyName = profile.company_name || proposal.company || 'our team'
      const repName = proposal.rep_name || 'Your representative'
      const repEmail = proposal.rep_email || 'followups@goforgept.com'
      const clientName = proposal.client_name || 'there'
      const proposalValue = (proposal.total_customer_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })

      // Client email content varies by days remaining
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

      // Send client email
      if (proposal.client_email) {
        const clientEmailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': brevoKey
          },
          body: JSON.stringify({
            sender: { name: repName, email: 'followups@goforgept.com' },
            to: [{ email: proposal.client_email, name: clientName }],
            replyTo: { email: repEmail },
            subject: clientSubject,
            htmlContent: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                ${clientBody}
                <br/>
                <p>Best regards,<br/><strong>${repName}</strong><br/>${companyName}<br/>${repEmail}</p>
                <br/>
                <p style="color: #aaa; font-size: 11px;">This email was sent on behalf of ${repName} at ${companyName}.</p>
              </div>
            `
          })
        })
        if (clientEmailRes.ok) emailsSent++
      }

      // Rep reminder email
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
        headers: {
          'Content-Type': 'application/json',
          'api-key': brevoKey
        },
        body: JSON.stringify({
          sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
          to: [{ email: repEmail, name: repName }],
          subject: repSubject,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0F1C2E;">Proposal Follow-up Reminder</h2>
              <p>Hi ${repName},</p>
              <p>${repUrgency}</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background: #0F1C2E; color: white;">
                  <th style="padding: 10px; text-align: left;">Proposal</th>
                  <th style="padding: 10px; text-align: left;">Client</th>
                  <th style="padding: 10px; text-align: left;">Value</th>
                  <th style="padding: 10px; text-align: left;">Close Date</th>
                </tr>
                <tr style="background: #f5f5f5;">
                  <td style="padding: 10px;">${proposal.proposal_name}</td>
                  <td style="padding: 10px;">${proposal.client_name} — ${proposal.company}</td>
                  <td style="padding: 10px;">$${proposalValue}</td>
                  <td style="padding: 10px;">${proposal.close_date}</td>
                </tr>
              </table>
              <p><a href="https://app.goforgept.com/proposal/${proposal.id}" style="background: #C8622A; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Proposal</a></p>
              <br/>
              <p style="color: #888; font-size: 12px;">Powered by ForgePt.</p>
            </div>
          `
        })
      })
      if (repEmailRes.ok) emailsSent++
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


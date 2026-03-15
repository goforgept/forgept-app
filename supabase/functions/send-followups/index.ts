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

    // Fetch all sent proposals
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

      // Fetch rep profile for followup_days setting
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

      // Determine email subject and message based on days
      let subject = ''
      let urgency = ''
      if (daysUntilClose === 0) {
        subject = `Today is the day — ${proposal.proposal_name}`
        urgency = 'Today is the close date for this proposal.'
      } else if (daysUntilClose <= 7) {
        subject = `${daysUntilClose} days left — ${proposal.proposal_name}`
        urgency = `There are only ${daysUntilClose} days left until the close date.`
      } else {
        subject = `Follow up — ${proposal.proposal_name}`
        urgency = `The close date is ${daysUntilClose} days away.`
      }

      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': brevoKey
        },
        body: JSON.stringify({
          sender: { name: profile.full_name || 'ForgePt.', email: 'followups@goforgept.com' },
          to: [{ email: proposal.rep_email, name: proposal.rep_name }],
          replyTo: { email: proposal.rep_email },
          subject,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0F1C2E;">Proposal Follow-up Reminder</h2>
              <p>Hi ${proposal.rep_name},</p>
              <p>${urgency}</p>
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
                  <td style="padding: 10px;">$${(proposal.total_customer_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td style="padding: 10px;">${proposal.close_date}</td>
                </tr>
              </table>
              <p>Log in to <a href="https://app.goforgept.com">ForgePt.</a> to view and update this proposal.</p>
              <br/>
              <p style="color: #888; font-size: 12px;">You are receiving this because you have an active proposal in ForgePt.</p>
            </div>
          `
        })
      })

      if (emailResponse.ok) {
        emailsSent++
      }
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
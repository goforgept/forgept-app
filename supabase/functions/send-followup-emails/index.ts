import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { sendEmail } from "../_shared/email.ts"
import { validateUser } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENDER_NAME = 'ForgePt.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

  const dbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  }

  try {
    const body = await req.json().catch(() => ({}))

    // ── Direct send: ai_email, meeting confirmation, share notifications etc ──
    // These require user JWT auth since they're called by logged-in users
    if (body.type === 'ai_email' || body.type === 'share_notification' || body.type === 'meeting_confirmation' || body.type === 'meeting_cancellation') {
      const authHeader = req.headers.get('Authorization')

      // Accept the cron secret, or a real signed-in user. The gateway's JWT check is off for this
      // function (verify_jwt = false), so the token must be verified here — a "Bearer" prefix alone
      // would let anyone on the internet send mail through our domain.
      const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`
      let senderEmail = ''
      if (!isCron) {
        const { user, error } = await validateUser(req)
        if (error || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        senderEmail = user.email ?? ''
      }
      const { toEmail, toName, fromName, subject, body: emailBody } = body
      // Replies go to the verified sender, never to an address supplied in the request
      const fromEmail = isCron ? body.fromEmail : senderEmail

      if (!toEmail || !subject || !emailBody) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Build .ics attachment for meeting confirmations
      let icsAttachment: { content: string; filename: string; mimeType: string } | undefined
      if ((body.type === 'meeting_confirmation' || body.type === 'meeting_cancellation') && body.meetingDate) {
        const { meetingDate, meetingTime, meetingDuration, meetingTitle, meetingLink, meetingNotes, organizerName, organizerEmail } = body

        const startTime = meetingTime || '09:00'
        const durationMins = parseInt(meetingDuration) || 60
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
          `ORGANIZER;CN=${organizerName || 'ForgePt'}:mailto:${organizerEmail || 'followups@goforgept.com'}`,
          `ATTENDEE;CN=${toName || toEmail}:mailto:${toEmail}`,
          body.type === 'meeting_cancellation' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
          'SEQUENCE:0',
          'END:VEVENT',
          'END:VCALENDAR',
        ].filter(Boolean).join('\r\n')

        icsAttachment = {
          content:  btoa(unescape(encodeURIComponent(icsLines))),
          filename: 'meeting.ics',
          mimeType: 'text/calendar; method=REQUEST',
        }
      }

      await sendEmail({
        to:          toEmail,
        subject,
        html:        emailBody,
        replyTo:     fromEmail,
        fromName:    fromName || SENDER_NAME,
        attachments: icsAttachment ? [icsAttachment] : undefined,
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Proposal follow-ups are sent by followup-engine (scheduled_followups). This function only
    // handles the direct sends above.
    return new Response(JSON.stringify({ error: 'Unknown email type' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

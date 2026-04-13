import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function sendBrevoEmail(to: string, toName: string, subject: string, html: string) {
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'ForgePt.', email: 'no-reply@goforgept.com' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  })
}

serve(async () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, clients(company, client_name, email), profiles!tasks_assigned_to_fkey(full_name, email)')
    .eq('due_date', tomorrowStr)
    .eq('customer_notified', true)
    .eq('reminder_sent', false)
    .eq('completed', false)
    .not('meeting_type', 'is', null)

  if (!tasks || tasks.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
  }

  let sent = 0
  for (const task of tasks) {
    const clientEmail = task.clients?.email
    const clientName = task.clients?.client_name || task.clients?.company || 'Valued Customer'
    if (!clientEmail) continue

    const meetingDate = new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a2d45;">Meeting Reminder — Tomorrow</h2>
        <p>Hi ${clientName},</p>
        <p>This is a reminder that you have a <strong>${task.meeting_type}</strong> scheduled for tomorrow.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr><td style="padding: 8px; color: #666;">Meeting</td><td style="padding: 8px; font-weight: bold;">${task.title}</td></tr>
          <tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">Type</td><td style="padding: 8px;">${task.meeting_type}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Date</td><td style="padding: 8px;">${meetingDate}</td></tr>
          ${task.duration_minutes ? `<tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">Duration</td><td style="padding: 8px;">${task.duration_minutes} minutes</td></tr>` : ''}
          ${task.meeting_link ? `<tr><td style="padding: 8px; color: #666;">Link</td><td style="padding: 8px;"><a href="${task.meeting_link}" style="color: #C8622A;">${task.meeting_link}</a></td></tr>` : ''}
          ${task.profiles?.full_name ? `<tr style="background: #f5f5f5;"><td style="padding: 8px; color: #666;">With</td><td style="padding: 8px;">${task.profiles.full_name}</td></tr>` : ''}
        </table>
        ${task.meeting_notes ? `<p style="color: #444;">${task.meeting_notes}</p>` : ''}
        <p style="color: #888; font-size: 12px; margin-top: 32px;">This reminder was sent automatically by ForgePt.</p>
      </div>
    `

    await sendBrevoEmail(clientEmail, clientName, `Reminder: ${task.meeting_type} tomorrow — ${task.title}`, html)
    await supabase.from('tasks').update({ reminder_sent: true }).eq('id', task.id)
    sent++
  }

  return new Response(JSON.stringify({ ok: true, sent }), { status: 200 })
})
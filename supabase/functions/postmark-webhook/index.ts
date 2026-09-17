import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-postmark-signature',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    const { RecordType, MessageID, RecipientEmail, ReceivedAt } = payload

    // Only handle Open events
    if (RecordType !== 'Open' || !MessageID) {
      return new Response('ok', { headers: corsHeaders })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find the email record by MessageID
    const { data: emailRow } = await admin
      .from('client_emails')
      .select('id, org_id, client_id, proposal_id, open_count, opened_at')
      .eq('postmark_message_id', MessageID)
      .maybeSingle()

    if (!emailRow) {
      return new Response('ok', { headers: corsHeaders })
    }

    const openedAt = ReceivedAt ? new Date(ReceivedAt).toISOString() : new Date().toISOString()
    const newCount = (emailRow.open_count ?? 0) + 1

    await admin.from('client_emails').update({
      opened_at:  emailRow.opened_at ?? openedAt, // keep first open time
      open_count: newCount,
    }).eq('id', emailRow.id)

    // Fire an in-app notification on first open
    if (!emailRow.opened_at && emailRow.org_id) {
      const { data: emailFull } = await admin
        .from('client_emails')
        .select('subject, sent_by, to_email')
        .eq('id', emailRow.id)
        .single()

      if (emailFull?.sent_by) {
        await admin.from('notifications').insert({
          org_id:  emailRow.org_id,
          user_id: emailFull.sent_by,
          type:    'email_opened',
          title:   `Email opened: ${emailFull.subject}`,
          body:    `${RecipientEmail} opened your email.`,
          link:    emailRow.proposal_id ? `/proposals/${emailRow.proposal_id}` : emailRow.client_id ? `/clients/${emailRow.client_id}` : null,
          read:    false,
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('postmark-webhook error:', err?.message)
    return new Response('ok', { headers: corsHeaders }) // always 200 to Postmark
  }
})

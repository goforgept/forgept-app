import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
}

async function verifyAndParse(req: Request, secret: string): Promise<unknown> {
  const svixId        = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) throw new Error('Missing svix headers')

  const rawBody      = await req.text()
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`

  // Resend signing secret format: "whsec_<base64>"
  const secretBase64 = secret.replace(/^whsec_/, '')
  const secretBytes  = Uint8Array.from(atob(secretBase64), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig         = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))

  const signatures = svixSignature.split(' ').map(s => s.replace(/^v1,/, ''))
  if (!signatures.includes(computedSig)) throw new Error('Invalid webhook signature')

  return JSON.parse(rawBody)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''

  try {
    const payload = await verifyAndParse(req, WEBHOOK_SECRET) as any
    if (payload.type !== 'email.opened') {
      return new Response('ok', { headers: corsHeaders })
    }

    const emailId = payload.data?.email_id
    if (!emailId) return new Response('ok', { headers: corsHeaders })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: emailRow } = await admin
      .from('client_emails')
      .select('id, org_id, client_id, proposal_id, open_count, opened_at')
      .eq('postmark_message_id', emailId) // column stores the provider message id
      .maybeSingle()

    if (!emailRow) return new Response('ok', { headers: corsHeaders })

    const openedAt = payload.created_at
      ? new Date(payload.created_at).toISOString()
      : new Date().toISOString()
    const newCount = (emailRow.open_count ?? 0) + 1

    await admin.from('client_emails').update({
      opened_at:  emailRow.opened_at ?? openedAt, // keep first open time
      open_count: newCount,
    }).eq('id', emailRow.id)

    // Fire in-app notification on first open only
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
          body:    `${emailFull.to_email} opened your email.`,
          link:    emailRow.proposal_id
            ? `/proposals/${emailRow.proposal_id}`
            : emailRow.client_id
            ? `/clients/${emailRow.client_id}`
            : null,
          read: false,
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('resend-webhook error:', err?.message, err?.stack)
    return new Response('ok', { headers: corsHeaders }) // always 200 to Resend
  }
})

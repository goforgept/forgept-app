import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractEmail(from: string): string {
  // Handle "Name <email@domain.com>" or just "email@domain.com"
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].trim().toLowerCase() : from.trim().toLowerCase()
}

function extractDomain(email: string): string {
  return email.split('@')[1] || ''
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</)
  return match ? match[1].trim().replace(/"/g, '') : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const brevoApiKey = Deno.env.get('BREVO_API_KEY')
  const appUrl = Deno.env.get('APP_URL') || 'https://app.goforgept.com'

  try {
    const payload = await req.json()
    const { from, subject, body, message_id } = payload

    if (!from || !subject) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const fromEmail = extractEmail(from)
    const fromDomain = extractDomain(fromEmail)
    const fromName = extractName(from) || fromEmail

    if (!fromDomain) {
      return new Response(JSON.stringify({ error: 'Could not extract domain from sender' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Look up org by inbound_email_domain — exact match only, never fuzzy
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?inbound_email_domain=eq.${fromDomain}&inbound_email_enabled=eq.true&inbound_email_verified=eq.true&select=id,inbound_email_auto_reply`,
      {
        headers: {
          'apikey': serviceKey!,
          'Authorization': `Bearer ${serviceKey}`,
        }
      }
    )
    const orgs = await orgRes.json()
    const org = orgs?.[0] || null

    // If no org matched — send to SuperAdmin quarantine
    if (!org) {
      await fetch(`${supabaseUrl}/rest/v1/inbound_email_quarantine`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey!,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          from_email: fromEmail,
          from_name: fromName,
          from_domain: fromDomain,
          subject,
          body: body?.slice(0, 5000) || null,
          message_id: message_id || null,
          status: 'unmatched',
        })
      })

      // Notify SuperAdmin via Brevo
      if (brevoApiKey) {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'ForgePt.', email: 'tickets@goforgept.com' },
            to: [{ email: 'cody@goforgept.com', name: 'Cody' }],
            subject: `⚠️ Unmatched inbound email from ${fromDomain}`,
            htmlContent: `
              <p>An inbound email was received but could not be matched to any org.</p>
              <p><strong>From:</strong> ${from}</p>
              <p><strong>Domain:</strong> ${fromDomain}</p>
              <p><strong>Subject:</strong> ${subject}</p>
              <p><strong>Body preview:</strong> ${body?.slice(0, 200) || 'No body'}</p>
              <p><a href="${appUrl}/superadmin">Review in SuperAdmin →</a></p>
            `
          })
        })
      }

      return new Response(JSON.stringify({ status: 'quarantined', domain: fromDomain }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Look up client by email within this org
    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?org_id=eq.${org.id}&email=eq.${fromEmail}&select=id,client_name,company`,
      {
        headers: {
          'apikey': serviceKey!,
          'Authorization': `Bearer ${serviceKey}`,
        }
      }
    )
    const clients = await clientRes.json()
    const client = clients?.[0] || null

    // Generate ticket number atomically — prevents duplicates under any load
    const counterRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_next_ticket_number`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceKey!,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id_input: org.id })
      }
    )
    const ticketNumber = await counterRes.json()

    // Create the ticket
    const ticketRes = await fetch(`${supabaseUrl}/rest/v1/service_tickets`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey!,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        org_id: org.id,
        ticket_number: ticketNumber,
        title: subject?.slice(0, 255) || 'Inbound Email Request',
        description: body?.slice(0, 5000) || null,
        client_id: client?.id || null,
        status: 'Open',
        priority: 'Normal',
        source: 'email',
        source_email: fromEmail,
        source_name: fromName,
      })
    })
    const tickets = await ticketRes.json()
    const ticket = tickets?.[0]

    // Send auto-reply to client via Brevo
    if (brevoApiKey) {
      const autoReplyBody = org.inbound_email_auto_reply ||
        `Hi ${fromName || 'there'},\n\nThank you for reaching out. We've received your request and created a support ticket (${ticketNumber}).\n\nOur team will review your request and be in touch shortly.\n\nThank you for your patience.`

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Support', email: 'tickets@goforgept.com' },
          to: [{ email: fromEmail, name: fromName }],
          subject: `Re: ${subject} [${ticketNumber}]`,
          htmlContent: autoReplyBody.replace(/\n/g, '<br>')
        })
      })
    }

    return new Response(JSON.stringify({
      status: 'created',
      ticket_number: ticketNumber,
      ticket_id: ticket?.id || null,
      org_id: org.id,
      client_matched: !!client,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function refreshQBOToken(supabase: any, org: any) {
  const clientId = Deno.env.get('QBO_CLIENT_ID')!
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET')!
  const credentials = btoa(`${clientId}:${clientSecret}`)
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: org.qbo_refresh_token }),
  })
  const tokens = await res.json()
  if (!tokens.access_token) throw new Error('QBO token refresh failed')
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabase.from('organizations').update({
    qbo_access_token: tokens.access_token,
    qbo_refresh_token: tokens.refresh_token || org.qbo_refresh_token,
    qbo_token_expires_at: expiresAt,
  }).eq('id', org.id)
  return tokens.access_token
}

Deno.serve(async (req) => {
  // QBO sends a GET to verify the endpoint on setup — respond 200
  if (req.method === 'GET') return new Response('ok', { status: 200 })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const rawBody = await req.text()
  const receivedSig = req.headers.get('intuit-signature') || ''

  // Verify HMAC-SHA256 signature using our verifier token
  const verifierToken = Deno.env.get('QBO_WEBHOOK_VERIFIER_TOKEN') || ''
  if (verifierToken) {
    try {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(verifierToken),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      )
      const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
      const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
      if (expected !== receivedSig) {
        console.error('QBO webhook: invalid signature')
        return new Response('Unauthorized', { status: 401 })
      }
    } catch (e) {
      console.error('QBO webhook signature check error:', e)
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // QBO sends an array of eventNotifications, one per connected company
  const notifications: any[] = body?.eventNotifications || []

  for (const notification of notifications) {
    const realmId = notification.realmId
    if (!realmId) continue

    const entities: any[] = notification?.dataChangeEvent?.entities || []

    try {
      // Find org by QBO realm ID
      const { data: org } = await supabase
        .from('organizations')
        .select('id, qbo_access_token, qbo_refresh_token, qbo_realm_id, qbo_token_expires_at, qbo_connected')
        .eq('qbo_realm_id', realmId)
        .single()

      if (!org?.qbo_connected) continue

      let token = org.qbo_access_token
      if (!org.qbo_token_expires_at || new Date(org.qbo_token_expires_at) <= new Date(Date.now() + 60000)) {
        try { token = await refreshQBOToken(supabase, org) } catch { continue }
      }

      const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
      const qboHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      }

      for (const entity of entities) {
        // ── Invoice paid ────────────────────────────────────────────────────
        if (entity.name === 'Invoice' && (entity.operation === 'Update' || entity.operation === 'Create')) {
          try {
            const invoiceRes = await fetch(`${baseUrl}/invoice/${entity.id}?minorversion=65`, { headers: qboHeaders })
            const invoiceData = await invoiceRes.json()
            const invoice = invoiceData?.Invoice
            if (!invoice) continue

            const isPaid = invoice.Balance === 0 && (invoice.TotalAmt || 0) > 0

            // Find the ForgePt proposal that corresponds to this QBO invoice
            const { data: proposal } = await supabase
              .from('proposals')
              .select('id, org_id, proposal_name')
              .eq('qbo_invoice_id', String(entity.id))
              .eq('org_id', org.id)
              .single()

            if (!proposal) continue

            if (isPaid) {
              const paidAmount = invoice.TotalAmt || 0
              const paidDate = new Date().toISOString().split('T')[0]

              // Update existing ForgePt invoice for this proposal if one exists
              const { data: fpInvoice } = await supabase
                .from('invoices')
                .select('id, status, total')
                .eq('proposal_id', proposal.id)
                .eq('org_id', org.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

              if (fpInvoice && fpInvoice.status !== 'Paid') {
                await supabase.from('invoices').update({
                  status: 'Paid',
                  amount_paid: paidAmount,
                  balance_due: 0,
                }).eq('id', fpInvoice.id)

                // Record payment
                await supabase.from('invoice_payments').insert({
                  invoice_id: fpInvoice.id,
                  amount: paidAmount,
                  payment_date: paidDate,
                  method: 'QuickBooks',
                  notes: `Synced from QuickBooks — Invoice #${invoice.DocNumber || entity.id}`,
                }).select()
              }

              // Log activity on the proposal
              await supabase.from('activities').insert({
                proposal_id: proposal.id,
                org_id: org.id,
                type: 'note',
                source: 'system',
                title: `Invoice paid in QuickBooks — $${paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}${invoice.DocNumber ? ` · #${invoice.DocNumber}` : ''}`,
              })
            }
          } catch (e) {
            console.error(`QBO webhook: invoice ${entity.id} error:`, e)
          }
        }

        // ── Customer updated — sync back to ForgePt client ─────────────────
        if (entity.name === 'Customer' && (entity.operation === 'Update' || entity.operation === 'Create')) {
          try {
            const custRes = await fetch(`${baseUrl}/customer/${entity.id}?minorversion=65`, { headers: qboHeaders })
            const custData = await custRes.json()
            const customer = custData?.Customer
            if (!customer) continue

            const { data: client } = await supabase
              .from('clients')
              .select('id')
              .eq('qbo_customer_id', String(entity.id))
              .eq('org_id', org.id)
              .maybeSingle()

            if (client) {
              await supabase.from('clients').update({
                company: customer.CompanyName || customer.DisplayName || undefined,
                email: customer.PrimaryEmailAddr?.Address || undefined,
                phone: customer.PrimaryPhone?.FreeFormNumber || undefined,
                address: customer.BillAddr?.Line1 || undefined,
                city: customer.BillAddr?.City || undefined,
                state: customer.BillAddr?.CountrySubDivisionCode || undefined,
                zip: customer.BillAddr?.PostalCode || undefined,
                qbo_last_sync_at: new Date().toISOString(),
              }).eq('id', client.id)
            }
          } catch (e) {
            console.error(`QBO webhook: customer ${entity.id} error:`, e)
          }
        }
      }
    } catch (e) {
      console.error(`QBO webhook: realm ${realmId} error:`, e)
    }
  }

  // QBO expects a 200 response quickly — always return success
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

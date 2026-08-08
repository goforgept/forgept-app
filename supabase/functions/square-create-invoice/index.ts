import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

  const adminSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const dbHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    const { invoiceId } = await req.json()
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'invoiceId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch invoice + proposal
    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=*,proposals(proposal_name,company,client_name,client_email,rep_name,rep_email),clients(square_customer_id,stripe_customer_id,email)`,
      { headers: dbHeaders }
    )
    const invData = await invRes.json()
    const invoice = invData[0]
    if (!invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (invoice.org_id !== profile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch org Square credentials
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${invoice.org_id}&select=square_access_token,square_location_id,square_connected`,
      { headers: dbHeaders }
    )
    const orgData = await orgRes.json()
    const org = orgData[0]

    if (!org?.square_connected || !org?.square_access_token) {
      return new Response(JSON.stringify({ error: 'Square not connected for this org' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const squareAppId = (Deno.env.get('SQUARE_APP_ID') ?? '').trim()
    const sqBase = squareAppId.startsWith('sandbox-')
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com'

    const sqHeaders = {
      'Authorization': `Bearer ${org.square_access_token}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    }

    // Auto-fetch and save location_id if missing
    if (!org.square_location_id) {
      const locRes = await fetch(`${sqBase}/v2/locations`, { headers: sqHeaders })
      const locData = await locRes.json()
      const locationId = locData.locations?.[0]?.id
      if (!locationId) {
        const sqErr = locData.errors?.[0]?.detail || locData.errors?.[0]?.code || 'no locations returned'
        return new Response(JSON.stringify({ error: `Could not retrieve Square location: ${sqErr}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      org.square_location_id = locationId
      await adminSupabase.from('organizations').update({ square_location_id: locationId }).eq('id', invoice.org_id)
    }

    const clientEmail = invoice.proposals?.client_email
    const clientName = invoice.proposals?.client_name || invoice.proposals?.company

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: 'No client email on this invoice — required for Square' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find or create Square customer (use saved ID if available)
    let squareCustomerId: string = invoice.clients?.square_customer_id || ''

    if (!squareCustomerId) {
      const searchRes = await fetch(`${sqBase}/v2/customers/search`, {
        method: 'POST',
        headers: sqHeaders,
        body: JSON.stringify({ query: { filter: { email_address: { exact: clientEmail } } } })
      })
      const searchData = await searchRes.json()

      if (searchData.customers?.length > 0) {
        squareCustomerId = searchData.customers[0].id
      } else {
        const createRes = await fetch(`${sqBase}/v2/customers`, {
          method: 'POST',
          headers: sqHeaders,
          body: JSON.stringify({ email_address: clientEmail, company_name: clientName || 'Client' })
        })
        const createData = await createRes.json()
        if (createData.errors?.length > 0) {
          throw new Error(`Square customer error: ${createData.errors[0].detail || createData.errors[0].code}`)
        }
        squareCustomerId = createData.customer?.id
      }
    }

    if (!squareCustomerId) throw new Error('Could not find or create Square customer')

    // Create Square order
    const idempotencyKey = `forgept-inv-${invoiceId}-${Date.now()}`
    const amountCents = Math.round((invoice.total || invoice.total_amount || 0) * 100)
    if (amountCents < 1) {
      return new Response(JSON.stringify({ error: 'Invoice total is $0 — add line items before sending to Square' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const orderRes = await fetch(`${sqBase}/v2/orders`, {
      method: 'POST',
      headers: sqHeaders,
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        order: {
          location_id: org.square_location_id,
          customer_id: squareCustomerId,
          reference_id: invoice.invoice_number || invoiceId,
          line_items: [{
            name: invoice.proposals?.proposal_name || 'Services',
            quantity: '1',
            base_price_money: { amount: amountCents, currency: 'USD' },
          }],
        }
      })
    })
    const orderData = await orderRes.json()
    console.log('Square order create:', JSON.stringify(orderData))
    const orderId = orderData.order?.id

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Could not create Square order', details: orderData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Square invoice — use email directly, no customer lookup needed
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toISOString().split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const sqInvRes = await fetch(`${sqBase}/v2/invoices`, {
      method: 'POST',
      headers: sqHeaders,
      body: JSON.stringify({
        idempotency_key: `${idempotencyKey}-invoice`,
        invoice: {
          location_id: org.square_location_id,
          order_id: orderId,
          primary_recipient: { customer_id: squareCustomerId },
          payment_requests: [{
            request_type: 'BALANCE',
            due_date: dueDate,
            automatic_payment_source: 'NONE',
          }],
          delivery_method: 'EMAIL',
          title: invoice.proposals?.proposal_name || 'Invoice',
          description: `Invoice ${invoice.invoice_number || ''}`.trim(),
          accepted_payment_methods: {
            card: true,
            square_gift_card: false,
            bank_account: true,
            buy_now_pay_later: false,
          },
        }
      })
    })
    const sqInvData = await sqInvRes.json()
    console.log('Square invoice create:', JSON.stringify(sqInvData))
    const sqInvoiceId = sqInvData.invoice?.id

    if (!sqInvoiceId) {
      const sqErr = sqInvData.errors?.[0]?.detail || sqInvData.errors?.[0]?.code || JSON.stringify(sqInvData)
      return new Response(JSON.stringify({ error: `Square invoice error: ${sqErr}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Publish invoice to get payment URL
    const publishRes = await fetch(`${sqBase}/v2/invoices/${sqInvoiceId}/publish`, {
      method: 'POST',
      headers: sqHeaders,
      body: JSON.stringify({
        idempotency_key: `${idempotencyKey}-publish`,
        version: sqInvData.invoice.version,
      })
    })
    const publishData = await publishRes.json()
    console.log('Square invoice publish:', JSON.stringify(publishData))
    if (publishData.errors?.length > 0) {
      throw new Error(`Square publish error: ${publishData.errors[0].detail || publishData.errors[0].code}`)
    }
    const paymentUrl = publishData.invoice?.public_url

    // Save Square invoice ID and payment URL back to ForgePt invoice
    await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}`, {
      method: 'PATCH',
      headers: dbHeaders,
      body: JSON.stringify({
        square_invoice_id: sqInvoiceId,
        square_payment_url: paymentUrl || null,
        square_payment_status: 'UNPAID',
      })
    })

    return new Response(JSON.stringify({ success: true, square_invoice_id: sqInvoiceId, payment_url: paymentUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

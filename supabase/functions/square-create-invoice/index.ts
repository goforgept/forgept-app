import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.goforgept.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const dbHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { invoiceId } = await req.json()
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'invoiceId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch invoice + proposal
    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=*,proposals(proposal_name,company,client_name,client_email,rep_name,rep_email)`,
      { headers: dbHeaders }
    )
    const invData = await invRes.json()
    const invoice = invData[0]
    if (!invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

    const sqHeaders = {
      'Authorization': `Bearer ${org.square_access_token}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    }

    const clientEmail = invoice.proposals?.client_email
    const clientName = invoice.proposals?.client_name || invoice.proposals?.company

    // Find or create Square customer
    let squareCustomerId: string
    const searchRes = await fetch('https://connect.squareup.com/v2/customers/search', {
      method: 'POST',
      headers: sqHeaders,
      body: JSON.stringify({
        query: { filter: { email_address: { exact: clientEmail } } }
      })
    })
    const searchData = await searchRes.json()

    if (searchData.customers?.length > 0) {
      squareCustomerId = searchData.customers[0].id
    } else {
      const createRes = await fetch('https://connect.squareup.com/v2/customers', {
        method: 'POST',
        headers: sqHeaders,
        body: JSON.stringify({
          email_address: clientEmail,
          display_name: clientName,
          reference_id: invoice.org_id,
        })
      })
      const createData = await createRes.json()
      squareCustomerId = createData.customer?.id
    }

    if (!squareCustomerId) {
      return new Response(JSON.stringify({ error: 'Could not find or create Square customer' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Square order
    const idempotencyKey = `forgept-inv-${invoiceId}-${Date.now()}`
    const amountCents = Math.round((invoice.total_amount || 0) * 100)

    const orderRes = await fetch('https://connect.squareup.com/v2/orders', {
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
    const orderId = orderData.order?.id

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Could not create Square order', details: orderData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Square invoice
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toISOString().split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const sqInvRes = await fetch('https://connect.squareup.com/v2/invoices', {
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
          delivery_method: 'SHARE_MANUALLY',
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
    const sqInvoiceId = sqInvData.invoice?.id

    if (!sqInvoiceId) {
      return new Response(JSON.stringify({ error: 'Could not create Square invoice', details: sqInvData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Publish invoice to get payment URL
    const publishRes = await fetch(`https://connect.squareup.com/v2/invoices/${sqInvoiceId}/publish`, {
      method: 'POST',
      headers: sqHeaders,
      body: JSON.stringify({
        idempotency_key: `${idempotencyKey}-publish`,
        version: sqInvData.invoice.version,
      })
    })
    const publishData = await publishRes.json()
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
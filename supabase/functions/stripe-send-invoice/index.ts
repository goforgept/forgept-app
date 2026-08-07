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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

  const adminSupabase = createClient(supabaseUrl, serviceKey)

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

    // Fetch invoice
    const { data: invoice } = await adminSupabase
      .from('invoices')
      .select('*, proposals(proposal_name, company, client_name, client_email, client_id), clients(company, client_name, email, stripe_customer_id)')
      .eq('id', invoiceId)
      .single()

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

    // Fetch org Stripe Connect credentials
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('stripe_connect_connected, stripe_connect_account_id')
      .eq('id', invoice.org_id)
      .single()

    if (!org?.stripe_connect_connected || !org?.stripe_connect_account_id) {
      return new Response(JSON.stringify({ error: 'Stripe not connected for this organization' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // All Stripe API calls use the platform key + Stripe-Account header to act on behalf of the connected account
    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': org.stripe_connect_account_id,
    }

    // Resolve client info
    const clientEmail = invoice.proposals?.client_email || invoice.clients?.email
    const clientName = invoice.proposals?.company || invoice.clients?.company || invoice.proposals?.client_name || invoice.clients?.client_name || 'Client'
    const clientId = invoice.proposals?.client_id || invoice.client_id

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: 'No client email found on this invoice' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find or create Stripe Customer
    let stripeCustomerId: string = invoice.clients?.stripe_customer_id || ''

    if (!stripeCustomerId) {
      // Search by email first
      const searchRes = await fetch(
        `https://api.stripe.com/v1/customers?email=${encodeURIComponent(clientEmail)}&limit=1`,
        { headers: stripeHeaders }
      )
      const searchData = await searchRes.json()

      if (searchData.data?.length > 0) {
        stripeCustomerId = searchData.data[0].id
      } else {
        const createRes = await fetch('https://api.stripe.com/v1/customers', {
          method: 'POST',
          headers: stripeHeaders,
          body: new URLSearchParams({
            email: clientEmail,
            name: clientName,
            'metadata[forgept_client_id]': clientId || '',
            'metadata[forgept_org_id]': invoice.org_id,
          }),
        })
        const customer = await createRes.json()
        if (customer.error) throw new Error(`Stripe customer error: ${customer.error.message}`)
        stripeCustomerId = customer.id
      }

      // Save stripe_customer_id to client record
      if (clientId && stripeCustomerId) {
        await adminSupabase.from('clients').update({ stripe_customer_id: stripeCustomerId }).eq('id', clientId)
      }
    }

    // Fetch line items
    const { data: lineItems } = await adminSupabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('id')

    // Create the Stripe Invoice
    const dueDate = invoice.due_date
      ? Math.floor(new Date(invoice.due_date).getTime() / 1000)
      : Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)

    const invoiceParams = new URLSearchParams({
      customer: stripeCustomerId,
      collection_method: 'send_invoice',
      due_date: String(dueDate),
      description: invoice.description || invoice.invoice_number || 'Invoice',
      'metadata[forgept_invoice_id]': invoiceId,
      'metadata[forgept_invoice_number]': invoice.invoice_number || '',
      'metadata[forgept_org_id]': invoice.org_id,
    })

    const stripeInvRes = await fetch('https://api.stripe.com/v1/invoices', {
      method: 'POST',
      headers: stripeHeaders,
      body: invoiceParams,
    })
    const stripeInv = await stripeInvRes.json()
    if (stripeInv.error) throw new Error(`Stripe invoice error: ${stripeInv.error.message}`)
    const stripeInvoiceId = stripeInv.id

    // Add line items to the invoice
    const itemsToAdd = (lineItems && lineItems.length > 0)
      ? lineItems
      : [{ description: invoice.description || 'Services', quantity: 1, unit_price: invoice.total || 0 }]

    for (const item of itemsToAdd) {
      const amountCents = Math.round((item.total || (item.unit_price || 0) * (item.quantity || 1)) * 100)
      if (amountCents <= 0) continue

      const itemParams = new URLSearchParams({
        customer: stripeCustomerId,
        invoice: stripeInvoiceId,
        description: item.description || 'Service',
        amount: String(amountCents),
        currency: 'usd',
        quantity: '1',
      })

      const itemRes = await fetch('https://api.stripe.com/v1/invoiceitems', {
        method: 'POST',
        headers: stripeHeaders,
        body: itemParams,
      })
      const itemData = await itemRes.json()
      if (itemData.error) console.error('Invoice item error:', itemData.error.message)
    }

    // Add tax as a separate line if applicable
    if (invoice.tax_amount && invoice.tax_amount > 0) {
      const taxCents = Math.round(invoice.tax_amount * 100)
      const taxItemParams = new URLSearchParams({
        customer: stripeCustomerId,
        invoice: stripeInvoiceId,
        description: `Tax (${invoice.tax_percent || 0}%)`,
        amount: String(taxCents),
        currency: 'usd',
        quantity: '1',
      })
      await fetch('https://api.stripe.com/v1/invoiceitems', {
        method: 'POST',
        headers: stripeHeaders,
        body: taxItemParams,
      })
    }

    // Finalize the invoice
    const finalizeRes = await fetch(`https://api.stripe.com/v1/invoices/${stripeInvoiceId}/finalize`, {
      method: 'POST',
      headers: stripeHeaders,
      body: new URLSearchParams({}),
    })
    const finalized = await finalizeRes.json()
    if (finalized.error) throw new Error(`Stripe finalize error: ${finalized.error.message}`)

    // Send the invoice email
    const sendRes = await fetch(`https://api.stripe.com/v1/invoices/${stripeInvoiceId}/send`, {
      method: 'POST',
      headers: stripeHeaders,
      body: new URLSearchParams({}),
    })
    const sent = await sendRes.json()
    if (sent.error) console.error('Stripe send error:', sent.error.message)

    const hostedUrl = finalized.hosted_invoice_url || sent.hosted_invoice_url || null

    // Save Stripe invoice ID + URL back to ForgePt invoice
    await adminSupabase.from('invoices').update({
      stripe_invoice_id: stripeInvoiceId,
      stripe_hosted_invoice_url: hostedUrl,
      status: 'Sent',
    }).eq('id', invoiceId)

    return new Response(JSON.stringify({
      success: true,
      stripe_invoice_id: stripeInvoiceId,
      hosted_invoice_url: hostedUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

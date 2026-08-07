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

  try {
    const { invoiceId } = await req.json()
    if (!invoiceId) return new Response(JSON.stringify({ error: 'invoiceId required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const { data: invoice } = await adminSupabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (!invoice || invoice.org_id !== profile.org_id) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!invoice.stripe_invoice_id) {
      return new Response(JSON.stringify({ error: 'No Stripe invoice linked' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: org } = await adminSupabase
      .from('organizations')
      .select('stripe_connect_account_id')
      .eq('id', invoice.org_id)
      .single()

    const stripeRes = await fetch(`https://api.stripe.com/v1/invoices/${invoice.stripe_invoice_id}`, {
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Stripe-Account': org?.stripe_connect_account_id ?? '',
      },
    })
    const stripeInvoice = await stripeRes.json()
    if (stripeInvoice.error) throw new Error(stripeInvoice.error.message)

    const isPaid = stripeInvoice.status === 'paid'
    const amountPaid = (stripeInvoice.amount_paid || 0) / 100
    const total = invoice.total || 0
    const balance = Math.max(0, total - amountPaid)

    if (isPaid) {
      await adminSupabase.from('invoices').update({
        status: balance <= 0 ? 'Paid' : 'Partially Paid',
        amount_paid: amountPaid,
        balance_due: balance,
      }).eq('id', invoiceId)

      // Record payment if not already recorded
      const { data: existing } = await adminSupabase
        .from('invoice_payments')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('method', 'Stripe')
        .single()

      if (!existing) {
        await adminSupabase.from('invoice_payments').insert({
          invoice_id: invoiceId,
          amount: amountPaid,
          payment_date: new Date().toISOString().split('T')[0],
          method: 'Stripe',
          notes: `Stripe Invoice ${invoice.stripe_invoice_id}`,
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      stripe_status: stripeInvoice.status,
      amount_paid: amountPaid,
      updated: isPaid,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

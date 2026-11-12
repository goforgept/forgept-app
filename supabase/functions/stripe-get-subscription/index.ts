import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader  = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  // Verify superadmin
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  const adminClient = createClient(supabaseUrl, supabaseKey)
  const { data: profile } = await adminClient.from('profiles').select('role, is_superadmin').eq('id', user.id).single()
  if (profile?.role !== 'superadmin' && !profile?.is_superadmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

  try {
    const { orgId } = await req.json()

    const dbHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    }

    // Fetch org — only need stripe_customer_id
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id`,
      { headers: dbHeaders }
    )
    const orgs = await orgRes.json()
    const org = orgs[0]

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const customerId = org.stripe_customer_id
    console.log('stripe-get-subscription: orgId=', orgId, 'customerId=', customerId)

    // Query subscriptions from Stripe FDW
    const { data: subRows, error: subError } = await adminClient
      .schema('stripe')
      .from('subscriptions')
      .select('id, attrs')
      .eq('attrs->>customer', customerId)
      .limit(10)

    if (subError) {
      console.error('stripe FDW subscriptions error:', subError)
      return new Response(JSON.stringify({ error: 'Failed to query Stripe data: ' + subError.message }), { status: 500, headers: corsHeaders })
    }

    // Query latest invoices from Stripe FDW
    const { data: invoiceRows } = await adminClient
      .schema('stripe')
      .from('invoices')
      .select('id, attrs')
      .eq('attrs->>customer', customerId)
      .limit(10)

    let subscription = null
    let invoiceUrl = null

    if (subRows && subRows.length > 0) {
      // Prefer active, then incomplete, then most recent
      const subRow = subRows.find((r: any) => r.attrs?.status === 'active')
        || subRows.find((r: any) => r.attrs?.status === 'incomplete')
        || subRows[0]

      const attrs = subRow.attrs || {}

      // current_period_end is null in the FDW; compute from billing_cycle_anchor + interval
      let periodEnd: number | null = attrs.current_period_end || null
      if (!periodEnd || periodEnd < Math.floor(Date.now() / 1000)) {
        const anchor = attrs.billing_cycle_anchor
        const interval: string = attrs.plan?.interval || attrs.items?.data?.[0]?.price?.recurring?.interval || 'year'
        const intervalCount: number = attrs.plan?.interval_count || attrs.items?.data?.[0]?.price?.recurring?.interval_count || 1
        if (anchor) {
          const nextDate = new Date(anchor * 1000)
          const now = new Date()
          if (interval === 'year') {
            while (nextDate <= now) nextDate.setFullYear(nextDate.getFullYear() + intervalCount)
          } else {
            while (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + intervalCount)
          }
          periodEnd = Math.floor(nextDate.getTime() / 1000)
        }
      }

      // Find the latest open invoice for due_date and hosted_invoice_url
      const openInvoice = invoiceRows?.find((r: any) => r.attrs?.subscription === subRow.id && r.attrs?.status === 'open')
        || invoiceRows?.find((r: any) => r.attrs?.status === 'open')

      const latestInvoice = invoiceRows?.find((r: any) => r.attrs?.subscription === subRow.id)
        || invoiceRows?.[0]

      if (latestInvoice?.attrs?.hosted_invoice_url) {
        invoiceUrl = latestInvoice.attrs.hosted_invoice_url
      }

      subscription = {
        id: subRow.id,
        status: attrs.status,
        current_period_end: periodEnd,
        due_date: openInvoice?.attrs?.due_date ?? null,
        cancel_at_period_end: attrs.cancel_at_period_end,
        amount: attrs.items?.data?.[0]?.price?.unit_amount,
        interval: attrs.items?.data?.[0]?.price?.recurring?.interval,
        plan_name: attrs.metadata?.plan || attrs.items?.data?.[0]?.price?.nickname || '',
        collection_method: attrs.collection_method,
      }

      // Sync billing_status, plan, monthly_rate back to organizations
      const billingStatus =
        attrs.status === 'active'    ? 'active'    :
        attrs.status === 'past_due'  ? 'past_due'  :
        attrs.status === 'canceled'  ? 'cancelled' : 'pending'

      const planName    = attrs.metadata?.plan || null
      const amountCents = attrs.items?.data?.[0]?.price?.unit_amount || 0
      const interval    = attrs.items?.data?.[0]?.price?.recurring?.interval || 'month'
      const monthlyRate = interval === 'year'
        ? Math.round(amountCents / 12 / 100)
        : Math.round(amountCents / 100)

      const syncPayload: Record<string, unknown> = { billing_status: billingStatus, monthly_rate: monthlyRate }
      if (planName) syncPayload.plan = planName

      await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(syncPayload),
      })
    }

    return new Response(JSON.stringify({
      connected: true,
      customerId,
      subscription,
      invoiceUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})

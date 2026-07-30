import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const dbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

async function updateOrg(orgId: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, {
    method: 'PATCH',
    headers: dbHeaders,
    body: JSON.stringify(patch),
  })
}

async function getOrgByCustomerId(customerId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?stripe_customer_id=eq.${customerId}&select=id`,
    { headers: dbHeaders }
  )
  const rows = await res.json()
  return rows?.[0]?.id ?? null
}

// Stripe signs webhooks — verify the signature before trusting the payload
async function verifyStripeSignature(body: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return false

    const payload = `${timestamp}.${body}`
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
    return expected === signature
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET)
    if (!valid) return new Response('Invalid signature', { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const obj = event.data?.object

  switch (event.type) {

    // ── Payment succeeded — mark org active ──────────────────────────────────
    case 'invoice.paid': {
      const customerId = obj.customer
      const orgId = await getOrgByCustomerId(customerId)
      if (orgId) {
        await updateOrg(orgId, {
          billing_status: 'active',
          stripe_subscription_id: obj.subscription ?? undefined,
        })
      }
      break
    }

    // ── Payment failed ───────────────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const customerId = obj.customer
      const orgId = await getOrgByCustomerId(customerId)
      if (orgId) {
        await updateOrg(orgId, { billing_status: 'past_due' })
      }
      break
    }

    // ── Subscription updated (plan change, cancel, etc.) ─────────────────────
    case 'customer.subscription.updated': {
      const customerId = obj.customer
      const orgId = await getOrgByCustomerId(customerId)
      if (!orgId) break

      const stripeStatus = obj.status // active, past_due, canceled, incomplete, trialing
      const billingStatus =
        stripeStatus === 'active'   ? 'active'   :
        stripeStatus === 'past_due' ? 'past_due' :
        stripeStatus === 'canceled' ? 'cancelled' : 'pending'

      await updateOrg(orgId, {
        billing_status: billingStatus,
        stripe_subscription_id: obj.id,
      })
      break
    }

    // ── Subscription cancelled ───────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const customerId = obj.customer
      const orgId = await getOrgByCustomerId(customerId)
      if (orgId) {
        await updateOrg(orgId, {
          billing_status: 'cancelled',
          stripe_subscription_id: null,
        })
      }
      break
    }

    default:
      // Ignore unhandled event types
      break
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

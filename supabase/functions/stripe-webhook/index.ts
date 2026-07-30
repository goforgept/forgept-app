import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendEmail } from "../_shared/email.ts"

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const dbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function updateOrg(orgId: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, {
    method: 'PATCH',
    headers: dbHeaders,
    body: JSON.stringify(patch),
  })
}

async function getOrgByCustomerId(customerId: string): Promise<{ id: string; name: string } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?stripe_customer_id=eq.${customerId}&select=id,name`,
    { headers: dbHeaders }
  )
  const rows = await res.json()
  return rows?.[0] ?? null
}

async function getSuperadminEmails(): Promise<string[]> {
  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'superadmin')
  const emails: string[] = []
  for (const a of admins || []) {
    const { data } = await supabase.auth.admin.getUserById(a.id)
    if (data.user?.email) emails.push(data.user.email)
  }
  return emails
}

async function getOrgAdminEmail(orgId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles').select('id').eq('org_id', orgId).eq('org_role', 'admin').single()
  if (!profile) return null
  const { data } = await supabase.auth.admin.getUserById(profile.id)
  return data.user?.email ?? null
}

async function notifyPastDue(org: { id: string; name: string }) {
  const [superadminEmails, orgAdminEmail] = await Promise.all([
    getSuperadminEmails(),
    getOrgAdminEmail(org.id),
  ])

  // Notify superadmin(s)
  if (superadminEmails.length > 0) {
    await sendEmail({
      to: superadminEmails,
      subject: `⚠ Past Due: ${org.name} – Payment Required`,
      html: `
        <p>The subscription for <strong>${org.name}</strong> is now <strong>past due</strong>.</p>
        <p>Their invoice has not been paid by the due date. Log in to SuperAdmin to follow up.</p>
        <p><a href="https://app.goforgept.com/superadmin">Open SuperAdmin →</a></p>
      `,
    })
  }

  // Notify the org admin
  if (orgAdminEmail) {
    await sendEmail({
      to: orgAdminEmail,
      subject: `Action Required: Your ForgePt invoice is past due`,
      html: `
        <p>Hi,</p>
        <p>Your ForgePt subscription invoice for <strong>${org.name}</strong> is past due.</p>
        <p>Please pay your outstanding invoice to avoid service interruption.</p>
        <p>If you have questions, reply to this email or contact us at <a href="mailto:hello@goforgept.com">hello@goforgept.com</a>.</p>
        <p>— The ForgePt Team</p>
      `,
    })
  }
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
      const org = await getOrgByCustomerId(obj.customer)
      if (org) {
        await updateOrg(org.id, {
          billing_status: 'active',
          stripe_subscription_id: obj.subscription ?? undefined,
        })
      }
      break
    }

    // ── Invoice payment failed ───────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const org = await getOrgByCustomerId(obj.customer)
      if (org) {
        await updateOrg(org.id, { billing_status: 'past_due' })
        await notifyPastDue(org).catch(console.error)
      }
      break
    }

    // ── Invoice overdue (send_invoice collection method) ─────────────────────
    case 'invoice.overdue': {
      const org = await getOrgByCustomerId(obj.customer)
      if (org) {
        await updateOrg(org.id, { billing_status: 'past_due' })
        await notifyPastDue(org).catch(console.error)
      }
      break
    }

    // ── Subscription updated (plan change, cancel, past due, etc.) ───────────
    case 'customer.subscription.updated': {
      const org = await getOrgByCustomerId(obj.customer)
      if (!org) break

      const stripeStatus = obj.status
      const billingStatus =
        stripeStatus === 'active'    ? 'active'    :
        stripeStatus === 'past_due'  ? 'past_due'  :
        stripeStatus === 'canceled'  ? 'cancelled' : 'pending'

      await updateOrg(org.id, {
        billing_status: billingStatus,
        stripe_subscription_id: obj.id,
      })

      if (stripeStatus === 'past_due') {
        await notifyPastDue(org).catch(console.error)
      }
      break
    }

    // ── Subscription cancelled ───────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const org = await getOrgByCustomerId(obj.customer)
      if (org) {
        await updateOrg(org.id, {
          billing_status: 'cancelled',
          stripe_subscription_id: null,
        })
      }
      break
    }

    default:
      break
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

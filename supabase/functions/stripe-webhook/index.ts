import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendEmail } from "../_shared/email.ts"

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const stripeHeaders = {
  'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
  'Content-Type': 'application/x-www-form-urlencoded',
}

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

async function getOrgByCustomerId(customerId: string): Promise<{ id: string; name: string; preferred_payment_method?: string } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?stripe_customer_id=eq.${customerId}&select=id,name,preferred_payment_method`,
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

    // ── Recurring invoice created (draft) — add CC surcharge then finalize ───
    case 'invoice.created': {
      // Only handle platform events (not connected account events)
      // Only handle recurring subscription invoices — subscription_create is handled
      // in stripe-create-subscription when we first set up the subscription
      if (event.account) break
      if (obj.billing_reason !== 'subscription_cycle' && obj.billing_reason !== 'subscription_update') break
      if (obj.status !== 'draft') break

      const org = await getOrgByCustomerId(obj.customer)
      if (!org) break

      const isCC = org.preferred_payment_method === 'Credit Card'

      // For CC orgs, add a 3% surcharge before finalizing
      if (isCC && obj.amount_due > 0) {
        const surchargeCents = Math.round(obj.amount_due * 0.03)
        await fetch('https://api.stripe.com/v1/invoiceitems', {
          method: 'POST',
          headers: stripeHeaders,
          body: new URLSearchParams({
            customer: obj.customer,
            invoice: obj.id,
            description: 'Credit Card Processing Fee (3%)',
            amount: String(surchargeCents),
            currency: 'usd',
          }),
        })
      }

      // Finalize the invoice so Stripe sends it
      const finalizeRes = await fetch(`https://api.stripe.com/v1/invoices/${obj.id}/finalize`, {
        method: 'POST',
        headers: stripeHeaders,
        body: new URLSearchParams({}),
      })
      const finalized = await finalizeRes.json()
      console.log('Finalized recurring invoice:', obj.id, finalized.status, finalized.error?.message || '')

      // Send the invoice email
      if (finalized.status === 'open') {
        const sendRes = await fetch(`https://api.stripe.com/v1/invoices/${obj.id}/send`, {
          method: 'POST',
          headers: stripeHeaders,
          body: new URLSearchParams({}),
        })
        const sent = await sendRes.json()
        console.log('Sent recurring invoice:', obj.id, sent.status, sent.error?.message || '')
      }
      break
    }

    // ── Invoice sent (open, awaiting payment) ───────────────────────────────
    case 'invoice.sent': {
      // Platform event only — ForgePt billing our own customers
      if (event.account) break
      const org = await getOrgByCustomerId(obj.customer)
      if (org) {
        // Only move to pending if they're still on trial (don't downgrade active orgs mid-cycle)
        const orgRes = await fetch(
          `${SUPABASE_URL}/rest/v1/organizations?id=eq.${org.id}&select=billing_status`,
          { headers: dbHeaders }
        )
        const orgData = await orgRes.json()
        if (orgData?.[0]?.billing_status === 'trial') {
          await updateOrg(org.id, { billing_status: 'pending' })
        }
      }
      break
    }

    // ── Payment succeeded ────────────────────────────────────────────────────
    case 'invoice.paid': {
      if (event.account) {
        // Connected account event — a ForgePt org's client paid their invoice
        const forgeptInvoiceId = obj.metadata?.forgept_invoice_id
        if (forgeptInvoiceId) {
          const totalPaid = (obj.amount_paid || 0) / 100
          const { data: inv } = await supabase.from('invoices').select('total').eq('id', forgeptInvoiceId).single()
          const balance = Math.max(0, (inv?.total || 0) - totalPaid)
          await supabase.from('invoices').update({
            status: balance <= 0 ? 'Paid' : 'Partially Paid',
            amount_paid: totalPaid,
            balance_due: balance,
          }).eq('id', forgeptInvoiceId)
          await supabase.from('invoice_payments').insert({
            invoice_id: forgeptInvoiceId,
            amount: totalPaid,
            payment_date: new Date().toISOString().split('T')[0],
            method: 'Stripe',
            notes: `Stripe Invoice ${obj.id}`,
          })
        }
      } else {
        // Platform event — org paid their ForgePt subscription
        const org = await getOrgByCustomerId(obj.customer)
        if (org) {
          await updateOrg(org.id, {
            billing_status: 'active',
            stripe_subscription_id: obj.subscription ?? undefined,
          })
        }
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

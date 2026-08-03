import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Square signs webhooks: HMAC-SHA256(key=signatureKey, message=notificationUrl + rawBody), base64-encoded
async function verifySquareSignature(
  rawBody: string,
  sigHeader: string,
  signatureKey: string,
  notificationUrl: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(signatureKey),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(notificationUrl + rawBody))
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
    return expected === sigHeader
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const rawBody = await req.text()
  const sigHeader = req.headers.get('x-square-hmacsha256-signature') || ''
  const signatureKey = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') || ''
  // Must match exactly what is registered in Square Developer dashboard
  const notificationUrl = Deno.env.get('SQUARE_WEBHOOK_URL') || ''

  if (signatureKey && notificationUrl) {
    const valid = await verifySquareSignature(rawBody, sigHeader, signatureKey, notificationUrl)
    if (!valid) {
      console.error('Square webhook: invalid signature')
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const eventType: string = event.type || ''

  // We care about payment_made (payment received) and updated (status changes)
  if (eventType === 'invoice.payment_made' || eventType === 'invoice.updated') {
    try {
      const sqInvoice = event.data?.object?.invoice
      if (!sqInvoice?.id) {
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      const sqInvoiceId: string = sqInvoice.id
      const sqStatus: string = sqInvoice.status // UNPAID | PAID | PARTIALLY_PAID | REFUNDED | CANCELLED

      // Only act on payment states
      if (!['PAID', 'PARTIALLY_PAID'].includes(sqStatus)) {
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      // Find the ForgePt invoice by square_invoice_id
      const { data: fpInvoice } = await supabase
        .from('invoices')
        .select('id, status, total_amount, org_id, proposal_id, invoice_number')
        .eq('square_invoice_id', sqInvoiceId)
        .maybeSingle()

      if (!fpInvoice) {
        console.log(`Square webhook: no ForgePt invoice found for square_invoice_id=${sqInvoiceId}`)
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      // Skip if already fully paid
      if (fpInvoice.status === 'Paid') {
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }

      // Pull paid amount from payment_requests — Square stores money in cents
      const paymentRequest = sqInvoice.payment_requests?.[0]
      const amountPaidCents = paymentRequest?.total_completed_amount_money?.amount || 0
      const totalCents = paymentRequest?.total_money?.amount || 0

      const amountPaid = amountPaidCents / 100
      const totalAmount = totalCents > 0 ? totalCents / 100 : (fpInvoice.total_amount || 0)
      const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100)

      const isPaid = sqStatus === 'PAID'
      const newStatus = isPaid ? 'Paid' : 'Partially Paid'
      const paidDate = new Date().toISOString().split('T')[0]

      // Update ForgePt invoice
      await supabase.from('invoices').update({
        status: newStatus,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        square_payment_status: sqStatus,
      }).eq('id', fpInvoice.id)

      // Record the payment entry
      if (amountPaid > 0) {
        await supabase.from('invoice_payments').insert({
          invoice_id: fpInvoice.id,
          amount: amountPaid,
          payment_date: paidDate,
          method: 'Square',
          notes: `Payment received via Square · ${sqInvoiceId}`,
        })
      }

      // Add activity on the proposal when fully paid
      if (fpInvoice.proposal_id && isPaid) {
        await supabase.from('activities').insert({
          proposal_id: fpInvoice.proposal_id,
          org_id: fpInvoice.org_id,
          type: 'note',
          source: 'system',
          title: `Invoice paid via Square — $${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}${fpInvoice.invoice_number ? ` · #${fpInvoice.invoice_number}` : ''}`,
        })
      }

      console.log(`Square webhook: invoice ${fpInvoice.id} → ${newStatus} ($${amountPaid})`)
    } catch (e) {
      console.error('Square webhook processing error:', e)
    }
  }

  // Square expects a fast 200 — always return it
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

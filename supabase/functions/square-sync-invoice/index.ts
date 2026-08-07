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

    if (!invoice.square_invoice_id) {
      return new Response(JSON.stringify({ error: 'No Square invoice linked' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: org } = await adminSupabase
      .from('organizations')
      .select('square_access_token')
      .eq('id', invoice.org_id)
      .single()

    if (!org?.square_access_token) {
      return new Response(JSON.stringify({ error: 'Square not connected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const squareAppId = (Deno.env.get('SQUARE_APP_ID') ?? '').trim()
    const sqBase = squareAppId.startsWith('sandbox-')
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com'

    const sqRes = await fetch(`${sqBase}/v2/invoices/${invoice.square_invoice_id}`, {
      headers: {
        'Authorization': `Bearer ${org.square_access_token}`,
        'Square-Version': '2024-01-18',
      },
    })
    const sqData = await sqRes.json()
    if (sqData.errors?.length > 0) throw new Error(sqData.errors[0].detail || sqData.errors[0].code)

    const sqInvoice = sqData.invoice
    const squareStatus = sqInvoice?.status
    const isPaid = squareStatus === 'PAID' || squareStatus === 'PARTIALLY_PAID'

    const amountPaidCents = sqInvoice?.payment_requests?.reduce((sum: number, pr: any) => {
      return sum + (pr.total_completed_amount_money?.amount || 0)
    }, 0) ?? 0
    const amountPaid = amountPaidCents / 100
    const total = invoice.total || 0
    const balance = Math.max(0, total - amountPaid)

    if (isPaid) {
      await adminSupabase.from('invoices').update({
        status: balance <= 0 ? 'Paid' : 'Partially Paid',
        amount_paid: amountPaid,
        balance_due: balance,
        square_payment_status: squareStatus,
      }).eq('id', invoiceId)

      const { data: existing } = await adminSupabase
        .from('invoice_payments')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('method', 'Square')
        .single()

      if (!existing && amountPaid > 0) {
        await adminSupabase.from('invoice_payments').insert({
          invoice_id: invoiceId,
          amount: amountPaid,
          payment_date: new Date().toISOString().split('T')[0],
          method: 'Square',
          notes: `Square Invoice ${invoice.square_invoice_id}`,
        })
      }
    } else {
      await adminSupabase.from('invoices').update({ square_payment_status: squareStatus }).eq('id', invoiceId)
    }

    return new Response(JSON.stringify({
      success: true,
      square_status: squareStatus,
      amount_paid: amountPaid,
      updated: isPaid,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

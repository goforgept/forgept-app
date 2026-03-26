import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

  const dbHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  }

  try {
    const today = new Date()
    const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    const todayStr = today.toISOString().split('T')[0]
    const in90Str = in90.toISOString().split('T')[0]

    // Fetch all recurring line items with renewal dates in next 90 days
    const recurringRes = await fetch(
      `${supabaseUrl}/rest/v1/bom_line_items?recurring=eq.true&renewal_date=gte.${todayStr}&renewal_date=lte.${in90Str}&select=*,proposals(*)`,
      { headers: dbHeaders }
    )
    const recurringItems = await recurringRes.json()

    if (!recurringItems.length) {
      return new Response(JSON.stringify({ message: 'No upcoming renewals', created: 0, notified: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Group by client_id + bundle items due within 30 days of each other
    const clientGroups: Record<string, any[]> = {}
    for (const item of recurringItems) {
      const proposal = item.proposals
      const clientKey = proposal?.client_id || proposal?.company || 'unknown'
      if (!clientGroups[clientKey]) clientGroups[clientKey] = []
      clientGroups[clientKey].push(item)
    }

    let created = 0
    let notified = 0

    for (const [clientKey, items] of Object.entries(clientGroups)) {
      // Sort items by renewal date
      items.sort((a: any, b: any) => new Date(a.renewal_date).getTime() - new Date(b.renewal_date).getTime())
      const earliestDate = items[0].renewal_date
      const proposal = items[0].proposals

      if (!proposal) continue

      const daysUntil = Math.ceil((new Date(earliestDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      // Only create renewal proposal at 90 days
      if (daysUntil > 88) {
        // Check if renewal proposal already exists for this source
        const existingRes = await fetch(
          `${supabaseUrl}/rest/v1/proposals?source_proposal_id=eq.${proposal.id}&status=eq.Draft&select=id`,
          { headers: dbHeaders }
        )
        const existing = await existingRes.json()

        if (existing.length === 0) {
          // Create renewal proposal
          const renewalProposalRes = await fetch(`${supabaseUrl}/rest/v1/proposals`, {
            method: 'POST',
            headers: { ...dbHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({
              proposal_name: `Renewal — ${proposal.proposal_name}`,
              org_id: proposal.org_id,
              user_id: proposal.user_id,
              client_id: proposal.client_id,
              client_name: proposal.client_name,
              company: proposal.company,
              client_email: proposal.client_email,
              rep_name: proposal.rep_name,
              rep_email: proposal.rep_email,
              industry: proposal.industry,
              status: 'Draft',
              source_proposal_id: proposal.id,
              close_date: earliestDate,
              job_description: `Renewal of ${proposal.proposal_name}`
            })
          })
          const renewalProposals = await renewalProposalRes.json()
          const renewalProposal = renewalProposals[0]

          if (renewalProposal?.id) {
            // Copy recurring line items to new proposal
            const lineItemsToCreate = items.map((item: any) => ({
              proposal_id: renewalProposal.id,
              item_name: item.item_name,
              part_number_sku: item.part_number_sku,
              quantity: item.quantity,
              unit: item.unit,
              category: item.category,
              vendor: item.vendor,
              your_cost_unit: item.your_cost_unit,
              markup_percent: item.markup_percent,
              customer_price_unit: item.customer_price_unit,
              customer_price_total: item.customer_price_total,
              pricing_status: item.pricing_status,
              recurring: true,
              renewal_date: item.renewal_date
            }))

            await fetch(`${supabaseUrl}/rest/v1/bom_line_items`, {
              method: 'POST',
              headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
              body: JSON.stringify(lineItemsToCreate)
            })

            // Update proposal value
            const totalValue = items.reduce((sum: number, i: any) => sum + (i.customer_price_total || 0), 0)
            await fetch(`${supabaseUrl}/rest/v1/proposals?id=eq.${renewalProposal.id}`, {
              method: 'PATCH',
              headers: dbHeaders,
              body: JSON.stringify({ proposal_value: totalValue, total_customer_value: totalValue })
            })

            created++
          }
        }
      }

      // Notify rep at 90, 60, 30 days
      if ([90, 60, 30].includes(daysUntil)) {
        // Get rep profile
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${proposal.user_id}&select=*`,
          { headers: dbHeaders }
        )
        const profiles = await profileRes.json()
        const repProfile = profiles[0]
        if (!repProfile?.email) continue

        const totalValue = items.reduce((sum: number, i: any) => sum + (i.customer_price_total || 0), 0)
        const itemsList = items.map((i: any) => `• ${i.item_name} — $${(i.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`).join('\n')

        const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
          body: JSON.stringify({
            sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
            to: [{ email: repProfile.email, name: repProfile.full_name }],
            subject: `Renewal coming up in ${daysUntil} days — ${proposal.company}`,
            htmlContent: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0F1C2E;padding:20px 28px;">
                  <span style="color:#ffffff;font-size:20px;font-weight:bold;">ForgePt.</span>
                </div>
                <div style="padding:28px;">
                  <h2 style="color:#0F1C2E;">🔄 Renewal Reminder — ${daysUntil} Days</h2>
                  <p>Hi ${repProfile.full_name},</p>
                  <p><strong>${proposal.company}</strong> has recurring items coming up for renewal on <strong>${new Date(earliestDate).toLocaleDateString()}</strong>.</p>
                  <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0 0 8px;font-weight:bold;">Renewal Items:</p>
                    ${items.map((i: any) => `<p style="margin:4px 0;">• ${i.item_name} — $${(i.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>`).join('')}
                    <p style="margin:12px 0 0;font-weight:bold;color:#C8622A;">Total: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  ${daysUntil === 90 ? '<p>A renewal proposal has been created in your pipeline as a Draft. Review and send when ready.</p>' : '<p>Don\'t forget to follow up with this client about their upcoming renewal.</p>'}
                  <p><a href="https://app.goforgept.com/clients" style="background:#C8622A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">View Client →</a></p>
                </div>
              </div>
            `
          })
        })
        if (emailRes.ok) notified++
      }
    }

    return new Response(JSON.stringify({ success: true, created, notified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
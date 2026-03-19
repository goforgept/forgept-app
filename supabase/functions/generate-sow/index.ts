import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { proposalId, company, clientName, jobDesc, industry, repName, lineItems, laborItems, aiNotes } = await req.json()

    const lineItemsText = lineItems.map((l: any) =>
      `${l.itemName} - Qty: ${l.quantity} - Price: $${l.customerPriceUnit} Total: $${l.customerPriceTotal}`
    ).join('\n')

    const laborText = (laborItems || [])
      .filter((l: any) => l.role)
      .map((l: any) => {
        const customerRate = l.your_cost && l.markup
          ? (parseFloat(l.your_cost) * (1 + parseFloat(l.markup) / 100)).toFixed(2)
          : null
        const rateStr = customerRate ? ` @ $${customerRate}/${l.unit || 'hr'}` : ''
        return `${l.role} - ${l.quantity} ${l.unit || 'hr'}${rateStr} - Total: $${l.customer_price}`
      }).join('\n')

    const prompt = `You are a professional proposal writer for trades businesses.

Company (Contractor): ${company}
Client: ${clientName || 'Not specified'}
Job: ${jobDesc}
Industry: ${industry}

${aiNotes ? `
========================================
PRIORITY INSTRUCTIONS FROM THE REP:
========================================
${aiNotes}

These instructions MUST be followed exactly. They override default behavior.
If the rep says to exclude something, exclude it.
If the rep specifies a tone, use that tone.
If the rep describes specific work, focus the SOW on that work.
If the rep says to emphasize something, emphasize it.
========================================
` : ''}

Materials provided:
${lineItemsText || 'None provided'}

Labor provided:
${laborText || 'None provided'}

RULES:
- ${company} is the contractor performing ALL work and supplying ALL materials
- The client (${clientName || 'the client'}) is ONLY the recipient of the work
- NEVER say the client provides, installs, or supplies anything
- DO NOT add materials or tasks not in the line items above
- The first sentence MUST start with: "${company} will provide and install..."
- Follow the rep's Priority Instructions above as the primary guide for tone, content, and emphasis

Write 2 short professional paragraphs as the Scope of Work only. Do NOT list the materials or labor items — they will be printed separately in the proposal document.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const claudeData = await claudeResponse.json()
    const sow = claudeData.content[0].text

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    await fetch(`${supabaseUrl}/rest/v1/proposals?id=eq.${proposalId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ scope_of_work: sow })
    })

    return new Response(
      JSON.stringify({ success: true, sow }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
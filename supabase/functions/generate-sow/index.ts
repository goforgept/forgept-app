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
    const { proposalId, company, jobDesc, industry, repName, lineItems } = await req.json()

    // Build the prompt
    const lineItemsText = lineItems.map((l: any) =>
      `${l.itemName} - Qty: ${l.quantity} - Price: $${l.customerPriceUnit} Total: $${l.customerPriceTotal}`
    ).join('\n')

    const prompt = `You are a professional proposal writer for trades businesses. Write a detailed Scope of Work.

Company: ${company}
Job: ${jobDesc}
Industry: ${industry}
Rep: ${repName}

Line Items:
${lineItemsText}

Write 3-4 professional paragraphs describing the scope of work, then include a formatted materials list with all items, quantities and prices. Use the exact prices provided. Do not say pricing will be provided separately.`

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const claudeData = await claudeResponse.json()
    const sow = claudeData.content[0].text

    // Update proposal in Supabase
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
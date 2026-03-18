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

    // Match the frontend shape: role, quantity, unit, your_cost, markup, customer_price
    const laborText = (laborItems || [])
      .filter((l: any) => l.role)
      .map((l: any) =>
        `${l.role} - ${l.quantity} ${l.unit || 'hr'} @ $${l.your_cost}/hr (Customer Price: $${l.customer_price})`
      ).join('\n')

    const prompt = `You are a professional proposal writer for trades businesses. Write a concise Scope of Work based ONLY on the line items provided. Do not add work, materials, or tasks that are not in the line items list.

Company: ${company}
Client: ${clientName || 'Not specified'}
Job: ${jobDesc}
Industry: ${industry}

User Instructions (AI Notes):
${aiNotes || 'None provided'}

Materials:
${lineItemsText || 'None provided'}

Labor:
${laborText || 'None provided'}

Instructions:
- The Company (${company}) is the contractor performing all work and providing all listed materials
- All labor listed is performed by the Company (${company}), not the Client
- The Client (${clientName || 'the client'}) is the customer receiving the work
- ALWAYS describe the Company as performing all work and supplying all listed materials
- NEVER use language where the Client provides, installs, or supplies anything
- If unclear, default to the Company performing the work
- Follow the AI Notes for tone, clarity, and emphasis
- DO NOT add anything not in the line items
- Keep everything aligned strictly with provided items

Write 2 short professional paragraphs describing the scope of work.

CRITICAL:
- The first sentence MUST begin exactly with: "${company} will provide and install..."
- EVERY sentence must use "${company}" as the subject performing the work
- NEVER start any sentence with the Client name
- NEVER state or imply that the Client provides, installs, or supplies anything
- If referencing the Client, only refer to them as the recipient of the work, not the performer
- If there is any ambiguity, default to ${company} performing all work and supplying all materials and labor

Then list the materials and labor exactly as provided. Do not invent or assume any additional work, cables, mounts, or materials that are not explicitly listed.`

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
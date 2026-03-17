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
    const { proposalId, company, ClientName, jobDesc, industry, repName, lineItems, aiNotes } = await req.json()

    const lineItemsText = lineItems.map((l: any) =>
      `${l.itemName} - Qty: ${l.quantity} - Price: $${l.customerPriceUnit} Total: $${l.customerPriceTotal}`
    ).join('\n')

   const prompt = `You are a professional proposal writer for trades businesses. Write a concise Scope of Work based ONLY on the line items provided. Do not add work, materials, or tasks that are not in the line items list.

Company: ${company}
Client: ${clientName || 'Not specified'}
Job: ${jobDesc}
Industry: ${industry}

User Instructions (AI Notes):
${aiNotes || 'None provided'}

Line Items:
${lineItemsText}

Instructions:
- Follow the AI Notes for tone, clarity, and emphasis
- DO NOT add anything not in the line items
- Keep everything aligned strictly with provided items

Write 2 short professional paragraphs describing only the work shown in the line items above. Then list the materials exactly as provided. Do not invent or assume any additional work, cables, mounts, or materials that are not explicitly listed.`


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
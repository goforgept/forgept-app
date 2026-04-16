import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // No auth check — this is called from the public vendor page

  try {
    const { fileBase64, mediaType, lineItems, token } = await req.json()

    if (!fileBase64 || !mediaType) {
      return new Response(JSON.stringify({ error: 'Missing file data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate token exists
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const rfqRes = await fetch(`${supabaseUrl}/rest/v1/rfq_requests?token=eq.${token}&select=id,status`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    })
    const rfqData = await rfqRes.json()
    if (!rfqData?.[0]) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const itemList = lineItems.map((i: any, idx: number) =>
      `${idx + 1}. ${i.itemName}${i.partNumber ? ` (${i.partNumber})` : ''} — Qty: ${i.quantity}`
    ).join('\n')

    const systemPrompt = `You are an expert at reading vendor quote documents and extracting pricing information.

You will be given a vendor quote PDF and a list of items that were requested. Your job is to:
1. Match each requested item to the pricing in the quote
2. Extract the unit price for each item
3. Extract the quote number if present
4. Extract the quote expiry date if present
5. Note any substitutions or lead time information

Return ONLY a valid JSON object. No markdown, no explanation, no code fences.

{
  "quoteNumber": "QT-2024-8812 or null",
  "quoteExpiry": "2024-12-31 or null",
  "notes": "Any important notes from the quote or null",
  "matchedItems": [
    { "id": "item_id_from_list", "itemName": "item name", "unitPrice": 125.00, "matched": true, "notes": "optional note" }
  ],
  "prices": { "item_id": unit_price_as_number }
}`

    const userPrompt = `Items requested:
${itemList}

Item IDs for matching (use these exact IDs in your response):
${lineItems.map((i: any) => `${i.itemName} → id: ${i.id}`).join('\n')}

Read this quote document and extract pricing for each item. Match by item name or part number. If an item is not found in the quote, omit it from the prices object.`

    const messageContent: any[] = []

    if (mediaType === 'application/pdf') {
      messageContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 }
      })
    } else {
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: fileBase64 }
      })
    }

    messageContent.push({ type: 'text', text: userPrompt })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: messageContent }]
      })
    })

    const data = await res.json()
    let text = data.content?.[0]?.text || '{}'
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) text = objMatch[0]

    let result = {}
    try { result = JSON.parse(text) } catch (e) {
      return new Response(JSON.stringify({ error: 'Could not parse response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
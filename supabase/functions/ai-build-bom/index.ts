import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { description, industry, orgType } = await req.json()
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const systemPrompt = `You are an expert estimator for trades contractors and systems integrators. 
Your job is to generate a realistic, complete Bill of Materials (BOM) for a given project description.

Rules:
- Return ONLY a valid JSON array of line items, no other text
- No manufacturer-specific part numbers — use generic descriptions
- Include ALL components needed for a complete, functional system
- Be specific about quantities and units
- Categories must be one of: Electrical, Mechanical, Audio/Visual, Security, Networking, Material, Labor, Roofing Materials, Insulation, Windows & Doors, Flooring, Painting & Finishing, Plumbing, HVAC, Solar, Hardware, Other
- Units must be one of: ea, ft, lot, hr, box, roll
- Do not include pricing — leave your_cost_unit and customer_price_unit as null

Return format:
[
  {
    "item_name": "string",
    "quantity": number,
    "unit": "ea|ft|lot|hr|box|roll",
    "category": "string",
    "vendor": ""
  }
]`

    const userPrompt = `Generate a complete BOM for this project:
Industry: ${industry || 'General'}
Description: ${description}

Return only the JSON array, no explanation.`

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
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    
    // Clean any markdown fences
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const items = JSON.parse(clean)

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { description, industry } = await req.json()
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const systemPrompt = `You are an expert estimator for trades contractors and systems integrators. Generate a complete Bill of Materials (BOM) for a given project. Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Just raw JSON starting with [ and ending with ]. Categories: Electrical, Mechanical, Audio/Visual, Security, Networking, Material, Labor, Roofing Materials, Insulation, Windows & Doors, Flooring, Painting & Finishing, Plumbing, HVAC, Solar, Hardware, Other. Units: ea, ft, lot, hr, box, roll. Example: [{"item_name":"IP Dome Camera 4K","quantity":8,"unit":"ea","category":"Security","vendor":""}]`

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
        messages: [{ role: 'user', content: `Industry: ${industry || 'General'}\nProject: ${description}\n\nReturn only the JSON array.` }]
      })
    })

    const data = await res.json()
    let text = data.content?.[0]?.text || '[]'
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) text = arrayMatch[0]
    text = text.replace(/,(\s*[}\]])/g, '$1')

    let items = []
    try { items = JSON.parse(text) } catch (e) {
      return new Response(JSON.stringify({ error: 'Could not parse response, please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const validItems = items.filter((i: any) => i.item_name).map((i: any) => ({
      item_name: String(i.item_name),
      quantity: parseFloat(i.quantity) || 1,
      unit: ['ea','ft','lot','hr','box','roll'].includes(i.unit) ? i.unit : 'ea',
      category: i.category || 'Other',
      vendor: ''
    }))

    return new Response(JSON.stringify({ items: validItems }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
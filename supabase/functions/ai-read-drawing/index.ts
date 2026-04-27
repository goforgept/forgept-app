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
    const { fileBase64, mediaType, instructions, industry } = await req.json()

    if (!fileBase64 || !mediaType) {
      return new Response(JSON.stringify({ error: 'Missing file data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const systemPrompt = `You are an expert estimator for trades contractors and systems integrators. You are analyzing a technical drawing or floor plan to build a Bill of Materials (BOM).

Your job is to count and identify equipment, devices, and materials visible in the drawing based on the rep's instructions.

Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Just raw JSON starting with [ and ending with ].

Categories: Electrical, Mechanical, Audio/Visual, Security, Networking, Material, Labor, Roofing Materials, Insulation, Windows & Doors, Flooring, Painting & Finishing, Plumbing, HVAC, Solar, Hardware, Other.
Units: ea, ft, lot, hr, box, roll.

Example: [{"item_name":"IP Dome Camera 4K","quantity":8,"unit":"ea","category":"Security","vendor":"","notes":"Count from drawing"}]

Include a "notes" field on each item explaining where you found it or how you counted it. Be conservative — if you are unsure of a count, note it.`

    const userPrompt = `Industry: ${industry || 'General'}

Rep Instructions: ${instructions || 'Count all equipment and devices visible in this drawing and build a complete BOM.'}

Analyze this drawing and return only the JSON array of BOM items based on what you can see and the rep's instructions.`

    // Build message content — image or PDF
    const messageContent: any[] = []

    if (mediaType === 'application/pdf') {
      messageContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileBase64
        }
      })
    } else {
      // image/jpeg, image/png, image/webp, image/gif
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: fileBase64
        }
      })
    }

    messageContent.push({
      type: 'text',
      text: userPrompt
    })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: messageContent }]
      })
    })

    const data = await res.json()
    let text = data.content?.[0]?.text || '[]'
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) text = arrayMatch[0]
    text = text.replace(/,(\s*[}\]])/g, '$1')

    let items = []
    try {
      items = JSON.parse(text)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Could not parse response, please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const validItems = items.filter((i: any) => i.item_name).map((i: any) => ({
      item_name: String(i.item_name),
      quantity: parseFloat(i.quantity) || 1,
      unit: ['ea', 'ft', 'lot', 'hr', 'box', 'roll'].includes(i.unit) ? i.unit : 'ea',
      category: i.category || 'Other',
      vendor: '',
      notes: i.notes || ''
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
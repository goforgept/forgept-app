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
    const { fileBase64, mediaType, industry } = await req.json()

    if (!fileBase64 || !mediaType) {
      return new Response(JSON.stringify({ error: 'Missing file data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const systemPrompt = `You are an expert estimator and systems engineer for trades contractors and systems integrators. You are reading a project specification document.

Your job is to extract and summarize the following from the spec:
1. Required manufacturers and approved product lists
2. Compliance and code requirements (UL, NFPA, NEC, local codes, etc.)
3. Submittal and documentation requirements
4. Installation standards and workmanship requirements
5. Testing and commissioning requirements
6. Warranty requirements
7. Any specific exclusions or restrictions
8. Key scope items relevant to the trade

Return ONLY a valid JSON object with no markdown, no explanation, no code fences. Just raw JSON.

Format:
{
  "manufacturers": [{ "category": "Security Cameras", "approved": ["Axis", "Hanwha"], "notes": "No substitutions without written approval" }],
  "compliance": ["UL 2050", "NFPA 72", "NEC Article 760"],
  "submittals": ["Shop drawings required 10 days prior", "O&M manuals at closeout"],
  "installation": ["All conduit to be EMT minimum", "All connections weatherproof rated"],
  "testing": ["100% camera coverage verification required", "Access control functional test with owner"],
  "warranty": ["2 year parts and labor", "4 hour response time"],
  "exclusions": ["Owner to provide network infrastructure", "No work above 14 feet without lift"],
  "scope_notes": ["26 cameras total per schedule on drawing A-101", "All exterior doors to have access control"],
  "flags": ["Liquidated damages clause present — review carefully", "Prevailing wage may apply"]
}`

    const userPrompt = `Industry: ${industry || 'General'}

Read this specification document and extract all relevant information for a trades contractor estimating this project. Return only the JSON object.`

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
    let text = data.content?.[0]?.text || '{}'
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) text = objMatch[0]

    let summary = {}
    try {
      summary = JSON.parse(text)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Could not parse response, please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
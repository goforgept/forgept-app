import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"
import { checkAndIncrementAIUsage } from "../_shared/ai-usage.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  const usageError = await checkAndIncrementAIUsage(profile.org_id)
  if (usageError) {
    return new Response(JSON.stringify({ error: usageError }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  }

  try {
    const { fileBase64, mediaType, industry } = await req.json()

    if (!fileBase64 || !mediaType) {
      return new Response(JSON.stringify({ error: 'Missing file data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ~15MB file limit (base64 is ~33% larger than raw)
    if (fileBase64.length > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Please use the page range selector to upload only the relevant section (typically 10–30 pages).' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const systemPrompt = `You are a senior estimator and systems engineer with 20+ years of experience reading project specifications for trades contractors and systems integrators (security, fire alarm, AV, electrical, low voltage, HVAC, plumbing, etc.).

Your job is to carefully read the provided specification section and extract only what is explicitly stated. Do NOT infer, assume, or invent information that is not clearly present in the document.

Extract the following categories:

1. **manufacturers** — Approved manufacturer lists by product category. Include any "or equal" language or substitution restrictions in notes.
2. **compliance** — Specific codes, standards, and certifications required (UL listings, NFPA chapters, NEC articles, IBC, local AHJ requirements, etc.). Quote the exact standard number when visible.
3. **submittals** — Documents the contractor must submit and when (shop drawings, product data, O&M manuals, as-builts, schedules).
4. **installation** — Workmanship standards, conduit types, mounting heights, clearances, labeling requirements, specific installation methods called out.
5. **testing** — Required tests, witness requirements, documentation, who performs and who witnesses.
6. **warranty** — Duration, coverage, response time requirements, who holds the warranty.
7. **exclusions** — Work explicitly stated as NIC (not in contract), by owner, or by others.
8. **scope_notes** — Specific quantities, locations, or scope items that would directly impact the bid (e.g. "26 cameras per schedule A-101", "all exterior doors require access control").
9. **flags** — Contractual or financial risk items that an estimator must review before bidding: liquidated damages, prevailing wage, bonding requirements, insurance minimums, indemnification language, phasing restrictions, or unusually tight schedules.

Rules:
- If a category has nothing explicitly stated in the document, return an empty array [] — never fabricate entries.
- Be concise but complete. Each bullet should be a standalone fact an estimator can act on.
- For manufacturers, group by system or product category.
- For flags, be direct about the risk: "Liquidated damages: $500/day after substantial completion" is better than "Liquidated damages clause present".
- Return ONLY a valid raw JSON object. No markdown, no code fences, no explanation before or after.

JSON format:
{
  "manufacturers": [{ "category": "string", "approved": ["string"], "notes": "string or null" }],
  "compliance": ["string"],
  "submittals": ["string"],
  "installation": ["string"],
  "testing": ["string"],
  "warranty": ["string"],
  "exclusions": ["string"],
  "scope_notes": ["string"],
  "flags": ["string"]
}`

    const userPrompt = `Industry/Trade: ${industry || 'General'}

Read the attached specification document and extract all relevant information following the instructions. Return only the JSON object with no other text.`

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
        model: 'claude-sonnet-5',
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
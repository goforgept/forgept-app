import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Step 1: Extract auth header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Step 2: Validate JWT — user-scoped client, RLS applies
  const userSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await userSupabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Step 3: Get caller's org_id
  const { data: profile, error: profileError } = await userSupabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.org_id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { 
      proposalId, company, clientName, jobDesc, 
      industry, repName, lineItems, laborItems, aiNotes 
    } = await req.json()

    // Step 4: Verify proposal belongs to caller's org
    // Uses user-scoped client so RLS double-checks this automatically
    const { data: proposal, error: proposalError } = await userSupabase
      .from('proposals')
      .select('id, org_id')
      .eq('id', proposalId)
      .eq('org_id', profile.org_id)
      .single()

    if (proposalError || !proposal) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 5: Build prompt — same as before
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

    // Step 6: Call Claude
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

    // Step 7: Write back using service role — but only to verified proposal
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await adminSupabase
      .from('proposals')
      .update({ scope_of_work: sow })
      .eq('id', proposalId)
      .eq('org_id', profile.org_id) // double-check org even with service role

    return new Response(
      JSON.stringify({ success: true, sow }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
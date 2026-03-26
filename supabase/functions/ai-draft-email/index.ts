import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { company, clientName, industry, context, repName } = await req.json()

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are an expert sales email writer for a trades/AV/security integration company. Write a professional, personalized sales email based on this context:\n- Company: ${company}\n- Contact: ${clientName || 'the contact'}\n- Industry: ${industry || 'trades'}\n- What I want to accomplish: ${context || 'introduce ourselves and open a conversation'}\n- My name: ${repName || 'the rep'}\n\nWrite only the email body — no subject line, no preamble. Start directly with the greeting. Keep it concise (3-4 short paragraphs), professional, and action-oriented with a clear call to action.`
        }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    return new Response(JSON.stringify({ draft: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

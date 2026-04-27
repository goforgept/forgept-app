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
    const {
      proposalName, company, industry, status, proposalValue,
      totalCost, grossMarginPercent, laborItems, lineItems,
      scopeOfWork, closeDate, sections
    } = await req.json()

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const materialsTotal = (lineItems || []).reduce((sum: number, i: any) => sum + (i.customer_price_total || 0), 0)
    const laborTotal = (laborItems || []).reduce((sum: number, l: any) => sum + (parseFloat(l.customer_price) || 0), 0)
    const sectionLaborTotal = (sections || []).reduce((sum: number, s: any) =>
      sum + (s.include_labor ? (s.labor_items || []).reduce((ss: number, l: any) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)
    const totalLaborHours = (laborItems || []).reduce((sum: number, l: any) => sum + (parseFloat(l.quantity) || 0), 0)
    const itemCount = (lineItems || []).length
    const vendors = [...new Set((lineItems || []).map((i: any) => i.vendor).filter(Boolean))]
    const categories = [...new Set((lineItems || []).map((i: any) => i.category).filter(Boolean))]
    const needsPricing = (lineItems || []).filter((i: any) => !i.customer_price_unit || i.pricing_status === 'Needs Pricing').length
    const daysUntilClose = closeDate ? Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

    const prompt = `You are an expert sales coach and estimator for trades contractors. Analyze this proposal and provide a concise deal summary with actionable insights.

Proposal: ${proposalName}
Client: ${company}
Industry: ${industry || 'General'}
Status: ${status}
Total Value: $${(proposalValue || 0).toLocaleString()}
Total Cost: $${(totalCost || 0).toLocaleString()}
Gross Margin: ${grossMarginPercent?.toFixed(1) || 0}%
Materials Total: $${materialsTotal.toLocaleString()}
Labor Total: $${(laborTotal + sectionLaborTotal).toLocaleString()}
Total Labor Hours: ${totalLaborHours}
Line Items: ${itemCount}
Vendors: ${vendors.join(', ') || 'None assigned'}
Categories: ${categories.join(', ') || 'None'}
Items Needing Pricing: ${needsPricing}
Days Until Close: ${daysUntilClose !== null ? daysUntilClose : 'No close date set'}
Scope of Work: ${scopeOfWork || 'Not written yet'}

Return ONLY a valid JSON object. No markdown, no explanation, no code fences.

{
  "headline": "One sentence deal summary",
  "strength": "What is strong about this deal",
  "risks": ["risk 1", "risk 2"],
  "actions": ["action item 1", "action item 2"],
  "margin_note": "Commentary on margin health",
  "close_note": "Commentary on close timeline and urgency",
  "readiness": "ready | needs_work | incomplete",
  "readiness_note": "Why this proposal is or isn't ready to send"
}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
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
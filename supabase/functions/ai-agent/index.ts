import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

const TOOLS = [
  {
    name: "create_client",
    description: "Create a new client/company in ForgePt",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
        client_name: { type: "string", description: "Contact person's name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        address: { type: "string", description: "Street address" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State" },
        zip: { type: "string", description: "Zip code" },
      },
      required: ["company"],
    },
  },
  {
    name: "search_clients",
    description: "Search for clients by name, company, or email",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_service_ticket",
    description: "Create a new service ticket",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Ticket title/subject" },
        description: { type: "string", description: "Description of the issue" },
        client_name: { type: "string", description: "Client or company name" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"], description: "Priority level" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_task",
    description: "Create a CRM task or follow-up",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        notes: { type: "string", description: "Additional notes" },
        client_name: { type: "string", description: "Client to associate this task with" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_pipeline_summary",
    description: "Get a summary of the current sales pipeline — counts and values by stage",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "create_proposal",
    description: "Create a new proposal shell (name and client only — user will fill in details)",
    input_schema: {
      type: "object",
      properties: {
        proposal_name: { type: "string", description: "Name/title of the proposal" },
        company: { type: "string", description: "Client company name" },
        client_name: { type: "string", description: "Client contact name" },
        client_email: { type: "string", description: "Client email address" },
        proposal_value: { type: "number", description: "Estimated value in dollars" },
      },
      required: ["proposal_name"],
    },
  },
  {
    name: "get_recent_activity",
    description: "Get recent clients, proposals, or service tickets",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["clients", "proposals", "tickets"], description: "What to fetch" },
        limit: { type: "number", description: "How many to return (max 10)" },
      },
      required: ["type"],
    },
  },
]

async function executeTool(name: string, input: any, supabase: any, orgId: string, userId: string) {
  switch (name) {
    case "create_client": {
      const { data, error } = await supabase.from("clients").insert({
        org_id: orgId,
        company: input.company,
        client_name: input.client_name || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        city: input.city || null,
        state: input.state || null,
        zip: input.zip || null,
      }).select("id, company").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, company: data.company, action: "created_client" }
    }

    case "search_clients": {
      const q = `%${input.query}%`
      const { data } = await supabase.from("clients")
        .select("id, company, client_name, email, phone")
        .eq("org_id", orgId)
        .or(`company.ilike.${q},client_name.ilike.${q},email.ilike.${q}`)
        .limit(5)
      return { results: data || [] }
    }

    case "create_service_ticket": {
      // Find client_id if client_name provided
      let clientId = null
      if (input.client_name) {
        const { data: cl } = await supabase.from("clients")
          .select("id").eq("org_id", orgId)
          .ilike("company", `%${input.client_name}%`).limit(1).maybeSingle()
        clientId = cl?.id || null
      }
      const { data, error } = await supabase.from("service_tickets").insert({
        org_id: orgId,
        title: input.title,
        description: input.description || null,
        priority: input.priority || "normal",
        status: "open",
        client_id: clientId,
        created_by: userId,
      }).select("id, title").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, title: data.title, action: "created_ticket" }
    }

    case "create_task": {
      let clientId = null
      if (input.client_name) {
        const { data: cl } = await supabase.from("clients")
          .select("id").eq("org_id", orgId)
          .ilike("company", `%${input.client_name}%`).limit(1).maybeSingle()
        clientId = cl?.id || null
      }
      const { data, error } = await supabase.from("tasks").insert({
        org_id: orgId,
        user_id: userId,
        title: input.title,
        due_date: input.due_date || null,
        notes: input.notes || null,
        client_id: clientId,
        status: "pending",
      }).select("id, title").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, title: data.title, action: "created_task" }
    }

    case "get_pipeline_summary": {
      const { data: proposals } = await supabase.from("proposals")
        .select("status, proposal_value, pipeline_stage_id, pipeline_stages(name)")
        .eq("org_id", orgId)
      const summary: Record<string, { count: number; value: number }> = {}
      for (const p of (proposals || [])) {
        const stage = p.pipeline_stages?.name || p.status || "Unknown"
        if (!summary[stage]) summary[stage] = { count: 0, value: 0 }
        summary[stage].count++
        summary[stage].value += p.proposal_value || 0
      }
      return { summary }
    }

    case "create_proposal": {
      const { data: profile } = await supabase.from("profiles")
        .select("full_name, email, org_id").eq("id", userId).single()
      const { data, error } = await supabase.from("proposals").insert({
        org_id: orgId,
        user_id: userId,
        proposal_name: input.proposal_name,
        company: input.company || null,
        client_name: input.client_name || null,
        client_email: input.client_email || null,
        proposal_value: input.proposal_value || 0,
        rep_name: profile?.full_name || null,
        rep_email: profile?.email || null,
        status: "Draft",
      }).select("id, proposal_name").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, proposal_name: data.proposal_name, action: "created_proposal" }
    }

    case "get_recent_activity": {
      const limit = Math.min(input.limit || 5, 10)
      if (input.type === "clients") {
        const { data } = await supabase.from("clients")
          .select("id, company, client_name, email, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit)
        return { results: data || [] }
      }
      if (input.type === "proposals") {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, status, proposal_value, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit)
        return { results: data || [] }
      }
      if (input.type === "tickets") {
        const { data } = await supabase.from("service_tickets")
          .select("id, title, status, priority, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit)
        return { results: data || [] }
      }
      return { results: [] }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), { status: 401, headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Check feature flag
  const { data: org } = await supabase.from("organizations")
    .select("feature_ai_agent").eq("id", profile.org_id).single()
  if (!org?.feature_ai_agent) {
    return new Response(JSON.stringify({ error: "AI Agent not enabled for this organization" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  try {
    const { messages } = await req.json()
    if (!messages?.length) return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!
    const systemPrompt = `You are a helpful assistant built into ForgePt, a field service and sales management platform. You help users manage their business by creating and retrieving data through natural language.

You have access to tools to create clients, service tickets, tasks, and proposals, search clients, and view pipeline summaries.

Guidelines:
- Be concise and action-oriented. When a user asks you to create something, do it immediately — don't ask for confirmation unless critical info is missing.
- When you create something, always mention what was created and that the user can find it in the app.
- If a required field is missing (like company name for a client), ask for just that field.
- Format dollar amounts with $ and commas. Format dates as Month Day, Year.
- Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`

    // Agentic loop — keep calling Claude until it stops using tools
    let currentMessages = [...messages]
    const toolResults: any[] = []

    for (let i = 0; i < 5; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
          tools: TOOLS,
          messages: currentMessages,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))

      if (data.stop_reason === "end_turn") {
        const text = data.content.find((b: any) => b.type === "text")?.text || ""
        return new Response(JSON.stringify({ reply: text, toolResults }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }

      if (data.stop_reason === "tool_use") {
        // Execute all tool calls
        const toolUseBlocks = data.content.filter((b: any) => b.type === "tool_use")
        const toolResultBlocks = []

        for (const block of toolUseBlocks) {
          const result = await executeTool(block.name, block.input, supabase, profile.org_id, profile.id)
          toolResults.push({ tool: block.name, input: block.input, result })
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: data.content },
          { role: "user", content: toolResultBlocks },
        ]
        continue
      }

      // Unexpected stop reason
      break
    }

    return new Response(JSON.stringify({ reply: "I wasn't able to complete that request. Please try again.", toolResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})

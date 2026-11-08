import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Tool definitions (MCP format) ───────────────────────────────────────────

const TOOLS = [
  {
    name: "search_clients",
    description: "Search for clients by name, company, or email",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Search term" } }, required: ["query"] },
  },
  {
    name: "get_client_overview",
    description: "Get a full snapshot of a client — open proposals, open service tickets, and pending tasks",
    inputSchema: { type: "object", properties: { company: { type: "string", description: "Company name to look up" } }, required: ["company"] },
  },
  {
    name: "create_client",
    description: "Create a new client/company",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, client_name: { type: "string" }, email: { type: "string" },
        phone: { type: "string" }, address: { type: "string" }, city: { type: "string" },
        state: { type: "string" }, zip: { type: "string" }, website: { type: "string" },
        industry: { type: "string" }, notes: { type: "string" },
      },
      required: ["company"],
    },
  },
  {
    name: "update_client",
    description: "Update fields on an existing client account",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
        address: { type: "string" }, city: { type: "string" }, state: { type: "string" },
        zip: { type: "string" }, website: { type: "string" }, industry: { type: "string" }, notes: { type: "string" },
      },
      required: ["company"],
    },
  },
  {
    name: "create_contact",
    description: "Add a contact person to an existing client account",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, full_name: { type: "string" }, email: { type: "string" },
        phone: { type: "string" }, title: { type: "string" }, is_primary: { type: "boolean" },
      },
      required: ["company", "full_name"],
    },
  },
  {
    name: "search_proposals",
    description: "Search proposals by client name, proposal name, or status",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term — company name, proposal name, or rep name" },
        status: { type: "string", description: "Filter by status: Draft, Sent, Won, Lost" },
      },
      required: [],
    },
  },
  {
    name: "get_proposal_bom",
    description: "Get the full bill of materials (BOM), labor, and totals for a proposal",
    inputSchema: {
      type: "object",
      properties: {
        proposal_name: { type: "string" },
        company: { type: "string", description: "Client company name (used if proposal_name not known)" },
      },
      required: [],
    },
  },
  {
    name: "create_proposal",
    description: "Create a new proposal shell",
    inputSchema: {
      type: "object",
      properties: {
        proposal_name: { type: "string" }, company: { type: "string" },
        client_name: { type: "string" }, client_email: { type: "string" },
        proposal_value: { type: "number" },
      },
      required: ["proposal_name"],
    },
  },
  {
    name: "update_proposal",
    description: "Update a proposal's pipeline stage, close date, or estimated value",
    inputSchema: {
      type: "object",
      properties: {
        proposal_name: { type: "string" }, company: { type: "string" },
        stage_name: { type: "string" }, close_date: { type: "string" }, proposal_value: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "update_proposal_status",
    description: "Mark a proposal as Won or Lost. Always search for the proposal first to confirm which one.",
    inputSchema: {
      type: "object",
      properties: {
        proposal_name: { type: "string" }, company: { type: "string" },
        status: { type: "string", enum: ["Won", "Lost"] },
        confirmed: { type: "boolean", description: "Must be true — user has confirmed" },
      },
      required: ["status", "confirmed"],
    },
  },
  {
    name: "add_bom_item",
    description: "Add a product or line item to a proposal section's BOM. Use this after searching for a product (from ForgePt catalog or an external source like Brivo) to add it to a proposal.",
    inputSchema: {
      type: "object",
      properties: {
        proposal_name: { type: "string", description: "Name of the proposal to add the item to" },
        company: { type: "string", description: "Client company (used if proposal_name not known)" },
        section_name: { type: "string", description: "Section name to add to (e.g. 'Access Control', 'Cameras'). If not found, item goes in the first section." },
        item_name: { type: "string", description: "Product name or description" },
        part_number: { type: "string", description: "Manufacturer part number (optional)" },
        manufacturer: { type: "string", description: "Manufacturer name (optional)" },
        quantity: { type: "number", description: "Quantity to add (default 1)" },
        your_cost: { type: "number", description: "Your cost per unit in dollars (optional)" },
        customer_price: { type: "number", description: "Customer price per unit in dollars (optional)" },
        notes: { type: "string", description: "Line item notes (optional)" },
      },
      required: ["item_name"],
    },
  },
  {
    name: "get_pipeline_summary",
    description: "Get a summary of the current sales pipeline — counts and values by stage",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_deal_summary",
    description: "Get a full summary of where a deal stands — proposal details, recent activity, open tasks",
    inputSchema: {
      type: "object",
      properties: {
        proposal_name: { type: "string" },
        company: { type: "string", description: "Client company name (used if proposal_name not known)" },
      },
      required: [],
    },
  },
  {
    name: "log_activity",
    description: "Log a call, email, meeting, or note against a client or proposal",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["call", "email", "meeting", "note"] },
        title: { type: "string" }, body: { type: "string" },
        company: { type: "string" }, proposal_name: { type: "string" },
        follow_up_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "create_task",
    description: "Create a CRM task or follow-up",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" }, due_date: { type: "string" },
        notes: { type: "string" }, client_name: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_service_ticket",
    description: "Create a new service ticket",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" }, description: { type: "string" },
        client_name: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
      },
      required: ["title"],
    },
  },
  {
    name: "schedule_meeting",
    description: "Schedule a meeting with a client",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, title: { type: "string" }, date: { type: "string" },
        time: { type: "string" }, duration_minutes: { type: "number" },
        meeting_type: { type: "string", enum: ["Sales Call", "Demo", "Follow-up", "Site Visit", "Kickoff", "Check-in", "Other"] },
        is_virtual: { type: "boolean" }, notes: { type: "string" },
      },
      required: ["company", "title", "date"],
    },
  },
  {
    name: "search_products",
    description: "Search the product library by name, part number, manufacturer, or category",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }, category: { type: "string" }, manufacturer: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "get_inventory",
    description: "Look up inventory stock levels",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        filter: { type: "string", enum: ["all", "low_stock", "out_of_stock"] },
        warehouse: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "get_recent_activity",
    description: "Get recent clients, proposals, or service tickets",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["clients", "proposals", "tickets"] },
        limit: { type: "number" },
      },
      required: ["type"],
    },
  },
  {
    name: "create_invoice",
    description: "Create a draft invoice for a client",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string" }, proposal_name: { type: "string" },
        amount: { type: "number" }, due_days: { type: "number" }, description: { type: "string" },
      },
      required: ["company", "amount"],
    },
  },
  {
    name: "get_reports",
    description: "Pull revenue, pipeline, or win-rate reports",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["revenue_by_rep", "win_rate", "pipeline_value", "top_clients"] },
        period_days: { type: "number" },
      },
      required: ["type"],
    },
  },
]

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(name: string, input: any, supabase: any, orgId: string, userId: string | null): Promise<any> {
  switch (name) {

    case "search_clients": {
      const q = `%${input.query}%`
      const { data } = await supabase.from("clients")
        .select("id, company, client_name, email, phone")
        .eq("org_id", orgId)
        .or(`company.ilike.${q},client_name.ilike.${q},email.ilike.${q}`)
        .limit(5)
      return { results: data || [] }
    }

    case "get_client_overview": {
      const { data: client } = await supabase.from("clients")
        .select("id, company, client_name, email, phone, address, city, state, website, notes")
        .eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      const [{ data: proposals }, { data: tickets }, { data: tasks }] = await Promise.all([
        supabase.from("proposals").select("id, proposal_name, status, proposal_value")
          .eq("org_id", orgId).eq("client_id", client.id).not("status", "in", '("Won","Lost")').limit(5),
        supabase.from("service_tickets").select("id, title, status, priority")
          .eq("org_id", orgId).eq("client_id", client.id).neq("status", "closed").limit(5),
        supabase.from("tasks").select("id, title, due_date, status")
          .eq("org_id", orgId).eq("client_id", client.id).neq("status", "completed").limit(5),
      ])
      return { client, open_proposals: proposals || [], open_tickets: tickets || [], pending_tasks: tasks || [] }
    }

    case "create_client": {
      const { data, error } = await supabase.from("clients").insert({
        org_id: orgId, company: input.company, client_name: input.client_name || null,
        email: input.email || null, phone: input.phone || null, address: input.address || null,
        city: input.city || null, state: input.state || null, zip: input.zip || null,
        website: input.website || null, industry: input.industry || null, notes: input.notes || null,
      }).select("id, company").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, company: data.company, action: "created_client" }
    }

    case "update_client": {
      const { data: client } = await supabase.from("clients")
        .select("id, company").eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      const updates: Record<string, any> = {}
      const fields = ["email","phone","address","city","state","zip","website","industry","notes"]
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      if (Object.keys(updates).length === 0) return { error: "No fields provided to update." }
      const { error } = await supabase.from("clients").update(updates).eq("id", client.id)
      if (error) return { error: error.message }
      return { success: true, company: client.company, updated_fields: Object.keys(updates), action: "updated_client" }
    }

    case "create_contact": {
      const { data: client } = await supabase.from("clients")
        .select("id, company").eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}". Create the company first.` }
      const { data, error } = await supabase.from("client_contacts").insert({
        org_id: orgId, client_id: client.id, full_name: input.full_name,
        email: input.email || null, phone: input.phone || null,
        title: input.title || null, is_primary: input.is_primary || false, notes: "",
      }).select("id, full_name").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, full_name: data.full_name, company: client.company, action: "created_contact" }
    }

    case "search_proposals": {
      let query = supabase.from("proposals")
        .select("id, proposal_name, company, client_name, status, proposal_value, created_at, quote_expires_at")
        .eq("org_id", orgId).order("created_at", { ascending: false }).limit(8)
      if (input.status) query = query.ilike("status", `%${input.status}%`)
      if (input.query) {
        const q = `%${input.query}%`
        query = query.or(`proposal_name.ilike.${q},company.ilike.${q},client_name.ilike.${q}`)
      }
      const { data } = await query
      return { results: data || [] }
    }

    case "get_proposal_bom": {
      let proposal: any = null
      if (input.proposal_name) {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, client_name, status, proposal_value, total_your_cost, total_gross_margin_percent, quote_number, quote_expires_at")
          .eq("org_id", orgId).ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposal = data
      } else if (input.company) {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, client_name, status, proposal_value, total_your_cost, total_gross_margin_percent, quote_number, quote_expires_at")
          .eq("org_id", orgId).ilike("company", `%${input.company}%`)
          .not("status", "in", '("Won","Lost")').order("created_at", { ascending: false }).limit(1).maybeSingle()
        proposal = data
      }
      if (!proposal) return { error: "No matching proposal found." }

      const { data: sections } = await supabase.from("proposal_sections")
        .select("id, name, include_labor")
        .eq("proposal_id", proposal.id).order("order_index")

      const { data: items } = await supabase.from("proposal_items")
        .select("id, section_id, item_name, part_number, manufacturer, quantity, your_cost, customer_price, notes, category")
        .eq("proposal_id", proposal.id)

      const sectionMap: Record<string, any[]> = {}
      for (const s of (sections || [])) sectionMap[s.id] = []
      for (const item of (items || [])) {
        if (item.section_id && sectionMap[item.section_id]) sectionMap[item.section_id].push(item)
      }

      return {
        proposal: {
          name: proposal.proposal_name, company: proposal.company, client: proposal.client_name,
          status: proposal.status, quote_number: proposal.quote_number,
          expires: proposal.quote_expires_at,
          customer_total: proposal.proposal_value, your_cost: proposal.total_your_cost,
          margin_pct: proposal.total_gross_margin_percent,
        },
        sections: (sections || []).map(s => ({
          id: s.id, name: s.name, include_labor: s.include_labor,
          items: (sectionMap[s.id] || []).map(i => ({
            id: i.id, name: i.item_name, part_number: i.part_number, manufacturer: i.manufacturer,
            qty: i.quantity, your_cost: i.your_cost, customer_price: i.customer_price,
            category: i.category, notes: i.notes,
          })),
        })),
      }
    }

    case "create_proposal": {
      const { data: profile } = userId
        ? await supabase.from("profiles").select("full_name, email").eq("id", userId).single()
        : { data: null }
      const { data, error } = await supabase.from("proposals").insert({
        org_id: orgId, user_id: userId || null,
        proposal_name: input.proposal_name, company: input.company || null,
        client_name: input.client_name || null, client_email: input.client_email || null,
        proposal_value: input.proposal_value || 0, status: "Draft",
        rep_name: profile?.full_name || null, rep_email: profile?.email || null,
        quote_expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0] })(),
      }).select("id, proposal_name").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, proposal_name: data.proposal_name, action: "created_proposal" }
    }

    case "update_proposal": {
      let proposal: any = null
      if (input.proposal_name) {
        const { data } = await supabase.from("proposals").select("id, proposal_name, company")
          .eq("org_id", orgId).ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposal = data
      } else if (input.company) {
        const { data } = await supabase.from("proposals").select("id, proposal_name, company")
          .eq("org_id", orgId).ilike("company", `%${input.company}%`)
          .not("status", "in", '("Won","Lost")').order("created_at", { ascending: false }).limit(1).maybeSingle()
        proposal = data
      }
      if (!proposal) return { error: "No matching proposal found." }
      const updates: Record<string, any> = {}
      if (input.close_date) updates.close_date = input.close_date
      if (input.proposal_value !== undefined) updates.proposal_value = input.proposal_value
      if (input.stage_name) {
        const { data: stage } = await supabase.from("pipeline_stages")
          .select("id").eq("org_id", orgId).ilike("name", `%${input.stage_name}%`).limit(1).maybeSingle()
        if (!stage) return { error: `No pipeline stage matching "${input.stage_name}".` }
        updates.pipeline_stage_id = stage.id
      }
      if (Object.keys(updates).length === 0) return { error: "No fields to update." }
      const { error } = await supabase.from("proposals").update(updates).eq("id", proposal.id)
      if (error) return { error: error.message }
      return { success: true, proposal_name: proposal.proposal_name, updated_fields: Object.keys(updates), action: "updated_proposal" }
    }

    case "update_proposal_status": {
      if (!input.confirmed) return { error: "User confirmation required before marking Won or Lost." }
      let proposal: any = null
      if (input.proposal_name) {
        const { data } = await supabase.from("proposals").select("id, proposal_name, company, status")
          .eq("org_id", orgId).ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposal = data
      } else if (input.company) {
        const { data } = await supabase.from("proposals").select("id, proposal_name, company, status")
          .eq("org_id", orgId).ilike("company", `%${input.company}%`)
          .not("status", "in", '("Won","Lost")').order("created_at", { ascending: false }).limit(1).maybeSingle()
        proposal = data
      }
      if (!proposal) return { error: "No matching proposal found." }
      if (proposal.status === input.status) return { error: `Already marked ${input.status}.` }
      if (input.status === "Won") {
        const { data: existingJob } = await supabase.from("jobs").select("id").eq("proposal_id", proposal.id).maybeSingle()
        if (!existingJob) {
          const { data: orgData } = await supabase.from("organizations").select("job_counter").eq("id", orgId).single()
          const jobNumber = `JOB-${orgData?.job_counter || 1000}`
          await supabase.from("organizations").update({ job_counter: (orgData?.job_counter || 1000) + 1 }).eq("id", orgId)
          await supabase.from("jobs").insert({ org_id: orgId, proposal_id: proposal.id, job_number: jobNumber, name: proposal.proposal_name, status: "Pending" })
        }
      }
      const { error } = await supabase.from("proposals").update({ status: input.status }).eq("id", proposal.id)
      if (error) return { error: error.message }
      return { success: true, proposal_name: proposal.proposal_name, status: input.status, action: "updated_proposal_status" }
    }

    case "add_bom_item": {
      // Find proposal
      let proposal: any = null
      if (input.proposal_name) {
        const { data } = await supabase.from("proposals").select("id, proposal_name, org_id")
          .eq("org_id", orgId).ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposal = data
      } else if (input.company) {
        const { data } = await supabase.from("proposals").select("id, proposal_name, org_id")
          .eq("org_id", orgId).ilike("company", `%${input.company}%`)
          .not("status", "in", '("Won","Lost")').order("created_at", { ascending: false }).limit(1).maybeSingle()
        proposal = data
      }
      if (!proposal) return { error: "No matching proposal found. Provide proposal_name or company." }

      // Find or use first section
      let sectionId: string | null = null
      if (input.section_name) {
        const { data: sec } = await supabase.from("proposal_sections")
          .select("id").eq("proposal_id", proposal.id).ilike("name", `%${input.section_name}%`).limit(1).maybeSingle()
        sectionId = sec?.id || null
      }
      if (!sectionId) {
        const { data: firstSec } = await supabase.from("proposal_sections")
          .select("id").eq("proposal_id", proposal.id).order("order_index").limit(1).maybeSingle()
        sectionId = firstSec?.id || null
      }
      if (!sectionId) {
        // Create a default section
        const { data: newSec } = await supabase.from("proposal_sections").insert({
          proposal_id: proposal.id, org_id: orgId, name: input.section_name || "Products", order_index: 0,
        }).select("id").single()
        sectionId = newSec?.id || null
      }
      if (!sectionId) return { error: "Could not find or create a section in this proposal." }

      const { data: item, error } = await supabase.from("proposal_items").insert({
        proposal_id: proposal.id,
        section_id: sectionId,
        org_id: orgId,
        item_name: input.item_name,
        part_number: input.part_number || null,
        manufacturer: input.manufacturer || null,
        quantity: input.quantity ?? 1,
        your_cost: input.your_cost ?? null,
        customer_price: input.customer_price ?? null,
        notes: input.notes || null,
      }).select("id, item_name, quantity").single()
      if (error) return { error: error.message }
      return { success: true, id: item.id, item_name: item.item_name, quantity: item.quantity, proposal_name: proposal.proposal_name, action: "added_bom_item" }
    }

    case "get_pipeline_summary": {
      const { data: proposals } = await supabase.from("proposals")
        .select("status, proposal_value, pipeline_stages(name)").eq("org_id", orgId)
      const summary: Record<string, { count: number; value: number }> = {}
      for (const p of (proposals || [])) {
        const stage = (p.pipeline_stages as any)?.name || p.status || "Unknown"
        if (!summary[stage]) summary[stage] = { count: 0, value: 0 }
        summary[stage].count++
        summary[stage].value += p.proposal_value || 0
      }
      return { summary }
    }

    case "get_deal_summary": {
      let proposal: any = null
      if (input.proposal_name) {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, client_name, status, proposal_value, created_at, pipeline_stages(name)")
          .eq("org_id", orgId).ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposal = data
      } else if (input.company) {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, client_name, status, proposal_value, created_at, pipeline_stages(name)")
          .eq("org_id", orgId).ilike("company", `%${input.company}%`)
          .not("status", "in", '("Won","Lost")').order("created_at", { ascending: false }).limit(1).maybeSingle()
        proposal = data
      }
      if (!proposal) return { error: "No matching proposal found." }
      const [{ data: activities }, { data: tasks }, { data: emails }] = await Promise.all([
        supabase.from("activities").select("type, title, body, created_at, profiles(full_name)")
          .eq("proposal_id", proposal.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("tasks").select("title, due_date, status")
          .eq("org_id", orgId).eq("client_id", proposal.id).neq("status", "completed").limit(5),
        supabase.from("client_emails").select("subject, sent_at, opened_at, open_count, to_email")
          .eq("proposal_id", proposal.id).order("sent_at", { ascending: false }).limit(5),
      ])
      return {
        proposal: {
          name: proposal.proposal_name, company: proposal.company, contact: proposal.client_name,
          status: proposal.status, stage: (proposal.pipeline_stages as any)?.name || null,
          value: proposal.proposal_value, created: proposal.created_at,
        },
        recent_activity: (activities || []).map((a: any) => ({ type: a.type, title: a.title, notes: a.body, by: a.profiles?.full_name, date: a.created_at })),
        open_tasks: tasks || [],
        email_history: (emails || []).map((e: any) => ({ subject: e.subject, sent: e.sent_at, opened: e.opened_at, open_count: e.open_count, to: e.to_email })),
      }
    }

    case "log_activity": {
      let clientId: string | null = null, proposalId: string | null = null
      if (input.company) {
        const { data: cl } = await supabase.from("clients").select("id")
          .eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
        clientId = cl?.id || null
      }
      if (input.proposal_name) {
        const { data: pr } = await supabase.from("proposals").select("id, client_id")
          .eq("org_id", orgId).ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        if (pr) { proposalId = pr.id; if (!clientId) clientId = pr.client_id }
      }
      await supabase.from("activities").insert({
        org_id: orgId, user_id: userId || null, client_id: clientId, proposal_id: proposalId,
        type: input.type, title: input.title, body: input.body || null, source: "mcp",
      })
      if (input.follow_up_date) {
        await supabase.from("tasks").insert({
          org_id: orgId, user_id: userId || null, client_id: clientId,
          title: `Follow up: ${input.title}`, due_date: input.follow_up_date, status: "pending",
        })
      }
      return { success: true, type: input.type, title: input.title, follow_up_created: !!input.follow_up_date, action: "logged_activity" }
    }

    case "create_task": {
      let clientId: string | null = null
      if (input.client_name) {
        const { data: cl } = await supabase.from("clients").select("id")
          .eq("org_id", orgId).ilike("company", `%${input.client_name}%`).limit(1).maybeSingle()
        clientId = cl?.id || null
      }
      const { data, error } = await supabase.from("tasks").insert({
        org_id: orgId, user_id: userId || null, title: input.title,
        due_date: input.due_date || null, notes: input.notes || null,
        client_id: clientId, status: "pending",
      }).select("id, title").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, title: data.title, action: "created_task" }
    }

    case "create_service_ticket": {
      let clientId: string | null = null
      if (input.client_name) {
        const { data: cl } = await supabase.from("clients").select("id")
          .eq("org_id", orgId).ilike("company", `%${input.client_name}%`).limit(1).maybeSingle()
        clientId = cl?.id || null
      }
      const { data, error } = await supabase.from("service_tickets").insert({
        org_id: orgId, title: input.title, description: input.description || null,
        priority: input.priority || "normal", status: "open",
        client_id: clientId, created_by: userId || null,
      }).select("id, title").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, title: data.title, action: "created_ticket" }
    }

    case "schedule_meeting": {
      const { data: client } = await supabase.from("clients")
        .select("id, company").eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      const { data, error } = await supabase.from("tasks").insert({
        org_id: orgId, user_id: userId || null, assigned_to: userId || null, created_by: userId || null,
        client_id: client.id, title: input.title, due_date: input.date,
        start_time: input.time || null, duration_minutes: input.duration_minutes || 60,
        meeting_type: input.meeting_type || "Sales Call", is_virtual: input.is_virtual || false,
        meeting_notes: input.notes || null, completed: false, priority: "normal",
      }).select("id, title").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, title: data.title, company: client.company, date: input.date, action: "scheduled_meeting" }
    }

    case "search_products": {
      let query = supabase.from("product_library")
        .select("item_name, part_number, manufacturer, category, description, msrp")
        .eq("org_id", orgId).order("item_name").limit(30)
      if (input.query) {
        const q = `%${input.query}%`
        query = query.or(`item_name.ilike.${q},part_number.ilike.${q},manufacturer.ilike.${q},description.ilike.${q}`)
      }
      if (input.category) query = query.ilike("category", `%${input.category}%`)
      if (input.manufacturer) query = query.ilike("manufacturer", `%${input.manufacturer}%`)
      const { data: products } = await query
      return {
        total: (products || []).length,
        products: (products || []).map((p: any) => ({
          name: p.item_name, part_number: p.part_number || null,
          manufacturer: p.manufacturer || null, category: p.category || null,
          description: p.description || null,
          msrp: p.msrp != null ? `$${Number(p.msrp).toFixed(2)}` : null,
        })),
      }
    }

    case "get_inventory": {
      const { data: allWarehouses } = await supabase.from("warehouses").select("id, name").eq("org_id", orgId)
      const warehouseMap: Record<string, string> = {}
      let warehouseFilterId: string | null = null
      for (const w of (allWarehouses || [])) warehouseMap[w.id] = w.name
      if (input.warehouse) {
        const match = (allWarehouses || []).find((w: any) => w.name.toLowerCase().includes(input.warehouse.toLowerCase()))
        if (match) warehouseFilterId = match.id
      }
      let query = supabase.from("inventory_items")
        .select("part_number, description, qty_on_hand, qty_reserved, min_stock_level, warehouse_id")
        .eq("org_id", orgId).order("description").limit(50)
      if (input.query) {
        const q = `%${input.query}%`
        query = query.or(`description.ilike.${q},part_number.ilike.${q}`)
      }
      if (warehouseFilterId) query = query.eq("warehouse_id", warehouseFilterId)
      const { data: items } = await query
      let results = (items || []).map((i: any) => ({
        part_number: i.part_number || null, description: i.description,
        on_hand: i.qty_on_hand ?? 0, reserved: i.qty_reserved ?? 0,
        available: (i.qty_on_hand ?? 0) - (i.qty_reserved ?? 0),
        min_stock_level: i.min_stock_level ?? null,
        warehouse: i.warehouse_id ? (warehouseMap[i.warehouse_id] || null) : null,
      }))
      if (input.filter === "out_of_stock") results = results.filter((i: any) => i.on_hand <= 0)
      else if (input.filter === "low_stock") results = results.filter((i: any) => i.min_stock_level != null && i.on_hand <= i.min_stock_level && i.on_hand > 0)
      return { total_items: results.length, items: results }
    }

    case "get_recent_activity": {
      const limit = Math.min(input.limit || 5, 10)
      if (input.type === "clients") {
        const { data } = await supabase.from("clients").select("id, company, client_name, email, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit)
        return { results: data || [] }
      }
      if (input.type === "proposals") {
        const { data } = await supabase.from("proposals").select("id, proposal_name, company, status, proposal_value, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit)
        return { results: data || [] }
      }
      if (input.type === "tickets") {
        const { data } = await supabase.from("service_tickets").select("id, title, status, priority, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit)
        return { results: data || [] }
      }
      return { results: [] }
    }

    case "create_invoice": {
      const { data: client } = await supabase.from("clients")
        .select("id, company").eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      let proposalId: string | null = null
      if (input.proposal_name) {
        const { data: pr } = await supabase.from("proposals").select("id")
          .eq("org_id", orgId).eq("client_id", client.id)
          .ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposalId = pr?.id || null
      }
      const { data: orgData } = await supabase.from("organizations").select("invoice_counter").eq("id", orgId).single()
      const counter = (orgData?.invoice_counter || 1000) + 1
      await supabase.from("organizations").update({ invoice_counter: counter }).eq("id", orgId)
      const today = new Date().toISOString().split("T")[0]
      const dueDate = new Date(Date.now() + (input.due_days ?? 30) * 86400000).toISOString().split("T")[0]
      const { data: inv, error } = await supabase.from("invoices").insert({
        org_id: orgId, client_id: client.id, proposal_id: proposalId,
        invoice_number: `INV-${counter}`, status: "Draft",
        issued_date: today, due_date: dueDate,
        subtotal: input.amount, tax_percent: 0, tax_amount: 0,
        total: input.amount, amount_paid: 0, balance_due: input.amount,
        description: input.description || `Invoice for ${client.company}`,
      }).select("id, invoice_number").single()
      if (error) return { error: error.message }
      return { success: true, id: inv.id, invoice_number: inv.invoice_number, amount: input.amount, due_date: dueDate, action: "created_invoice" }
    }

    case "get_reports": {
      const periodDays = input.period_days ?? 90
      const since = new Date(Date.now() - periodDays * 86400000).toISOString().split("T")[0]
      if (input.type === "revenue_by_rep") {
        const { data: proposals } = await supabase.from("proposals")
          .select("rep_name, proposal_value, status").eq("org_id", orgId).gte("created_at", since)
        const repMap: Record<string, { won: number; active: number; count: number }> = {}
        for (const p of (proposals || [])) {
          const rep = p.rep_name || "Unassigned"
          if (!repMap[rep]) repMap[rep] = { won: 0, active: 0, count: 0 }
          repMap[rep].count++
          if (p.status === "Won") repMap[rep].won += p.proposal_value || 0
          else if (p.status !== "Lost") repMap[rep].active += p.proposal_value || 0
        }
        return { period_days: periodDays, by_rep: Object.entries(repMap).map(([rep, d]) => ({ rep, ...d })).sort((a, b) => b.won - a.won) }
      }
      if (input.type === "win_rate") {
        const { data: proposals } = await supabase.from("proposals")
          .select("status, proposal_value").eq("org_id", orgId).gte("created_at", since)
        const total = (proposals || []).length
        const won = (proposals || []).filter(p => p.status === "Won").length
        const lost = (proposals || []).filter(p => p.status === "Lost").length
        const wonValue = (proposals || []).filter(p => p.status === "Won").reduce((s, p) => s + (p.proposal_value || 0), 0)
        return { period_days: periodDays, total, won, lost, open: total - won - lost, win_rate_pct: total > 0 ? Math.round((won / (won + lost || 1)) * 100) : 0, won_value: wonValue }
      }
      if (input.type === "pipeline_value") {
        const { data: proposals } = await supabase.from("proposals")
          .select("proposal_value, pipeline_stages(name)").eq("org_id", orgId).not("status", "in", '("Won","Lost")')
        const total = (proposals || []).reduce((s, p) => s + (p.proposal_value || 0), 0)
        const byStage: Record<string, number> = {}
        for (const p of (proposals || [])) {
          const stage = (p.pipeline_stages as any)?.name || "Unknown"
          byStage[stage] = (byStage[stage] || 0) + (p.proposal_value || 0)
        }
        return { total_pipeline: total, by_stage: byStage }
      }
      if (input.type === "top_clients") {
        const { data: proposals } = await supabase.from("proposals")
          .select("company, proposal_value, status").eq("org_id", orgId).gte("created_at", since)
        const clientMap: Record<string, { won: number; total: number }> = {}
        for (const p of (proposals || [])) {
          const co = p.company || "Unknown"
          if (!clientMap[co]) clientMap[co] = { won: 0, total: 0 }
          clientMap[co].total += p.proposal_value || 0
          if (p.status === "Won") clientMap[co].won += p.proposal_value || 0
        }
        return { period_days: periodDays, top_clients: Object.entries(clientMap).map(([company, d]) => ({ company, ...d })).sort((a, b) => b.won - a.won).slice(0, 10) }
      }
      return { error: "Unknown report type." }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── MCP server ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  // Auth
  const authHeader = req.headers.get("Authorization") || ""
  const raw = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!raw) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Missing API key" } }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } })
  }

  const hash = await sha256hex(raw)
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id, org_id, user_id, scopes, is_active")
    .eq("key_hash", hash)
    .maybeSingle()

  if (!keyRow?.is_active) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or revoked API key" } }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } })
  }
  if (!keyRow.scopes?.includes("agent:mcp")) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Key does not have agent:mcp scope. Generate a new key with the AI Agent scope in ForgePt Settings." } }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } })
  }

  const orgId: string = keyRow.org_id
  const userId: string | null = keyRow.user_id || null

  // Fire-and-forget last_used update
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id)

  // Parse JSON-RPC
  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
  }

  const { method, params, id } = body

  const ok = (result: any) => new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    { headers: { ...CORS, "Content-Type": "application/json" } }
  )

  // notifications have no id and need no response body
  if (method?.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: CORS })
  }

  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ForgePt", version: "1.0.0" },
      })

    case "tools/list":
      return ok({ tools: TOOLS })

    case "tools/call": {
      const toolName: string = params?.name
      const toolInput: any = params?.arguments || {}
      if (!toolName) return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
      const result = await executeTool(toolName, toolInput, supabase, orgId, userId)
      return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] })
    }

    default:
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } })
  }
})

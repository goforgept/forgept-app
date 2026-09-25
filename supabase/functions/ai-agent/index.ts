import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"
import { checkAndIncrementAIUsage } from "../_shared/ai-usage.ts"

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
        website: { type: "string", description: "Website URL" },
        industry: { type: "string", description: "Industry or vertical" },
        notes: { type: "string", description: "Internal notes about the client" },
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
    name: "create_contact",
    description: "Add a contact person to an existing client account. Use this when adding a new person to a company that already exists — do NOT use create_client. Inserts into the contacts tab.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name to find the client account" },
        full_name: { type: "string", description: "Contact person's full name" },
        email: { type: "string", description: "Contact email address" },
        phone: { type: "string", description: "Contact phone number" },
        title: { type: "string", description: "Job title or role" },
        is_primary: { type: "boolean", description: "Set as primary contact (default false)" },
      },
      required: ["company", "full_name"],
    },
  },
  {
    name: "update_client",
    description: "Update fields on an existing client account (address, phone, email, website, industry, notes). Only updates fields you provide — leave others blank to keep them unchanged.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name to find the client" },
        email: { type: "string", description: "New email address" },
        phone: { type: "string", description: "New phone number" },
        address: { type: "string", description: "New street address" },
        city: { type: "string", description: "New city" },
        state: { type: "string", description: "New state" },
        zip: { type: "string", description: "New zip code" },
        website: { type: "string", description: "New website URL" },
        industry: { type: "string", description: "New industry" },
        notes: { type: "string", description: "New internal notes (replaces existing notes)" },
      },
      required: ["company"],
    },
  },
  {
    name: "search_proposals",
    description: "Search or look up proposals by client name, proposal name, or status",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term — company name, proposal name, or rep name" },
        status: { type: "string", description: "Filter by status: Draft, Sent, Won, Lost, etc." },
      },
      required: [],
    },
  },
  {
    name: "get_client_overview",
    description: "Get a full snapshot of a client — their open proposals, open service tickets, and pending tasks all in one view",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name to look up" },
      },
      required: ["company"],
    },
  },
  {
    name: "update_client_poc",
    description: "Update the main point of contact (POC) name on a client account. ALWAYS call search_clients first to find the client and check the current POC. Then show the user the current POC and ask for confirmation before calling this tool. Never call this without user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name to find the client" },
        new_poc_name: { type: "string", description: "New main POC full name to set" },
        confirmed: { type: "boolean", description: "Must be true — user has explicitly confirmed they want to overwrite the existing POC" },
      },
      required: ["company", "new_poc_name", "confirmed"],
    },
  },
  {
    name: "log_activity",
    description: "Log a call, email, meeting, or note against a client or proposal. Use this when the user mentions they spoke with someone, had a meeting, sent an email, or wants to record a note. Optionally creates a follow-up task.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["call", "email", "meeting", "note"], description: "Type of activity" },
        title: { type: "string", description: "Short summary — e.g. 'Called Marcus, no answer'" },
        body: { type: "string", description: "Longer notes — what was discussed, objections, next steps" },
        company: { type: "string", description: "Client company name to associate this activity with" },
        proposal_name: { type: "string", description: "Proposal name to link this activity to (optional)" },
        follow_up_date: { type: "string", description: "If a follow-up task should be created, the due date in YYYY-MM-DD format" },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "get_deal_summary",
    description: "Get a full summary of where a deal stands — proposal details, recent activity, open tasks — and provide a recommendation on how to move it forward",
    input_schema: {
      type: "object",
      properties: {
        proposal_name: { type: "string", description: "Proposal name to summarize" },
        company: { type: "string", description: "Client company name (used if proposal name is not known)" },
      },
      required: [],
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
  {
    name: "search_products",
    description: "Search the org's product library by name, part number, manufacturer, or category. Returns matching products with pricing.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term — product name, part number, or manufacturer" },
        category: { type: "string", description: "Filter by category (optional)" },
        manufacturer: { type: "string", description: "Filter by manufacturer (optional)" },
      },
      required: [],
    },
  },
  {
    name: "get_inventory",
    description: "Look up inventory stock levels. Can search by part number or description, filter by low/out-of-stock, or return everything.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term — part number or description (optional)" },
        filter: { type: "string", enum: ["all", "low_stock", "out_of_stock"], description: "Filter results (default: all)" },
        warehouse: { type: "string", description: "Filter by warehouse name (optional)" },
      },
      required: [],
    },
  },
]

const DEFAULT_ALL_WRITE: Record<string, string> = {
  dashboard: 'write', proposals: 'write', clients: 'write', pipeline: 'write',
  tasks: 'write', jobs: 'write', serviceTickets: 'write', dispatch: 'write',
  invoices: 'write', purchaseOrders: 'write', inventory: 'write', contracts: 'write',
  vendors: 'write', productLibrary: 'write', reports: 'write', settings: 'write',
}
const TECH_DEFAULT: Record<string, string> = {
  dashboard: 'none', proposals: 'none', clients: 'none', pipeline: 'none',
  tasks: 'read', jobs: 'write', serviceTickets: 'write', dispatch: 'read',
  invoices: 'none', purchaseOrders: 'none', inventory: 'read', contracts: 'none',
  vendors: 'none', productLibrary: 'none', reports: 'none', settings: 'write',
}

function buildPerms(orgRole: any, overrides: any, isAdmin: boolean): Record<string, string> {
  if (isAdmin || !orgRole) return { ...DEFAULT_ALL_WRITE }
  if (orgRole.is_admin) return { ...DEFAULT_ALL_WRITE }
  const isTech = orgRole.base_role === 'technician'
  return { ...(isTech ? TECH_DEFAULT : DEFAULT_ALL_WRITE), ...(orgRole.permissions || {}), ...(overrides || {}) }
}

// Tool → required permission area and minimum level
const TOOL_PERMS: Record<string, { area: string; write?: boolean }> = {
  create_client:          { area: 'clients',        write: true },
  search_clients:         { area: 'clients' },
  create_service_ticket:  { area: 'serviceTickets', write: true },
  create_task:            { area: 'tasks',          write: true },
  create_proposal:        { area: 'proposals',      write: true },
  create_contact:         { area: 'clients',        write: true },
  update_client_poc:      { area: 'clients',        write: true },
  update_client:          { area: 'clients',        write: true },
  search_proposals:       { area: 'proposals' },
  get_client_overview:    { area: 'clients' },
  log_activity:           { area: 'clients',        write: true },
  get_deal_summary:       { area: 'proposals' },
  get_pipeline_summary:   { area: 'pipeline' },
  get_recent_activity:    { area: 'dashboard' },
  get_inventory:          { area: 'inventory' },
  search_products:        { area: 'productLibrary' },
}

async function executeTool(name: string, input: any, supabase: any, orgId: string, userId: string, perms: Record<string, string>) {
  // Permission gate
  const rule = TOOL_PERMS[name]
  if (rule) {
    const level = perms[rule.area] || 'write'
    if (level === 'none') return { error: `You don't have access to ${rule.area}.` }
    if (rule.write && level !== 'write') return { error: `You don't have permission to create/edit ${rule.area}.` }
  }
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
        website: input.website || null,
        industry: input.industry || null,
        notes: input.notes || null,
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

    case "create_contact": {
      // Find the client account by company name
      const { data: client } = await supabase.from("clients")
        .select("id, company").eq("org_id", orgId)
        .ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client account found matching "${input.company}". Create the company first with create_client.` }
      const { data, error } = await supabase.from("client_contacts").insert({
        org_id: orgId,
        client_id: client.id,
        full_name: input.full_name,
        email: input.email || null,
        phone: input.phone || null,
        title: input.title || null,
        is_primary: input.is_primary || false,
        notes: "",
      }).select("id, full_name").single()
      if (error) return { error: error.message }
      return { success: true, id: data.id, full_name: data.full_name, company: client.company, action: "created_contact" }
    }

    case "update_client_poc": {
      if (!input.confirmed) return { error: "User confirmation required before updating the main POC." }
      const { data: client } = await supabase.from("clients")
        .select("id, company, client_name").eq("org_id", orgId)
        .ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      const { error } = await supabase.from("clients").update({ client_name: input.new_poc_name }).eq("id", client.id)
      if (error) return { error: error.message }
      return { success: true, company: client.company, previous_poc: client.client_name || "(none)", new_poc: input.new_poc_name, action: "updated_poc" }
    }

    case "get_pipeline_summary": {
      const { data: proposals } = await supabase.from("proposals")
        .select("status, proposal_value, pipeline_stage_id, pipeline_stages(name)")
        .eq("org_id", orgId)
      const summary = Object.create(null) as Record<string, { count: number; value: number }>
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

    case "log_activity": {
      let clientId = null, proposalId = null
      if (input.company) {
        const { data: cl } = await supabase.from("clients")
          .select("id").eq("org_id", orgId)
          .ilike("company", `%${input.company}%`).limit(1).maybeSingle()
        clientId = cl?.id || null
      }
      if (input.proposal_name) {
        const { data: pr } = await supabase.from("proposals")
          .select("id, client_id").eq("org_id", orgId)
          .ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        if (pr) { proposalId = pr.id; if (!clientId) clientId = pr.client_id }
      }
      await supabase.from("activities").insert({
        org_id: orgId,
        user_id: userId,
        client_id: clientId,
        proposal_id: proposalId,
        type: input.type,
        title: input.title,
        body: input.body || null,
        source: "ai",
      })
      if (input.follow_up_date) {
        await supabase.from("tasks").insert({
          org_id: orgId,
          user_id: userId,
          client_id: clientId,
          title: `Follow up: ${input.title}`,
          due_date: input.follow_up_date,
          status: "pending",
        })
      }
      return { success: true, type: input.type, title: input.title, follow_up_created: !!input.follow_up_date, action: "logged_activity" }
    }

    case "get_deal_summary": {
      let proposal = null
      if (input.proposal_name) {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, client_name, status, proposal_value, created_at, pipeline_stages(name)")
          .eq("org_id", orgId)
          .ilike("proposal_name", `%${input.proposal_name}%`).limit(1).maybeSingle()
        proposal = data
      } else if (input.company) {
        const { data } = await supabase.from("proposals")
          .select("id, proposal_name, company, client_name, status, proposal_value, created_at, pipeline_stages(name)")
          .eq("org_id", orgId)
          .ilike("company", `%${input.company}%`)
          .not("status", "in", '("Won","Lost")')
          .order("created_at", { ascending: false }).limit(1).maybeSingle()
        proposal = data
      }
      if (!proposal) return { error: "No matching proposal found." }

      const [{ data: activities }, { data: tasks }, { data: emails }] = await Promise.all([
        supabase.from("activities")
          .select("type, title, body, created_at, profiles(full_name)")
          .eq("proposal_id", proposal.id)
          .order("created_at", { ascending: false }).limit(10),
        supabase.from("tasks")
          .select("title, due_date, status")
          .eq("org_id", orgId).eq("client_id", proposal.id)
          .neq("status", "completed").limit(5),
        supabase.from("client_emails")
          .select("subject, sent_at, opened_at, open_count, to_email")
          .eq("proposal_id", proposal.id)
          .order("sent_at", { ascending: false }).limit(5),
      ])

      return {
        proposal: {
          name: proposal.proposal_name,
          company: proposal.company,
          contact: proposal.client_name,
          status: proposal.status,
          stage: proposal.pipeline_stages?.name || null,
          value: proposal.proposal_value,
          created: proposal.created_at,
        },
        recent_activity: (activities || []).map(a => ({ type: a.type, title: a.title, notes: a.body, by: a.profiles?.full_name, date: a.created_at })),
        open_tasks: tasks || [],
        email_history: (emails || []).map(e => ({
          subject: e.subject,
          sent: e.sent_at,
          opened: e.opened_at ?? null,
          open_count: e.open_count ?? 0,
          to: e.to_email,
        })),
      }
    }

    case "update_client": {
      const { data: client } = await supabase.from("clients")
        .select("id, company").eq("org_id", orgId)
        .ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      const updates: Record<string, any> = {}
      if (input.email    !== undefined) updates.email    = input.email
      if (input.phone    !== undefined) updates.phone    = input.phone
      if (input.address  !== undefined) updates.address  = input.address
      if (input.city     !== undefined) updates.city     = input.city
      if (input.state    !== undefined) updates.state    = input.state
      if (input.zip      !== undefined) updates.zip      = input.zip
      if (input.website  !== undefined) updates.website  = input.website
      if (input.industry !== undefined) updates.industry = input.industry
      if (input.notes    !== undefined) updates.notes    = input.notes
      if (Object.keys(updates).length === 0) return { error: "No fields provided to update." }
      const { error } = await supabase.from("clients").update(updates).eq("id", client.id)
      if (error) return { error: error.message }
      return { success: true, company: client.company, updated_fields: Object.keys(updates), action: "updated_client" }
    }

    case "search_proposals": {
      let query = supabase.from("proposals")
        .select("id, proposal_name, company, client_name, status, proposal_value, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(8)
      if (input.status) query = query.ilike("status", `%${input.status}%`)
      if (input.query) {
        const q = `%${input.query}%`
        query = query.or(`proposal_name.ilike.${q},company.ilike.${q},client_name.ilike.${q}`)
      }
      const { data } = await query
      return { results: data || [] }
    }

    case "get_client_overview": {
      const { data: client } = await supabase.from("clients")
        .select("id, company, client_name, email, phone, address, city, state, website, notes")
        .eq("org_id", orgId)
        .ilike("company", `%${input.company}%`).limit(1).maybeSingle()
      if (!client) return { error: `No client found matching "${input.company}".` }
      const [{ data: proposals }, { data: tickets }, { data: tasks }] = await Promise.all([
        supabase.from("proposals")
          .select("id, proposal_name, status, proposal_value")
          .eq("org_id", orgId).eq("client_id", client.id)
          .not("status", "in", '("Won","Lost")').limit(5),
        supabase.from("service_tickets")
          .select("id, title, status, priority")
          .eq("org_id", orgId).eq("client_id", client.id)
          .neq("status", "closed").limit(5),
        supabase.from("tasks")
          .select("id, title, due_date, status")
          .eq("org_id", orgId).eq("client_id", client.id)
          .neq("status", "completed").limit(5),
      ])
      return { client, open_proposals: proposals || [], open_tickets: tickets || [], pending_tasks: tasks || [] }
    }

    case "search_products": {
      let query = supabase.from("product_library")
        .select("item_name, part_number, manufacturer, category, description, msrp")
        .eq("org_id", orgId)
        .order("item_name")
        .limit(30)

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
          name: p.item_name,
          part_number: p.part_number || null,
          manufacturer: p.manufacturer || null,
          category: p.category || null,
          description: p.description || null,
          msrp: p.msrp != null ? `$${Number(p.msrp).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null,
        })),
      }
    }

    case "get_inventory": {
      let query = supabase.from("inventory_items")
        .select("part_number, description, qty_on_hand, qty_reserved, reorder_point, warehouses(name)")
        .eq("org_id", orgId)
        .order("description")
        .limit(50)

      if (input.query) {
        const q = `%${input.query}%`
        query = query.or(`description.ilike.${q},part_number.ilike.${q}`)
      }
      if (input.warehouse) {
        const { data: wh } = await supabase.from("warehouses")
          .select("id").eq("org_id", orgId).ilike("name", `%${input.warehouse}%`).limit(1).maybeSingle()
        if (wh) query = query.eq("warehouse_id", wh.id)
      }

      const { data: items, error: invError } = await query
      if (invError) return { error: `Inventory query failed: ${invError.message}` }
      let results = (items || []).map((i: any) => ({
        part_number: i.part_number || null,
        description: i.description,
        on_hand: i.qty_on_hand ?? 0,
        reserved: i.qty_reserved ?? 0,
        available: (i.qty_on_hand ?? 0) - (i.qty_reserved ?? 0),
        reorder_point: i.reorder_point ?? null,
        warehouse: i.warehouses?.name || null,
      }))

      if (input.filter === "out_of_stock") {
        results = results.filter((i: any) => i.on_hand <= 0)
      } else if (input.filter === "low_stock") {
        results = results.filter((i: any) => i.reorder_point != null && i.on_hand <= i.reorder_point && i.on_hand > 0)
      }

      return { total_items: results.length, items: results }
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

  // Block technicians
  const effectiveRole = profile.org_role || profile.role || ''
  if (effectiveRole === 'technician') {
    return new Response(JSON.stringify({ error: "AI Agent not available for technicians" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  // Check feature flag + load limit
  const { data: org } = await supabase.from("organizations")
    .select("feature_ai_agent, ai_request_limit").eq("id", profile.org_id).single()
  if (!org?.feature_ai_agent) {
    return new Response(JSON.stringify({ error: "AI Agent not enabled for this organization" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  // Usage gate
  const usageError = await checkAndIncrementAIUsage(profile.org_id)
  if (usageError) {
    return new Response(JSON.stringify({ error: usageError }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  // Build permission map — mirrors frontend usePermissions logic
  const isAdmin = profile.org_role === 'admin' || profile.role === 'admin'
  const baseRole = (profile.org_roles as any)?.base_role || profile.org_role || profile.role || 'rep'
  const orgRoleWithBase = profile.org_roles
    ? ((profile.org_roles as any).base_role ? profile.org_roles : { ...(profile.org_roles as any), base_role: baseRole })
    : baseRole === 'technician'
    ? { base_role: 'technician', permissions: {}, is_admin: false }
    : null
  const userPerms = buildPerms(orgRoleWithBase, profile.permission_overrides, isAdmin)

  try {
    const { messages, helpMode } = await req.json()
    if (!messages?.length) return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!

    const helpContext = `
ForgePt is a field service and sales management platform for integrators, contractors, and field service companies. Here is what it can do:

PROPOSALS: Create, edit, and send proposals with a BOM (bill of materials), scope of work (AI-generated or manual), labor items, tax, and markup. Export to PDF or DOCX. Send to clients with e-signature support. Pipeline view (Kanban board) tracks stages. Forecast page shows weighted revenue projections.

CLIENTS & CRM: Store clients with contacts, addresses, and linked proposals. Tasks and follow-ups can be linked to clients. Zoho CRM and QBO customer sync available.

INVOICES: Create invoices from proposals or standalone. Track status (Draft, Sent, Partially Paid, Paid, Overdue). Connect to QuickBooks Online or Stripe for payment. Auto-invoice engine bills recurring line items automatically.

PURCHASE ORDERS: Generate POs from proposal line items, grouped by vendor. Track PO status (Sent, Partial, Received, Cancelled).

JOBS: Track field installations linked to proposals. Assign technicians, set checklists, track progress. Technicians see their own jobs.

SERVICE TICKETS: Help-desk style ticketing. Assign to techs, set priority (Low/Normal/High/Urgent). Clients can submit via inbound email. Dispatch board for visual scheduling.

TASKS: CRM tasks with due dates, linked to clients/proposals. Daily reminders via email and bell notifications. Calendar view available.

CONTRACTS: Track service agreements and maintenance contracts. Alert on expiring contracts. Recurring Items tab shows items set for auto-invoicing.

DESIGNER: Floor plan design tool — upload drawings, place security/AV symbols, assign products from catalog. Approve & Push to BOM writes all devices + labor to the proposal automatically.

PRODUCT LIBRARY: Org-wide product catalog. Import from Excel or QuickBooks. Used in proposals and Designer placements.

REPORTS: Revenue by rep, proposal win rates, pipeline analytics. Admin-only. Sales KPIs page has a period filter — use the ‹ › arrows to navigate to previous weeks or months, and the Weekly/Monthly buttons to switch period type.

INVENTORY: Track stock levels for products. Add items, set quantities, record adjustments.

AI AGENT: The floating orange chat button (bottom-right). Can create clients, tickets, tasks, and proposals, search clients, and show pipeline summary — all via natural language.

NOTIFICATIONS: Bell icon in sidebar. Fires for: tasks due today or overdue, overdue invoices, auto-sent invoices. Proposal signed notification and invoice paid notification are also tracked.

SETTINGS: Upload logo, set brand color, terms and conditions. Rate Card sets labor roles and rates. Calendar integrations (Google, Microsoft). API keys for external integrations. Security tab: enable or disable two-factor authentication (TOTP) using an authenticator app like Google Authenticator or Authy. Support tab: find your 8-character support code (used to identify your account when contacting support), and step-by-step instructions for Google Remote Desktop (desktop) and iOS screen recording for remote support sessions.

INTEGRATIONS: QuickBooks Online (invoices, customers, payments), Zoho CRM (accounts, contacts), Square (payments), Stripe (subscriptions and client payments), REST API for custom integrations.`

    const systemPrompt = helpMode
      ? `You are the ForgePt Help Assistant, embedded in the Help & FAQ page of ForgePt — a field service and sales management platform for integrators and contractors.

Your job is to answer questions about how ForgePt works. Be clear, helpful, and specific. When explaining where to find something, name the exact page or button. Keep answers concise — 2–4 sentences for simple questions, a short numbered list for multi-step processes.

If a user wants to DO something (create a client, ticket, etc.) rather than learn about it, let them know they can use the orange chat button in the bottom-right corner of any page to take action directly.
${helpContext}

Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`
      : `You are a helpful assistant built into ForgePt, a field service and sales management platform. You help users manage their business by creating and retrieving data through natural language.

You have access to tools to create and update clients, search clients and proposals, log activity (calls, emails, meetings, notes) against clients or proposals, get a deal summary with AI recommendations, get a full client overview, create service tickets, tasks, and proposals, view pipeline summaries, look up inventory stock levels, and search the product library. You can also answer questions about how ForgePt features work.
- When a user asks about inventory, stock levels, what's in stock, or what parts are on hand — always call get_inventory. Never say inventory is empty without calling it first.
${helpContext}

Guidelines:
- Be concise and action-oriented. When a user asks you to create something, do it immediately — don't ask for confirmation unless critical info is missing.
- When you create something, always mention what was created and that the user can find it in the app.
- If a required field is missing (like company name for a client), ask for just that field.
- Format dollar amounts with $ and commas. Format dates as Month Day, Year.
- IMPORTANT: When adding a contact person to an existing company, always use create_contact (not create_client). create_client creates a new company account. create_contact adds a person to an existing company's Contacts tab.
- When creating a new client, use create_client for the company (with address, website, industry, notes), then immediately follow up with create_contact to add the primary contact person (name, title, email, phone) — do both in sequence without asking.
- NEVER use create_client to change the main POC on an existing client — that creates a duplicate. To change the main POC, use update_client_poc. Always search the client first, tell the user the current POC ("Pinnacle Group's main POC is currently Marcus Delgado — replace with Sarah Chen?"), and only call update_client_poc after the user confirms.
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
          ...(helpMode ? {} : { tools: TOOLS }),
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
          const result = await executeTool(block.name, block.input, supabase, profile.org_id, profile.id, userPerms)
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

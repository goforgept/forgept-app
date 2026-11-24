// CRM helpers shared by the in-app AI agent (ai-agent) and the MCP server (mcp-server).
// Both use a service-role client, so every query here filters by org_id explicitly.

// ─── LinkedIn URL cleanup (mirrors src/lib/linkedin.jsx) ─────────────────────

export function normalizeLinkedIn(input: unknown): { url: string | null } | { error: string } {
  const raw = typeof input === "string" ? input.trim() : ""
  if (!raw) return { url: null }
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return { error: "linkedin_url is not a valid URL" } }
  const host = u.hostname.toLowerCase()
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return { error: "linkedin_url must be a linkedin.com link" }
  const m = u.pathname.match(/^\/(in|company|school|pub)\/([^/]+)/i)
  if (!m) return { error: "linkedin_url must be a profile (/in/…) or company (/company/…) link" }
  return { url: `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` }
}

// ─── Contacts ────────────────────────────────────────────────────────────────

/** Update a contact found by company + name. Returns a tool result object. */
export async function updateContact(supabase: any, orgId: string, input: any) {
  const { data: client } = await supabase.from("clients")
    .select("id, company").eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
  if (!client) return { error: `No client found matching "${input.company}".` }
  const { data: matches } = await supabase.from("client_contacts")
    .select("id, full_name").eq("org_id", orgId).eq("client_id", client.id)
    .ilike("full_name", `%${input.full_name}%`).limit(2)
  if (!matches?.length) return { error: `No contact matching "${input.full_name}" at ${client.company}.` }
  if (matches.length > 1) return { error: `More than one contact matches "${input.full_name}" at ${client.company}: ${matches.map((m: any) => m.full_name).join(", ")}. Use the full name.` }
  const updates: Record<string, any> = {}
  for (const f of ["email", "phone", "title", "is_primary"]) if (input[f] !== undefined) updates[f] = input[f]
  if (input.linkedin_url !== undefined) {
    const li = normalizeLinkedIn(input.linkedin_url)
    if ("error" in li) return { error: li.error }
    updates.linkedin_url = li.url
  }
  if (Object.keys(updates).length === 0) return { error: "No fields provided to update." }
  const { error } = await supabase.from("client_contacts").update(updates).eq("id", matches[0].id)
  if (error) return { error: error.message }
  return { success: true, full_name: matches[0].full_name, company: client.company, updated_fields: Object.keys(updates), action: "updated_contact" }
}

// ─── Tags ────────────────────────────────────────────────────────────────────

const TAG_COLORS = ["slate", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink"]
export const TAG_LINK: Record<string, { table: string; col: string }> = {
  client: { table: "client_tags", col: "client_id" },
  contact: { table: "contact_tags", col: "contact_id" },
  proposal: { table: "proposal_tags", col: "proposal_id" },
}
const tagKey = (s: string) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase()

export async function findTag(supabase: any, orgId: string, name: string) {
  const { data } = await supabase.from("tags").select("id, name").eq("org_id", orgId)
  return (data || []).find((t: any) => tagKey(t.name) === tagKey(name)) || null
}

/** Map tag names to ids. With create=true, missing tags are created unless the org limits creation to admins. */
export async function resolveTags(supabase: any, orgId: string, userId: string | null, names: string[], create: boolean) {
  const { data: all } = await supabase.from("tags").select("id, name").eq("org_id", orgId)
  const tags = [...(all || [])]
  const ids: string[] = [], created: string[] = [], missing: string[] = []
  let canCreate: boolean | null = null
  for (const raw of names || []) {
    const name = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40)
    if (!name) continue
    const hit = tags.find((t: any) => tagKey(t.name) === tagKey(name))
    if (hit) { ids.push(hit.id); continue }
    if (!create) { missing.push(name); continue }
    if (canCreate === null) {
      const [{ data: org }, { data: prof }] = await Promise.all([
        supabase.from("organizations").select("tags_admin_only").eq("id", orgId).maybeSingle(),
        userId ? supabase.from("profiles").select("org_role, role").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
      ])
      canCreate = !org?.tags_admin_only || prof?.org_role === "admin" || prof?.role === "admin"
    }
    if (!canCreate) { missing.push(name); continue }
    const { data: row, error } = await supabase.from("tags")
      .insert({ org_id: orgId, name, color: TAG_COLORS[tags.length % TAG_COLORS.length], created_by: userId })
      .select("id, name").single()
    if (error || !row) { missing.push(name); continue }
    tags.push(row); ids.push(row.id); created.push(row.name)
  }
  return { ids, created, missing }
}

export async function tagNamesFor(supabase: any, entity: string, id: string): Promise<string[]> {
  const { table, col } = TAG_LINK[entity]
  const { data } = await supabase.from(table).select("tags(name)").eq(col, id)
  return (data || []).map((r: any) => r.tags?.name).filter(Boolean).sort()
}

/** Client ids carrying a tag, or null when no tag has that name. */
export async function clientIdsWithTag(supabase: any, orgId: string, tagName: string): Promise<string[] | null> {
  const tag = await findTag(supabase, orgId, tagName)
  if (!tag) return null
  const { data } = await supabase.from("client_tags").select("client_id").eq("tag_id", tag.id)
  return (data || []).map((r: any) => r.client_id)
}

/** Proposal ids carrying a tag directly or through their client, or null when no tag has that name. */
export async function proposalIdsWithTag(supabase: any, orgId: string, tagName: string): Promise<string[] | null> {
  const tag = await findTag(supabase, orgId, tagName)
  if (!tag) return null
  const [{ data: pl }, { data: cl }] = await Promise.all([
    supabase.from("proposal_tags").select("proposal_id").eq("tag_id", tag.id),
    supabase.from("client_tags").select("client_id").eq("tag_id", tag.id),
  ])
  const ids = new Set<string>((pl || []).map((r: any) => r.proposal_id))
  const cids = (cl || []).map((r: any) => r.client_id)
  if (cids.length) {
    const { data } = await supabase.from("proposals").select("id").eq("org_id", orgId).in("client_id", cids)
    for (const r of data || []) ids.add(r.id)
  }
  return [...ids]
}

export async function listTags(supabase: any, orgId: string) {
  const { data: tags } = await supabase.from("tags").select("id, name, color").eq("org_id", orgId).order("name")
  const count = async (table: string) => {
    const m: Record<string, number> = {}
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from(table).select("tag_id").eq("org_id", orgId).range(from, from + 999)
      for (const r of data || []) m[r.tag_id] = (m[r.tag_id] || 0) + 1
      if (!data || data.length < 1000) break
    }
    return m
  }
  const [cl, co, pr] = await Promise.all([count("client_tags"), count("contact_tags"), count("proposal_tags")])
  return { tags: (tags || []).map((t: any) => ({ name: t.name, color: t.color, clients: cl[t.id] || 0, contacts: co[t.id] || 0, proposals: pr[t.id] || 0 })) }
}

/** Add/remove tags on one client, contact or proposal. */
export async function tagRecord(supabase: any, orgId: string, userId: string | null, input: any) {
  const entity = input.entity
  if (!TAG_LINK[entity]) return { error: "entity must be client, contact or proposal" }
  let recordId: string | null = null, label = ""
  if (entity === "proposal") {
    if (!input.proposal_name) return { error: "proposal_name is required for proposals" }
    const q = `%${input.proposal_name}%`
    const { data } = await supabase.from("proposals").select("id, proposal_name, company")
      .eq("org_id", orgId).eq("is_current_revision", true)
      .or(`proposal_name.ilike.${q},quote_number.ilike.${q}`).limit(2)
    if (!data?.length) return { error: `No proposal matching "${input.proposal_name}".` }
    if (data.length > 1) return { error: `More than one proposal matches "${input.proposal_name}": ${data.map((p: any) => p.proposal_name).join(", ")}. Be more specific.` }
    recordId = data[0].id; label = `${data[0].proposal_name} (${data[0].company || ""})`
  } else {
    if (!input.company) return { error: "company is required" }
    const { data: client } = await supabase.from("clients").select("id, company")
      .eq("org_id", orgId).ilike("company", `%${input.company}%`).limit(1).maybeSingle()
    if (!client) return { error: `No client found matching "${input.company}".` }
    if (entity === "client") { recordId = client.id; label = client.company }
    else {
      if (!input.full_name) return { error: "full_name is required for contacts" }
      const { data: m } = await supabase.from("client_contacts").select("id, full_name")
        .eq("org_id", orgId).eq("client_id", client.id).ilike("full_name", `%${input.full_name}%`).limit(2)
      if (!m?.length) return { error: `No contact matching "${input.full_name}" at ${client.company}.` }
      if (m.length > 1) return { error: `More than one contact matches "${input.full_name}": ${m.map((x: any) => x.full_name).join(", ")}.` }
      recordId = m[0].id; label = `${m[0].full_name} at ${client.company}`
    }
  }
  const { table, col } = TAG_LINK[entity]
  const add = await resolveTags(supabase, orgId, userId, input.add || [], true)
  if (add.ids.length) {
    await supabase.from(table).upsert(add.ids.map(tag_id => ({ [col]: recordId, tag_id, org_id: orgId })), { onConflict: `${col},tag_id`, ignoreDuplicates: true })
  }
  const rem = await resolveTags(supabase, orgId, userId, input.remove || [], false)
  if (rem.ids.length) await supabase.from(table).delete().eq(col, recordId).in("tag_id", rem.ids)
  return {
    success: true, record: label, tags: await tagNamesFor(supabase, entity, recordId!),
    ...(add.created.length ? { created_tags: add.created } : {}),
    ...(add.missing.length ? { not_added: add.missing, note: "Only admins can create new tags in this org." } : {}),
    action: "tagged_record",
  }
}

// Tool schemas (input_schema shape; MCP renames the key to inputSchema)
export const TAG_TOOL_SCHEMAS = {
  list_tags: {
    description: "List the organization's tags with how many clients, contacts and proposals use each",
    schema: { type: "object", properties: {}, required: [] },
  },
  tag_record: {
    description: "Add or remove tags on a client, contact or proposal. Tags are shared across the org; adding a tag that doesn't exist creates it (unless the org restricts tag creation to admins). Prefer existing tag names from list_tags.",
    schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ["client", "contact", "proposal"] },
        company: { type: "string", description: "Client company (required for client and contact)" },
        full_name: { type: "string", description: "Contact name (for entity=contact)" },
        proposal_name: { type: "string", description: "Proposal name or quote number (for entity=proposal)" },
        add: { type: "array", items: { type: "string" }, description: "Tag names to add" },
        remove: { type: "array", items: { type: "string" }, description: "Tag names to remove" },
      },
      required: ["entity"],
    },
  },
  update_contact: {
    description: "Update an existing contact on a client account (title, email, phone, LinkedIn, primary flag). Finds the contact by company + name.",
    schema: {
      type: "object",
      properties: {
        company: { type: "string" }, full_name: { type: "string", description: "Current name of the contact to update" },
        email: { type: "string" }, phone: { type: "string" }, title: { type: "string" }, is_primary: { type: "boolean" },
        linkedin_url: { type: "string", description: "Person's LinkedIn profile; empty string clears it" },
      },
      required: ["company", "full_name"],
    },
  },
}

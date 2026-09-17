import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const DEFAULT_LIMIT = 1000

/**
 * Check org's monthly AI request count and increment it.
 * Returns an error string if the limit is hit, null if ok.
 */
export async function checkAndIncrementAIUsage(orgId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const admin = createClient(supabaseUrl, serviceKey)

  const month = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

  const { data: org } = await admin
    .from("organizations")
    .select("ai_request_limit")
    .eq("id", orgId)
    .single()

  const limit = org?.ai_request_limit ?? DEFAULT_LIMIT

  const { data: usage } = await admin
    .from("ai_usage")
    .select("request_count")
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle()

  const current = usage?.request_count ?? 0

  if (current >= limit) {
    return `Your organization has reached its AI request limit for this month (${limit} requests). Contact support to increase your limit.`
  }

  await admin.from("ai_usage").upsert({
    org_id: orgId,
    month,
    request_count: current + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,month" })

  return null
}

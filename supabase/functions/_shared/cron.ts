// Scheduled jobs (pg_cron → net.http_post) authenticate with our own CRON_SECRET, not a Supabase
// API key: legacy keys were disabled on 2026-09-01, and decoding a JWT without verifying its
// signature (what these functions used to do) let anyone forge a "service_role" token.

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`. Constant-time compare. */
export function isCronRequest(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (secret.length < 16) {
    console.error('CRON_SECRET is missing or too short — refusing scheduled call')
    return false
  }
  const header = req.headers.get('Authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(secret)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}

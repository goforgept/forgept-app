// Zoho's published regional API base URLs — no other values are permitted.
const ALLOWED_ZOHO_API_DOMAINS: ReadonlySet<string> = new Set([
  'https://www.zohoapis.com',
  'https://www.zohoapis.eu',
  'https://www.zohoapis.com.au',
  'https://www.zohoapis.in',
  'https://www.zohoapis.com.cn',
  'https://www.zohoapis.jp',
  'https://www.zohoapis.ca',
])

const DEFAULT_API_DOMAIN = 'https://www.zohoapis.com'

/** Return a validated Zoho API base URL. Falls back to the US default and
 *  logs a warning if the supplied value is not an allowlisted Zoho domain,
 *  preventing SSRF from a tampered api_domain in the token response.
 */
export function zohoApiBase(apiDomain: string | null | undefined): string {
  if (!apiDomain) return DEFAULT_API_DOMAIN
  if (!ALLOWED_ZOHO_API_DOMAINS.has(apiDomain)) {
    console.warn(`zoho: unexpected api_domain "${apiDomain}" — using default`)
    return DEFAULT_API_DOMAIN
  }
  return apiDomain
}

/** Derive the Zoho accounts (auth) base URL from the stored api_domain.
 *  api_domain examples: https://www.zohoapis.com  https://www.zohoapis.eu
 *  auth domain  result: https://accounts.zoho.com https://accounts.zoho.eu
 */
export function zohoAuthBase(apiDomain: string | null | undefined): string {
  const base = zohoApiBase(apiDomain)
  return base.replace('https://www.zohoapis.', 'https://accounts.zoho.')
}

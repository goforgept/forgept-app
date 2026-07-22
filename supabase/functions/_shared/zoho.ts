// Keys are the values Zoho puts in api_domain; values are the canonical
// hardcoded strings that flow into fetch(). Returning the Map value (not the
// input) breaks the taint chain for static-analysis tools.
const ZOHO_API_DOMAIN_MAP = new Map<string, string>([
  ['https://www.zohoapis.com',    'https://www.zohoapis.com'],
  ['https://www.zohoapis.eu',     'https://www.zohoapis.eu'],
  ['https://www.zohoapis.com.au', 'https://www.zohoapis.com.au'],
  ['https://www.zohoapis.in',     'https://www.zohoapis.in'],
  ['https://www.zohoapis.com.cn', 'https://www.zohoapis.com.cn'],
  ['https://www.zohoapis.jp',     'https://www.zohoapis.jp'],
  ['https://www.zohoapis.ca',     'https://www.zohoapis.ca'],
])

const DEFAULT_API_DOMAIN = 'https://www.zohoapis.com'

/** Return a validated Zoho API base URL.
 *  The return value is always a hardcoded Map value, never the raw input,
 *  preventing SSRF from a tampered api_domain in the token response.
 */
export function zohoApiBase(apiDomain: string | null | undefined): string {
  return ZOHO_API_DOMAIN_MAP.get(apiDomain ?? '') ?? DEFAULT_API_DOMAIN
}

/** Derive the Zoho accounts (auth) base URL from the stored api_domain.
 *  api_domain examples: https://www.zohoapis.com  https://www.zohoapis.eu
 *  auth domain  result: https://accounts.zoho.com https://accounts.zoho.eu
 */
export function zohoAuthBase(apiDomain: string | null | undefined): string {
  const base = zohoApiBase(apiDomain)
  return base.replace('https://www.zohoapis.', 'https://accounts.zoho.')
}

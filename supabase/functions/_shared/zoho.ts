/** Derive the Zoho accounts (auth) base URL from the stored api_domain.
 *  api_domain examples: https://www.zohoapis.com  https://www.zohoapis.eu
 *  auth domain  result: https://accounts.zoho.com https://accounts.zoho.eu
 */
export function zohoAuthBase(apiDomain: string | null | undefined): string {
  if (!apiDomain) return 'https://accounts.zoho.com'
  return apiDomain.replace('https://www.zohoapis.', 'https://accounts.zoho.')
}

export function zohoApiBase(apiDomain: string | null | undefined): string {
  return apiDomain || 'https://www.zohoapis.com'
}

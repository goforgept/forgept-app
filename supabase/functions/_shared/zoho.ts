/** Return a validated Zoho API base URL.
 *  Each branch returns a string literal — never the raw input — so taint
 *  analysis tools can see the fetch URL is always a hardcoded constant.
 */
export function zohoApiBase(apiDomain: string | null | undefined): string {
  if (apiDomain === 'https://www.zohoapis.eu')     return 'https://www.zohoapis.eu'
  if (apiDomain === 'https://www.zohoapis.com.au') return 'https://www.zohoapis.com.au'
  if (apiDomain === 'https://www.zohoapis.in')     return 'https://www.zohoapis.in'
  if (apiDomain === 'https://www.zohoapis.com.cn') return 'https://www.zohoapis.com.cn'
  if (apiDomain === 'https://www.zohoapis.jp')     return 'https://www.zohoapis.jp'
  if (apiDomain === 'https://www.zohoapis.ca')     return 'https://www.zohoapis.ca'
  return 'https://www.zohoapis.com'
}

/** Derive the Zoho accounts (auth) base URL from the stored api_domain.
 *  Each branch returns a string literal so the auth URL is always a constant.
 */
export function zohoAuthBase(apiDomain: string | null | undefined): string {
  if (apiDomain === 'https://www.zohoapis.eu')     return 'https://accounts.zoho.eu'
  if (apiDomain === 'https://www.zohoapis.com.au') return 'https://accounts.zoho.com.au'
  if (apiDomain === 'https://www.zohoapis.in')     return 'https://accounts.zoho.in'
  if (apiDomain === 'https://www.zohoapis.com.cn') return 'https://accounts.zoho.com.cn'
  if (apiDomain === 'https://www.zohoapis.jp')     return 'https://accounts.zoho.jp'
  if (apiDomain === 'https://www.zohoapis.ca')     return 'https://accounts.zoho.ca'
  return 'https://accounts.zoho.com'
}

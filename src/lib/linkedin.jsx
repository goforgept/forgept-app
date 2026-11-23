// Normalize whatever a user pastes into one clean LinkedIn URL.
// Accepts "linkedin.com/in/jane", "www.linkedin.com/in/jane/?utm=x", "https://linkedin.com/company/acme", etc.
// Returns { url } (null when empty) or { error } when it isn't a LinkedIn profile/company link.
export function normalizeLinkedIn(input) {
  const raw = (input || '').trim()
  if (!raw) return { url: null }
  let u
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return { error: 'Enter a LinkedIn link like linkedin.com/in/name' }
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
    return { error: 'That is not a LinkedIn link' }
  }
  const m = u.pathname.match(/^\/(in|company|school|pub)\/([^/]+)/i)
  if (!m) return { error: 'Use a profile (linkedin.com/in/…) or company (linkedin.com/company/…) link' }
  return { url: `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` }
}

export function LinkedInIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

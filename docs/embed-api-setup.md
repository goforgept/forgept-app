# ForgePt Embedded Designer — Setup Guide

The embedded designer lets you drop the ForgePt system design canvas directly into your own portal or website. Your users design on your site; you receive the full BOM via a postMessage event — no ForgePt login required for their end users.

---

## Prerequisites

- An active ForgePt account (manufacturer or distributor org)
- ForgePt support must enable two flags on your account:
  - **API Access** — unlocks the API key system
  - **Embedded Designer** — unlocks the embed:designer scope and the session endpoint

Contact your ForgePt account manager to get both flags enabled.

---

## Step 1 — Generate an API Key

1. Log in to ForgePt and go to **Settings → API**
2. Click **Generate Key**
3. Give it a name (e.g., `Production Embed Key`)
4. Check the **Designer (embed)** scope — `embed:designer`
5. Click **Generate Key**
6. **Copy the key immediately** — it is shown only once
7. Store it securely (environment variable, secrets manager — never hardcode it in client-side code)

Your key looks like: `fpk_a1b2c3d4e5f6...`

---

## Step 2 — Exchange Your API Key for a Session Token (Server-Side Only)

Your API key must **never** be exposed in the browser. All token exchange happens on your server.

When a user navigates to the page containing the designer, your server calls:

```
POST https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/embed-session
Authorization: Bearer fpk_your_key_here
Content-Type: application/json
```

**Without user tracking (anonymous shared session):**
```json
{}
```

**With user tracking (recommended — see Step 5):**
```json
{
  "user": {
    "id":    "your-internal-user-id",
    "email": "user@theircompany.com",
    "name":  "Jane Smith"
  }
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "expires_at":   "2026-06-30T10:00:00.000Z",
  "org_id":       "uuid",
  "user_id":      "uuid"
}
```

**Token caching:**  
The token is valid for 24 hours. Cache it server-side and reuse it. Only regenerate when within ~5 minutes of expiry. Do not call this endpoint on every page load.

---

## Step 3 — Render the iframe

Pass the `access_token` to the iframe `src`. This is safe to do client-side since the token is short-lived and scoped to your org only.

```html
<iframe
  src="https://app.goforgept.com/embed?session=ACCESS_TOKEN"
  width="100%"
  height="700"
  frameborder="0"
  allow="clipboard-write"
></iframe>
```

**Optional parameters:**

| Parameter  | Required | Description |
|------------|----------|-------------|
| `session`  | Yes      | The `access_token` from Step 2 |
| `proposal` | No       | UUID of an existing project to load. Omit to open a blank canvas |

**Loading an existing project:**
```html
src="https://app.goforgept.com/embed?session=ACCESS_TOKEN&proposal=PROPOSAL_UUID"
```

---

## Step 4 — Receive the BOM Export

When the user clicks **Export BOM** inside the designer, the iframe sends a `postMessage` to your page. Listen for it:

```javascript
window.addEventListener('message', (event) => {
  // Always verify the origin
  if (event.origin !== 'https://app.goforgept.com') return
  if (event.data?.type !== 'forgept:export') return

  const { proposal_id, devices, cables } = event.data

  // devices — array of placed products
  devices.forEach(device => {
    console.log(device.part_number)   // string | null
    console.log(device.name)          // string
    console.log(device.manufacturer)  // string | null
    console.log(device.category)      // string | null
    console.log(device.quantity)      // number
  })

  // cables — array of cable run totals
  cables.forEach(cable => {
    console.log(cable.cable_type)  // e.g. "Cat6", "Fiber SM"
    console.log(cable.footage)     // total feet across all runs
  })

  // Push to your CRM, quoting system, cart, etc.
  submitToQuotingSystem({ proposal_id, devices, cables })
})
```

---

## Step 5 — Track Individual Users (Recommended)

By passing the logged-in user's identity in Step 2, each of your users gets their own persistent session in ForgePt. Their designs are saved and associated with them specifically.

This means:
- A user can leave and come back to their design later
- You can pull their saved designs via the Data API
- Your SuperAdmin billing view in ForgePt shows per-user session counts

**Your server passes the user object when calling embed-session:**
```json
{
  "user": {
    "id":    "your-systems-user-id-123",
    "email": "jane@integrator.com",
    "name":  "Jane Smith"
  }
}
```

- `id` is your internal user identifier — any stable string works
- `email` and `name` are optional but improve visibility in ForgePt's billing reports
- The first call creates a shadow account in ForgePt; subsequent calls reuse it
- Your users never see a ForgePt login — they're authenticated automatically via the token

---

## Step 6 — Token Expiry Handling

If the session token expires while the user is mid-session (after 24 hours), the iframe shows an expiry message. Handle this by regenerating a token server-side and reloading the iframe src:

```javascript
// Example: reload iframe on expiry message
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://app.goforgept.com') return
  if (event.data?.type !== 'forgept:session_expired') return

  // Fetch a fresh token from your server and update the iframe src
  fetchFreshToken().then(token => {
    document.querySelector('#forgept-embed').src =
      `https://app.goforgept.com/embed?session=${token}&proposal=${currentProposalId}`
  })
})
```

---

## Complete Example (Node.js / Express)

```javascript
// server.js

const FORGEPT_API_KEY = process.env.FORGEPT_API_KEY  // fpk_...
const FORGEPT_EMBED_URL = 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/embed-session'

let cachedToken = null
let tokenExpiry = null

async function getForgePtToken(user) {
  // Reuse cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken
  }

  const res = await fetch(FORGEPT_EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FORGEPT_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      user: { id: user.id, email: user.email, name: user.name }
    }),
  })

  if (!res.ok) throw new Error(`ForgePt token error: ${res.status}`)

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = new Date(data.expires_at).getTime()
  return cachedToken
}

// Route that renders your designer page
app.get('/design', requireAuth, async (req, res) => {
  const token = await getForgePtToken(req.user)
  res.render('designer', { forgeptToken: token })
})
```

> **Note:** In production, cache tokens per user (not globally) when using per-user sessions.

---

## Error Reference

| Status | Message | Fix |
|--------|---------|-----|
| 401 | Missing API key | Include `Authorization: Bearer fpk_...` header |
| 401 | Invalid or revoked API key | Regenerate key in Settings → API |
| 403 | Key lacks embed:designer scope | Edit key to include `embed:designer` scope |
| 403 | API access not enabled | Contact ForgePt support to enable API Access flag |
| 403 | Embedded designer not enabled | Contact ForgePt support to enable Embedded Designer flag |
| 500 | Failed to create embed user | Contact ForgePt support |

---

## Checklist

- [ ] API Access flag enabled (ForgePt support)
- [ ] Embedded Designer flag enabled (ForgePt support)
- [ ] API key generated with `embed:designer` scope
- [ ] API key stored in environment variable (never in client-side code)
- [ ] `embed-session` called server-side only
- [ ] `postMessage` listener added with origin check
- [ ] Token caching implemented (avoid calling embed-session on every page load)
- [ ] User identity passed in embed-session body (for per-user tracking)

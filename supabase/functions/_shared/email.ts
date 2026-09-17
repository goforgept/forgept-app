// Shared email helper — sends via Resend API

export interface EmailAttachment {
  /** Base64-encoded file content */
  content:  string
  /** File name, e.g. "proposal.pdf" */
  filename: string
  /** MIME type (unused by Resend but kept for interface compatibility) */
  mimeType?: string
}

interface EmailOptions {
  to:           string | string[]
  subject:      string
  html:         string
  replyTo?:     string
  fromName?:    string
  cc?:          string[]
  attachments?: EmailAttachment[]
  trackOpens?:  boolean
}

export async function sendEmail(opts: EmailOptions): Promise<{ messageId: string | null }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hello@mail.goforgept.com'

  const body: Record<string, unknown> = {
    from:    `${opts.fromName || 'ForgePt.'} <${FROM_EMAIL}>`,
    to:      Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html:    opts.html,
  }

  if (opts.replyTo)    body.reply_to = opts.replyTo
  if (opts.cc?.length) body.cc       = opts.cc

  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map(a => ({
      filename: a.filename,
      content:  a.content,
    }))
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error (${res.status}): ${err}`)
  }

  const json = await res.json()
  return { messageId: json.id ?? null }
}

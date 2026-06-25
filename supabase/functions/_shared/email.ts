// Shared email helper — sends via Postmark API

export interface EmailAttachment {
  /** Base64-encoded file content */
  content:  string
  /** File name, e.g. "proposal.pdf" */
  filename: string
  /** MIME type, e.g. "application/pdf" */
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
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const POSTMARK_API_KEY = Deno.env.get('POSTMARK_API_KEY')!
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hello@goforgept.com'

  const body: Record<string, unknown> = {
    From:     `${opts.fromName || 'ForgePt.'} <${FROM_EMAIL}>`,
    To:       Array.isArray(opts.to) ? opts.to.join(',') : opts.to,
    Subject:  opts.subject,
    HtmlBody: opts.html,
  }

  if (opts.replyTo)    body.ReplyTo = opts.replyTo
  if (opts.cc?.length) body.Cc = opts.cc.join(',')

  if (opts.attachments?.length) {
    body.Attachments = opts.attachments.map(a => ({
      Name:        a.filename,
      Content:     a.content,
      ContentType: a.mimeType ?? 'application/octet-stream',
    }))
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept':                  'application/json',
      'Content-Type':            'application/json',
      'X-Postmark-Server-Token': POSTMARK_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Postmark error (${res.status}): ${err}`)
  }
}

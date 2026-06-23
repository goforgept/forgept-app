// Shared email helper — sends via Google Workspace SMTP (denomailer)
// Replaces all Brevo API calls across Edge Functions

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

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
  const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
  const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') ?? '465')
  const SMTP_USER = Deno.env.get('SMTP_USER')!
  const SMTP_PASS = Deno.env.get('SMTP_PASS')!

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port:     SMTP_PORT,
      tls:      true,
      auth: {
        username: SMTP_USER,
        password: SMTP_PASS,
      },
    },
  })

  // Map our attachment shape to denomailer's attachment shape
  const attachments = opts.attachments?.map(a => ({
    encoding: 'base64' as const,
    mimeType: a.mimeType ?? 'application/octet-stream',
    filename: a.filename,
    content:  a.content,
  }))

  try {
    await client.send({
      from:        `${opts.fromName || 'ForgePt.'} <${SMTP_USER}>`,
      to:          Array.isArray(opts.to) ? opts.to : [opts.to],
      cc:          opts.cc,
      replyTo:     opts.replyTo,
      subject:     opts.subject,
      html:        opts.html,
      attachments,
    })
  } finally {
    await client.close()
  }
}

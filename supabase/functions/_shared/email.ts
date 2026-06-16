// Shared email helper — sends via Google Workspace SMTP (denomailer)
// Replaces all Brevo API calls across Edge Functions

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

interface EmailOptions {
  to:        string | string[]
  subject:   string
  html:      string
  replyTo?:  string
  fromName?: string
  cc?:       string[]
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

  try {
    await client.send({
      from:    `${opts.fromName || 'ForgePt.'} <${SMTP_USER}>`,
      to:      Array.isArray(opts.to) ? opts.to : [opts.to],
      cc:      opts.cc,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html:    opts.html,
    })
  } finally {
    await client.close()
  }
}

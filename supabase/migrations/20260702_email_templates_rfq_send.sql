ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_template_rfq_subject text,
  ADD COLUMN IF NOT EXISTS email_template_rfq_body text,
  ADD COLUMN IF NOT EXISTS email_template_send_subject text,
  ADD COLUMN IF NOT EXISTS email_template_send_body text;

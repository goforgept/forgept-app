ALTER TABLE client_emails
  ADD COLUMN IF NOT EXISTS postmark_message_id text,
  ADD COLUMN IF NOT EXISTS proposal_id         uuid REFERENCES proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS open_count          integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_client_emails_postmark ON client_emails (postmark_message_id) WHERE postmark_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_emails_proposal ON client_emails (proposal_id) WHERE proposal_id IS NOT NULL;

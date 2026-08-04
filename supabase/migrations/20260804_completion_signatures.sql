-- Completion signatures for service tickets and job packets
ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS completion_signature_data text,
  ADD COLUMN IF NOT EXISTS completion_signed_by      text,
  ADD COLUMN IF NOT EXISTS completion_signed_at      timestamptz;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS completion_signature_data text,
  ADD COLUMN IF NOT EXISTS completion_signed_by      text,
  ADD COLUMN IF NOT EXISTS completion_signed_at      timestamptz;

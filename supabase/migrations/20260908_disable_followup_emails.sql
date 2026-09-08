-- Per-proposal toggle to suppress close-date follow-up emails
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS disable_followup_emails boolean DEFAULT false;

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS allowed_origins    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_proposal_ids uuid[] NOT NULL DEFAULT '{}';

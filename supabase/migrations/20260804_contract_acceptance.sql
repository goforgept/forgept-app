-- Track which SLA / monitoring contracts the customer accepted or declined when signing
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS contract_acceptance jsonb DEFAULT '{}'::jsonb;

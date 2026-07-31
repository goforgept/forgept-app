-- Per-proposal toggle for compliance columns (Lead Time, COO, Berry).
-- Defaults false so compliance is hidden unless explicitly enabled on a proposal.
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS show_compliance boolean DEFAULT false;

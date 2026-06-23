ALTER TABLE proposals ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS original_proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS is_current_revision boolean NOT NULL DEFAULT true;

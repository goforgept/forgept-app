-- Add org_id to bom_line_items so sync_drawing_to_bom can populate it
ALTER TABLE bom_line_items ADD COLUMN IF NOT EXISTS org_id UUID;

-- Backfill existing rows from their linked proposal
UPDATE bom_line_items b
SET org_id = p.org_id
FROM proposals p
WHERE b.proposal_id = p.id
  AND b.org_id IS NULL;

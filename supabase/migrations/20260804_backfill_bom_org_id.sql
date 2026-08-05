-- Backfill org_id on bom_line_items that are still null (items saved after initial migration)
UPDATE bom_line_items b
SET org_id = p.org_id
FROM proposals p
WHERE b.proposal_id = p.id
  AND b.org_id IS NULL;

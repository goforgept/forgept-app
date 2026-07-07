-- The original migration put UNIQUE(org_id, category) which only allows one labor
-- role per category. The UI and PlacementPanel both support multiple roles per
-- category, so this constraint is wrong. Change it to (org_id, category, labor_role)
-- so duplicate exact rows are blocked but multiple roles per category are allowed.

ALTER TABLE designer_labor_defaults
  DROP CONSTRAINT IF EXISTS designer_labor_defaults_org_id_category_key;

ALTER TABLE designer_labor_defaults
  ADD CONSTRAINT designer_labor_defaults_org_id_category_role_key
  UNIQUE (org_id, category, labor_role);

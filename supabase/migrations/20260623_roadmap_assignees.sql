-- Drop single-assignee column in favor of many-to-many
ALTER TABLE roadmap_items DROP COLUMN IF EXISTS assigned_to;

CREATE TABLE IF NOT EXISTS roadmap_item_assignees (
  item_id    uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, profile_id)
);

ALTER TABLE roadmap_item_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignees_select" ON roadmap_item_assignees FOR SELECT USING (
  item_id IN (
    SELECT id FROM roadmap_items WHERE org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "assignees_manage" ON roadmap_item_assignees FOR ALL USING (
  item_id IN (
    SELECT id FROM roadmap_items WHERE org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role IN ('admin', 'dev', 'product_manager')
    )
  )
);

ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS target_quarter text;

CREATE TABLE IF NOT EXISTS roadmap_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid        NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  body       text        NOT NULL,
  is_internal boolean    NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roadmap_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roadmap_notes_select" ON roadmap_notes FOR SELECT USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND (
    is_internal = false
    OR org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role = 'admin')
  )
);

CREATE POLICY "roadmap_notes_admin_insert" ON roadmap_notes FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role = 'admin')
);

CREATE POLICY "roadmap_notes_admin_delete" ON roadmap_notes FOR DELETE USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role = 'admin')
);

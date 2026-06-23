-- Allow dev team role to manage roadmap items
DROP POLICY IF EXISTS "roadmap_admin_all" ON roadmap_items;

CREATE POLICY "roadmap_admin_all" ON roadmap_items FOR ALL USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role IN ('admin', 'dev')
  )
);

-- Allow dev team to insert regardless of status (not just backlog)
DROP POLICY IF EXISTS "roadmap_rep_insert" ON roadmap_items;

CREATE POLICY "roadmap_rep_insert" ON roadmap_items FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND (
    status = 'backlog'
    OR org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role IN ('admin', 'dev'))
  )
);

-- Allow dev team to manage notes
DROP POLICY IF EXISTS "roadmap_notes_admin_insert" ON roadmap_notes;
DROP POLICY IF EXISTS "roadmap_notes_admin_delete" ON roadmap_notes;

CREATE POLICY "roadmap_notes_admin_insert" ON roadmap_notes FOR INSERT WITH CHECK (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role IN ('admin', 'dev')
  )
);

CREATE POLICY "roadmap_notes_admin_delete" ON roadmap_notes FOR DELETE USING (
  org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role IN ('admin', 'dev')
  )
);

CREATE TABLE IF NOT EXISTS roadmap_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text,
  category     text        NOT NULL DEFAULT 'feature', -- 'feature' | 'product' | 'improvement' | 'bug_fix'
  status       text        NOT NULL DEFAULT 'backlog',  -- 'backlog' | 'planned' | 'in_progress' | 'released' | 'declined'
  requested_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  target_date  date,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roadmap_items ENABLE ROW LEVEL SECURITY;

-- All org members can read
CREATE POLICY "roadmap_select" ON roadmap_items FOR SELECT USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

-- Admins can do everything
CREATE POLICY "roadmap_admin_all" ON roadmap_items FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role = 'admin')
);

-- Reps can insert into backlog only
CREATE POLICY "roadmap_rep_insert" ON roadmap_items FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND status = 'backlog'
);

CREATE TABLE IF NOT EXISTS drawing_pathways (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_sheet_id uuid        NOT NULL REFERENCES drawing_sheets(id) ON DELETE CASCADE,
  org_id           uuid,
  pathway_type     text        NOT NULL DEFAULT 'EMT',
  label            text,
  points           jsonb       NOT NULL DEFAULT '[]',
  cable_types      jsonb       NOT NULL DEFAULT '[]',
  notes            text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE drawing_pathways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pathway_org_access" ON drawing_pathways
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pathways_sheet ON drawing_pathways(drawing_sheet_id);

-- Site condition on placed devices (existing / replace / new)
ALTER TABLE drawing_placements ADD COLUMN IF NOT EXISTS site_condition text;

-- Freeform annotation objects (arrows + revision clouds)
CREATE TABLE IF NOT EXISTS drawing_annotations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_sheet_id uuid        NOT NULL REFERENCES drawing_sheets(id) ON DELETE CASCADE,
  org_id           uuid,
  annotation_type  text        NOT NULL DEFAULT 'arrow', -- 'arrow' | 'cloud'
  points           jsonb       NOT NULL DEFAULT '[]',    -- [{x,y},{x,y}] normalised 0-1
  color            text        NOT NULL DEFAULT '#ef4444',
  label            text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE drawing_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annotations_org_access" ON drawing_annotations
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_annotations_sheet ON drawing_annotations(drawing_sheet_id);

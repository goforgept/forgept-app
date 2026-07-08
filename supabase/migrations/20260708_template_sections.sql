CREATE TABLE IF NOT EXISTS template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES templates(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  include_labor boolean NOT NULL DEFAULT false,
  labor_items jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_line_items
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES template_sections(id) ON DELETE SET NULL;

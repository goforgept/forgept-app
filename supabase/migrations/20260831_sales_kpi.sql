-- Add contact_id to tasks so meetings can be linked to a specific contact
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES client_contacts(id) ON DELETE SET NULL;

-- Rep KPI targets set by managers
CREATE TABLE IF NOT EXISTS rep_kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  set_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  metric_type text NOT NULL, -- 'calls','emails','meetings','notes','proposals','deals_won'
  target_value integer NOT NULL DEFAULT 0,
  period_type text NOT NULL DEFAULT 'monthly', -- 'weekly' | 'monthly'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, rep_id, metric_type, period_type)
);

ALTER TABLE rep_kpi_targets ENABLE ROW LEVEL SECURITY;

-- Org members can read all targets in their org
CREATE POLICY "org members read kpi targets" ON rep_kpi_targets
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- Admins/managers can insert and update targets
CREATE POLICY "admins manage kpi targets" ON rep_kpi_targets
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND (role IN ('admin','manager') OR org_role IN ('admin','manager'))
    )
  );

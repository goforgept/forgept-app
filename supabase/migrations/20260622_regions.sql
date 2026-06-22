-- Add regions feature flag to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS feature_regions boolean DEFAULT false;

-- Add region fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_regional_vp boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region_id uuid;

-- Regions table
CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Add FK from profiles.region_id to regions
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS profiles_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regions_org_member_select" ON regions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "regions_admin_all" ON regions
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid() AND org_role = 'admin'
    )
  );

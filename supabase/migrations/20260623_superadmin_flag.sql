-- Add is_superadmin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

-- Allow superadmins to read across all orgs on the tables SuperAdmin queries directly
CREATE POLICY "sa_orgs_read" ON organizations FOR SELECT USING (
  (SELECT is_superadmin FROM profiles WHERE id = auth.uid()) = true
);

CREATE POLICY "sa_proposals_read" ON proposals FOR SELECT USING (
  (SELECT is_superadmin FROM profiles WHERE id = auth.uid()) = true
);

CREATE POLICY "sa_clients_read" ON clients FOR SELECT USING (
  (SELECT is_superadmin FROM profiles WHERE id = auth.uid()) = true
);

CREATE POLICY "sa_activities_read" ON activities FOR SELECT USING (
  (SELECT is_superadmin FROM profiles WHERE id = auth.uid()) = true
);

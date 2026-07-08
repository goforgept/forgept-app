-- Superadmins can read and manage all roadmap items across all orgs
CREATE POLICY "roadmap_superadmin_all" ON roadmap_items FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
);

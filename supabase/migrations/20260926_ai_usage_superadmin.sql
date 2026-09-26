-- Allow superadmins to read all orgs' AI usage (for SuperAdmin dashboard)
CREATE POLICY "ai_usage_superadmin_select" ON ai_usage
  FOR SELECT USING (
    (SELECT is_superadmin FROM profiles WHERE id = auth.uid()) = true
  );

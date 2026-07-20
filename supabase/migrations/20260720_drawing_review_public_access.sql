-- Allow unauthenticated (anon) users to access drawing review data via share token.
-- The token acts as the access credential — only valid shared packages are readable.

-- drawing_packages: anon can read rows that have a share token
CREATE POLICY IF NOT EXISTS "anon_read_shared_packages" ON drawing_packages
  FOR SELECT TO anon
  USING (share_token IS NOT NULL);

-- drawing_packages: anon can mark a package as approved (client approval flow)
CREATE POLICY IF NOT EXISTS "anon_approve_shared_packages" ON drawing_packages
  FOR UPDATE TO anon
  USING (share_token IS NOT NULL)
  WITH CHECK (share_token IS NOT NULL);

-- drawing_sheets: anon can read sheets belonging to a shared proposal
CREATE POLICY IF NOT EXISTS "anon_read_review_sheets" ON drawing_sheets
  FOR SELECT TO anon
  USING (
    proposal_id IN (
      SELECT proposal_id FROM drawing_packages WHERE share_token IS NOT NULL
    )
  );

-- drawing_placements: anon can read placements on those sheets
CREATE POLICY IF NOT EXISTS "anon_read_review_placements" ON drawing_placements
  FOR SELECT TO anon
  USING (
    drawing_sheet_id IN (
      SELECT ds.id FROM drawing_sheets ds
      JOIN drawing_packages dp ON dp.proposal_id = ds.proposal_id
      WHERE dp.share_token IS NOT NULL
    )
  );

-- drawing_review_comments: anon can read and post comments on shared packages
CREATE POLICY IF NOT EXISTS "anon_read_review_comments" ON drawing_review_comments
  FOR SELECT TO anon
  USING (
    share_token IN (SELECT share_token FROM drawing_packages WHERE share_token IS NOT NULL)
  );

CREATE POLICY IF NOT EXISTS "anon_insert_review_comments" ON drawing_review_comments
  FOR INSERT TO anon
  WITH CHECK (
    share_token IN (SELECT share_token FROM drawing_packages WHERE share_token IS NOT NULL)
  );

-- profiles: anon can read org branding (name, logo, color) for shared packages
CREATE POLICY IF NOT EXISTS "anon_read_org_branding" ON profiles
  FOR SELECT TO anon
  USING (
    org_id IN (SELECT org_id FROM drawing_packages WHERE share_token IS NOT NULL)
  );

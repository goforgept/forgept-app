-- Per-org AI request tracking and limit
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_request_limit integer DEFAULT 1000;

CREATE TABLE IF NOT EXISTS ai_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month       text NOT NULL, -- 'YYYY-MM'
  request_count integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Only service role writes; orgs can read their own
CREATE POLICY "ai_usage_select" ON ai_usage
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

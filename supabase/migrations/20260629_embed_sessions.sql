CREATE TABLE IF NOT EXISTS embed_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_id   uuid        REFERENCES api_keys(id) ON DELETE SET NULL,
  profile_id   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  ext_user_id  text,
  ext_email    text,
  ext_name     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- SuperAdmin accesses this via service role only — no RLS needed for org users
ALTER TABLE embed_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_embed_sessions_org_id    ON embed_sessions(org_id);
CREATE INDEX idx_embed_sessions_created   ON embed_sessions(created_at);
CREATE INDEX idx_embed_sessions_ext_user  ON embed_sessions(org_id, ext_user_id);

-- Lets embed-session register a real GoTrue session so manually-crafted JWTs
-- pass the /auth/v1/user validation check (GoTrue looks up session_id in auth.sessions).
CREATE OR REPLACE FUNCTION create_embed_session(
  p_session_id uuid,
  p_user_id    uuid,
  p_not_after  timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  INSERT INTO auth.sessions (id, user_id, aal, not_after, created_at, updated_at)
  VALUES (p_session_id, p_user_id, 'aal1', p_not_after, now(), now())
  ON CONFLICT (id) DO NOTHING;
END;
$$;

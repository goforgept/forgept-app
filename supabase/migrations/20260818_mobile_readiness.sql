-- ── Mobile readiness ─────────────────────────────────────────────────────────
-- 1. Wire updated_at triggers on all drawing tables + proposals
-- 2. Add missing updated_at columns on vertical_rises and proposals
-- 3. Add missing indexes for RLS query performance
-- 4. Push notification tokens table for mobile

-- ── 1. Add missing updated_at columns ────────────────────────────────────────

ALTER TABLE vertical_rises
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── 2. Wire updated_at triggers everywhere they're missing ───────────────────
-- The existing update_updated_at_column lives in the storage schema; create
-- a public version for use on public tables.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_drawing_placements_updated_at
  BEFORE UPDATE ON drawing_placements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_drawing_sheets_updated_at
  BEFORE UPDATE ON drawing_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_cable_runs_updated_at
  BEFORE UPDATE ON cable_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_vertical_rises_updated_at
  BEFORE UPDATE ON vertical_rises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Indexes for RLS performance ───────────────────────────────────────────

-- RLS on every drawing table does: SELECT org_id FROM profiles WHERE id = auth.uid()
-- This index makes that subquery fast.
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles (org_id);

-- Listing proposals by org is the primary mobile query
CREATE INDEX IF NOT EXISTS idx_proposals_org_id ON proposals (org_id);

-- Useful for listing proposals by status (mobile dashboard)
CREATE INDEX IF NOT EXISTS idx_proposals_org_status ON proposals (org_id, status);

-- updated_at index on drawing tables for efficient offline delta sync
CREATE INDEX IF NOT EXISTS idx_drawing_placements_updated_at ON drawing_placements (drawing_sheet_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cable_runs_updated_at ON cable_runs (drawing_sheet_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vertical_rises_updated_at ON vertical_rises (proposal_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_sheets_updated_at ON drawing_sheets (proposal_id, updated_at DESC);

-- ── 4. Push notification tokens ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL,
  token       text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios','android')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_org  ON push_tokens (org_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_own_access ON push_tokens
  FOR ALL USING (user_id = auth.uid());

CREATE OR REPLACE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add data-scope control to roles and per-user overrides.
-- 'scopes' maps area keys to 'own' | 'all' (default 'all' when absent).
-- Admins always see all data regardless of this setting.

ALTER TABLE public.org_roles
  ADD COLUMN IF NOT EXISTS scopes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scope_overrides jsonb NOT NULL DEFAULT '{}';

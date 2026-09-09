-- Custom roles and per-user permission overrides
-- Run in Supabase SQL editor

-- 1. Org-scoped role templates
CREATE TABLE IF NOT EXISTS public.org_roles (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  description text,
  -- nav template: 'admin' | 'rep' | 'project_manager' | 'technician'
  base_role   text NOT NULL DEFAULT 'rep',
  -- { area: 'none' | 'read' | 'write' }
  permissions jsonb NOT NULL DEFAULT '{}',
  is_admin    boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;

-- Anyone in the org can read roles (needed to load their own permissions)
CREATE POLICY "org members read roles" ON public.org_roles
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Only admins can insert/update/delete roles
CREATE POLICY "admins manage roles" ON public.org_roles
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND org_role = 'admin'
    )
  );

-- 2. Add role assignment + per-user overrides to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_role_id uuid REFERENCES public.org_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permission_overrides jsonb DEFAULT '{}';

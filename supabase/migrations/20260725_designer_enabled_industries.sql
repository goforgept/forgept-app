ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS designer_enabled_industries text[];

-- Add support_pin column to profiles for superadmin support access
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS support_pin TEXT;

-- Unique index so two users can't share a PIN
CREATE UNIQUE INDEX IF NOT EXISTS profiles_support_pin_unique ON profiles (support_pin) WHERE support_pin IS NOT NULL;

-- Security-definer function checks superadmin status without causing RLS recursion
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  )
$$;

-- Allow superadmins to read all profiles across all orgs
CREATE POLICY "superadmin_read_all_profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_superadmin());

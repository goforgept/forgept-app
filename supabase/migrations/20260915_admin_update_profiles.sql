-- Allow admins to update other team members' profiles in their org.
-- Without this, the MemberModal silently saves nothing because RLS blocks
-- any UPDATE where auth.uid() != the target profile's id.

DROP POLICY IF EXISTS "admins update team profiles" ON public.profiles;
CREATE POLICY "admins update team profiles"
ON public.profiles
FOR UPDATE
USING (
  org_id = get_my_org_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND org_role = 'admin'
  )
)
WITH CHECK (
  org_id = get_my_org_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND org_role = 'admin'
  )
);

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile"
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

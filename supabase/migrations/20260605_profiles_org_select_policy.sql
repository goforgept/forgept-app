-- Allow users to read all profiles that share the same org_id.
-- Without this, the admin query in ManageReps only returns the current user's own row.
drop policy if exists "Users can view profiles in same org" on profiles;

create policy "Users can view profiles in same org"
on profiles for select
using (
  org_id = (select org_id from profiles where id = auth.uid())
);

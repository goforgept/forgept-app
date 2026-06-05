-- Security definer function breaks the RLS recursion that happens when a policy
-- on profiles tries to subquery profiles to get the current user's org_id.
create or replace function get_my_org_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select org_id from profiles where id = auth.uid()
$$;

drop policy if exists "Users can view profiles in same org" on profiles;

create policy "Users can view profiles in same org"
on profiles for select
using (
  org_id = get_my_org_id()
);

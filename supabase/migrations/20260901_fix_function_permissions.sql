-- Revoke anon access to sync_drawing_to_bom (no reason unauthenticated users need this)
revoke execute on function public.sync_drawing_to_bom(uuid) from anon;
revoke execute on function public.sync_drawing_to_bom(uuid, uuid) from anon;

-- Revoke anon access to lookup_by_support_code
revoke execute on function public.lookup_by_support_code(text) from anon;

-- Replace lookup_by_support_code with a version that requires superadmin role
create or replace function public.lookup_by_support_code(code text)
returns table (id uuid, full_name text, email text, org_id uuid, company_name text, org_name text, billing_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only superadmins can use this function
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'superadmin'
  ) then
    raise exception 'Forbidden';
  end if;

  return query
    select p.id, p.full_name, p.email, p.org_id, p.company_name,
           o.name as org_name, o.billing_status
    from public.profiles p
    left join public.organizations o on o.id = p.org_id
    where p.id::text like lower(code) || '-%'
    limit 1;
end;
$$;

-- Keep authenticated grant (the superadmin check inside handles authorization)
grant execute on function public.lookup_by_support_code(text) to authenticated;

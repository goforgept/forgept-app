create or replace function public.lookup_by_support_code(code text)
returns table (id uuid, full_name text, email text, org_id uuid, company_name text, org_name text, billing_status text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.org_id, p.company_name,
         o.name as org_name, o.billing_status
  from public.profiles p
  left join public.organizations o on o.id = p.org_id
  where p.id::text like lower(code) || '-%'
  limit 1;
$$;

grant execute on function public.lookup_by_support_code(text) to authenticated;

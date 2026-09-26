create or replace function get_org_user_activity()
returns table (
  full_name text,
  email text,
  org_role text,
  last_login timestamptz,
  last_login_platform text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.full_name,
    p.email,
    p.org_role,
    coalesce(p.last_login, u.last_sign_in_at) as last_login,
    p.last_login_platform,
    p.created_at
  from profiles p
  left join auth.users u on u.id = p.id
  where p.org_id = (select org_id from profiles where id = auth.uid())
  order by p.created_at desc;
$$;

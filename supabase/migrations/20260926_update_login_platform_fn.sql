create or replace function update_last_login(platform text default 'web')
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_login = now(), last_login_platform = platform where id = auth.uid();
$$;

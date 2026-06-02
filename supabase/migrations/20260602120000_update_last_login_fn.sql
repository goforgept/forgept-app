create or replace function update_last_login()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_login = now() where id = auth.uid();
$$;

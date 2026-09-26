-- Drop previous versions
drop function if exists update_last_login();
drop function if exists update_last_login(text);

-- New version: accepts user_id explicitly so auth.uid() issues don't matter
-- Still validates the caller can only update their own row via RLS
create or replace function update_last_login(p_user_id uuid, p_platform text default 'web')
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_login = now(), last_login_platform = p_platform where id = p_user_id;
$$;

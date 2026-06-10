alter table organizations
  add column if not exists feature_api boolean not null default false;

create table if not exists api_keys (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  name        text        not null,
  key_prefix  text        not null,
  key_hash    text        not null,
  scopes      text[]      not null default '{read}',
  last_used_at timestamptz,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index api_keys_org_id_idx on api_keys(org_id);
create index api_keys_key_hash_idx on api_keys(key_hash);

alter table api_keys enable row level security;

create policy "org members can read own api keys"
  on api_keys for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert api keys"
  on api_keys for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update api keys"
  on api_keys for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can delete api keys"
  on api_keys for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));

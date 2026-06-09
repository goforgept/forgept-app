create table if not exists org_products (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  industry    text        not null,
  manufacturer text       not null,
  category    text        not null,
  name        text        not null,
  part_number text        not null,
  model_number text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index org_products_org_id_idx on org_products(org_id);

alter table org_products enable row level security;

create policy "org members can read own org products"
  on org_products for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert org products"
  on org_products for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can delete org products"
  on org_products for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));

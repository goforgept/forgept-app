alter table org_products
  add column if not exists accessories jsonb not null default '{"required":[],"options":[]}'::jsonb;

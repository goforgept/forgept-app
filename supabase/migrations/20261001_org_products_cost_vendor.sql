alter table org_products
  add column if not exists unit_cost  numeric,
  add column if not exists vendor     text;

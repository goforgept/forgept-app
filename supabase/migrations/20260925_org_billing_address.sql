-- Org-level billing / shipping addresses for ForgePt platform billing
alter table organizations
  add column if not exists bill_to_name    text,
  add column if not exists bill_to_address text,
  add column if not exists bill_to_city    text,
  add column if not exists bill_to_state   text,
  add column if not exists bill_to_zip     text,
  add column if not exists ship_to_address text,
  add column if not exists ship_to_city    text,
  add column if not exists ship_to_state   text,
  add column if not exists ship_to_zip     text;

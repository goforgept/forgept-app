alter table organizations
  add column if not exists billing_contact_name  text,
  add column if not exists billing_contact_email text;

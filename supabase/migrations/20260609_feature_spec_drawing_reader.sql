alter table organizations
  add column if not exists feature_spec_reader boolean not null default false,
  add column if not exists feature_drawing_reader boolean not null default false;

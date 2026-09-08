create table if not exists job_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text not null default '#8A9AB0',
  position int not null default 0,
  created_at timestamptz default now()
);

create index if not exists job_stages_org_id_idx on job_stages(org_id, position);

alter table job_stages enable row level security;

create policy "org members can manage job stages"
  on job_stages for all
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

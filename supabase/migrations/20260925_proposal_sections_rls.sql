-- Ensure proposal_sections has RLS enabled and correct policies for all org members
alter table proposal_sections enable row level security;

-- Drop any existing policies so we don't create duplicates
drop policy if exists "proposal_sections_select" on proposal_sections;
drop policy if exists "proposal_sections_insert" on proposal_sections;
drop policy if exists "proposal_sections_update" on proposal_sections;
drop policy if exists "proposal_sections_delete" on proposal_sections;
drop policy if exists "Users can view proposal sections for their org" on proposal_sections;
drop policy if exists "Users can insert proposal sections for their org" on proposal_sections;
drop policy if exists "Users can update proposal sections for their org" on proposal_sections;
drop policy if exists "Users can delete proposal sections for their org" on proposal_sections;

-- Allow any authenticated user in the same org to read/write sections
create policy "proposal_sections_select" on proposal_sections
  for select using (
    org_id = (select org_id from profiles where id = auth.uid())
  );

create policy "proposal_sections_insert" on proposal_sections
  for insert with check (
    org_id = (select org_id from profiles where id = auth.uid())
  );

create policy "proposal_sections_update" on proposal_sections
  for update using (
    org_id = (select org_id from profiles where id = auth.uid())
  );

create policy "proposal_sections_delete" on proposal_sections
  for delete using (
    org_id = (select org_id from profiles where id = auth.uid())
  );

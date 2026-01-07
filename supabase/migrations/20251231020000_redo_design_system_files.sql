begin;

drop table if exists design_system_files;

drop type if exists public.design_system_file_type;

create type public.design_system_file_type as enum (
  'mobile_component',
  'web_component',
  'mobile_theme',
  'web_theme'
);

create table design_system_files (
  design_system_id uuid references design_systems(id) on delete cascade,
  file_type public.design_system_file_type not null,
  name text not null,
  contents jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table design_system_files enable row level security;

create policy "Team members with edit privileges can view design system files"
  on design_system_files
  for select
  to authenticated
  using (
    exists (
      select 1
      from design_systems
      where design_systems.id = design_system_files.design_system_id
        and public.is_team_member_with_edit_privileges(design_systems.team_id)
    )
  );

create policy "Team members with edit privileges can insert design system files"
  on design_system_files
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from design_systems
      where design_systems.id = design_system_files.design_system_id
        and public.is_team_member_with_edit_privileges(design_systems.team_id)
    )
  );

create policy "Team members with edit privileges can update design system files"
  on design_system_files
  for update
  to authenticated
  using (
    exists (
      select 1
      from design_systems
      where design_systems.id = design_system_files.design_system_id
        and public.is_team_member_with_edit_privileges(design_systems.team_id)
    )
  )
  with check (
    exists (
      select 1
      from design_systems
      where design_systems.id = design_system_files.design_system_id
        and public.is_team_member_with_edit_privileges(design_systems.team_id)
    )
  );

create policy "Team members with edit privileges can delete design system files"
  on design_system_files
  for delete
  to authenticated
  using (
    exists (
      select 1
      from design_systems
      where design_systems.id = design_system_files.design_system_id
        and public.is_team_member_with_edit_privileges(design_systems.team_id)
    )
  );

drop policy if exists "Team members can view design systems" on design_systems;
drop policy if exists "Team members with edit privileges can insert design systems" on design_systems;
drop policy if exists "Team members with edit privileges can update design systems" on design_systems;
drop policy if exists "Team members with edit privileges can delete design systems" on design_systems;

create policy "Team members with edit privileges can view design systems"
  on design_systems
  for select
  to authenticated
  using (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can insert design systems"
  on design_systems
  for insert
  to authenticated
  with check (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can update design systems"
  on design_systems
  for update
  to authenticated
  using (public.is_team_member_with_edit_privileges(team_id))
  with check (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can delete design systems"
  on design_systems
  for delete
  to authenticated
  using (public.is_team_member_with_edit_privileges(team_id));

commit;

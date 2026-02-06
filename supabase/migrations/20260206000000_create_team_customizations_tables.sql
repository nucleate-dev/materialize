begin;

-- ===========================================================================
-- Team Customizations: Skills, Subagents, and MCP Servers
-- ===========================================================================
-- Allows teams to define custom AI configurations with project-level overrides

-- ---------------------------------------------------------------------------
-- 1. team_skills - User-defined SKILL.md files
-- ---------------------------------------------------------------------------
create table if not exists public.team_skills (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null
    references public.teams(id)
      on update cascade
      on delete cascade,
  name varchar(255) not null,
  description text,
  skill_content text not null,  -- Full SKILL.md content (YAML frontmatter + markdown)
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint team_skills_unique_name unique (team_id, name)
);

comment on table public.team_skills is 'User-defined skills (SKILL.md format) at the team level';
comment on column public.team_skills.skill_content is 'Full SKILL.md content including YAML frontmatter and markdown body';

-- Index for faster team lookups
create index if not exists idx_team_skills_team_id on public.team_skills(team_id);

-- ---------------------------------------------------------------------------
-- 2. team_subagents - User-defined AI subagents
-- ---------------------------------------------------------------------------
create table if not exists public.team_subagents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null
    references public.teams(id)
      on update cascade
      on delete cascade,
  agent_name varchar(255) not null,
  description text not null,
  system_prompt text not null,
  allowed_tools text[] not null default '{}',  -- Array of tool names the agent can use
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint team_subagents_unique_name unique (team_id, agent_name)
);

comment on table public.team_subagents is 'User-defined AI subagents with custom prompts and tool access';
comment on column public.team_subagents.allowed_tools is 'Array of tool names this agent can use (e.g., Read, Edit, mcp__devtools__SafeBash)';

-- Index for faster team lookups
create index if not exists idx_team_subagents_team_id on public.team_subagents(team_id);

-- ---------------------------------------------------------------------------
-- 3. team_mcp_servers - External MCP server connections
-- ---------------------------------------------------------------------------
create table if not exists public.team_mcp_servers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null
    references public.teams(id)
      on update cascade
      on delete cascade,
  server_name varchar(255) not null,
  description text,
  server_url text not null,
  transport_type varchar(50) not null default 'http',  -- 'http' or 'sse'
  auth_type varchar(50),  -- 'bearer', 'api_key', 'none', or null
  auth_header_name varchar(255),  -- Custom header name for API key auth
  auth_token_encrypted text,  -- Encrypted auth token
  custom_headers jsonb not null default '{}',  -- Additional HTTP headers as JSON object
  is_enabled boolean not null default true,
  last_health_check_at timestamptz,
  health_status varchar(50) not null default 'unknown',  -- 'healthy', 'unhealthy', 'unknown'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint team_mcp_servers_unique_name unique (team_id, server_name),
  constraint team_mcp_servers_transport_type_check check (transport_type in ('http', 'sse')),
  constraint team_mcp_servers_auth_type_check check (auth_type is null or auth_type in ('bearer', 'api_key', 'none')),
  constraint team_mcp_servers_health_status_check check (health_status in ('healthy', 'unhealthy', 'unknown'))
);

comment on table public.team_mcp_servers is 'External MCP server connections configured by the team';
comment on column public.team_mcp_servers.auth_token_encrypted is 'Encrypted authentication token - decrypt only at runtime';
comment on column public.team_mcp_servers.custom_headers is 'Additional HTTP headers to send with requests (JSON object)';

-- Index for faster team lookups
create index if not exists idx_team_mcp_servers_team_id on public.team_mcp_servers(team_id);

-- ---------------------------------------------------------------------------
-- 4. prototype_ai_config_overrides - Project-level overrides
-- ---------------------------------------------------------------------------
create table if not exists public.prototype_ai_config_overrides (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null
    references public.prototypes(id)
      on update cascade
      on delete cascade,
  config_type varchar(50) not null,  -- 'skill', 'subagent', 'mcp_server'
  config_id uuid not null,  -- References team_skills.id, team_subagents.id, or team_mcp_servers.id
  is_enabled boolean not null,  -- Override value (true = enabled, false = disabled)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prototype_ai_config_unique unique (prototype_id, config_type, config_id),
  constraint prototype_ai_config_type_check check (config_type in ('skill', 'subagent', 'mcp_server'))
);

comment on table public.prototype_ai_config_overrides is 'Project-level overrides for team AI configurations';
comment on column public.prototype_ai_config_overrides.config_type is 'Type of configuration being overridden: skill, subagent, or mcp_server';
comment on column public.prototype_ai_config_overrides.is_enabled is 'Override value - when set, this takes precedence over team-level is_enabled';

-- Indexes for faster lookups
create index if not exists idx_prototype_ai_config_overrides_prototype_id
  on public.prototype_ai_config_overrides(prototype_id);
create index if not exists idx_prototype_ai_config_overrides_config
  on public.prototype_ai_config_overrides(config_type, config_id);

-- ---------------------------------------------------------------------------
-- 5. Updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.update_team_customizations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.update_team_customizations_updated_at() from public;

-- team_skills trigger
drop trigger if exists trg_update_team_skills_updated_at on public.team_skills;
create trigger trg_update_team_skills_updated_at
before update on public.team_skills
for each row
execute function public.update_team_customizations_updated_at();

-- team_subagents trigger
drop trigger if exists trg_update_team_subagents_updated_at on public.team_subagents;
create trigger trg_update_team_subagents_updated_at
before update on public.team_subagents
for each row
execute function public.update_team_customizations_updated_at();

-- team_mcp_servers trigger
drop trigger if exists trg_update_team_mcp_servers_updated_at on public.team_mcp_servers;
create trigger trg_update_team_mcp_servers_updated_at
before update on public.team_mcp_servers
for each row
execute function public.update_team_customizations_updated_at();

-- prototype_ai_config_overrides trigger
drop trigger if exists trg_update_prototype_ai_config_overrides_updated_at on public.prototype_ai_config_overrides;
create trigger trg_update_prototype_ai_config_overrides_updated_at
before update on public.prototype_ai_config_overrides
for each row
execute function public.update_team_customizations_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Enable Row Level Security
-- ---------------------------------------------------------------------------
alter table public.team_skills enable row level security;
alter table public.team_subagents enable row level security;
alter table public.team_mcp_servers enable row level security;
alter table public.prototype_ai_config_overrides enable row level security;

-- ---------------------------------------------------------------------------
-- 7. RLS Policies for team_skills
-- ---------------------------------------------------------------------------
-- Any team member can read skills
drop policy if exists "team_skills_select" on public.team_skills;
create policy "team_skills_select"
on public.team_skills
for select
to authenticated
using (
  public.is_team_member(team_skills.team_id)
);

-- Only team owners or admins can insert skills
drop policy if exists "team_skills_insert" on public.team_skills;
create policy "team_skills_insert"
on public.team_skills
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(team_skills.team_id)
);

-- Only team owners or admins can update skills
drop policy if exists "team_skills_update" on public.team_skills;
create policy "team_skills_update"
on public.team_skills
for update
to authenticated
using (
  public.is_team_owner_or_admin(team_skills.team_id)
)
with check (
  public.is_team_owner_or_admin(team_skills.team_id)
);

-- Only team owners or admins can delete skills
drop policy if exists "team_skills_delete" on public.team_skills;
create policy "team_skills_delete"
on public.team_skills
for delete
to authenticated
using (
  public.is_team_owner_or_admin(team_skills.team_id)
);

-- ---------------------------------------------------------------------------
-- 8. RLS Policies for team_subagents
-- ---------------------------------------------------------------------------
-- Any team member can read subagents
drop policy if exists "team_subagents_select" on public.team_subagents;
create policy "team_subagents_select"
on public.team_subagents
for select
to authenticated
using (
  public.is_team_member(team_subagents.team_id)
);

-- Only team owners or admins can insert subagents
drop policy if exists "team_subagents_insert" on public.team_subagents;
create policy "team_subagents_insert"
on public.team_subagents
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(team_subagents.team_id)
);

-- Only team owners or admins can update subagents
drop policy if exists "team_subagents_update" on public.team_subagents;
create policy "team_subagents_update"
on public.team_subagents
for update
to authenticated
using (
  public.is_team_owner_or_admin(team_subagents.team_id)
)
with check (
  public.is_team_owner_or_admin(team_subagents.team_id)
);

-- Only team owners or admins can delete subagents
drop policy if exists "team_subagents_delete" on public.team_subagents;
create policy "team_subagents_delete"
on public.team_subagents
for delete
to authenticated
using (
  public.is_team_owner_or_admin(team_subagents.team_id)
);

-- ---------------------------------------------------------------------------
-- 9. RLS Policies for team_mcp_servers
-- ---------------------------------------------------------------------------
-- Any team member can read MCP servers
drop policy if exists "team_mcp_servers_select" on public.team_mcp_servers;
create policy "team_mcp_servers_select"
on public.team_mcp_servers
for select
to authenticated
using (
  public.is_team_member(team_mcp_servers.team_id)
);

-- Only team owners or admins can insert MCP servers
drop policy if exists "team_mcp_servers_insert" on public.team_mcp_servers;
create policy "team_mcp_servers_insert"
on public.team_mcp_servers
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(team_mcp_servers.team_id)
);

-- Only team owners or admins can update MCP servers
drop policy if exists "team_mcp_servers_update" on public.team_mcp_servers;
create policy "team_mcp_servers_update"
on public.team_mcp_servers
for update
to authenticated
using (
  public.is_team_owner_or_admin(team_mcp_servers.team_id)
)
with check (
  public.is_team_owner_or_admin(team_mcp_servers.team_id)
);

-- Only team owners or admins can delete MCP servers
drop policy if exists "team_mcp_servers_delete" on public.team_mcp_servers;
create policy "team_mcp_servers_delete"
on public.team_mcp_servers
for delete
to authenticated
using (
  public.is_team_owner_or_admin(team_mcp_servers.team_id)
);

-- ---------------------------------------------------------------------------
-- 10. RLS Policies for prototype_ai_config_overrides
-- ---------------------------------------------------------------------------
-- Use the prototype's team_id for access control via subquery
-- Any team member can read overrides for prototypes they have access to
drop policy if exists "prototype_ai_config_overrides_select" on public.prototype_ai_config_overrides;
create policy "prototype_ai_config_overrides_select"
on public.prototype_ai_config_overrides
for select
to authenticated
using (
  exists (
    select 1 from public.prototypes p
    where p.id = prototype_ai_config_overrides.prototype_id
    and public.is_team_member(p.team_id)
  )
);

-- Team members with edit privileges can insert overrides
drop policy if exists "prototype_ai_config_overrides_insert" on public.prototype_ai_config_overrides;
create policy "prototype_ai_config_overrides_insert"
on public.prototype_ai_config_overrides
for insert
to authenticated
with check (
  exists (
    select 1 from public.prototypes p
    where p.id = prototype_ai_config_overrides.prototype_id
    and public.is_team_member_with_edit_privileges(p.team_id)
  )
);

-- Team members with edit privileges can update overrides
drop policy if exists "prototype_ai_config_overrides_update" on public.prototype_ai_config_overrides;
create policy "prototype_ai_config_overrides_update"
on public.prototype_ai_config_overrides
for update
to authenticated
using (
  exists (
    select 1 from public.prototypes p
    where p.id = prototype_ai_config_overrides.prototype_id
    and public.is_team_member_with_edit_privileges(p.team_id)
  )
)
with check (
  exists (
    select 1 from public.prototypes p
    where p.id = prototype_ai_config_overrides.prototype_id
    and public.is_team_member_with_edit_privileges(p.team_id)
  )
);

-- Team members with edit privileges can delete overrides
drop policy if exists "prototype_ai_config_overrides_delete" on public.prototype_ai_config_overrides;
create policy "prototype_ai_config_overrides_delete"
on public.prototype_ai_config_overrides
for delete
to authenticated
using (
  exists (
    select 1 from public.prototypes p
    where p.id = prototype_ai_config_overrides.prototype_id
    and public.is_team_member_with_edit_privileges(p.team_id)
  )
);

commit;

-- Create table to persist pull requests created by the sandbox agent

begin;

create type if not exists public.source_repo_pull_request_status as enum (
  'open',
  'closed',
  'merged'
);

create table if not exists public.prototype_source_repo_pull_requests (
  id uuid primary key default uuid_generate_v4(),
  prototype_id uuid not null references public.prototypes(id) on delete cascade,
  prototype_chat_session_id uuid null references public.prototype_chat_sessions(id) on delete set null,
  branch_name text not null,
  base_branch text not null,
  pr_title text not null,
  pr_body text null,
  github_pull_request_number integer not null,
  github_pull_request_url text not null,
  head_sha text null,
  status public.source_repo_pull_request_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prototype_source_repo_pull_requests_prototype_id_idx
  on public.prototype_source_repo_pull_requests(prototype_id);

create unique index if not exists prototype_source_repo_pull_requests_session_idx
  on public.prototype_source_repo_pull_requests(prototype_id, prototype_chat_session_id)
  where prototype_chat_session_id is not null;

create or replace function public.update_prototype_source_repo_pull_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_prototype_source_repo_pull_requests_updated_at
  on public.prototype_source_repo_pull_requests;
create trigger trg_update_prototype_source_repo_pull_requests_updated_at
before update on public.prototype_source_repo_pull_requests
for each row
execute function public.update_prototype_source_repo_pull_requests_updated_at();

alter table public.prototype_source_repo_pull_requests enable row level security;

drop policy if exists "prototype_source_repo_pull_requests_select" on public.prototype_source_repo_pull_requests;
create policy "prototype_source_repo_pull_requests_select"
on public.prototype_source_repo_pull_requests
for select
to authenticated
using (
  public.can_edit_prototype(prototype_source_repo_pull_requests.prototype_id)
  or public.is_team_member(
    public.get_prototype_team_id(prototype_source_repo_pull_requests.prototype_id)
  )
);

drop policy if exists "prototype_source_repo_pull_requests_insert" on public.prototype_source_repo_pull_requests;
create policy "prototype_source_repo_pull_requests_insert"
on public.prototype_source_repo_pull_requests
for insert
to authenticated
with check (
  public.can_edit_prototype(prototype_source_repo_pull_requests.prototype_id)
);

drop policy if exists "prototype_source_repo_pull_requests_update" on public.prototype_source_repo_pull_requests;
create policy "prototype_source_repo_pull_requests_update"
on public.prototype_source_repo_pull_requests
for update
to authenticated
using (
  public.can_edit_prototype(prototype_source_repo_pull_requests.prototype_id)
)
with check (
  public.can_edit_prototype(prototype_source_repo_pull_requests.prototype_id)
);

drop policy if exists "prototype_source_repo_pull_requests_delete" on public.prototype_source_repo_pull_requests;
create policy "prototype_source_repo_pull_requests_delete"
on public.prototype_source_repo_pull_requests
for delete
to authenticated
using (
  public.can_edit_prototype(prototype_source_repo_pull_requests.prototype_id)
);

commit;

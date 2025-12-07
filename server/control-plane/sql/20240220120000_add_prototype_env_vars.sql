-- Adds prototype-specific environment variables with secure access controls
create table if not exists public.prototype_env_vars (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes(id) on update cascade on delete cascade,
  name text not null,
  is_public boolean not null default false,
  secret_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prototype_env_vars_prototype_id_name_idx
  on public.prototype_env_vars (prototype_id, lower(name));

create index if not exists prototype_env_vars_prototype_id_idx
  on public.prototype_env_vars (prototype_id);

alter table public.prototype_env_vars enable row level security;

revoke all on public.prototype_env_vars from anon, authenticated;
grant insert, update, delete on public.prototype_env_vars to authenticated;

create or replace view public.prototype_env_vars_view as
select
  pev.id,
  pev.prototype_id,
  pev.name,
  pev.is_public,
  pev.created_at,
  pev.updated_at,
  case
    when p.owner_id = auth.uid() or auth.role() = 'service_role' then pev.secret_value
    else null
  end as secret_value
from public.prototype_env_vars pev
  join public.prototypes p on p.id = pev.prototype_id;

grant select on public.prototype_env_vars_view to anon, authenticated, service_role;

create policy if not exists prototype_env_vars_select_policy
  on public.prototype_env_vars
  for select
  using (
    auth.role() = 'service_role' or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and (
          p.owner_id = auth.uid()
          or p.visibility = 'PUBLIC'
        )
    )
  );

create policy if not exists prototype_env_vars_insert_policy
  on public.prototype_env_vars
  for insert
  with check (
    auth.role() = 'service_role' or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  );

create policy if not exists prototype_env_vars_update_policy
  on public.prototype_env_vars
  for update
  using (
    auth.role() = 'service_role' or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'service_role' or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  );

create policy if not exists prototype_env_vars_delete_policy
  on public.prototype_env_vars
  for delete
  using (
    auth.role() = 'service_role' or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  );

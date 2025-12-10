-- Prototype environment variable metadata (names) + secrets stored separately
drop view if exists public.prototype_env_vars_view;
drop table if exists public.prototype_env_var_secrets;
drop table if exists public.prototype_env_vars;

create table public.prototype_env_vars (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes(id) on update cascade on delete cascade,
  name text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index prototype_env_vars_prototype_id_name_idx
  on public.prototype_env_vars (prototype_id, lower(name));

create index prototype_env_vars_prototype_id_idx
  on public.prototype_env_vars (prototype_id);

create table public.prototype_env_var_secrets (
  env_var_id uuid primary key references public.prototype_env_vars(id) on update cascade on delete cascade,
  secret_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prototype_env_vars enable row level security;
alter table public.prototype_env_var_secrets enable row level security;

create policy prototype_env_vars_select_policy
  on public.prototype_env_vars
  for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and (
          p.owner_id = auth.uid()
          or p.visibility = 'PUBLIC'
        )
    )
  );

create policy prototype_env_vars_insert_policy
  on public.prototype_env_vars
  for insert
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  );

create policy prototype_env_vars_update_policy
  on public.prototype_env_vars
  for update
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  );

create policy prototype_env_vars_delete_policy
  on public.prototype_env_vars
  for delete
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototypes p
      where p.id = prototype_env_vars.prototype_id
        and p.owner_id = auth.uid()
    )
  );

create policy prototype_env_var_secrets_select_policy
  on public.prototype_env_var_secrets
  for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototype_env_vars pev
        join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
        and p.owner_id = auth.uid()
    )
  );

create policy prototype_env_var_secrets_insert_policy
  on public.prototype_env_var_secrets
  for insert
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototype_env_vars pev
        join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
        and p.owner_id = auth.uid()
    )
  );

create policy prototype_env_var_secrets_update_policy
  on public.prototype_env_var_secrets
  for update
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototype_env_vars pev
        join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototype_env_vars pev
        join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
        and p.owner_id = auth.uid()
    )
  );

create policy prototype_env_var_secrets_delete_policy
  on public.prototype_env_var_secrets
  for delete
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.prototype_env_vars pev
        join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
        and p.owner_id = auth.uid()
    )
  );

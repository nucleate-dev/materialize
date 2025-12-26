begin;

alter table public.subscriptions
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete set null;

alter table public.credit_grants
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete cascade;

alter table public.prototypes
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete cascade;

alter table public.api_usage
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete cascade;

commit;

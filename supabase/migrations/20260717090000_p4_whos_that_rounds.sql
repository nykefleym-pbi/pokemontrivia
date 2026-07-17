-- server-first-refactor Phase 4 — Who's That Pokémon.
--
-- Round generation (which Pokémon, mode, reward item, shiny roll) and reward
-- grant currently happen entirely client-side with no server involvement at
-- all — a client can pick its own favorable reward, force isShiny, or grant
-- itself the reward without ever answering, and nothing stops it replaying
-- the hourly gate. This table lets the whos-that Edge Function be the sole
-- place a round is generated and the sole gate on "one round per hour".
--
-- One row per (user, hour) — the unique constraint IS the hourly gate.
create table public.whos_that_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  hour_key bigint not null,
  mon_id integer not null,
  name text not null,
  types jsonb not null,
  mode text not null,
  is_shiny boolean not null,
  reward_id text not null,
  reward_name text not null,
  reward_icon text not null,
  crop_back boolean not null,
  crop_dx integer not null,
  crop_dy integer not null,
  choices jsonb not null,
  resolved boolean not null default false,
  correct boolean,
  created_at timestamptz not null default now(),
  unique (user_id, hour_key)
);

alter table public.whos_that_rounds enable row level security;

grant select, insert, update on public.whos_that_rounds to authenticated;
grant all on public.whos_that_rounds to service_role;

create index whos_that_rounds_user_id_idx on public.whos_that_rounds (user_id);

create policy "whos_that_rounds_select_own"
  on public.whos_that_rounds for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "whos_that_rounds_insert_own"
  on public.whos_that_rounds for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "whos_that_rounds_update_own"
  on public.whos_that_rounds for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- server-first-refactor P2: server-authoritative saves.
--
-- `saves` is the versioned replacement for the client's localStorage-persisted
-- Zustand store (02-architecture.md §6.4/§10). One row per player; `version`
-- backs optimistic-concurrency writes from save-sync{push} (baseVersion must
-- match the stored version or the write is rejected as a conflict, so two
-- devices racing a push can't silently clobber each other). `state` is the
-- player's entire solo-progression payload (XP, coins, items, statuses,
-- pokedex, achievements) as the client's GameState shape — deliberately
-- untyped here (jsonb) since the shape is owned by src/state/types.ts, not SQL.
--
-- `grants` records which idempotent rewards (achievements/badges/levels) a
-- player has already been credited, so rewards-grant can be called safely
-- more than once for the same reward without double-paying it (the
-- UNIQUE(user_id, kind, ref_id) is the idempotency key). Grants are only ever
-- written by the rewards-grant Edge Function (service-role, bypasses RLS) or
-- a SECURITY DEFINER RPC — never inserted directly by an authenticated client.
--
-- No consumer switches yet: nothing reads or writes these tables until
-- save-sync / rewards-grant ship (next step). Purely additive; safe to leave
-- in place even if that follow-up is delayed.
create table public.saves (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version integer not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;
grant select, insert, update on public.saves to authenticated;
grant all on public.saves to service_role;

create policy "saves_select_own" on public.saves
  for select to authenticated
  using (user_id = auth.uid());

create policy "saves_insert_own" on public.saves
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "saves_update_own" on public.saves
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: saves are never deleted by a client (deny-by-default).

create or replace function public.saves_set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger saves_set_updated_at
  before update on public.saves
  for each row execute function public.saves_set_updated_at();

create table public.grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind = any (array['achievement', 'badge', 'level'])),
  ref_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);

alter table public.grants enable row level security;
grant select on public.grants to authenticated;
grant all on public.grants to service_role;

create policy "grants_select_own" on public.grants
  for select to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy for `authenticated`: grants are written only
-- by the rewards-grant Edge Function (service-role key) or a SECURITY DEFINER
-- RPC, never directly by the client — that's what makes a grant trustworthy.

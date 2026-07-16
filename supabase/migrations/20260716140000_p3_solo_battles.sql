-- server-first-refactor P3 — solo_battles (02-architecture.md P3 scope).
--
-- Server-authoritative record of an in-progress or finished solo battle.
-- `seed` + `log` are the reproducibility pair: engine/turn.ts's reduce()
-- replays `log` against `cfg` from `seed` to arrive at the same state any
-- client would, so the server never has to trust a client-reported HP/score.
-- `result` stays null until the battle concludes (won/lost/abandoned).
--
-- Append-only from the client's point of view: rows are inserted once (battle
-- start) and updated as the log grows or the battle concludes. No delete
-- policy, matching the `saves`/`grants` convention — battle history is never
-- discarded by a client.
create table public.solo_battles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  seed text not null,
  cfg jsonb not null,
  log jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'won', 'lost', 'abandoned')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.solo_battles enable row level security;

grant select, insert, update on public.solo_battles to authenticated;
grant all on public.solo_battles to service_role;

create index solo_battles_user_id_idx on public.solo_battles (user_id);

create policy "solo_battles_select_own" on public.solo_battles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "solo_battles_insert_own" on public.solo_battles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "solo_battles_update_own" on public.solo_battles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.solo_battles_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.solo_battles_set_updated_at() from public, anon, authenticated;

create trigger solo_battles_set_updated_at
  before update on public.solo_battles
  for each row
  execute function public.solo_battles_set_updated_at();

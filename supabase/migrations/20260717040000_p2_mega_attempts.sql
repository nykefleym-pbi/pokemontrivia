-- server-first-refactor Phase 2 — mega_attempts.
--
-- Server-authoritative record of an in-progress Mega Raid attempt. Mirrors
-- solo_battles' role for solo battles (P3): `log` is an append-only action
-- list (see src/engine/mega-battle-replay.ts's StoredMegaRaidAction),
-- replayed server-side to derive the authoritative correct/total/accuracy/
-- time_ms handed to submit_mega_run — closing the trust gap where that RPC
-- previously took those numbers as given from the client.
--
-- One row per (user_id, event_id): only one attempt can be "in flight" at a
-- time. The mega-run Edge Function deletes the row once an attempt concludes
-- (after folding its result into mega_runs via submit_mega_run), so a
-- rematch's `start` always begins a fresh, empty log rather than resuming a
-- finished one. `total` is a server-read snapshot of the event's frozen
-- question-set size (mega_event_questions), taken once at `start` — never
-- client-supplied.
create table public.mega_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id text not null references public.mega_events(id) on delete cascade,
  total integer not null,
  log jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.mega_attempts enable row level security;

grant select, insert, update, delete on public.mega_attempts to authenticated;
grant all on public.mega_attempts to service_role;

create index mega_attempts_user_id_idx on public.mega_attempts (user_id);

create policy "mega_attempts_select_own" on public.mega_attempts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "mega_attempts_insert_own" on public.mega_attempts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "mega_attempts_update_own" on public.mega_attempts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "mega_attempts_delete_own" on public.mega_attempts
  for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.mega_attempts_set_updated_at()
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

revoke execute on function public.mega_attempts_set_updated_at() from public, anon, authenticated;

create trigger mega_attempts_set_updated_at
  before update on public.mega_attempts
  for each row
  execute function public.mega_attempts_set_updated_at();

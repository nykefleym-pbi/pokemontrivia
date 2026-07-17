-- server-first-refactor Phase 3 — daily_runs.
--
-- Server-authoritative record of a completed Daily Quest run. Closes the
-- same trust gap solo battles and Mega Raid closed: today the client is
-- handed the day's full question set (INCLUDING the correct answer index,
-- via api.daily-challenge.ts), self-grades locally, and directly applies
-- dailyReward()'s XP/TP to the store with zero server validation — nothing
-- stops a player from self-reporting a perfect score, or claiming the
-- reward more than once per day (dailyDone/recordDaily are client-only
-- store state, trivially reset by clearing storage or using a second
-- device).
--
-- One row per (user_id, date): the daily-run Edge Function inserts this
-- FIRST (idempotency guard, same pattern as mega-reward-claim's grants
-- insert) before computing/applying the reward, so a second submit for a
-- date already recorded fails on the unique constraint rather than paying
-- out twice. `correct`/`total` here are the Edge Function's OWN replay
-- result (submitted picks checked against daily_questions.questions'
-- held correct_index per question) — never the client's self-reported tally.
create table public.daily_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  correct integer not null,
  total integer not null,
  time_ms integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.daily_runs enable row level security;

grant select, insert on public.daily_runs to authenticated;
grant all on public.daily_runs to service_role;

create index daily_runs_user_id_idx on public.daily_runs (user_id);

create policy "daily_runs_select_own" on public.daily_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "daily_runs_insert_own" on public.daily_runs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

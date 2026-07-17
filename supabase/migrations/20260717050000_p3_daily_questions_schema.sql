-- server-first-refactor Phase 3 — track the daily_questions schema.
--
-- daily_questions, pick_daily_curated, and insert_daily_if_absent have been
-- live on this project since "daily_quest_curated_rotation"
-- (version 20260617133437) but that migration was applied out-of-band and no
-- file for it ever landed in this repo — src/routes/api.daily-challenge.ts's
-- own comment flagged this gap. This migration doesn't change production
-- behavior: every statement below is written idempotently (IF NOT EXISTS /
-- CREATE OR REPLACE / guarded DO blocks) so applying it against the
-- already-migrated database is a no-op, and its only effect is giving this
-- schema a tracked file and registering its version in the migration ledger.
--
-- SECURITY NOTE (flagged, not fixed here — out of scope for "add the missing
-- migration"): both RPCs below grant EXECUTE to `anon`. Since the anon key is
-- public (embedded in the client bundle), anyone can call them directly
-- against this project, bypassing api.daily-challenge.ts's route entirely —
-- pick_daily_curated leaks curated_questions.correct_index for arbitrary
-- questions, and insert_daily_if_absent lets a caller race today's row before
-- the real server route ever runs (its `on conflict (date) do nothing` only
-- protects an EXISTING row, not the first writer). Tightening these grants is
-- a separate, deliberate change that needs review for anything else relying
-- on anon access — not folded into this schema-tracking migration.
create table if not exists public.daily_questions (
  date date primary key,
  questions jsonb not null,
  served_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

alter table public.daily_questions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_questions'
      and policyname = 'Public can read daily questions'
  ) then
    create policy "Public can read daily questions"
      on public.daily_questions for select
      using (true);
  end if;
end $$;

create or replace function public.pick_daily_curated(
  p_easy integer default 3,
  p_medium integer default 7,
  p_window integer default 50
)
returns table(id uuid, question text, options jsonb, correct_index integer, explanation text, category text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  recent uuid[];
begin
  select coalesce(array_agg(distinct uid), '{}')
  into recent
  from (
    select unnest(served_ids) as uid
    from (
      select served_ids from public.daily_questions
      order by date desc limit p_window
    ) r
  ) ids;

  return query
  ( select c.id, c.question, c.options, c.correct_index, c.explanation, c.category
    from public.curated_questions c
    where c.verified and c.difficulty = 'easy' and not (c.id = any(recent))
    order by random() limit p_easy )
  union all
  ( select c.id, c.question, c.options, c.correct_index, c.explanation, c.category
    from public.curated_questions c
    where c.verified and c.difficulty = 'medium' and not (c.id = any(recent))
    order by random() limit p_medium );
end;
$function$;

create or replace function public.insert_daily_if_absent(
  p_date date,
  p_questions jsonb,
  p_served_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.daily_questions (date, questions, served_ids)
  values (p_date, p_questions, coalesce(p_served_ids, '{}'))
  on conflict (date) do nothing;
end;
$function$;

grant execute on function public.pick_daily_curated(integer, integer, integer) to anon, authenticated;
grant execute on function public.insert_daily_if_absent(date, jsonb, uuid[]) to anon, authenticated;

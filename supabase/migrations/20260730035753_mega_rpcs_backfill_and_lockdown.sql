-- Backfill two Mega RPCs that exist in production but in no migration, and close
-- an anon write path on one of them.
--
-- Found by mapping the repo (docs/REPO_MAP.md) and diffing the RPC names called
-- from code against pg_proc in the live project: get_mega_leaderboard and
-- insert_mega_questions_if_absent are both LIVE and both on a user-facing path,
-- yet `grep -r "create .*function" supabase/migrations` returns nothing for
-- either. They were created by hand against the database. A clean-room rebuild
-- from this directory therefore came up without them, and the Mega Raid
-- leaderboard and question-freezing would both fail on a fresh project.
--
-- Both bodies below are transcribed VERBATIM from pg_get_functiondef() against
-- dvdorceiasaipdvyfhil on 2026-07-30, so this migration is a no-op replace
-- against production and a faithful create everywhere else. Do not "improve"
-- them here: this file's job is to make the repo match what already runs.
--
-- THE LOCKDOWN. insert_mega_questions_if_absent is SECURITY DEFINER and writes
-- into mega_event_questions, a table with RLS on and zero policies -- i.e. the
-- function is the only way in. Production had the default PUBLIC execute grant
-- on it, so any holder of the anon key could call it directly, and because the
-- insert is `on conflict (event_id) do nothing` the FIRST writer for an event_id
-- wins: an anonymous caller could pre-seed a future raid's 50 questions and the
-- server's own set would be silently discarded. Its only caller is
-- src/routes/api.mega-questions.ts through supabaseAdmin (service-role), so
-- nothing legitimate needs the public grant. Revoked below, same pattern as
-- gen_friend_code, lookup_profile_by_code and the set_updated_at triggers.
--
-- get_mega_leaderboard keeps its grants deliberately: it is STABLE, returns only
-- display columns, and is called from the browser client (src/lib/mega/runs.ts)
-- precisely so that the owner-only mega_runs table does not have to be readable.

-- ---------------------------------------------------------------------------
-- 1. get_mega_leaderboard(text, integer)
-- ---------------------------------------------------------------------------
create or replace function public.get_mega_leaderboard(
  p_event_id text,
  p_limit integer default 100
)
returns table (
  user_id uuid,
  trainer_name text,
  trainer_sprite text,
  level integer,
  accuracy numeric,
  correct integer,
  total integer,
  time_ms integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select user_id, trainer_name, trainer_sprite, level, accuracy, correct, total, time_ms
  from public.mega_runs
  where event_id = p_event_id
  order by accuracy desc, time_ms asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

-- Already held in production; stated explicitly so a clean rebuild does not
-- depend on whatever ALTER DEFAULT PRIVILEGES happens to be in force.
grant execute on function public.get_mega_leaderboard(text, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. insert_mega_questions_if_absent(text, jsonb)
-- ---------------------------------------------------------------------------
create or replace function public.insert_mega_questions_if_absent(
  p_event_id text,
  p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.mega_event_questions (event_id, questions)
  values (p_event_id, p_questions)
  on conflict (event_id) do nothing;
end; $function$;

-- Service-role only. The grant has to be explicit and has to come AFTER the
-- revoke: service_role is an ordinary role for EXECUTE purposes (bypassing RLS
-- is not bypassing function privileges), so revoking PUBLIC without re-granting
-- would lock out the one caller that is supposed to work.
revoke execute on function public.insert_mega_questions_if_absent(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_mega_questions_if_absent(text, jsonb)
  to service_role;

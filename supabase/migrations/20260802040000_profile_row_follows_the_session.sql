-- Every auth user gets a profiles row, at the moment the user is created.
--
-- ## The bug this fixes
--
-- `saves`, `solo_battles` and `whos_that_rounds` all carry
-- `user_id references public.profiles(id)`. Nothing created that parent row
-- except one fire-and-forget `syncProfile()` at the END of onboarding
-- (src/routes/index.tsx). Any session that reached a server feature before that
-- call landed — or whose one call failed, with no retry — hit a foreign-key
-- violation on EVERY write, forever:
--
--   insert or update on table "whos_that_rounds" violates foreign key
--   constraint "whos_that_rounds_user_id_fkey"
--
-- The Edge Functions turn that into a 500, and Who's That renders it as
-- "Couldn't load — check your connection", which is what the owner reported.
-- It is not a connection problem and no amount of retrying fixes it. At the
-- time of writing production held 136 auth users against 11 profiles: 125
-- accounts that could not save, battle or play a round.
--
-- Second, quieter symptom, same cause: `claim_trainer_name` returns
-- `no_profile` when the row is missing, and onboarding claims the name BEFORE
-- it calls `syncProfile()`. So for a brand-new trainer the claim could never
-- succeed on the first pass — the name only stuck on the next app launch, via
-- `reconcileTrainerName()`. Both newest profiles in production carry a null
-- `trainer_name` for exactly this reason.
--
-- ## Why a trigger rather than another client call
--
-- The row's real precondition is "an auth user exists", so that is where it
-- belongs. Client-side creation can only ever be one more place that might not
-- run: it is skipped by a crash, a closed tab, a lost network, or simply by a
-- code path nobody thought to add it to — which is precisely how this happened.
-- Anchoring it to the INSERT on auth.users makes the invariant unconditional
-- and retroactively true for every entry point, including ones not yet written.
--
-- `on conflict do nothing` keeps it idempotent, so the existing
-- `syncProfile()` upsert continues to work untouched and this is safe to
-- re-run.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Owned by postgres and SECURITY DEFINER, so it is not subject to the
-- self-row RLS policies on profiles — the new user has no session yet when
-- this runs.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill the accounts already stranded. They come back with a generated
-- friend_code (see `profiles_before_write`) and a null trainer_name, which is
-- the same state a fresh install has before the name step — and nameless
-- profiles are already excluded from discovery by `challenge_random_trainer`
-- and `get_pvp_leaderboard`, so this puts nobody blank in front of a player.
insert into public.profiles (id)
select u.id
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

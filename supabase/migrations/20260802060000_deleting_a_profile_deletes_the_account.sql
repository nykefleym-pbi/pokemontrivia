-- Deleting a profile deletes the whole account.
--
-- Owner's standing instruction (2026-08-02): profiles removed by hand are test
-- accounts, and nothing belonging to them should survive — the auth user
-- included.
--
-- ## Why the auth row cannot be left behind
--
-- `profiles.id` already references `auth.users(id) on delete cascade`, so
-- deleting the AUTH row takes the profile with it. The reverse had no such
-- link: deleting the profile left a signed-in account with no profile row, and
-- as of 20260802040000 that is precisely the shape that cannot function —
-- every `saves` / `solo_battles` / `whos_that_rounds` write fails its foreign
-- key and the device gets "Couldn't load — check your connection" forever.
--
-- So this is not only tidiness. Without it, hand-deleting a profile MANUFACTURES
-- the exact broken account the previous migration exists to prevent, and the
-- signup trigger cannot heal it: that fires on INSERT into auth.users, and the
-- auth user already exists.
--
-- ## Recursion
--
-- The two cascades point at each other, which looks like a loop and is not.
-- Verified on a scratch replica of the same shape, both directions:
--
--   delete the profile -> trigger deletes the auth user -> its cascade finds
--     the profile already gone
--   delete the auth user -> cascade deletes the profile -> trigger's DELETE
--     matches no row, because it is already gone in this command
--
-- A `pg_trigger_depth()` guard was tried and then REMOVED after testing showed
-- it changed nothing: Postgres already treats the second delete as a no-op. It
-- is left out rather than kept "just in case", because a guard that never fires
-- reads as though recursion were possible.
--
-- ## Blast radius
--
-- `profiles` has no DELETE policy, so no player can reach this — only the
-- service role and the dashboard, i.e. the manual deletion this implements.
-- The Training Bot stays safe through `protect_training_bot_delete`, which
-- raises on the profile delete and aborts the whole transaction, whichever end
-- the delete started from.

create or replace function public.handle_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from auth.users where id = old.id;
  return old;
end;
$$;

revoke execute on function public.handle_profile_deleted() from public, anon, authenticated;

drop trigger if exists on_profile_deleted on public.profiles;
create trigger on_profile_deleted
  after delete on public.profiles
  for each row execute function public.handle_profile_deleted();

-- Two tables held a user id with NO foreign key at all, so neither cascade
-- reached them and both would have kept rows for deleted accounts. Pointed at
-- auth.users rather than profiles so they are cleared from either direction.
alter table public.push_subscriptions
  add constraint push_subscriptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.feedback
  add constraint feedback_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Reconcile what already exists to the invariant the trigger now maintains.
-- "Auth user with no profile" becomes unreachable from here on — signup creates
-- the row, deletion removes both — so any such row today is a leftover of a
-- profile that was deleted before this rule existed.
delete from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

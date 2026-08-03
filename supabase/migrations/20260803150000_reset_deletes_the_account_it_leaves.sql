-- Let a player delete their OWN account, so "Reset progress" actually releases it.
--
-- ## The bug this fixes
--
-- Reset now signs out and wipes the device, so the next boot mints a fresh
-- anonymous user. The old account was left behind untouched — and it keeps the
-- trainer name, because `claim_trainer_name` rejects any name held by a row
-- whose id is not yours:
--
--   if exists (select 1 from public.profiles
--              where lower(trainer_name) = lower(v_name) and id <> v_uid)
--     -> 'taken'
--
-- So resetting cost you your own name, permanently, with no way to get it back
-- from inside the app. Reported after a real reset: the orphaned row still held
-- the owner's name sixteen seconds after the new account was created.
--
-- Every other table hangs off `profiles` with ON DELETE CASCADE — saves,
-- solo_battles, whos_that_rounds, daily_runs, mega_runs/attempts, friends,
-- friend_requests, referrals, grants, the pvp_* family, pvp_queue — so removing
-- the profile removes the account entire, which is what a reset should leave
-- behind. `on_profile_deleted` (20260802060000) then takes the auth user with
-- it.
--
-- ## This deliberately changes an invariant
--
-- 20260802060000 states: "`profiles` has no DELETE policy, so no player can
-- reach this — only the service role and the dashboard." That is no longer
-- true, and the change is the point. It is narrowed as far as it can be:
--
--   * SECURITY DEFINER, because there is still no DELETE policy — the function
--     is the only route, rather than opening the table.
--   * `where id = v_uid` with v_uid from auth.uid(), so a caller can only ever
--     delete themselves. There is no argument to point at someone else.
--   * granted to `authenticated` only; `anon` has no auth.uid() and exits at
--     the null check without touching a row.
--   * an explicit refusal for the Training Bot's fixed id. `protect_training_bot_delete`
--     already raises on that row, so this is belt-and-braces — but the bot is
--     shared state whose loss would break every player's Training mode, and one
--     line of redundancy is cheap next to that.
--
-- The risk that remains is a player deleting their own account, which is what
-- the button says it does and what the confirm dialog now spells out.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  -- The bot is not a player and must survive every reset.
  if v_uid = 'b07b07b0-7b07-4b07-8b07-b07b07b07b07'::uuid then
    return;
  end if;
  delete from public.profiles where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

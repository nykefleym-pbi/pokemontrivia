-- The shared Training Bot (b07b07b0-…) is a singleton identity used as guest_id
-- for every Training-vs-Bot match (see 20260706202457_pvp_bot_match_schema_and_seed).
-- Its profiles row was collaterally deleted during a test-account cleanup, which
-- made start_bot_pvp_match hit its `no_bot` branch and return {ok:false} — the
-- client then shows "Couldn't start training." This migration (1) re-seeds the
-- bot profile and (2) makes it undeletable so a future cleanup can't take it out.

-- (1) Re-seed the singleton bot profile. The bot's auth.users row already exists
-- (it survived the cleanup); this restores only the missing profiles row.
insert into public.profiles (id, friend_code, trainer_name, trainer_sprite, level)
values ('b07b07b0-7b07-4b07-8b07-b07b07b07b07', 'TRNBOT', 'Training Bot', 'red', 5)
on conflict (id) do nothing;

-- (2) Delete-protection. A BEFORE DELETE trigger that SILENTLY cancels a delete
-- of the bot row (returns null) while letting every other row delete through —
-- so bulk "delete the test accounts" statements still work and simply skip the
-- bot instead of aborting the whole transaction.
create or replace function public.protect_training_bot()
returns trigger
language plpgsql
as $$
begin
  if old.id = 'b07b07b0-7b07-4b07-8b07-b07b07b07b07' then
    -- Cancel this row's deletion; other rows in the same statement proceed.
    return null;
  end if;
  return old;
end;
$$;

drop trigger if exists protect_training_bot_delete on public.profiles;
create trigger protect_training_bot_delete
  before delete on public.profiles
  for each row
  execute function public.protect_training_bot();

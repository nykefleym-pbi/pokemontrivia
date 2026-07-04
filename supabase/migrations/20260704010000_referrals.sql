-- Referral campaign: a new user who signs up via `?ref=<friend_code>` credits
-- the referrer. Coins/items/eggs live purely client-side (zustand), so this
-- table only tracks the event + whether the referrer's side has been
-- collected yet — the referred user's reward is granted immediately (they're
-- in the app right now), the referrer's is granted lazily next time they
-- open the app (claim_pending_referral_rewards), same pattern as friend
-- requests already use for anything the other party isn't present for.
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  referrer_reward_claimed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.referrals enable row level security;
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;

create policy "referrals_select_own" on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());

-- Claim a referral by the referrer's friend code. Called once, right after
-- a new user finishes onboarding. Blocks self-referral, being referred
-- twice, and caps a referrer to 5 rewarded referrals/day (throwaway guest
-- accounts mean there's no real identity check available, so a daily cap
-- is the practical anti-abuse ceiling) — over the cap, the row still records
-- the referral but is marked already-claimed so the referrer simply gets no
-- reward from it, rather than blocking the new user's onboarding.
create or replace function public.claim_referral(_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_today_count int;
  v_capped boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select id into v_referrer from public.profiles where friend_code = upper(trim(_code));
  if v_referrer is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_referrer = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if exists (select 1 from public.referrals where referred_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_referred');
  end if;

  select count(*) into v_today_count from public.referrals
    where referrer_id = v_referrer and created_at >= date_trunc('day', now());
  v_capped := v_today_count >= 5;

  insert into public.referrals (referrer_id, referred_id, referrer_reward_claimed)
  values (v_referrer, v_uid, v_capped);

  return jsonb_build_object('ok', true, 'referrerRewarded', not v_capped);
end;
$$;

grant execute on function public.claim_referral(text) to authenticated;

-- Collect any of the caller's un-claimed referrer-side rewards (from people
-- who signed up using their code while they weren't present). Returns how
-- many reward-bundles the client should roll and grant locally.
create or replace function public.claim_pending_referral_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select count(*) into v_count from public.referrals
    where referrer_id = v_uid and referrer_reward_claimed = false;

  update public.referrals
     set referrer_reward_claimed = true
   where referrer_id = v_uid and referrer_reward_claimed = false;

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

grant execute on function public.claim_pending_referral_rewards() to authenticated;

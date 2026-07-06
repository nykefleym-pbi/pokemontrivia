-- Phase 1: store each side's partner dex id on the live match so abilities that
-- depend on knowing the OPPONENT's identity (Mew's Transform, weather-conflict
-- resolution, ability-suppress interactions) can resolve server- and client-side.
--
-- host_partner_id is set by the scanner at match creation (start_live_pvp_match).
-- guest_partner_id is set by the guest right after they load the match
-- (set_live_pvp_partner), because the guest never calls the start RPC. Both are
-- nullable: a non-Legendary partner has no signature ability, and a legacy row
-- created before this migration simply has null on both sides (treated as "no
-- identity-dependent interaction", i.e. the pre-existing behaviour).

alter table public.pvp_live_matches
  add column if not exists host_partner_id int,
  add column if not exists guest_partner_id int;

-- Extend the start RPC with the host's partner dex id. Drop the old 2-arg form
-- first so PostgREST doesn't see an ambiguous overload; the new form keeps a
-- default so any un-migrated caller still resolves.
drop function if exists public.start_live_pvp_match(text, jsonb);

create or replace function public.start_live_pvp_match(
  _opponent_code text,
  _questions jsonb,
  _partner_id int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_opponent public.profiles;
  v_id uuid;
  v_started_at timestamptz := now() + interval '3 seconds';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_opponent from public.profiles where friend_code = upper(trim(_opponent_code));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_opponent.id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  insert into public.pvp_live_matches (host_id, guest_id, questions, started_at, host_partner_id)
  values (v_uid, v_opponent.id, _questions, v_started_at, _partner_id)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_id,
    'startedAt', v_started_at,
    'opponent', jsonb_build_object(
      'id', v_opponent.id,
      'trainer_name', v_opponent.trainer_name,
      'trainer_sprite', v_opponent.trainer_sprite,
      'level', v_opponent.level
    )
  );
end;
$$;

-- Register the CALLER's own partner dex id on a match they belong to. Idempotent
-- and side-aware: sets host_partner_id when the caller is the host, else
-- guest_partner_id. Only writes when currently null so it can't be used to swap
-- partners mid-battle. Returns whether both sides are now known.
create or replace function public.set_live_pvp_partner(_match_id uuid, _partner_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_uid = v_match.host_id then
    update public.pvp_live_matches
      set host_partner_id = coalesce(host_partner_id, _partner_id)
      where id = _match_id
      returning * into v_match;
  else
    update public.pvp_live_matches
      set guest_partner_id = coalesce(guest_partner_id, _partner_id)
      where id = _match_id
      returning * into v_match;
  end if;

  return jsonb_build_object(
    'ok', true,
    'hostPartnerId', v_match.host_partner_id,
    'guestPartnerId', v_match.guest_partner_id,
    'bothKnown', v_match.host_partner_id is not null and v_match.guest_partner_id is not null
  );
end;
$$;

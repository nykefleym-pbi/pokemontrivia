-- Populate pvp_live_matches.match_source, and record WHEN and BY WHOM a match
-- was forfeited.
--
-- WHY: match_source was NULL on all 74 production rows. The column and its CHECK
-- ('qr','queue','bot') were added in 20260726150000, and `enqueue_pvp` does set
-- it -- but the two functions that create every other match, start_live_pvp_match
-- and start_bot_pvp_match, never did. So the Arena's queue and the Battle-Code
-- scanner were indistinguishable in the data, and the analysis in
-- docs/ENGAGEMENT_PLAN.md could not separate two products with different funnels.
--
-- Both function bodies below are transcribed from pg_get_functiondef() and
-- changed ONLY by adding match_source to the insert. Reconstructing them from
-- earlier migrations would have silently reverted whatever has been hand-applied
-- since -- start_bot_pvp_match's is_bot_match/guest_bot_profile columns and its
-- whole tier-rolling block appear in no migration at all.

alter table public.pvp_live_matches
  add column if not exists forfeited_at timestamptz,
  add column if not exists forfeited_by uuid references public.profiles (id) on delete set null;

comment on column public.pvp_live_matches.forfeited_at is
  'When forfeit_live_pvp_match resolved this match. NULL for matches that ended any other way.';
comment on column public.pvp_live_matches.forfeited_by is
  'Who invoked the forfeit. NOT the loser: the presence watchdog CLAIMS a win by '
  'forfeit (concede=false), so this is the actor, and winner_id is the outcome. '
  'The pair is what tells a rage-quit apart from an opponent who vanished.';

-- ---------------------------------------------------------------- match_source

create or replace function public.start_live_pvp_match(_opponent_code text, _questions jsonb, _partner_id integer DEFAULT NULL::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- 'qr' is this path by definition: it resolves a Battle Code, which is only
  -- ever reached by scanning or typing one.
  insert into public.pvp_live_matches (host_id, guest_id, questions, started_at, host_partner_id, match_source)
  values (v_uid, v_opponent.id, _questions, v_started_at, _partner_id, 'qr')
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
$function$;

create or replace function public.start_bot_pvp_match(_questions jsonb, _partner_id integer DEFAULT NULL::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_bot_id uuid := 'b07b07b0-7b07-4b07-8b07-b07b07b07b07';
  v_bot public.profiles;
  v_id uuid;
  v_started_at timestamptz := now() + interval '3 seconds';
  v_roster int[] := array[
    144,145,146,150,243,244,245,249,250,377,378,379,380,381,382,383,384,
    480,481,482,483,484,485,486,487,488,638,639,640,641,642,643,644,645,646,
    716,717,718,772,773,785,786,787,788,789,790,791,792,800,803,804,805,806,
    888,889,890,891,892,894,895,896,897,898,10194,
    1001,1002,1003,1004,1007,1008,1009,1010,1014,1015,1016,1017,1020,1021,1022,1023,1024,
    151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,
    801,802,807,808,809,893,1025
  ];
  v_bot_partner int := v_roster[1 + floor(random() * array_length(v_roster, 1))::int];
  v_tier_roll numeric := random();
  v_tier text := case when v_tier_roll < 0.3 then 'rookie' when v_tier_roll < 0.75 then 'trainer' else 'ace' end;
  v_accuracy numeric;
  v_mean_ms numeric;
  v_jitter numeric;
  v_aggression numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_bot from public.profiles where id = v_bot_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_bot');
  end if;

  if v_tier = 'rookie' then
    v_accuracy := 0.45 + random() * (0.6 - 0.45);
    v_mean_ms := round(8500 + random() * (12000 - 8500));
    v_jitter := round(2000 + random() * (4000 - 2000));
    v_aggression := 0.15 + random() * (0.35 - 0.15);
  elsif v_tier = 'trainer' then
    v_accuracy := 0.62 + random() * (0.8 - 0.62);
    v_mean_ms := round(5500 + random() * (8500 - 5500));
    v_jitter := round(1500 + random() * (3000 - 1500));
    v_aggression := 0.35 + random() * (0.6 - 0.35);
  else
    v_accuracy := 0.82 + random() * (0.95 - 0.82);
    v_mean_ms := round(3000 + random() * (5500 - 3000));
    v_jitter := round(800 + random() * (2000 - 800));
    v_aggression := 0.6 + random() * (0.9 - 0.6);
  end if;

  insert into public.pvp_live_matches
    (host_id, guest_id, questions, started_at, host_partner_id, guest_partner_id, is_bot_match, guest_bot_profile, match_source)
  values
    (v_uid, v_bot_id, _questions, v_started_at, _partner_id, v_bot_partner, true,
     jsonb_build_object(
       'tier', v_tier, 'accuracy', v_accuracy,
       'speed', jsonb_build_object('meanMs', v_mean_ms, 'jitter', v_jitter),
       'aggression', v_aggression
     ), 'bot')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_id,
    'startedAt', v_started_at,
    'opponent', jsonb_build_object(
      'id', v_bot.id,
      'trainer_name', v_bot.trainer_name,
      'trainer_sprite', v_bot.trainer_sprite,
      'level', v_bot.level
    )
  );
end;
$function$;

-- ---------------------------------------------------------------- forfeit timing

-- Two overloads existed: (uuid) and (uuid, boolean default false). PostgREST
-- resolves by the argument NAMES supplied, so the client -- which always sends
-- _concede -- has been hitting the 2-arg one, and the 1-arg one is unreachable
-- today. It is dropped rather than left as a trap: it predates the concede split
-- and always credits the win to the CALLER, so the first caller to omit _concede
-- would silently turn "I give up" into "I claim the win", with no compile error
-- and no runtime error. Exactly the duplicate-implementation hazard CLAUDE.md
-- warns about.
drop function if exists public.forfeit_live_pvp_match(uuid);

create or replace function public.forfeit_live_pvp_match(_match_id uuid, _concede boolean DEFAULT false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_winner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_match.status != 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  if _concede then
    v_winner := case when v_uid = v_match.host_id then v_match.guest_id else v_match.host_id end;
  else
    v_winner := v_uid;
  end if;

  update public.pvp_live_matches
     set status = 'forfeited',
         winner_id = v_winner,
         forfeited_at = now(),
         forfeited_by = v_uid
   where id = _match_id and status = 'active';

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.forfeit_live_pvp_match(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- backfill

-- The 74 existing rows CAN be classified, which is worth doing rather than
-- leaving a permanent NULL gap at the start of the series:
--
--   * enqueue_pvp has always written match_source, so no queue-created row can
--     be NULL. Every NULL row therefore came from one of the two functions
--     fixed above.
--   * is_bot_match separates them, and it agrees exactly with a guest_id test
--     against the Training Bot's uuid (73 true / 1 false, both ways).
--
-- Only NULLs are touched, so anything already labelled is left alone.
update public.pvp_live_matches
   set match_source = case when is_bot_match then 'bot' else 'qr' end
 where match_source is null;

-- forfeited_at is deliberately NOT backfilled. The 26 existing forfeits have no
-- recorded time, and created_at would be the match's start, not the forfeit --
-- inventing that number would make the first 26 rows of any duration analysis
-- quietly wrong. They stay NULL, which is honest and filterable.

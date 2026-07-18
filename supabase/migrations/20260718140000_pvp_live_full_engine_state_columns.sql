-- Live PvP Phase 4/5 cutover, slice 1: full PvpEngineState persistence columns.
--
-- Phase 3 (20260718060000 + its confused-ticks addendum) persisted streak/
-- wrongStreak/confusedTicks -- enough for the shadow-log/offline-verifier work
-- (Phase 4a/4b/5a). The actual cutover (a new Edge Function computing
-- ability-modified damage via engine/pvp-live-answer.ts's `resolvePvpAnswer`,
-- for both the human path and the bot-mirror path) needs the REST of
-- `PvpEngineState` too: `sigLatched`/`moxieStacks`/`wrongCount`/`hadWrong`/
-- `sturdyUsed`/`prevCorrect`/`prevAnswerElapsedMs`/`swordOfRuinCharges` --
-- none of which have a server column yet, for either side. This gap is
-- identical for humans and the bot, so one migration serves both Phase 4 and
-- Phase 5's still-deferred cutover.
--
-- Purely additive: nothing reads these columns yet (this migration does NOT
-- touch submit_pvp_live_answer / submit_bot_pvp_move / apply_pvp_signature_effect).
-- Zero behavior change, same discipline as every prior schema-only slice in
-- this refactor (Phase 3, Phase 4a).
--
-- NOT included here: wiring apply_pvp_signature_effect's phase='manual'
-- Chien-Pao (1002) branch to write sword_of_ruin_charges = 2 when it fires.
-- That function has been `create or replace`'d ~10 times across this
-- refactor's history and is large -- it gets its own careful slice rather
-- than being folded into a schema-only migration.
alter table public.pvp_live_matches
  add column if not exists host_sig_latched boolean not null default false,
  add column if not exists guest_sig_latched boolean not null default false,
  add column if not exists host_moxie_stacks integer not null default 0,
  add column if not exists guest_moxie_stacks integer not null default 0,
  add column if not exists host_wrong_count integer not null default 0,
  add column if not exists guest_wrong_count integer not null default 0,
  add column if not exists host_had_wrong boolean not null default false,
  add column if not exists guest_had_wrong boolean not null default false,
  add column if not exists host_sturdy_used boolean not null default false,
  add column if not exists guest_sturdy_used boolean not null default false,
  add column if not exists host_prev_correct boolean not null default false,
  add column if not exists guest_prev_correct boolean not null default false,
  add column if not exists host_prev_answer_elapsed_ms integer not null default 0,
  add column if not exists guest_prev_answer_elapsed_ms integer not null default 0,
  add column if not exists host_sword_of_ruin_charges integer not null default 0,
  add column if not exists guest_sword_of_ruin_charges integer not null default 0,
  -- Training-bot's rolled skill profile (tier/accuracy/speed/aggression),
  -- currently only a client-side useRef (rollBotProfile(), pvp-bot.ts) rolled
  -- fresh each Training match and never persisted. The eventual bot-turn Edge
  -- Function needs to reuse the SAME profile every question rather than
  -- re-rolling it per-call, so it's rolled once, server-side, at match start
  -- (see start_bot_pvp_match below) and stored here.
  add column if not exists guest_bot_profile jsonb;

-- Roll and persist the bot's profile at match creation, mirroring
-- rollBotProfile()'s tier bands (src/lib/pvp-bot.ts) in SQL. This is a
-- one-time roll stored as data, not a re-derivation of the ability-damage
-- math (the fragile part this repo's CLAUDE.md warns about) -- tier bands are
-- plain accuracy/speed/aggression ranges, not signature-ability logic.
create or replace function public.start_bot_pvp_match(_questions jsonb, _partner_id integer default null)
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
  -- Tier draw mirrors TIER_ROLL in pvp-bot.ts: rookie [0,0.3), trainer
  -- [0.3,0.75), ace [0.75,1]. Bands mirror TIER_BANDS there exactly.
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
    (host_id, guest_id, questions, started_at, host_partner_id, guest_partner_id, is_bot_match, guest_bot_profile)
  values
    (v_uid, v_bot_id, _questions, v_started_at, _partner_id, v_bot_partner, true,
     jsonb_build_object(
       'tier', v_tier, 'accuracy', v_accuracy,
       'speed', jsonb_build_object('meanMs', v_mean_ms, 'jitter', v_jitter),
       'aggression', v_aggression
     ))
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

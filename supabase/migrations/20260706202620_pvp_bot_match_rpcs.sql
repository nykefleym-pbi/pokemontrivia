-- ── Training vs Bot RPCs ────────────────────────────────────────────────────
-- start_bot_pvp_match: NOT security-sensitive (only ever inserts a row for the
--   caller as host, against the shared Training Bot as guest).
-- submit_bot_pvp_move / apply_bot_pvp_signature_effect / use_bot_pvp_live_item:
--   security-sensitive. Every one gates on auth.uid() = host_id AND
--   is_bot_match = true, and writes ONLY the bot's (guest) side (plus the host
--   side for the bot's own attacks/opponent-facing effects, exactly as the real
--   guest branch of submit_pvp_live_answer does). They can therefore never write
--   a real opponent's side in a real match. Magnitudes are clamped/looked up
--   server-side, never trusted from the client.

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
  -- Mirrors ALL_LEGENDARY_MYTHICAL_IDS in src/lib/legendary-data.ts (the exact
  -- egg-hatch roster). Kept in sync manually; the bot's rolled signature ability
  -- is already wired into the generic engine, so no new ability code is needed.
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
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_bot from public.profiles where id = v_bot_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_bot');
  end if;

  insert into public.pvp_live_matches
    (host_id, guest_id, questions, started_at, host_partner_id, guest_partner_id, is_bot_match)
  values
    (v_uid, v_bot_id, _questions, v_started_at, _partner_id, v_bot_partner, true)
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

create or replace function public.submit_bot_pvp_move(_match_id uuid, _question_index integer, _correct boolean, _dmg integer, _time_ms integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_last_idx int;
  -- Bot attacks the host with _dmg (same [0,60] clamp as submit_pvp_live_answer);
  -- a wrong bot answer costs the flat self-chip the client applies for humans.
  v_dmg int := greatest(0, least(60, coalesce(_dmg, 0)));
  v_self_dmg int := 8;
  v_my_hp int; v_opp_hp int; v_pre_hp int; v_pre_opp_hp int;
  v_my_revived boolean; v_my_stages jsonb; v_my_statuses jsonb; v_my_bonus_until int; v_my_bonus_prev int;
  v_opp_revived boolean; v_opp_stages jsonb; v_opp_statuses jsonb; v_opp_bonus_until int;
  v_resolved boolean := false;
  v_winner uuid;
  v_h_acc numeric; v_g_acc numeric; v_h_avg numeric; v_g_avg numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- You can only ever drive the bot in a match YOU host …
  if v_uid <> v_match.host_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- … and only when the match is genuinely a bot match. This RPC can therefore
  -- never write to a real opponent's side in a real match.
  if not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'not_bot_match');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  v_last_idx := v_match.guest_last_submitted_idx;
  if _question_index <= v_last_idx then
    return jsonb_build_object(
      'ok', true, 'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
      'resolved', v_match.status = 'completed'
    );
  end if;
  if _question_index < 0 or _question_index >= 20 then
    return jsonb_build_object('ok', false, 'error', 'out_of_range');
  end if;

  -- Damage on a correct answer; flat self-chip on a wrong one (mirrors the
  -- client's dmg / selfDmg split for a human's own side).
  if _correct then v_self_dmg := 0; else v_dmg := 0; end if;

  -- Bot (guest) self-KO Rainbow Rebirth (no-op unless the bot rolled Ho-Oh).
  v_pre_hp := v_match.guest_hp - v_self_dmg;
  v_my_bonus_prev := v_match.guest_revive_bonus_until;
  if v_pre_hp <= 0 and v_match.guest_partner_id = 250 and not coalesce(v_match.guest_revived, false) then
    v_my_hp := round(120 * 0.25)::int;
    v_my_revived := true;
    v_my_stages := public._pvp_bump_stage(v_match.guest_stages, 'attack', 1);
    v_my_statuses := public._pvp_cure_status(v_match.guest_statuses, 'any');
    v_my_bonus_until := _question_index + 1 + 2;
  else
    v_my_hp := greatest(0, v_pre_hp);
    v_my_revived := v_match.guest_revived;
    v_my_stages := v_match.guest_stages;
    v_my_statuses := v_match.guest_statuses;
    v_my_bonus_until := v_match.guest_revive_bonus_until;
  end if;

  -- Host opponent-inflicted-KO Rainbow Rebirth (no-op unless the human is Ho-Oh).
  v_pre_opp_hp := v_match.host_hp - v_dmg;
  if v_pre_opp_hp <= 0 and v_match.host_partner_id = 250 and not coalesce(v_match.host_revived, false) then
    v_opp_hp := round(120 * 0.25)::int;
    v_opp_revived := true;
    v_opp_stages := public._pvp_bump_stage(v_match.host_stages, 'attack', 1);
    v_opp_statuses := public._pvp_cure_status(v_match.host_statuses, 'any');
    v_opp_bonus_until := _question_index + 1 + 2;
  else
    v_opp_hp := greatest(0, v_pre_opp_hp);
    v_opp_revived := v_match.host_revived;
    v_opp_stages := v_match.host_stages;
    v_opp_statuses := v_match.host_statuses;
    v_opp_bonus_until := v_match.host_revive_bonus_until;
  end if;

  update public.pvp_live_matches set
    guest_hp = v_my_hp,
    host_hp = v_opp_hp,
    guest_revived = v_my_revived,
    guest_stages = v_my_stages,
    guest_statuses = v_my_statuses,
    guest_revive_bonus_until = v_my_bonus_until,
    host_revived = v_opp_revived,
    host_stages = v_opp_stages,
    host_statuses = v_opp_statuses,
    host_revive_bonus_until = v_opp_bonus_until,
    guest_correct_live = guest_correct_live + (case when _correct then 1 else 0 end),
    guest_answered_live = guest_answered_live + 1,
    guest_time_ms_live = guest_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
    guest_last_submitted_idx = _question_index
  where id = _match_id;

  -- Rainbow Rebirth bonus window (isolated: opponent status only, never HP).
  if _correct and _question_index < v_my_bonus_prev and random() < 0.5 then
    update public.pvp_live_matches set
      host_statuses = public._pvp_apply_status(host_statuses, 'burn', 3)
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;

  if v_match.host_hp <= 0 or v_match.guest_hp <= 0 then
    v_resolved := true;
  elsif v_match.host_answered_live >= 20 and v_match.guest_answered_live >= 20 then
    v_resolved := true;
  end if;

  if v_resolved and v_match.status = 'active' then
    if v_match.host_hp > v_match.guest_hp then
      v_winner := v_match.host_id;
    elsif v_match.guest_hp > v_match.host_hp then
      v_winner := v_match.guest_id;
    else
      v_h_acc := v_match.host_correct_live::numeric / greatest(v_match.host_answered_live, 1);
      v_g_acc := v_match.guest_correct_live::numeric / greatest(v_match.guest_answered_live, 1);
      if v_h_acc > v_g_acc then
        v_winner := v_match.host_id;
      elsif v_g_acc > v_h_acc then
        v_winner := v_match.guest_id;
      else
        v_h_avg := v_match.host_time_ms_live::numeric / greatest(v_match.host_answered_live, 1);
        v_g_avg := v_match.guest_time_ms_live::numeric / greatest(v_match.guest_answered_live, 1);
        if v_h_avg < v_g_avg then
          v_winner := v_match.host_id;
        elsif v_g_avg < v_h_avg then
          v_winner := v_match.guest_id;
        else
          v_winner := null;
        end if;
      end if;
    end if;

    update public.pvp_live_matches set
      status = 'completed', winner_id = v_winner, live_resolved_at = now()
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp,
    'guestHp', v_match.guest_hp,
    'resolved', v_match.status = 'completed',
    'winnerId', v_match.winner_id
  );
end;
$function$;

create or replace function public.apply_bot_pvp_signature_effect(_match_id uuid, _question_index integer, _pokemon_id integer, _phase text, _scale_count integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_row public.pvp_signature_effects;
  v_self_stages jsonb; v_self_statuses jsonb; v_self_hp int;
  v_opp_stages jsonb; v_opp_statuses jsonb; v_opp_hp int;
  v_applied int := 0; v_did_apply boolean; v_touched_opponent boolean := false;
  v_stat text; v_delta int; v_amount int; v_status_chance numeric;
  v_qidx int := greatest(0, _question_index);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid <> v_match.host_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'not_bot_match');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  -- Ownership: the bot may only invoke its own registered (guest) partner's
  -- ability (same "verify the caller owns what they claim to control" discipline
  -- as apply_pvp_signature_effect).
  if v_match.guest_partner_id is null or _pokemon_id is distinct from v_match.guest_partner_id then
    return jsonb_build_object('ok', false, 'error', 'unauthorized_ability');
  end if;
  -- The bot only ever fires auto phases (its passive/manual damage abilities
  -- already fold into the clamped _dmg of submit_bot_pvp_move).
  if _phase not in ('battle_start', 'post_answer') then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'unsupported_phase');
  end if;

  if _phase = 'battle_start' and v_match.guest_ability_started then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if _phase = 'post_answer' and v_qidx <= v_match.guest_post_answer_last_idx then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'post_answer_replay');
  end if;

  v_self_stages := v_match.guest_stages;
  v_self_statuses := v_match.guest_statuses;
  v_self_hp := v_match.guest_hp;
  v_opp_stages := v_match.host_stages;
  v_opp_statuses := v_match.host_statuses;
  v_opp_hp := v_match.host_hp;

  for v_row in
    select * from public.pvp_signature_effects
    where pokemon_id = _pokemon_id and phase = _phase
    order by effect_index
  loop
    v_did_apply := true;
    if v_row.kind = 'stat_stage' then
      v_stat := v_row.payload->>'stat';
      v_delta := (v_row.payload->>'delta')::int;
      if v_row.target = 'self' then
        v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat, v_delta);
      else
        v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat, v_delta);
        v_touched_opponent := true;
      end if;
    elsif v_row.kind = 'stat_scale' then
      v_stat := v_row.payload->>'stat';
      v_delta := least((v_row.payload->>'max')::int,
                       floor(greatest(0, coalesce(_scale_count, 0)) / greatest(1, (v_row.payload->>'per')::int))::int);
      if v_delta > 0 then
        v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat, v_delta);
      else
        v_did_apply := false;
      end if;
    elsif v_row.kind = 'status' then
      v_status_chance := coalesce((v_row.payload->>'chance')::numeric, 1);
      if random() < v_status_chance then
        if v_row.target = 'self' then
          v_self_statuses := public._pvp_apply_status(v_self_statuses, v_row.payload->>'status', coalesce((v_row.payload->>'questions')::int, 3));
        else
          v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_row.payload->>'status', coalesce((v_row.payload->>'questions')::int, 3));
          v_touched_opponent := true;
        end if;
      else
        v_did_apply := false;
      end if;
    elsif v_row.kind = 'cure' then
      v_self_statuses := public._pvp_cure_status(v_self_statuses, v_row.payload->>'status');
    elsif v_row.kind = 'heal' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_self_hp := least(120, v_self_hp + v_amount);
    elsif v_row.kind = 'drain' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_opp_hp := greatest(0, v_opp_hp - v_amount);
      v_self_hp := least(120, v_self_hp + v_amount);
      v_touched_opponent := true;
    else
      -- Exotic kinds (weather/suppress/swap/cleanse/sig_state) are deliberately
      -- unsupported for the bot; skip them so the function stays small/auditable.
      v_did_apply := false;
    end if;
    if v_did_apply then
      v_applied := v_applied + 1;
    end if;
  end loop;

  if v_applied = 0 then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.pvp_live_matches set
    guest_hp = v_self_hp, host_hp = v_opp_hp,
    guest_stages = v_self_stages, guest_statuses = v_self_statuses,
    host_stages = v_opp_stages, host_statuses = v_opp_statuses,
    guest_ability_started = guest_ability_started or (_phase = 'battle_start'),
    guest_post_answer_last_idx = case when _phase = 'post_answer' then greatest(guest_post_answer_last_idx, v_qidx) else guest_post_answer_last_idx end
  where id = _match_id;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (
    _match_id, v_qidx, v_match.guest_id,
    case when v_touched_opponent then 'opponent' else 'self' end,
    null, 'ability', _pokemon_id, 'stat_stage', jsonb_build_object('phase', _phase)
  );

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages, 'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses, 'guestStatuses', v_match.guest_statuses
  );
end;
$function$;

create or replace function public.use_bot_pvp_live_item(_match_id uuid, _question_index integer, _item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_effect public.pvp_item_effects;
  v_self_stages jsonb; v_self_statuses jsonb; v_self_hp int;
  v_opp_stages jsonb; v_opp_statuses jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid <> v_match.host_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'not_bot_match');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  select * into v_effect from public.pvp_item_effects where item_id = _item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_item');
  end if;
  if v_match.guest_items_used >= 3 then
    return jsonb_build_object('ok', false, 'error', 'item_cap');
  end if;

  v_self_stages := v_match.guest_stages;
  v_self_statuses := v_match.guest_statuses;
  v_self_hp := v_match.guest_hp;
  v_opp_stages := v_match.host_stages;
  v_opp_statuses := v_match.host_statuses;

  if v_effect.kind = 'heal' then
    if (v_effect.payload->>'full')::boolean is true then
      v_self_hp := 120;
    else
      v_self_hp := least(120, v_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
    end if;
  elsif v_effect.kind = 'stat_stage' then
    if v_effect.target = 'self' then
      v_self_stages := public._pvp_bump_stage(v_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    else
      v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    end if;
  elsif v_effect.kind = 'status' then
    if v_effect.target = 'self' then
      v_self_statuses := public._pvp_apply_status(v_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    else
      v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    end if;
  elsif v_effect.kind = 'cure' then
    v_self_statuses := public._pvp_cure_status(v_self_statuses, v_effect.payload->>'status');
  end if;

  update public.pvp_live_matches set
    guest_hp = v_self_hp,
    guest_stages = v_self_stages,
    guest_statuses = v_self_statuses,
    host_stages = v_opp_stages,
    host_statuses = v_opp_statuses,
    guest_items_used = guest_items_used + 1
  where id = _match_id;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
  values (_match_id, _question_index, v_match.guest_id, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp,
    'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages,
    'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses,
    'guestStatuses', v_match.guest_statuses
  );
end;
$function$;

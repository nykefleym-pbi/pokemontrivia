-- Live PvP Phase 4/5 cutover, slice 2: wire Sword of Ruin arming server-side.
--
-- Chien-Pao's (1002) ignore-Defense window is currently armed ENTIRELY
-- client-side (`swordOfRuinChargesRef`, live-pvp-battle-screen.tsx:2276-2278)
-- the moment the human's own manual-fire lands (-2 opp Def via
-- apply_pvp_signature_effect phase='manual'). Once the cutover stops trusting
-- the client's damage computation, that ignore-Defense window needs a real
-- server column to read from -- `guest_sword_of_ruin_charges` /
-- `host_sword_of_ruin_charges` (added additively, unread, in the previous
-- slice) -- or Chien-Pao's passive silently stops applying post-cutover. This
-- is also the shadow-log's documented `sword_of_ruin_arming` known gap
-- (engine/pvp-shadow-verify.ts) -- this closes it.
--
-- Confirmed via the live function definitions (pg_get_functiondef, not the
-- migration history, since this function has been create-or-replace'd many
-- times) that `apply_bot_pvp_signature_effect` explicitly excludes phase
-- 'manual' (`if _phase not in ('battle_start', 'post_answer', 'bespoke')`) --
-- the bot has NO manual-fire mechanic today, so a bot rolling Chien-Pao
-- already never gets this window. This migration therefore only touches the
-- human RPC; there is no pre-existing bot behavior to preserve here, and
-- adding bot support would be new scope, not parity.
--
-- Reproduces the human RPC's current live body byte-for-byte (verified via
-- pg_get_functiondef) plus one additive change: when a phase='manual' fire
-- for pokemon_id=1002 actually applies (v_applied > 0), set the caller's own
-- side's sword_of_ruin_charges to 2, mirroring `armSwordOfRuinCharges` in
-- engine/pvp-live-answer.ts exactly.
create or replace function public.apply_pvp_signature_effect(_match_id uuid, _question_index integer, _pokemon_id integer, _phase text, _scale_count integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_i_am_host boolean;
  v_row public.pvp_signature_effects;
  v_self_stages jsonb;
  v_self_statuses jsonb;
  v_self_hp int;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
  v_opp_hp int;
  v_self_suppressed int;
  v_opp_suppressed int;
  v_dur int;
  v_applied int := 0;
  v_did_apply boolean;
  v_status_chance numeric;
  v_touched_opponent boolean := false;
  v_stat text;
  v_delta int;
  v_amount int;
  v_cap int;
  v_my_fires int;
  v_qidx int := greatest(0, _question_index);
  v_is_weather boolean;
  v_sig_state jsonb;
  v_sig_val int;
  v_my_partner int;
  v_my_transform int;
  v_authorized_id int;
  v_my_post_idx int;
  -- Sword of Ruin (Chien-Pao, 1002): arm a 2-charge ignore-Defense window on
  -- the caller's own side once its manual fire actually applies.
  v_arm_sword_of_ruin boolean;
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
  if v_match.status != 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  v_i_am_host := v_uid = v_match.host_id;

  v_my_partner := case when v_i_am_host then v_match.host_partner_id else v_match.guest_partner_id end;

  if v_my_partner is null and _pokemon_id is not null and _pokemon_id <> 151 then
    if v_i_am_host then
      update public.pvp_live_matches set host_partner_id = _pokemon_id
        where id = _match_id and host_partner_id is null;
    else
      update public.pvp_live_matches set guest_partner_id = _pokemon_id
        where id = _match_id and guest_partner_id is null;
    end if;
    v_my_partner := _pokemon_id;
  end if;

  v_my_transform := case when v_i_am_host then v_match.host_transform_id else v_match.guest_transform_id end;
  v_authorized_id := case when v_my_partner = 151 then v_my_transform else v_my_partner end;

  if v_authorized_id is null or _pokemon_id is distinct from v_authorized_id then
    return jsonb_build_object('ok', false, 'error', 'unauthorized_ability');
  end if;

  if _phase = 'sig_state' then
    v_sig_val := least(3, greatest(0, coalesce(_scale_count, 0)));
    if v_i_am_host then
      v_sig_state := coalesce(v_match.host_sig_state, '{}'::jsonb)
        || jsonb_build_object(_pokemon_id::text, v_sig_val);
      update public.pvp_live_matches set host_sig_state = v_sig_state where id = _match_id;
    else
      v_sig_state := coalesce(v_match.guest_sig_state, '{}'::jsonb)
        || jsonb_build_object(_pokemon_id::text, v_sig_val);
      update public.pvp_live_matches set guest_sig_state = v_sig_state where id = _match_id;
    end if;
    return jsonb_build_object(
      'ok', true,
      'hostSigState', (select host_sig_state from public.pvp_live_matches where id = _match_id),
      'guestSigState', (select guest_sig_state from public.pvp_live_matches where id = _match_id)
    );
  end if;

  v_self_suppressed := case when v_i_am_host then v_match.host_suppressed_until else v_match.guest_suppressed_until end;
  v_opp_suppressed := case when v_i_am_host then v_match.guest_suppressed_until else v_match.host_suppressed_until end;
  v_is_weather := _pokemon_id in (382, 383) and _phase = 'post_answer';

  if _phase <> 'battle_start' and v_qidx < v_self_suppressed then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'suppressed');
  end if;

  if v_is_weather and (v_match.host_partner_id = 384 or v_match.guest_partner_id = 384) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'weather_negated');
  end if;

  if v_is_weather and v_match.weather_owner is not null then
    if (v_match.weather_owner = 'host' and v_match.host_partner_id in (382, 383) and v_match.host_partner_id <> _pokemon_id)
       or (v_match.weather_owner = 'guest' and v_match.guest_partner_id in (382, 383) and v_match.guest_partner_id <> _pokemon_id) then
      return jsonb_build_object('ok', true, 'noop', true, 'reason', 'weather_non_owner');
    end if;
  end if;

  v_my_post_idx := case when v_i_am_host then v_match.host_post_answer_last_idx else v_match.guest_post_answer_last_idx end;
  if _phase = 'post_answer' and v_qidx <= v_my_post_idx then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'post_answer_replay');
  end if;

  if _phase = 'battle_start' then
    if v_i_am_host and v_match.host_ability_started then
      return jsonb_build_object('ok', true, 'noop', true);
    elsif (not v_i_am_host) and v_match.guest_ability_started then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  end if;

  if _phase = 'manual' then
    select coalesce(max((payload->>'uses')::int), 0) into v_cap
      from public.pvp_signature_effects
      where pokemon_id = _pokemon_id and phase = 'manual';
    if v_cap <= 0 then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
    v_my_fires := case when v_i_am_host then v_match.host_manual_fires else v_match.guest_manual_fires end;
    if v_my_fires >= v_cap then
      return jsonb_build_object('ok', true, 'noop', true, 'reason', 'no_charges');
    end if;
  end if;

  v_self_stages := case when v_i_am_host then v_match.host_stages else v_match.guest_stages end;
  v_self_statuses := case when v_i_am_host then v_match.host_statuses else v_match.guest_statuses end;
  v_self_hp := case when v_i_am_host then v_match.host_hp else v_match.guest_hp end;
  v_opp_stages := case when v_i_am_host then v_match.guest_stages else v_match.host_stages end;
  v_opp_statuses := case when v_i_am_host then v_match.guest_statuses else v_match.host_statuses end;
  v_opp_hp := case when v_i_am_host then v_match.guest_hp else v_match.host_hp end;

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
    elsif v_row.kind = 'suppress_ability' then
      v_dur := coalesce((v_row.payload->>'questions')::int, 3);
      v_opp_suppressed := greatest(v_opp_suppressed, v_qidx + 1 + v_dur);
      v_touched_opponent := true;
    elsif v_row.kind = 'swap_stages' then
      declare
        v_low_stat text; v_low_val int := 2147483647;
        v_high_stat text; v_high_val int := -2147483648;
        v_k text; v_v int;
        v_swap_applied boolean := false;
      begin
        foreach v_k in array array['attack','defense','speed','crit'] loop
          v_v := coalesce((v_self_stages->>v_k)::int, 0);
          if v_v < v_low_val then v_low_val := v_v; v_low_stat := v_k; end if;
        end loop;
        foreach v_k in array array['attack','defense','speed','crit'] loop
          v_v := coalesce((v_opp_stages->>v_k)::int, 0);
          if v_v > v_high_val then v_high_val := v_v; v_high_stat := v_k; end if;
        end loop;
        if v_high_val > 0 then
          v_self_stages := public._pvp_bump_stage(v_self_stages, v_high_stat, v_high_val);
          v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_high_stat, -v_high_val);
          v_touched_opponent := true;
          v_swap_applied := true;
        end if;
        if v_low_val < 0 then
          v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_low_stat, v_low_val);
          v_self_stages := public._pvp_bump_stage(v_self_stages, v_low_stat, -v_low_val);
          v_touched_opponent := true;
          v_swap_applied := true;
        end if;
        v_did_apply := v_swap_applied;
      end;
    elsif v_row.kind = 'cleanse' then
      v_amount := round(greatest(0, v_self_hp) * coalesce((v_row.payload->>'hpCostPct')::numeric, 15) / 100.0)::int;
      v_self_hp := greatest(0, v_self_hp - v_amount);
      v_self_stages := jsonb_build_object(
        'attack', greatest(0, coalesce((v_self_stages->>'attack')::int, 0)),
        'defense', greatest(0, coalesce((v_self_stages->>'defense')::int, 0)),
        'speed', greatest(0, coalesce((v_self_stages->>'speed')::int, 0)),
        'crit', coalesce((v_self_stages->>'crit')::int, 0)
      );
      v_self_statuses := '[]'::jsonb;
    elsif v_row.kind = 'dot_frac_hp' then
      v_amount := round(120 * coalesce((v_row.payload->>'pct')::numeric, 0))::int;
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'frac_hp_random' then
      declare
        v_min numeric := coalesce((v_row.payload->>'minPct')::numeric, 0);
        v_max numeric := coalesce((v_row.payload->>'maxPct')::numeric, 0);
      begin
        v_amount := round(120 * (v_min + random() * greatest(0, v_max - v_min)))::int;
      end;
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'flat_next_question_damage' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'reflect_opponent_stat' then
      declare
        v_k text; v_v int; v_did_reflect boolean := false;
      begin
        foreach v_k in array array['attack','defense','speed','crit'] loop
          v_v := coalesce((v_self_stages->>v_k)::int, 0);
          if v_v < 0 then
            v_self_stages := public._pvp_bump_stage(v_self_stages, v_k, -2 * v_v);
            v_did_reflect := true;
          end if;
        end loop;
        v_did_apply := v_did_reflect;
      end;
    elsif v_row.kind = 'predicted_status_apply' then
      declare
        v_runtime jsonb;
        v_pred text;
      begin
        v_runtime := case when v_i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
        v_pred := coalesce(v_runtime, '{}'::jsonb) #>> array[_pokemon_id::text, 'predictedStatus'];
        if v_pred is null then
          v_did_apply := false;
        else
          v_opp_statuses := public._pvp_apply_status(
            v_opp_statuses, v_pred, coalesce((v_row.payload->>'questions')::int, 3));
          v_touched_opponent := true;
        end if;
      end;
    else
      v_did_apply := false;
    end if;
    if v_did_apply then
      v_applied := v_applied + 1;
    end if;
  end loop;

  if v_applied = 0 then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  v_arm_sword_of_ruin := _phase = 'manual' and _pokemon_id = 1002;

  if v_i_am_host then
    update public.pvp_live_matches set
      host_hp = v_self_hp, guest_hp = v_opp_hp,
      host_stages = v_self_stages, host_statuses = v_self_statuses,
      guest_stages = v_opp_stages, guest_statuses = v_opp_statuses,
      guest_suppressed_until = v_opp_suppressed,
      weather_owner = case when v_is_weather then 'host' else weather_owner end,
      host_ability_started = host_ability_started or (_phase = 'battle_start'),
      host_manual_fires = host_manual_fires + (case when _phase = 'manual' then 1 else 0 end),
      host_post_answer_last_idx = case when _phase = 'post_answer' then greatest(host_post_answer_last_idx, v_qidx) else host_post_answer_last_idx end,
      host_sword_of_ruin_charges = case when v_arm_sword_of_ruin then 2 else host_sword_of_ruin_charges end
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp, host_hp = v_opp_hp,
      guest_stages = v_self_stages, guest_statuses = v_self_statuses,
      host_stages = v_opp_stages, host_statuses = v_opp_statuses,
      host_suppressed_until = v_opp_suppressed,
      weather_owner = case when v_is_weather then 'guest' else weather_owner end,
      guest_ability_started = guest_ability_started or (_phase = 'battle_start'),
      guest_manual_fires = guest_manual_fires + (case when _phase = 'manual' then 1 else 0 end),
      guest_post_answer_last_idx = case when _phase = 'post_answer' then greatest(guest_post_answer_last_idx, v_qidx) else guest_post_answer_last_idx end,
      guest_sword_of_ruin_charges = case when v_arm_sword_of_ruin then 2 else guest_sword_of_ruin_charges end
    where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (
    _match_id, v_qidx, v_uid,
    case when v_touched_opponent then 'opponent' else 'self' end,
    null, 'ability', _pokemon_id, 'stat_stage', jsonb_build_object('phase', _phase)
  );

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages, 'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses, 'guestStatuses', v_match.guest_statuses,
    'hostSuppressedUntil', v_match.host_suppressed_until,
    'guestSuppressedUntil', v_match.guest_suppressed_until,
    'weatherOwner', v_match.weather_owner,
    'hostSigState', v_match.host_sig_state,
    'guestSigState', v_match.guest_sig_state
  );
end;
$function$;

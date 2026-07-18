-- Live PvP Phase 4/5 cutover, slice 4: new service-role-only apply RPCs.
--
-- These back the new `pvp-live-resolve-turn` Edge Function (deployed DARK in
-- this same slice -- not called by the client yet, and the OLD
-- submit_pvp_live_answer/submit_bot_pvp_move RPCs keep their `authenticated`
-- grant untouched). The actual flip -- client cutover + revoking the old
-- RPCs' grant -- is its own later, most-carefully-reviewed step.
--
-- Both new RPCs are granted to `service_role` ONLY, never `authenticated` --
-- this is what actually makes the Edge Function load-bearing. Without
-- revoking `authenticated` here, a client could still call these directly
-- with its own numbers, same as the exploit this whole plan closes.
--
-- Human path (apply_pvp_live_answer_v2): mirrors submit_pvp_live_answer's
-- exact locking/HP/revive/poison/winner-resolution body (verified via
-- pg_get_functiondef), but:
--   - independently re-derives `v_correct` from `_selected_index` vs the
--     immutable `questions` array (defense in depth -- even a buggy Edge
--     Function can't grant a bogus win: a wrong answer always zeros
--     `_edge_dmg` here regardless of what was passed).
--   - independently re-derives streak/wrong-streak/confused-ticks in SQL
--     (the same simple, already-proven rule) using the Edge Function's
--     `_confusion_missed` flag (resolvePvpAnswer's own authoritative
--     confusion-miss roll) instead of inferring it from `dmg = 0`, which was
--     only ever a heuristic proxy.
--   - trusts `_next_state` for the REST of PvpEngineState (sigLatched,
--     moxieStacks, wrongCount, hadWrong, sturdyUsed, prevCorrect,
--     prevAnswerElapsedMs, swordOfRuinCharges) -- these depend on the
--     signature/type-ability catalogs that only exist in TS; re-deriving
--     them in SQL would be exactly the "two vocabularies, one word"
--     duplicate-implementation trap this repo's CLAUDE.md warns about.
--
-- Bot-mirror path (apply_bot_pvp_move_v2): the bot has no independent "true
-- answer" to re-verify against -- the Edge Function IS the sole authority
-- for its outcome (rolled from the persisted guest_bot_profile), so this
-- trusts `_next_state` wholesale for the bot's side, same as
-- submit_bot_pvp_move already did for HP/stages/statuses.

create or replace function public.apply_pvp_live_answer_v2(
  _match_id uuid,
  _question_index integer,
  _selected_index integer,
  _time_ms integer,
  _edge_dmg integer,
  _edge_self_dmg integer,
  _confusion_missed boolean,
  _next_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_i_am_host boolean;
  v_last_idx int;
  v_dmg int := greatest(0, least(60, coalesce(_edge_dmg, 0)));
  v_self_dmg int := greatest(0, least(60, coalesce(_edge_self_dmg, 0)));
  v_my_hp int;
  v_opp_hp int;
  v_pre_hp int;
  v_resolved boolean := false;
  v_winner uuid;
  v_h_acc numeric;
  v_g_acc numeric;
  v_h_avg numeric;
  v_g_avg numeric;
  v_my_revived boolean;
  v_my_stages jsonb;
  v_my_statuses jsonb;
  v_my_bonus_until int;
  v_my_bonus_prev int;
  v_pre_opp_hp int;
  v_opp_revived boolean;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
  v_opp_bonus_until int;
  v_q_no int := greatest(0, _question_index) + 1;
  v_my_dex int;
  v_opp_dex int;
  v_my_runtime jsonb;
  v_opp_runtime jsonb;
  v_shield_pct int;
  v_poison jsonb;
  v_poisoned_statuses jsonb;
  v_correct boolean;
  v_streak int;
  v_wrong_streak int;
  v_confused_ticks int;
  v_streak_before int;
  v_wrong_streak_before int;
  v_confused_ticks_before int;
  v_my_hp_before int;
  v_opp_hp_before int;
  v_my_stages_before jsonb;
  v_opp_stages_before jsonb;
  v_my_statuses_before jsonb;
  v_my_ability_id text;
  v_my_sig_state jsonb;
  v_pokedex_count int;
  v_question jsonb;
  v_runtime_snapshot jsonb;
  v_client_report jsonb;
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
  v_last_idx := case when v_i_am_host then v_match.host_last_submitted_idx else v_match.guest_last_submitted_idx end;
  if _question_index <= v_last_idx then
    return jsonb_build_object(
      'ok', true,
      'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
      'resolved', v_match.status = 'completed'
    );
  end if;
  if _question_index >= 20 then
    return jsonb_build_object('ok', false, 'error', 'out_of_range');
  end if;

  -- Defense in depth: correctness is re-derived here, from the immutable
  -- `questions` array, never trusted from the Edge Function's claim. A
  -- genuinely wrong (or timed-out) answer always zeros damage, regardless
  -- of what `_edge_dmg` says.
  v_correct := _selected_index is not null
    and (v_match.questions -> greatest(0, _question_index) ->> 'correct')::int = _selected_index;
  if not v_correct then
    v_dmg := 0;
  end if;

  v_streak_before := case when v_i_am_host then v_match.host_streak_live else v_match.guest_streak_live end;
  v_wrong_streak_before := case when v_i_am_host then v_match.host_wrong_streak_live else v_match.guest_wrong_streak_live end;
  v_confused_ticks_before := case when v_i_am_host then v_match.host_confused_ticks_live else v_match.guest_confused_ticks_live end;
  if v_correct then
    v_wrong_streak := 0;
    if v_confused_ticks_before > 0 and coalesce(_confusion_missed, false) then
      v_confused_ticks := v_confused_ticks_before - 1;
      v_streak := 0;
    else
      v_confused_ticks := v_confused_ticks_before;
      v_streak := v_streak_before + 1;
    end if;
  else
    v_streak := 0;
    v_wrong_streak := v_wrong_streak_before + 1;
    v_confused_ticks := case when v_wrong_streak = 2 then 2 else v_confused_ticks_before end;
  end if;

  v_my_dex := case
    when v_i_am_host then (case when v_match.host_partner_id = 151 then v_match.host_transform_id else v_match.host_partner_id end)
    else (case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end)
  end;
  v_opp_dex := case
    when v_i_am_host then (case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end)
    else (case when v_match.host_partner_id = 151 then v_match.host_transform_id else v_match.host_partner_id end)
  end;
  v_my_runtime  := case when v_i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
  v_opp_runtime := case when v_i_am_host then v_match.guest_sig_runtime else v_match.host_sig_runtime end;

  v_my_hp_before := case when v_i_am_host then v_match.host_hp else v_match.guest_hp end;
  v_opp_hp_before := case when v_i_am_host then v_match.guest_hp else v_match.host_hp end;
  v_my_stages_before := case when v_i_am_host then v_match.host_stages else v_match.guest_stages end;
  v_opp_stages_before := case when v_i_am_host then v_match.guest_stages else v_match.host_stages end;
  v_my_statuses_before := case when v_i_am_host then v_match.host_statuses else v_match.guest_statuses end;
  v_my_ability_id := case when v_i_am_host then v_match.host_ability_id else v_match.guest_ability_id end;
  v_my_sig_state := case when v_i_am_host then v_match.host_sig_state else v_match.guest_sig_state end;
  select p.pokedex_count into v_pokedex_count from public.profiles p
    where p.id = (case when v_i_am_host then v_match.host_id else v_match.guest_id end);
  v_question := v_match.questions -> greatest(0, _question_index);

  v_runtime_snapshot := jsonb_build_object(
    'myDex', v_my_dex,
    'oppDex', v_opp_dex,
    'myPartnerId', case when v_i_am_host then v_match.host_partner_id else v_match.guest_partner_id end,
    'oppPartnerId', case when v_i_am_host then v_match.guest_partner_id else v_match.host_partner_id end,
    'myHp', v_my_hp_before,
    'oppHp', v_opp_hp_before,
    'myStages', v_my_stages_before,
    'oppStages', v_opp_stages_before,
    'myStatuses', v_my_statuses_before,
    'myAbilityId', v_my_ability_id,
    'mySigRuntime', v_my_runtime,
    'mySigState', v_my_sig_state,
    'mySuppressedUntil', case when v_i_am_host then v_match.host_suppressed_until else v_match.guest_suppressed_until end,
    'streakBefore', v_streak_before,
    'wrongStreakBefore', v_wrong_streak_before,
    'confusedTicksBefore', v_confused_ticks_before,
    'pokedexCount', coalesce(v_pokedex_count, 0),
    'question', v_question,
    'questionIndex', _question_index
  );
  -- Post-cutover this is a production audit log, not a trust-gap shadow log:
  -- `dmg`/`selfDmg` here are what the AUTHORITATIVE (Edge Function + this
  -- RPC's defense-in-depth) path actually applied, not a client claim.
  v_client_report := jsonb_build_object(
    'correct', v_correct,
    'dmg', v_dmg,
    'selfDmg', v_self_dmg,
    'timeMs', _time_ms,
    'selectedIndex', _selected_index
  );
  insert into public.pvp_live_answer_shadow_log (
    match_id, question_index, side, verified_correct, runtime_snapshot, client_report
  ) values (
    _match_id, _question_index, case when v_i_am_host then 'host' else 'guest' end,
    v_correct, v_runtime_snapshot, v_client_report
  );

  if public._pvp_m4_window_active(v_opp_runtime, v_opp_dex, 'shieldThroughQ', v_q_no) then
    v_shield_pct := coalesce(((v_opp_runtime -> v_opp_dex::text) ->> 'shieldPct')::int, 0);
    v_dmg := round(v_dmg * greatest(0, least(100, v_shield_pct)) / 100.0)::int;
  end if;

  if public._pvp_index_shield_zero(v_opp_runtime, v_opp_dex, v_q_no) then
    v_dmg := 0;
  end if;

  if v_my_dex is not null and v_my_runtime is not null
     and coalesce(((v_my_runtime -> v_my_dex::text) ->> 'selfDmgZero')::boolean, false)
     and not coalesce(((v_my_runtime -> v_my_dex::text) ->> 'disabled')::boolean, false) then
    v_self_dmg := 0;
  end if;

  v_poison := public._pvp_poison_tick(
    case when v_i_am_host then v_match.host_statuses else v_match.guest_statuses end
  );
  v_self_dmg := v_self_dmg + coalesce((v_poison->>'dmg')::int, 0);
  v_poisoned_statuses := v_poison->'statuses';

  if v_i_am_host then
    v_pre_hp := v_match.host_hp - v_self_dmg;
    v_my_bonus_prev := v_match.host_revive_bonus_until;
    if v_pre_hp <= 0 and v_match.host_partner_id = 250 and not coalesce(v_match.host_revived, false) then
      v_my_hp := round(120 * 0.25)::int;
      v_my_revived := true;
      v_my_stages := public._pvp_bump_stage(v_match.host_stages, 'attack', 1);
      v_my_statuses := public._pvp_cure_status(v_match.host_statuses, 'any');
      v_my_bonus_until := _question_index + 1 + 2;
    else
      v_my_hp := greatest(0, v_pre_hp);
      v_my_revived := v_match.host_revived;
      v_my_stages := v_match.host_stages;
      v_my_statuses := v_poisoned_statuses;
      v_my_bonus_until := v_match.host_revive_bonus_until;
    end if;
    v_pre_opp_hp := v_match.guest_hp - v_dmg;
    if v_pre_opp_hp <= 0 and v_match.guest_partner_id = 250 and not coalesce(v_match.guest_revived, false) then
      v_opp_hp := round(120 * 0.25)::int;
      v_opp_revived := true;
      v_opp_stages := public._pvp_bump_stage(v_match.guest_stages, 'attack', 1);
      v_opp_statuses := public._pvp_cure_status(v_match.guest_statuses, 'any');
      v_opp_bonus_until := _question_index + 1 + 2;
    else
      v_opp_hp := greatest(0, v_pre_opp_hp);
      v_opp_revived := v_match.guest_revived;
      v_opp_stages := v_match.guest_stages;
      v_opp_statuses := v_match.guest_statuses;
      v_opp_bonus_until := v_match.guest_revive_bonus_until;
    end if;
    update public.pvp_live_matches set
      host_hp = v_my_hp,
      guest_hp = v_opp_hp,
      host_revived = v_my_revived,
      host_stages = v_my_stages,
      host_statuses = v_my_statuses,
      host_revive_bonus_until = v_my_bonus_until,
      guest_revived = v_opp_revived,
      guest_stages = v_opp_stages,
      guest_statuses = v_opp_statuses,
      guest_revive_bonus_until = v_opp_bonus_until,
      host_correct_live = host_correct_live + (case when v_correct then 1 else 0 end),
      host_answered_live = host_answered_live + 1,
      host_time_ms_live = host_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      host_last_submitted_idx = _question_index,
      host_streak_live = v_streak,
      host_wrong_streak_live = v_wrong_streak,
      host_confused_ticks_live = v_confused_ticks,
      host_sig_latched = coalesce((_next_state->>'sigLatched')::boolean, host_sig_latched),
      host_moxie_stacks = coalesce((_next_state->>'moxieStacks')::int, host_moxie_stacks),
      host_wrong_count = coalesce((_next_state->>'wrongCount')::int, host_wrong_count),
      host_had_wrong = coalesce((_next_state->>'hadWrong')::boolean, host_had_wrong),
      host_sturdy_used = coalesce((_next_state->>'sturdyUsed')::boolean, host_sturdy_used),
      host_prev_correct = coalesce((_next_state->>'prevCorrect')::boolean, v_correct),
      host_prev_answer_elapsed_ms = coalesce((_next_state->>'prevAnswerElapsedMs')::int, greatest(0, coalesce(_time_ms, 0))),
      host_sword_of_ruin_charges = coalesce((_next_state->>'swordOfRuinCharges')::int, host_sword_of_ruin_charges)
    where id = _match_id;

    if v_correct and _question_index < v_my_bonus_prev and random() < 0.5 then
      update public.pvp_live_matches set
        guest_statuses = public._pvp_apply_status(guest_statuses, 'burn', 3)
      where id = _match_id;
    end if;
  else
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
      v_my_statuses := v_poisoned_statuses;
      v_my_bonus_until := v_match.guest_revive_bonus_until;
    end if;
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
      guest_correct_live = guest_correct_live + (case when v_correct then 1 else 0 end),
      guest_answered_live = guest_answered_live + 1,
      guest_time_ms_live = guest_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      guest_last_submitted_idx = _question_index,
      guest_streak_live = v_streak,
      guest_wrong_streak_live = v_wrong_streak,
      guest_confused_ticks_live = v_confused_ticks,
      guest_sig_latched = coalesce((_next_state->>'sigLatched')::boolean, guest_sig_latched),
      guest_moxie_stacks = coalesce((_next_state->>'moxieStacks')::int, guest_moxie_stacks),
      guest_wrong_count = coalesce((_next_state->>'wrongCount')::int, guest_wrong_count),
      guest_had_wrong = coalesce((_next_state->>'hadWrong')::boolean, guest_had_wrong),
      guest_sturdy_used = coalesce((_next_state->>'sturdyUsed')::boolean, guest_sturdy_used),
      guest_prev_correct = coalesce((_next_state->>'prevCorrect')::boolean, v_correct),
      guest_prev_answer_elapsed_ms = coalesce((_next_state->>'prevAnswerElapsedMs')::int, greatest(0, coalesce(_time_ms, 0))),
      guest_sword_of_ruin_charges = coalesce((_next_state->>'swordOfRuinCharges')::int, guest_sword_of_ruin_charges)
    where id = _match_id;

    if v_correct and _question_index < v_my_bonus_prev and random() < 0.5 then
      update public.pvp_live_matches set
        host_statuses = public._pvp_apply_status(host_statuses, 'burn', 3)
      where id = _match_id;
    end if;
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
      status = 'completed',
      winner_id = v_winner,
      live_resolved_at = now()
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

revoke all on function public.apply_pvp_live_answer_v2(uuid, integer, integer, integer, integer, integer, boolean, jsonb) from public, authenticated, anon;
grant execute on function public.apply_pvp_live_answer_v2(uuid, integer, integer, integer, integer, integer, boolean, jsonb) to service_role;

-- Bot-mirror path. Unlike the human RPC above, there is no independent "true
-- answer" to re-derive -- the Edge Function IS the sole authority for the
-- bot's outcome (rolled from guest_bot_profile), so this trusts `_next_state`
-- wholesale for the bot's (guest) engine-state columns, same trust level
-- submit_bot_pvp_move already had for HP/stages/statuses.
create or replace function public.apply_bot_pvp_move_v2(
  _match_id uuid,
  _question_index integer,
  _correct boolean,
  _dmg integer,
  _self_dmg integer,
  _time_ms integer,
  _next_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_last_idx int;
  v_dmg int := greatest(0, least(60, coalesce(_dmg, 0)));
  v_self_dmg int := greatest(0, least(60, coalesce(_self_dmg, 0)));
  v_my_hp int; v_opp_hp int; v_pre_hp int; v_pre_opp_hp int;
  v_my_revived boolean; v_my_stages jsonb; v_my_statuses jsonb; v_my_bonus_until int; v_my_bonus_prev int;
  v_opp_revived boolean; v_opp_stages jsonb; v_opp_statuses jsonb; v_opp_bonus_until int;
  v_resolved boolean := false;
  v_winner uuid;
  v_h_acc numeric; v_g_acc numeric; v_h_avg numeric; v_g_avg numeric;
  v_my_dex int; v_opp_dex int; v_pokedex_count int;
  v_question jsonb; v_runtime_snapshot jsonb; v_client_report jsonb;
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

  if _correct then v_self_dmg := 0; else v_dmg := 0; end if;

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
    guest_last_submitted_idx = _question_index,
    guest_streak_live = coalesce((_next_state->>'streakLive')::int, guest_streak_live),
    guest_wrong_streak_live = coalesce((_next_state->>'wrongStreakLive')::int, guest_wrong_streak_live),
    guest_confused_ticks_live = coalesce((_next_state->>'confusedTicksLive')::int, guest_confused_ticks_live),
    guest_sig_latched = coalesce((_next_state->>'sigLatched')::boolean, guest_sig_latched),
    guest_moxie_stacks = coalesce((_next_state->>'moxieStacks')::int, guest_moxie_stacks),
    guest_wrong_count = coalesce((_next_state->>'wrongCount')::int, guest_wrong_count),
    guest_had_wrong = coalesce((_next_state->>'hadWrong')::boolean, guest_had_wrong),
    guest_sturdy_used = coalesce((_next_state->>'sturdyUsed')::boolean, guest_sturdy_used),
    guest_prev_correct = coalesce((_next_state->>'prevCorrect')::boolean, _correct),
    guest_prev_answer_elapsed_ms = coalesce((_next_state->>'prevAnswerElapsedMs')::int, greatest(0, coalesce(_time_ms, 0))),
    guest_sword_of_ruin_charges = coalesce((_next_state->>'swordOfRuinCharges')::int, guest_sword_of_ruin_charges)
  where id = _match_id;

  if _correct and _question_index < v_my_bonus_prev and random() < 0.5 then
    update public.pvp_live_matches set
      host_statuses = public._pvp_apply_status(host_statuses, 'burn', 3)
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;

  v_my_dex := case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end;
  v_opp_dex := case when v_match.host_partner_id = 151 then v_match.host_transform_id else v_match.host_partner_id end;
  select p.pokedex_count into v_pokedex_count from public.profiles p where p.id = v_match.guest_id;
  v_question := v_match.questions -> greatest(0, _question_index);

  v_runtime_snapshot := jsonb_build_object(
    'myDex', v_my_dex, 'oppDex', v_opp_dex,
    'myPartnerId', v_match.guest_partner_id, 'oppPartnerId', v_match.host_partner_id,
    'myHp', v_my_hp, 'oppHp', v_opp_hp,
    'myStages', v_my_stages, 'oppStages', v_opp_stages,
    'myStatuses', v_my_statuses, 'myAbilityId', v_match.guest_ability_id,
    'mySigRuntime', v_match.guest_sig_runtime, 'mySigState', v_match.guest_sig_state,
    'mySuppressedUntil', v_match.guest_suppressed_until,
    'streakBefore', coalesce((_next_state->>'streakLive')::int, 0),
    'wrongStreakBefore', coalesce((_next_state->>'wrongStreakLive')::int, 0),
    'confusedTicksBefore', coalesce((_next_state->>'confusedTicksLive')::int, 0),
    'pokedexCount', coalesce(v_pokedex_count, 0),
    'question', v_question, 'questionIndex', _question_index
  );
  v_client_report := jsonb_build_object(
    'correct', _correct, 'dmg', v_dmg, 'selfDmg', v_self_dmg, 'timeMs', _time_ms, 'selectedIndex', null
  );
  insert into public.pvp_live_answer_shadow_log (
    match_id, question_index, side, verified_correct, runtime_snapshot, client_report
  ) values (
    _match_id, _question_index, 'guest', _correct, v_runtime_snapshot, v_client_report
  );

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

revoke all on function public.apply_bot_pvp_move_v2(uuid, integer, boolean, integer, integer, integer, jsonb) from public, authenticated, anon;
grant execute on function public.apply_bot_pvp_move_v2(uuid, integer, boolean, integer, integer, integer, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Signature-ability balance pass (owner rulings 2026-07-13)
--
-- Driven by a 2.1-million-battle simulation of every Legendary/Mythical against
-- every other (scripts/balance-sim). Win rates ran from 86% down to 34% where a
-- balanced roster sits at 50%. Three of the findings were BUGS, not tuning:
--
--   1. The four Paradox rows (#1020/#1021/#1022/#1023) trigger on "self HP below
--      50%". That is a STATE, not an event — it stays true for every remaining
--      question — so the expiry below, which only ran on a question where the
--      trigger did NOT fire, never ran at all. Iron Boulder's "no damage for 3
--      questions" became "no damage for the rest of the battle" (86% win rate,
--      95% into Rayquaza). Fixed by anchoring the window to the question it
--      OPENED on and closing it N questions later even while the trigger is held.
--
--   2. `shield.receivePct` was never sent to the server: `_pvp_m4_window_apply`
--      took only `_shield_questions`, and `submit_pvp_live_answer` hard-zeroed the
--      damage. So a shield could only ever be total. The percentage is now read
--      SERVER-SIDE off `pvp_signature_effects` (phase `m4_window`), keeping the
--      trust model intact — the client still only names the phase.
--
--   3. Poison dealt NO damage in live PvP. Solo drains HP on a real-time timer;
--      the PvP loop never got an equivalent, so six poison-based signatures landed
--      a status that did nothing. Proof from the sim: Spectrier's GUARANTEED
--      badly-poison was worth +6pp, while the identically-shaped Glastrier with a
--      guaranteed Freeze was worth +12pp. Poison now bites per question.
--
-- Everything else here is a magnitude the owner chose from the simulation report.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Poison damage-over-time (new mechanic, owner ruling) ──────────────────
-- Poisoned chips a flat 5 HP each question. Badly-poisoned RAMPS (5, 10, 15…)
-- like the mainline games, tracked by a `ticks` counter on the status entry
-- itself so it needs no new column. Returns both the damage and the advanced
-- status array, so the caller writes back exactly what it charged for.
create or replace function public._pvp_poison_tick(_statuses jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_dmg int := 0;
  v_ticks int;
begin
  for v_item in select * from jsonb_array_elements(coalesce(_statuses, '[]'::jsonb))
  loop
    if v_item->>'kind' = 'poisoned' then
      v_dmg := v_dmg + 5;
    elsif v_item->>'kind' = 'badly-poisoned' then
      v_ticks := coalesce((v_item->>'ticks')::int, 0) + 1;
      -- Cap the ramp at 4 ticks (20 HP) so a long badly-poison cannot run away
      -- with the match on its own.
      v_dmg := v_dmg + (5 * least(v_ticks, 4));
      v_item := v_item || jsonb_build_object('ticks', v_ticks);
    end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('dmg', v_dmg, 'statuses', v_out);
end;
$function$;

-- ── 2. Shield percentage, read server-side ───────────────────────────────────
-- The receive-% for a dex's shield, off `pvp_signature_effects`. Absent row = 0
-- (a total shield), which is what every shield did before this migration.
create or replace function public._pvp_shield_pct(_dex integer)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select (payload->>'receivePct')::int
       from public.pvp_signature_effects
      where pokemon_id = _dex and phase = 'm4_window' and kind = 'shield'
      limit 1),
    0
  );
$function$;

-- `_pvp_m4_window_apply` now stamps the shield's receive-% into runtime alongside
-- the window, so the defender's row carries everything the damage clamp needs.
create or replace function public._pvp_m4_window_apply(_match_id uuid, _i_am_host boolean, _question_index integer, _pokemon_id integer, _shield_questions integer, _self_dmg_zero boolean, _opp_timer_ms integer, _opp_timer_questions integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_match public.pvp_live_matches;
  v_runtime jsonb;
  v_dex text := _pokemon_id::text;
  v_entry jsonb;
  v_q_no int := greatest(0, _question_index) + 1;
  v_shield_q int;
  v_timer_ms int;
  v_timer_q int;
begin
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if public._pvp_m4_row_disabled(v_match, _i_am_host, _pokemon_id) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'row_disabled');
  end if;

  v_runtime := case when _i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
  v_entry := coalesce(coalesce(v_runtime, '{}'::jsonb) -> v_dex, '{}'::jsonb);

  if coalesce((v_entry->>'disabled')::boolean, false) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'disabled');
  end if;

  if coalesce(_shield_questions, 0) > 0 then
    v_shield_q := least(greatest(_shield_questions, 1), 5);
    v_entry := v_entry || jsonb_build_object(
      'shieldThroughQ', v_q_no + v_shield_q - 1,
      -- Server-owned magnitude: the client named the phase, the server prices it.
      'shieldPct', public._pvp_shield_pct(_pokemon_id)
    );
  end if;

  if coalesce(_self_dmg_zero, false) then
    v_entry := v_entry || jsonb_build_object('selfDmgZero', true);
  end if;

  if coalesce(_opp_timer_ms, 0) > 0 and coalesce(_opp_timer_questions, 0) > 0 then
    v_timer_ms := greatest(least(_opp_timer_ms, 20000), 3000);
    v_timer_q  := least(greatest(_opp_timer_questions, 1), 5);
    v_entry := v_entry || jsonb_build_object(
      'oppTimerMs', v_timer_ms,
      'oppTimerThroughQ', v_q_no + v_timer_q - 1
    );
  end if;

  v_runtime := coalesce(v_runtime, '{}'::jsonb) || jsonb_build_object(v_dex, v_entry);
  if _i_am_host then
    update public.pvp_live_matches set host_sig_runtime = v_runtime where id = _match_id;
  else
    update public.pvp_live_matches set guest_sig_runtime = v_runtime where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostSigRuntime', v_match.host_sig_runtime,
    'guestSigRuntime', v_match.guest_sig_runtime
  );
end;
$function$;

-- ── 3. The engine tick: make a timed window actually close ───────────────────
create or replace function public._pvp_sig_engine_apply(_match_id uuid, _i_am_host boolean, _question_index integer, _pokemon_id integer, _correct boolean, _trigger_fired boolean, _stat_specs jsonb, _disable_kind text, _disable_n integer, _disable_next_question boolean, _stack_cap integer, _incorrect_stat_specs jsonb DEFAULT '[]'::jsonb, _expire_after_questions integer DEFAULT 0, _self_hp integer DEFAULT NULL::integer, _opp_hp integer DEFAULT NULL::integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_match public.pvp_live_matches;
  v_qidx int := greatest(0, _question_index);
  v_q_no int := greatest(0, _question_index) + 1;
  v_last_idx int;
  v_dex text := _pokemon_id::text;

  v_self_runtime jsonb;
  v_self_stages jsonb;
  v_opp_stages jsonb;

  v_entry jsonb;
  v_net jsonb;
  v_stacks int;
  v_consecutive_wrong int;
  v_disabled boolean;
  v_increase_disabled boolean;
  v_fired_this_battle boolean;
  v_phase_idx int;
  v_disabled_until_q int;
  v_already_fired boolean;
  v_skip_this_q boolean;
  v_did_apply boolean := false;
  v_ramp_arm boolean;
  v_did_ramp boolean;

  -- NEW: a timed window is anchored to the question it OPENED on, and is "spent"
  -- once it has closed, so a still-held trigger cannot immediately re-open it.
  v_win_open_q int;
  v_win_spent boolean;

  v_spec jsonb;
  v_mode_i text;
  v_stat_i text;
  v_target_i text;
  v_per_fire int;
  v_delta int;
  v_initial int;
  v_per_q int;
  v_floor int;

  v_key text;
  v_cur int;
  v_before int;
  v_after int;
  v_target_total int;
  v_incr int;

  v_tracked jsonb;
  v_reverted jsonb;

  v_predicted_status text;
  v_pending_strike int;
  v_wants_predicted boolean;
begin
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_last_idx := case when _i_am_host then v_match.host_sig_engine_last_idx else v_match.guest_sig_engine_last_idx end;
  if v_qidx <= v_last_idx then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'stale');
  end if;

  v_self_runtime := case when _i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
  v_self_stages := case when _i_am_host then v_match.host_stages else v_match.guest_stages end;
  v_opp_stages := case when _i_am_host then v_match.guest_stages else v_match.host_stages end;

  v_entry := coalesce(v_self_runtime->v_dex, '{}'::jsonb);
  v_net := coalesce(v_entry->'netByStat', '{}'::jsonb);
  v_stacks := coalesce((v_entry->>'stacks')::int, 0);
  v_consecutive_wrong := coalesce((v_entry->>'consecutiveWrong')::int, 0);
  v_disabled := coalesce((v_entry->>'disabled')::boolean, false);
  v_increase_disabled := coalesce((v_entry->>'increaseDisabled')::boolean, false);
  v_fired_this_battle := coalesce((v_entry->>'firedThisBattle')::boolean, false);
  v_phase_idx := coalesce((v_entry->>'phaseIdx')::int, 0);
  v_disabled_until_q := coalesce((v_entry->>'disabledUntilQ')::int, -1);
  v_win_open_q := coalesce((v_entry->>'winOpenQ')::int, 0);
  v_win_spent := coalesce((v_entry->>'winSpent')::boolean, false);
  v_already_fired := v_fired_this_battle;
  v_predicted_status := v_entry->>'predictedStatus';
  v_pending_strike := case when v_entry ? 'pendingStrikeAtQ' then (v_entry->>'pendingStrikeAtQ')::int else null end;
  v_wants_predicted := exists (
    select 1 from jsonb_array_elements(coalesce(_stat_specs, '[]'::jsonb)) e
    where e->>'mode' = 'predicted_status'
  );

  if _correct then
    v_consecutive_wrong := 0;
  else
    v_consecutive_wrong := v_consecutive_wrong + 1;
  end if;

  if not _correct then
    if _disable_kind = 'revert_stat_after_incorrect'
       and v_consecutive_wrong >= greatest(_disable_n, 1) then
      v_reverted := public._pvp_revert_ability_stat(
        v_self_stages, v_opp_stages,
        jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net, 'stacks', v_stacks)),
        v_dex
      );
      v_self_stages := v_reverted->'selfStages';
      v_opp_stages := v_reverted->'oppStages';
      v_net := coalesce(((v_reverted->'runtime')->v_dex)->'netByStat', '{}'::jsonb);
      v_stacks := 0;
      v_disabled := true;
    elsif _disable_kind = 'disable_increase_after_incorrect'
          and v_consecutive_wrong >= greatest(_disable_n, 1) then
      v_increase_disabled := true;
    elsif _disable_kind = 'disable_effect_after_incorrect'
          and v_consecutive_wrong >= greatest(_disable_n, 1) then
      v_disabled := true;
      v_reverted := public._pvp_revert_ability_stat(
        v_self_stages, v_opp_stages,
        jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net, 'stacks', v_stacks)),
        v_dex
      );
      v_self_stages := v_reverted->'selfStages';
      v_opp_stages := v_reverted->'oppStages';
      v_net := coalesce(((v_reverted->'runtime')->v_dex)->'netByStat', '{}'::jsonb);
      v_stacks := 0;
    end if;
  end if;
  if _disable_kind = 'once_per_battle' and v_fired_this_battle then
    v_disabled := true;
  end if;

  -- ── Timed window (was: `_expire_after_questions`) ──────────────────────────
  -- A question on which the trigger does NOT fire releases the row: the window it
  -- last spent no longer blocks a fresh one. (For an event trigger like a streak
  -- this is every quiet question; for an HP-state trigger it means healing back
  -- above the line.)
  if not _trigger_fired then
    v_win_spent := false;
  end if;

  -- Open a window on the fire that arms it.
  if _expire_after_questions > 0 and _trigger_fired and not v_win_spent and v_win_open_q = 0 then
    v_win_open_q := v_q_no;
  end if;

  -- Close it exactly N questions after it OPENED — even if the trigger is still
  -- held. This is the fix: the old test also required `not _trigger_fired`, and an
  -- HP-below-50% trigger never stops firing, so the window never closed.
  if _expire_after_questions > 0 and v_win_open_q > 0
     and v_q_no >= v_win_open_q + _expire_after_questions then
    v_reverted := public._pvp_revert_ability_stat(
      v_self_stages, v_opp_stages,
      jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net, 'stacks', v_stacks)),
      v_dex
    );
    v_self_stages := v_reverted->'selfStages';
    v_opp_stages := v_reverted->'oppStages';
    v_net := coalesce(((v_reverted->'runtime')->v_dex)->'netByStat', '{}'::jsonb);
    v_stacks := 0;
    v_disabled := true;
    v_win_spent := true;
    v_win_open_q := 0;
  end if;

  -- A live trigger re-arms the row — unless it has just spent its window and the
  -- trigger has not been released since. Without that guard the re-arm below would
  -- undo the close we just did, on the very next question.
  if _trigger_fired and _disable_kind <> 'once_per_battle' and not v_win_spent then
    v_disabled := false;
    v_increase_disabled := false;
  end if;
  if _trigger_fired then
    v_phase_idx := v_q_no;
    v_fired_this_battle := true;
  end if;

  if v_wants_predicted and _trigger_fired and not v_already_fired and v_predicted_status is null then
    v_predicted_status := (array['poisoned','burn','paralysis','sleep','freeze','confused'])[1 + floor(random() * 6)::int];
  end if;

  v_skip_this_q := _disable_next_question and (v_q_no = v_disabled_until_q);

  if not v_skip_this_q and not v_disabled then
    v_ramp_arm := (_trigger_fired or (_correct and v_already_fired and v_q_no > v_phase_idx))
                  and not v_increase_disabled and v_stacks < greatest(_stack_cap, 1);
    v_did_ramp := false;

    for v_spec in select value from jsonb_array_elements(coalesce(_stat_specs, '[]'::jsonb))
    loop
      v_mode_i := v_spec->>'mode';
      v_stat_i := v_spec->>'stat';
      v_target_i := coalesce(v_spec->>'target', 'self');
      if v_stat_i is null then
        continue;
      end if;

      if v_mode_i = 'ramp' then
        if v_ramp_arm then
          v_per_fire := coalesce((v_spec->>'perCorrect')::int, 0);
          v_tracked := public._pvp_bump_stage_tracked(
            case when v_target_i = 'opponent' then v_opp_stages else v_self_stages end,
            jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net)),
            v_dex, v_target_i, v_stat_i, v_per_fire, _stack_cap
          );
          if v_target_i = 'opponent' then v_opp_stages := v_tracked->'stages'; else v_self_stages := v_tracked->'stages'; end if;
          v_net := coalesce(((v_tracked->'runtime')->v_dex)->'netByStat', v_net);
          v_did_ramp := true;
          v_did_apply := true;
        end if;

      elsif v_mode_i = 'decay' then
        v_initial := coalesce((v_spec->>'initial')::int, 0);
        v_per_q := coalesce((v_spec->>'perQuestion')::int, 0);
        v_floor := coalesce((v_spec->>'floor')::int, 0);
        v_key := v_target_i || ':' || v_stat_i;
        v_cur := coalesce((v_net->>v_key)::int, 0);
        if _trigger_fired then
          if v_cur <> 0 then
            if v_target_i = 'opponent' then
              v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, -v_cur);
            else
              v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, -v_cur);
            end if;
          end if;
          if v_target_i = 'opponent' then
            v_before := coalesce((v_opp_stages->>v_stat_i)::int, 0);
            v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, v_initial);
            v_after := coalesce((v_opp_stages->>v_stat_i)::int, 0);
          else
            v_before := coalesce((v_self_stages->>v_stat_i)::int, 0);
            v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, v_initial);
            v_after := coalesce((v_self_stages->>v_stat_i)::int, 0);
          end if;
          v_net := v_net || jsonb_build_object(v_key, v_after - v_before);
          v_did_apply := true;
        elsif v_q_no > v_phase_idx then
          if v_per_q < 0 then
            v_target_total := greatest(v_floor, v_cur + v_per_q);
          else
            v_target_total := least(v_floor, v_cur + v_per_q);
          end if;
          v_incr := v_target_total - v_cur;
          if v_incr <> 0 then
            if v_target_i = 'opponent' then
              v_before := coalesce((v_opp_stages->>v_stat_i)::int, 0);
              v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, v_incr);
              v_after := coalesce((v_opp_stages->>v_stat_i)::int, 0);
            else
              v_before := coalesce((v_self_stages->>v_stat_i)::int, 0);
              v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, v_incr);
              v_after := coalesce((v_self_stages->>v_stat_i)::int, 0);
            end if;
            v_net := v_net || jsonb_build_object(v_key, v_cur + (v_after - v_before));
            v_did_apply := true;
          end if;
        end if;

      elsif v_mode_i = 'one_shot' then
        if _trigger_fired and not v_already_fired then
          v_delta := coalesce((v_spec->>'delta')::int, 0);
          if v_stat_i = 'random' then
            declare
              v_snap jsonb;
              v_k text;
              v_b int;
              v_a int;
            begin
              if v_target_i = 'opponent' then
                v_snap := v_opp_stages;
                v_opp_stages := public._pvp_bump_stage(v_opp_stages, 'random', v_delta);
              else
                v_snap := v_self_stages;
                v_self_stages := public._pvp_bump_stage(v_self_stages, 'random', v_delta);
              end if;
              foreach v_k in array array['attack','defense','speed','crit'] loop
                v_b := coalesce((v_snap->>v_k)::int, 0);
                if v_target_i = 'opponent' then
                  v_a := coalesce((v_opp_stages->>v_k)::int, 0);
                else
                  v_a := coalesce((v_self_stages->>v_k)::int, 0);
                end if;
                if v_a <> v_b then
                  v_key := v_target_i || ':' || v_k;
                  v_net := v_net || jsonb_build_object(v_key, coalesce((v_net->>v_key)::int, 0) + (v_a - v_b));
                end if;
              end loop;
            end;
          else
            v_key := v_target_i || ':' || v_stat_i;
            if v_target_i = 'opponent' then
              v_before := coalesce((v_opp_stages->>v_stat_i)::int, 0);
              v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, v_delta);
              v_after := coalesce((v_opp_stages->>v_stat_i)::int, 0);
            else
              v_before := coalesce((v_self_stages->>v_stat_i)::int, 0);
              v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, v_delta);
              v_after := coalesce((v_self_stages->>v_stat_i)::int, 0);
            end if;
            v_net := v_net || jsonb_build_object(v_key, coalesce((v_net->>v_key)::int, 0) + (v_after - v_before));
          end if;
          v_did_apply := true;
        end if;
      end if;
    end loop;

    if not _correct and jsonb_array_length(coalesce(_incorrect_stat_specs, '[]'::jsonb)) > 0 then
      for v_spec in select value from jsonb_array_elements(coalesce(_incorrect_stat_specs, '[]'::jsonb))
      loop
        v_stat_i := v_spec->>'stat';
        v_target_i := coalesce(v_spec->>'target', 'self');
        if v_stat_i is null then
          continue;
        end if;
        v_per_fire := coalesce((v_spec->>'delta')::int, (v_spec->>'perCorrect')::int, 0);
        if v_per_fire = 0 then
          continue;
        end if;
        v_tracked := public._pvp_bump_stage_tracked(
          case when v_target_i = 'opponent' then v_opp_stages else v_self_stages end,
          jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net)),
          v_dex, v_target_i, v_stat_i, v_per_fire, 3
        );
        if v_target_i = 'opponent' then v_opp_stages := v_tracked->'stages'; else v_self_stages := v_tracked->'stages'; end if;
        v_net := coalesce(((v_tracked->'runtime')->v_dex)->'netByStat', v_net);
        v_did_apply := true;
        -- Hoopa #720: an `incorrectStat` penalty is now a TIMED window too, so the
        -- Defence it strips comes back instead of stacking to the floor forever.
        if _expire_after_questions > 0 and v_win_open_q = 0 and not v_win_spent then
          v_win_open_q := v_q_no;
        end if;
      end loop;
    end if;

    if v_did_ramp then
      v_stacks := least(greatest(_stack_cap, 1), v_stacks + 1);
    end if;
    if v_did_apply then
      v_phase_idx := v_q_no;
    end if;
  end if;

  if _disable_next_question then
    if v_skip_this_q then
      v_disabled_until_q := -1;
    elsif v_did_apply then
      v_disabled_until_q := v_q_no + 1;
    end if;
  end if;

  v_entry := jsonb_build_object(
    'stacks', v_stacks,
    'netByStat', coalesce(v_net, '{}'::jsonb),
    'consecutiveWrong', v_consecutive_wrong,
    'disabled', v_disabled,
    'increaseDisabled', v_increase_disabled,
    'firedThisBattle', v_fired_this_battle,
    'phaseIdx', v_phase_idx,
    'disabledUntilQ', v_disabled_until_q,
    'winOpenQ', v_win_open_q,
    'winSpent', v_win_spent
  );
  if v_predicted_status is not null then
    v_entry := v_entry || jsonb_build_object('predictedStatus', v_predicted_status);
  end if;
  if v_pending_strike is not null then
    v_entry := v_entry || jsonb_build_object('pendingStrikeAtQ', v_pending_strike);
  end if;
  v_self_runtime := coalesce(v_self_runtime, '{}'::jsonb) || jsonb_build_object(v_dex, v_entry);

  if _i_am_host then
    update public.pvp_live_matches set
      host_stages = v_self_stages,
      guest_stages = v_opp_stages,
      host_sig_runtime = v_self_runtime,
      host_sig_engine_last_idx = v_qidx
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_stages = v_self_stages,
      host_stages = v_opp_stages,
      guest_sig_runtime = v_self_runtime,
      guest_sig_engine_last_idx = v_qidx
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostStages', v_match.host_stages,
    'guestStages', v_match.guest_stages,
    'hostSigRuntime', v_match.host_sig_runtime,
    'guestSigRuntime', v_match.guest_sig_runtime
  );
end;
$function$;

-- ── 4. submit_pvp_live_answer: shield %, and the poison tick ─────────────────
create or replace function public.submit_pvp_live_answer(_match_id uuid, _question_index integer, _correct boolean, _dmg integer, _self_dmg integer, _time_ms integer)
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
  v_dmg int := greatest(0, least(60, coalesce(_dmg, 0)));
  v_self_dmg int := greatest(0, least(60, coalesce(_self_dmg, 0)));
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

  -- M4 clamp. Resolve both partners through Mew's Transform.
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

  -- Zamazenta #889 / Iron Boulder #1022: the DEFENDER is shielded, so the damage
  -- this attacker just computed is scaled down. The percentage is the DEFENDER's,
  -- read off their runtime (stamped there server-side from pvp_signature_effects) —
  -- a shield is no longer forced to be all-or-nothing.
  if public._pvp_m4_window_active(v_opp_runtime, v_opp_dex, 'shieldThroughQ', v_q_no) then
    v_shield_pct := coalesce(((v_opp_runtime -> v_opp_dex::text) ->> 'shieldPct')::int, 0);
    v_dmg := round(v_dmg * greatest(0, least(100, v_shield_pct)) / 100.0)::int;
  end if;

  -- M5 — Giratina #487: the DEFENDER takes nothing on the questions its spec marks
  -- (q1/q11). Same reasoning as the shield above: the attacker computes the damage,
  -- so only the server can be trusted to zero it.
  if public._pvp_index_shield_zero(v_opp_runtime, v_opp_dex, v_q_no) then
    v_dmg := 0;
  end if;

  -- Eternatus #890: wrong answers cost it nothing (self-damage channel only).
  if v_my_dex is not null and v_my_runtime is not null
     and coalesce(((v_my_runtime -> v_my_dex::text) ->> 'selfDmgZero')::boolean, false)
     and not coalesce(((v_my_runtime -> v_my_dex::text) ->> 'disabled')::boolean, false) then
    v_self_dmg := 0;
  end if;

  -- Poison bites once per question, on the side that carries it. Folded into the
  -- self-damage channel AFTER Eternatus's clamp: Eternatus ignores the cost of its
  -- own wrong answers, not the poison in its veins. Ho-Oh's revive still catches a
  -- poison kill, because it tests the post-self-damage HP.
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
      host_correct_live = host_correct_live + (case when _correct then 1 else 0 end),
      host_answered_live = host_answered_live + 1,
      host_time_ms_live = host_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      host_last_submitted_idx = _question_index
    where id = _match_id;

    if _correct and _question_index < v_my_bonus_prev and random() < 0.5 then
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
      guest_correct_live = guest_correct_live + (case when _correct then 1 else 0 end),
      guest_answered_live = guest_answered_live + 1,
      guest_time_ms_live = guest_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      guest_last_submitted_idx = _question_index
    where id = _match_id;

    if _correct and _question_index < v_my_bonus_prev and random() < 0.5 then
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

-- ── 5. The magnitudes the owner chose from the simulation report ─────────────

-- The shield percentage lives in a new `m4_window` / `shield` row, so both CHECK
-- constraints have to learn the new vocabulary before the insert below.
alter table public.pvp_signature_effects
  drop constraint if exists pvp_signature_effects_phase_check;
alter table public.pvp_signature_effects
  add constraint pvp_signature_effects_phase_check
  check (phase = any (array[
    'battle_start', 'post_answer', 'manual', 'bespoke',
    'engine_status', 'm4_fx', 'index_shield', 'm4_window'
  ]));

alter table public.pvp_signature_effects
  drop constraint if exists pvp_signature_effects_kind_check;
alter table public.pvp_signature_effects
  add constraint pvp_signature_effects_kind_check
  check (kind = any (array[
    'stat_stage', 'status', 'cure', 'heal', 'drain', 'stat_scale', 'swap_stages',
    'cleanse', 'suppress_ability', 'dot_frac_hp', 'frac_hp_random',
    'flat_next_question_damage', 'reflect_opponent_stat', 'predicted_status_apply',
    'instant_ko', 'frac_hp_current', 'receive_zero', 'shield'
  ]));

-- Arceus #493 — Judgment. 1-10% of MAX HP every question with no cooldown is
-- ~132 free damage against a 120 HP bar. Halved to 1-5%.
update public.pvp_signature_effects
   set payload = jsonb_build_object('minPct', 0.01, 'maxPct', 0.05)
 where pokemon_id = 493 and phase = 'bespoke' and kind = 'frac_hp_random';

-- Terapagos #1024 — Tera Starstorm. A 50% coin-flip to win outright, behind a gate
-- that only asks you to be losing. 15%.
update public.pvp_signature_effects
   set payload = jsonb_build_object('chance', 0.15)
 where pokemon_id = 1024 and phase = 'm4_fx' and kind = 'instant_ko';

-- Zarude #893 — Jungle Healing. Heal to 60% of the bar, not 100%…
update public.pvp_signature_effects
   set payload = jsonb_build_object('amount', 72)
 where pokemon_id = 893 and phase = 'bespoke' and kind = 'heal';
-- …and drop the LEGACY heal-8-and-cure that was still firing every 5th question on
-- top of it (the catalog row moves to `bespoke` wiring in the same commit).
delete from public.pvp_signature_effects
 where pokemon_id = 893 and phase = 'post_answer';

-- Cresselia #488 — Lunar Dance. The cleanse used to cost 15% of current HP, which
-- cancelled out its own free heal and left it second-weakest in the game.
update public.pvp_signature_effects
   set payload = jsonb_build_object('uses', 1, 'hpCostPct', 0)
 where pokemon_id = 488 and phase = 'manual' and kind = 'cleanse';

-- Freeze is turn-deletion: a frozen player forfeits the question outright. A
-- GUARANTEED freeze on a repeatable streak trigger was the second-strongest thing
-- in the game. Calyrex-Ice (3-streak) 35%; Glastrier (5-streak, harder) 40%.
update public.pvp_signature_effects
   set payload = jsonb_build_object('chance', 0.35, 'status', 'freeze', 'questions', 3)
 where pokemon_id = 898 and phase = 'engine_status';
update public.pvp_signature_effects
   set payload = jsonb_build_object('chance', 0.4, 'status', 'freeze', 'questions', 3)
 where pokemon_id = 896 and phase = 'engine_status';

-- Shield percentages (new `m4_window` phase — see `_pvp_shield_pct`).
-- Zamazenta #889 halves incoming damage instead of nullifying it; Iron Boulder
-- #1022 keeps its total shield, which is fine now that the window actually closes.
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload)
values
  (889, 92, 'm4_window', 'self', 'shield', jsonb_build_object('questions', 3, 'receivePct', 50)),
  (1022, 92, 'm4_window', 'self', 'shield', jsonb_build_object('questions', 3, 'receivePct', 0))
on conflict (pokemon_id, effect_index) do update
  set phase = excluded.phase,
      target = excluded.target,
      kind = excluded.kind,
      payload = excluded.payload;

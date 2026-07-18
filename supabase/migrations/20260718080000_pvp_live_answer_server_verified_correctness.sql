-- Live-PvP server-authoritative answer verification, Phase 4 (first slice —
-- see the plan at /root/.claude/plans/prancy-spinning-sedgewick.md).
--
-- Closes the MOST severe trust gap named in the motivating bug report:
-- `submit_pvp_live_answer` has always taken the client's self-reported
-- `_correct` at face value, so a malicious client could call it repeatedly
-- with `_correct: true` and self-grant a win with zero real answers — no
-- ability-engine recompute needed to see that, just an independent check.
--
-- Phase 1 (20260718100000 — note its filename timestamp predates this one's
-- but it shipped first; PvP migrations are timestamped by apply time, not
-- strict chronological authorship) already made the client submit
-- `_selected_index`, the choice mapped back to the match's own canonical
-- (unshuffled) `questions` order. This migration is the first thing that
-- actually USES it: `v_correct` is now derived by the server, by comparing
-- `_selected_index` against `questions[_question_index].correct` — the
-- client's `_correct` PARAMETER is no longer trusted for anything downstream
-- (kept only for the null/no-answer case, which already always means wrong).
-- A wrong answer's `_dmg` is forced to 0 regardless of what the client sent.
--
-- Self-damage magnitude and ability-modified outgoing damage MAGNITUDE stay a
-- bounded, clamped (0..60) residual risk — recomputing those needs the full
-- signature-engine port (`engine/pvp-live-answer.ts`, already built and
-- verified in Phase 2c) wired through a new Edge Function, which is
-- deliberately NOT part of this slice: that's a much larger input-derivation
-- surface (Mew Transform, opponent type/species, stat stages, statuses,
-- suppression windows, the engine-runtime disable flag, Sword of Ruin's
-- charges) best built and dark-launched on its own, reviewed on its own. This
-- slice ships alone because it's small, self-contained, and closes the worst
-- exploit immediately with no client changes at all (same RPC name/signature).
--
-- Also starts populating the streak/wrong-streak/confused-ticks columns
-- (Phase 3 + its confused-ticks addendum) with real, server-verified ground
-- truth — using `v_correct`, never the client's claim — so they're accurate
-- and ready to read from whenever the Edge Function recompute lands.
--
-- Confusion's miss roll is NOT independently re-rolled here: a self-reported
-- `dmg: 0` on an otherwise-`v_correct` answer can only ever REDUCE the
-- reporter's own damage output — there is no direction in which faking a
-- miss benefits an attacker — so it's trusted as the signal that ticks
-- `confused_ticks` down, exactly mirroring the client's local
-- `tickConfusedOut` (`resolvePvpAnswer`'s `confusionMissed` branch,
-- `engine/pvp-live-answer.ts`). Independently rolling a SECOND, server-side
-- 25% check here would just desync from whatever the client's own roll
-- already decided to show the player.
create or replace function public.submit_pvp_live_answer(
  _match_id uuid,
  _question_index integer,
  _correct boolean,
  _dmg integer,
  _self_dmg integer,
  _time_ms integer,
  _selected_index integer default null
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
  -- Server-verified correctness + streak/wrong-streak/confused-ticks tracking.
  v_correct boolean;
  v_streak int;
  v_wrong_streak int;
  v_confused_ticks int;
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

  -- Server-authoritative correctness: a null `_selected_index` (personal
  -- timeout / no-answer) is always wrong, matching existing client behavior.
  -- Otherwise it's checked against THIS match's own immutable `questions`
  -- array — never the client's `_correct` claim.
  v_correct := _selected_index is not null
    and (v_match.questions -> greatest(0, _question_index) ->> 'correct')::int = _selected_index;
  if not v_correct then
    v_dmg := 0;
  end if;

  v_streak := case when v_i_am_host then v_match.host_streak_live else v_match.guest_streak_live end;
  v_wrong_streak := case when v_i_am_host then v_match.host_wrong_streak_live else v_match.guest_wrong_streak_live end;
  v_confused_ticks := case when v_i_am_host then v_match.host_confused_ticks_live else v_match.guest_confused_ticks_live end;
  if v_correct then
    v_wrong_streak := 0;
    if v_confused_ticks > 0 and v_dmg = 0 then
      v_confused_ticks := v_confused_ticks - 1;
      v_streak := 0;
    else
      v_streak := v_streak + 1;
    end if;
  else
    v_streak := 0;
    v_wrong_streak := v_wrong_streak + 1;
    if v_wrong_streak = 2 then
      v_confused_ticks := 2;
    end if;
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
      host_correct_live = host_correct_live + (case when v_correct then 1 else 0 end),
      host_answered_live = host_answered_live + 1,
      host_time_ms_live = host_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      host_last_submitted_idx = _question_index,
      host_streak_live = v_streak,
      host_wrong_streak_live = v_wrong_streak,
      host_confused_ticks_live = v_confused_ticks
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
      guest_confused_ticks_live = v_confused_ticks
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

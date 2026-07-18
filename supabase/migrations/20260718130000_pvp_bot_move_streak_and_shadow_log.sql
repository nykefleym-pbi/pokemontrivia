-- Live PvP Phase 5a: bot-mirror groundwork for submit_bot_pvp_move.
--
-- The bot's move is still entirely client-computed and self-reported (_correct,
-- _dmg) -- this migration does NOT close that trust gap yet. It's the same
-- "dark launch first" staging this repo used for Phase 4 (see
-- /root/.claude/plans/prancy-spinning-sedgewick.md, Phase 4/5):
--
--   1. `guest_streak_live` / `guest_wrong_streak_live` / `guest_confused_ticks_live`
--      already exist (Phase 3) and are symmetric with the host columns, but
--      NOTHING has ever written them for a bot match -- only a real human
--      calling `submit_pvp_live_answer` as guest does, and a bot match's guest
--      is never that. This migration makes `submit_bot_pvp_move` maintain them
--      for the bot's own side, using the EXACT rule already shipped for humans
--      in `submit_pvp_live_answer` (20260718080000) -- copied, not reinvented.
--   2. The bot's move also starts writing into the shadow log
--      (`pvp_live_answer_shadow_log`, side='guest') the same shape Phase 4a
--      built for humans. `engine/pvp-shadow-verify.ts`'s `verifyMatchSide` is
--      already side-agnostic (keyed on "my"/"opp", not "host"/"guest"), so it
--      can replay these rows through `resolvePvpAnswer` with ZERO new code --
--      this alone lets Phase 5b (an offline verifier run) check whether the
--      bot's client-computed damage matches what the ported engine would
--      produce, exactly like Phase 4b does for humans.
--
-- Important asymmetry vs. the human shadow log: `verified_correct` there means
-- server-verified against the immutable `questions` array. There is no such
-- server-side check for the bot yet -- `_correct` is still the client's claim,
-- stored as-is. The offline verifier can therefore only catch "does the
-- reported dmg match what the engine produces GIVEN the claimed outcome" for
-- bot rows, not "did the client lie about the outcome itself" -- that second
-- gap stays open until the real bot-turn cutover (mirrors Phase 4's cutover;
-- deliberately deferred, same reasoning).
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
  v_dmg int := greatest(0, least(60, coalesce(_dmg, 0)));
  v_self_dmg int := 8;
  v_my_hp int; v_opp_hp int; v_pre_hp int; v_pre_opp_hp int;
  v_my_revived boolean; v_my_stages jsonb; v_my_statuses jsonb; v_my_bonus_until int; v_my_bonus_prev int;
  v_opp_revived boolean; v_opp_stages jsonb; v_opp_statuses jsonb; v_opp_bonus_until int;
  v_resolved boolean := false;
  v_winner uuid;
  v_h_acc numeric; v_g_acc numeric; v_h_avg numeric; v_g_avg numeric;
  -- Streak/wrong-streak/confused-ticks: same rule as submit_pvp_live_answer,
  -- applied to the bot's (guest) already-existing columns.
  v_streak_before int; v_wrong_streak_before int; v_confused_ticks_before int;
  v_streak int; v_wrong_streak int; v_confused_ticks int;
  -- Shadow-log capture (mirrors 20260718120000's block, self = bot/guest).
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

  v_streak_before := v_match.guest_streak_live;
  v_wrong_streak_before := v_match.guest_wrong_streak_live;
  v_confused_ticks_before := v_match.guest_confused_ticks_live;
  v_streak := v_streak_before;
  v_wrong_streak := v_wrong_streak_before;
  v_confused_ticks := v_confused_ticks_before;
  if _correct then
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
    guest_last_submitted_idx = _question_index,
    guest_streak_live = v_streak,
    guest_wrong_streak_live = v_wrong_streak,
    guest_confused_ticks_live = v_confused_ticks
  where id = _match_id;

  -- Rainbow Rebirth bonus window (isolated: opponent status only, never HP).
  if _correct and _question_index < v_my_bonus_prev and random() < 0.5 then
    update public.pvp_live_matches set
      host_statuses = public._pvp_apply_status(host_statuses, 'burn', 3)
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;

  -- Shadow-log capture (Phase 4a's table, reused as-is) -- self = bot/guest,
  -- opponent = the host. Mew's Transform is in the bot's own roster, so it
  -- gets the same transform-id resolution the human path already has.
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
    'streakBefore', v_streak_before, 'wrongStreakBefore', v_wrong_streak_before,
    'confusedTicksBefore', v_confused_ticks_before, 'pokedexCount', coalesce(v_pokedex_count, 0),
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

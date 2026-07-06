-- Ho-Oh (dex 250) "Rainbow Rebirth" — extend the one-time revive to the
-- OPPONENT-INFLICTED KO path in Nearby Battle (live PvP).
--
-- The prior migration (20260706034314_pvp_hooh_rainbow_rebirth_revive.sql) only
-- intercepted a Ho-Oh holder's SELF-KO (the fixed wrong-answer `_self_dmg` chip
-- on the answering player's own `v_my_hp`). But the dominant death vector is the
-- OPPONENT's correct answer draining you via `v_opp_hp` inside the OPPONENT's own
-- submission — a different code path. Per product-owner approval ("cover both
-- paths that Ho-Oh gets KO"), this migration mirrors the exact same revive
-- treatment onto the `v_opp_hp` computation in BOTH branches, applied to the
-- OPPONENT's side columns:
--   * host branch:  v_opp_hp -> GUEST columns (guest_revived/stages/statuses/bonus)
--   * guest branch: v_opp_hp -> HOST  columns (host_revived/stages/statuses/bonus)
--
-- The single `*_revived` flag per side gates BOTH trigger paths (self-KO and
-- opponent-KO), so a given side can revive at most once per match via either
-- path. Revive treatment is identical: 25% of PVP_MAX_HP (120 -> 30), cure all
-- statuses, +1 Attack stage, and a 2-question Burn-on-correct bonus window.
-- Everything else in submit_pvp_live_answer is unchanged.

create or replace function public.submit_pvp_live_answer(
  _match_id uuid,
  _question_index int,
  _correct boolean,
  _dmg int,
  _self_dmg int,
  _time_ms int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  -- Ho-Oh Rainbow Rebirth locals (revive is a no-op for every non-Ho-Oh side).
  v_my_revived boolean;
  v_my_stages jsonb;
  v_my_statuses jsonb;
  v_my_bonus_until int;
  v_my_bonus_prev int;   -- pre-update bonus-window threshold, for the Burn gate
  -- Opponent-side Rainbow Rebirth locals (opponent-INFLICTED KO revive path).
  -- Applied to the OPPONENT's own side columns; no-op for a non-Ho-Oh opponent.
  v_pre_opp_hp int;
  v_opp_revived boolean;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
  v_opp_bonus_until int;
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
    -- Already processed (retry/duplicate) — return current state idempotently.
    return jsonb_build_object(
      'ok', true,
      'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
      'resolved', v_match.status = 'completed'
    );
  end if;
  if _question_index >= 20 then
    return jsonb_build_object('ok', false, 'error', 'out_of_range');
  end if;

  if v_i_am_host then
    -- Pre-floor self HP. Ho-Oh's Rainbow Rebirth intercepts a would-be self-KO
    -- (<=0) ONCE, before the greatest(0,...) floor, reviving to 25% max HP.
    v_pre_hp := v_match.host_hp - v_self_dmg;
    v_my_bonus_prev := v_match.host_revive_bonus_until;
    if v_pre_hp <= 0 and v_match.host_partner_id = 250 and not coalesce(v_match.host_revived, false) then
      v_my_hp := round(120 * 0.25)::int;                                  -- PVP_MAX_HP=120 -> 30
      v_my_revived := true;
      v_my_stages := public._pvp_bump_stage(v_match.host_stages, 'attack', 1);
      v_my_statuses := public._pvp_cure_status(v_match.host_statuses, 'any');
      v_my_bonus_until := _question_index + 1 + 2;                         -- 2q window, starts next q
    else
      v_my_hp := greatest(0, v_pre_hp);                                    -- unchanged behavior
      v_my_revived := v_match.host_revived;
      v_my_stages := v_match.host_stages;
      v_my_statuses := v_match.host_statuses;
      v_my_bonus_until := v_match.host_revive_bonus_until;
    end if;
    -- Opponent-inflicted KO revive: the host's correct answer damages the GUEST
    -- via v_opp_hp. If that would drop the guest to <=0 and the guest is a
    -- first-time Ho-Oh, Rainbow Rebirth revives THEM (mirror of the self-KO
    -- path, applied to the guest's own columns — guest_* here).
    v_pre_opp_hp := v_match.guest_hp - v_dmg;
    if v_pre_opp_hp <= 0 and v_match.guest_partner_id = 250 and not coalesce(v_match.guest_revived, false) then
      v_opp_hp := round(120 * 0.25)::int;                                 -- 30
      v_opp_revived := true;
      v_opp_stages := public._pvp_bump_stage(v_match.guest_stages, 'attack', 1);
      v_opp_statuses := public._pvp_cure_status(v_match.guest_statuses, 'any');
      v_opp_bonus_until := _question_index + 1 + 2;
    else
      v_opp_hp := greatest(0, v_pre_opp_hp);                              -- unchanged behavior
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

    -- Rainbow Rebirth bonus window (ISOLATED — touches only the opponent's
    -- status array, never HP, so it cannot affect the KO/resolution math below):
    -- within the 2-question post-revive window, each correct answer has a 50%
    -- chance to Burn the opponent.
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
      v_my_statuses := v_match.guest_statuses;
      v_my_bonus_until := v_match.guest_revive_bonus_until;
    end if;
    -- Opponent-inflicted KO revive: the guest's correct answer damages the HOST
    -- via v_opp_hp. If that would drop the host to <=0 and the host is a
    -- first-time Ho-Oh, Rainbow Rebirth revives THEM (mirror applied to the
    -- host's own columns — host_* here).
    v_pre_opp_hp := v_match.host_hp - v_dmg;
    if v_pre_opp_hp <= 0 and v_match.host_partner_id = 250 and not coalesce(v_match.host_revived, false) then
      v_opp_hp := round(120 * 0.25)::int;                                 -- 30
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

  -- Sudden KO, or both sides have answered all 20 questions. Reads POST-revive
  -- HP (a revived Ho-Oh is at 30, not 0), so a revive never resolves the match.
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
      -- Tiebreak 1: higher accuracy. Tiebreak 2: lower average answer time.
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
$$;

grant execute on function public.submit_pvp_live_answer(uuid, int, boolean, int, int, int) to authenticated;

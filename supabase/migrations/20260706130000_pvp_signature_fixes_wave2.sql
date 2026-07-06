-- Signature-ability validation-audit fixes (wave 2), product-owner approved:
-- "Fix all issues - security gap, dead abilities, minor gaps." The security gap
-- (issue #1) was already fixed in 20260706090116_pvp_signature_effect_ownership_
-- and_post_answer_ratelimit.sql. This migration covers the remainder:
--
--   1. Zekrom (643) "Blue Flare" — new post_answer row: 40%-chance Burn on the
--      opponent (the damage-calc bonus is now deterministic on any first-half
--      correct answer per the matching signature-abilities.ts catalog edit).
--   2. Regice (378) "Blizzard" — new post_answer row: -1 opponent Speed on a
--      4+ streak (replaces the undeliverable hide_options hamper).
--   3. Four passive_damage compound entries that bundle a dropped sub-effect,
--      now routed through a same-hit post_answer RPC call from the client:
--        243 Raikou "Thunder" — +1 self Speed.
--        809 Melmetal "Double Iron Bash" — 30%-chance Sleep on the opponent.
--        386 Deoxys "Psycho Boost" — -1 self Attack recoil.
--        801 Magearna "Fleur Cannon" — -1 self Attack recoil.
--   4. Meloetta (648) Sleep-chance fidelity — add chance:0.3 to its existing
--      manual status row and add genuine probabilistic gating to
--      apply_pvp_signature_effect's `status` branch (previously any `chance`
--      key in a status row's payload was silently ignored — status effects
--      always applied at 100%).
--   5. Weather non-owner enforcement (Kyogre 382 / Groudon 383) — the server
--      now independently refuses a weather post_answer effect when the other
--      weather mascot currently owns the field (mirrors the existing
--      Rayquaza-negation check's structure), instead of relying solely on the
--      client's `weatherGatedOut` gate.
--
-- All 6 new/changed catalog rows are additive; no existing row is removed.

-- ── New pvp_signature_effects rows ──────────────────────────────────────────
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, kind, target, payload)
values
  (243, 0, 'post_answer', 'stat_stage', 'self', jsonb_build_object('stat', 'speed', 'delta', 1)),
  (378, 0, 'post_answer', 'stat_stage', 'opponent', jsonb_build_object('stat', 'speed', 'delta', -1)),
  (386, 0, 'post_answer', 'stat_stage', 'self', jsonb_build_object('stat', 'attack', 'delta', -1)),
  (643, 0, 'post_answer', 'status', 'opponent', jsonb_build_object('status', 'burn', 'questions', 3, 'chance', 0.4)),
  (801, 0, 'post_answer', 'stat_stage', 'self', jsonb_build_object('stat', 'attack', 'delta', -1)),
  (809, 0, 'post_answer', 'status', 'opponent', jsonb_build_object('status', 'sleep', 'questions', 1, 'chance', 0.3));

-- ── Meloetta (648) — add the documented 30% roll to its existing Sleep row ──
update public.pvp_signature_effects
set payload = payload || jsonb_build_object('chance', 0.3)
where pokemon_id = 648 and phase = 'manual' and kind = 'status';

-- ── apply_pvp_signature_effect: status-chance gating + weather non-owner ───
create or replace function public.apply_pvp_signature_effect(_match_id uuid, _question_index integer, _pokemon_id integer, _phase text, _scale_count integer DEFAULT 0)
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

  -- ── Ownership authorization (security) ────────────────────────────────────
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

  -- Phase 1: per-battle signature counter write (e.g. Moltres Wrath stacks).
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

  -- Phase 5: Rayquaza's Air Lock negates Kyogre/Groudon weather stat effects.
  if v_is_weather and (v_match.host_partner_id = 384 or v_match.guest_partner_id = 384) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'weather_negated');
  end if;

  -- Weather non-owner enforcement (housekeeping item): "latest weather wins".
  -- If the field is currently owned by the OTHER weather source's side, refuse
  -- this side's weather effect server-side too (previously only the client's
  -- weatherGatedOut gate enforced this — a modified client could ignore it).
  if v_is_weather and v_match.weather_owner is not null then
    if (v_match.weather_owner = 'host' and v_match.host_partner_id in (382, 383) and v_match.host_partner_id <> _pokemon_id)
       or (v_match.weather_owner = 'guest' and v_match.guest_partner_id in (382, 383) and v_match.guest_partner_id <> _pokemon_id) then
      return jsonb_build_object('ok', true, 'noop', true, 'reason', 'weather_non_owner');
    end if;
  end if;

  -- Per-question idempotency for post_answer effects (mirrors *_last_submitted_idx).
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
      -- Fix: honor an optional probabilistic `chance` in the payload (e.g.
      -- Zekrom's 40% Burn, Melmetal's 30% Sleep, Meloetta's 30% Sleep-on-toggle)
      -- instead of always applying the status at 100%.
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
    end if;
    if v_did_apply then
      v_applied := v_applied + 1;
    end if;
  end loop;

  if v_applied = 0 then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  if v_i_am_host then
    update public.pvp_live_matches set
      host_hp = v_self_hp, guest_hp = v_opp_hp,
      host_stages = v_self_stages, host_statuses = v_self_statuses,
      guest_stages = v_opp_stages, guest_statuses = v_opp_statuses,
      guest_suppressed_until = v_opp_suppressed,
      weather_owner = case when v_is_weather then 'host' else weather_owner end,
      host_ability_started = host_ability_started or (_phase = 'battle_start'),
      host_manual_fires = host_manual_fires + (case when _phase = 'manual' then 1 else 0 end),
      host_post_answer_last_idx = case when _phase = 'post_answer' then greatest(host_post_answer_last_idx, v_qidx) else host_post_answer_last_idx end
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
      guest_post_answer_last_idx = case when _phase = 'post_answer' then greatest(guest_post_answer_last_idx, v_qidx) else guest_post_answer_last_idx end
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

grant execute on function public.apply_pvp_signature_effect(uuid, integer, integer, text, integer) to authenticated;

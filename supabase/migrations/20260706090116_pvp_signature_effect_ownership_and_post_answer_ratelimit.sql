-- Fix a HIGH-severity gap found in a full signature-ability validation audit:
-- apply_pvp_signature_effect trusted the client-supplied _pokemon_id with no
-- check that it matched the caller's own registered partner, so any match
-- participant could invoke ANY catalog ability -- including repeatedly firing
-- unbounded HP drain/heal effects with no per-battle cap (post_answer had no
-- idempotency, unlike submit_pvp_live_answer's *_last_submitted_idx or
-- manual's *_manual_fires cap).
--
-- Fix has two parts:
--   1. Ownership authorization: the caller's authorized ability id is their
--      own partner_id, EXCEPT a Mew (151) player, who is authorized only for
--      whatever ability Mew's Transform resolved to copy -- persisted
--      write-once server-side via the new set_live_pvp_transform RPC (the
--      client can't re-roll it mid-battle to dodge validation). A call whose
--      _pokemon_id doesn't match the authorized id is rejected with
--      'unauthorized_ability'. A NULL partner self-heals from the first call
--      (write-once, never to 151) to cover the battle-start registration race
--      without weakening the check thereafter.
--   2. Post-answer idempotency: a per-side *_post_answer_last_idx cursor
--      (mirroring *_last_submitted_idx) rejects a replay of the same question
--      index for the post_answer phase, closing the drain/heal spam vector.
--
-- Verified against production with disposable test data (own-ability use,
-- spoofed-ability rejection, Mew Transform end-to-end, post_answer replay
-- rejection, manual/battle_start regression, Ho-Oh/suppression/weather
-- regression) -- all passed. get_advisors: 88 findings (was 86), the +2 being
-- the same recurring SECURITY DEFINER-executable warning every RPC in this
-- system already carries for the new function -- no new risk category.

alter table public.pvp_live_matches
  add column host_transform_id int,
  add column guest_transform_id int,
  add column host_post_answer_last_idx int not null default -1,
  add column guest_post_answer_last_idx int not null default -1;

-- Persists Mew's (dex 151) resolved Transform target, write-once per match
-- side. Rejects non-Mew callers, invalid/self ids, and non-participants.
create or replace function public.set_live_pvp_transform(
  _match_id uuid,
  _transform_id int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_my_partner int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;
  if _transform_id is null or _transform_id = 151 or _transform_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_transform');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_my_partner := case when v_uid = v_match.host_id then v_match.host_partner_id else v_match.guest_partner_id end;
  -- Only an actual Mew (partner 151) may register a Transform target.
  if v_my_partner is distinct from 151 then
    return jsonb_build_object('ok', false, 'error', 'not_mew');
  end if;

  -- Write-once via coalesce: cannot be re-rolled mid-battle to dodge validation.
  if v_uid = v_match.host_id then
    update public.pvp_live_matches
      set host_transform_id = coalesce(host_transform_id, _transform_id)
      where id = _match_id
      returning * into v_match;
  else
    update public.pvp_live_matches
      set guest_transform_id = coalesce(guest_transform_id, _transform_id)
      where id = _match_id
      returning * into v_match;
  end if;

  return jsonb_build_object(
    'ok', true,
    'hostTransformId', v_match.host_transform_id,
    'guestTransformId', v_match.guest_transform_id
  );
end;
$$;

grant execute on function public.set_live_pvp_transform(uuid, int) to authenticated;

create or replace function public.apply_pvp_signature_effect(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _phase text,
  _scale_count int default 0
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
  -- Resolve the caller's authorized ability id and reject any _pokemon_id that
  -- does not match it. Normal players are pinned to their own registered
  -- partner; a Mew (151) player is pinned to whatever Transform resolved to copy
  -- (persisted write-once via set_live_pvp_transform). This runs BEFORE every
  -- effect path (incl. sig_state) so no phase can invoke a foreign ability.
  v_my_partner := case when v_i_am_host then v_match.host_partner_id else v_match.guest_partner_id end;

  -- Self-heal a not-yet-registered partner from this very call, mirroring the
  -- client-declared trust already in set_live_pvp_partner. Guards the battle-
  -- start race where an ability can fire before the mount-time partner
  -- registration commits. Write-once (only fills a NULL) so it can never be used
  -- to switch abilities mid-battle; never self-heals to Mew (151).
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
  -- Stores a single integer, server-clamped 0..3, into the caller's own
  -- *_sig_state jsonb keyed by the partner dex id. Isolated early return — it
  -- neither reads the effect catalog nor touches HP/KO/resolution.
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

  -- Per-question idempotency for post_answer effects (mirrors *_last_submitted_idx):
  -- reject a replay at or below the caller's already-processed post_answer index,
  -- so drain/heal/stat post_answer effects can't be spammed for the same question.
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
      end if;
    elsif v_row.kind = 'status' then
      if v_row.target = 'self' then
        v_self_statuses := public._pvp_apply_status(v_self_statuses, v_row.payload->>'status', coalesce((v_row.payload->>'questions')::int, 3));
      else
        v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_row.payload->>'status', coalesce((v_row.payload->>'questions')::int, 3));
        v_touched_opponent := true;
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
        end if;
        if v_low_val < 0 then
          v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_low_stat, v_low_val);
          v_self_stages := public._pvp_bump_stage(v_self_stages, v_low_stat, -v_low_val);
          v_touched_opponent := true;
        end if;
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
    v_applied := v_applied + 1;
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
$$;

grant execute on function public.apply_pvp_signature_effect(uuid, int, int, text, int) to authenticated;

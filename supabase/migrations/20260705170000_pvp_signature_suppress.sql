-- Phase 4: ability-lock / suppress mechanics.
--
-- Heatran (485), Zygarde (718), Regieleki (894) and Pecharunt (1025) trap the
-- opponent for 3 questions during which the opponent CANNOT activate their own
-- signature ability. We store, per side, the question index at which the lock
-- LIFTS (`*_suppressed_until`, 0 = never suppressed). A side is suppressed while
-- its current question index < that value. The suppressors fire through the
-- normal manual path; a new server-catalog effect kind `suppress_ability`
-- (target=opponent) sets the opponent's lift index alongside the ability's
-- other debuffs (a status / stat drop). apply_pvp_signature_effect refuses to
-- apply ANY effect for a suppressed caller (except the one-time battle_start
-- buff, which resolves at q0 before a suppressor can act) and — crucially —
-- consumes no manual-fire charge for a suppressed attempt.

alter table public.pvp_live_matches
  add column if not exists host_suppressed_until int not null default 0,
  add column if not exists guest_suppressed_until int not null default 0;

alter table public.pvp_signature_effects
  drop constraint pvp_signature_effects_kind_check,
  add constraint pvp_signature_effects_kind_check
    check (kind in ('stat_stage', 'status', 'cure', 'heal', 'drain', 'stat_scale',
                    'swap_stages', 'cleanse', 'suppress_ability'));

insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (485, 0, 'manual', 'opponent', 'suppress_ability', '{"questions":3,"uses":1}'::jsonb),
  (485, 1, 'manual', 'opponent', 'status', '{"status":"badly-poisoned","questions":3}'::jsonb),
  (718, 0, 'manual', 'opponent', 'suppress_ability', '{"questions":3,"uses":1}'::jsonb),
  (718, 1, 'manual', 'opponent', 'stat_stage', '{"stat":"speed","delta":-1}'::jsonb),
  (894, 0, 'manual', 'opponent', 'suppress_ability', '{"questions":3,"uses":1}'::jsonb),
  (894, 1, 'manual', 'opponent', 'status', '{"status":"paralysis","questions":3}'::jsonb),
  (1025, 0, 'manual', 'opponent', 'suppress_ability', '{"questions":3,"uses":1}'::jsonb),
  (1025, 1, 'manual', 'opponent', 'status', '{"status":"badly-poisoned","questions":3}'::jsonb)
on conflict (pokemon_id, effect_index) do update
  set phase = excluded.phase, target = excluded.target,
      kind = excluded.kind, payload = excluded.payload;

-- RPC: adds (a) a suppressed-caller gate that returns BEFORE the manual-cap
-- check/mutation so a blocked attempt consumes no charge, and (b) a
-- `suppress_ability` handler that sets the opponent's lift index. Everything
-- else is reproduced from 20260705150000_pvp_signature_swap_cleanse.sql.
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
  v_self_suppressed := case when v_i_am_host then v_match.host_suppressed_until else v_match.guest_suppressed_until end;
  v_opp_suppressed := case when v_i_am_host then v_match.guest_suppressed_until else v_match.host_suppressed_until end;

  if _phase <> 'battle_start' and v_qidx < v_self_suppressed then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'suppressed');
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
      host_ability_started = host_ability_started or (_phase = 'battle_start'),
      host_manual_fires = host_manual_fires + (case when _phase = 'manual' then 1 else 0 end)
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp, host_hp = v_opp_hp,
      guest_stages = v_self_stages, guest_statuses = v_self_statuses,
      host_stages = v_opp_stages, host_statuses = v_opp_statuses,
      host_suppressed_until = v_opp_suppressed,
      guest_ability_started = guest_ability_started or (_phase = 'battle_start'),
      guest_manual_fires = guest_manual_fires + (case when _phase = 'manual' then 1 else 0 end)
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
    'guestSuppressedUntil', v_match.guest_suppressed_until
  );
end;
$$;

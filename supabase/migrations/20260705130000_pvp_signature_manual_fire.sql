-- Phase 3 (bucket 1): manual "charge and fire" signature abilities.
--
-- A subset of Legendary/Mythical partners have a player-fired signature move
-- (Aeroblast, Mist Ball, Luster Purge, Dark Void, Seed Flare, Roar of Time,
-- Spacial Rend, Relic Song, the Ruination burst pair, Tera Starstorm). The live
-- battle screen now shows a generic charge/Fire affordance; on tap the client
-- calls apply_pvp_signature_effect with phase='manual'. Same trust model as
-- berries and the auto phases: the client only names WHICH partner/phase fired,
-- the server looks up the fixed magnitude here and enforces the per-battle use
-- cap (a partner has exactly one signature ability, so one counter per side
-- suffices). Magnitudes are generated from src/lib/signature-abilities.ts via
-- scripts/gen-signature-sql.ts to stay in lockstep.

-- 1) Allow the new phase in the catalog.
alter table public.pvp_signature_effects
  drop constraint pvp_signature_effects_phase_check,
  add constraint pvp_signature_effects_phase_check
    check (phase in ('battle_start', 'post_answer', 'manual'));

-- 2) Per-side manual-fire counters (the ability's `uses` cap is enforced against these).
alter table public.pvp_live_matches
  add column host_manual_fires int not null default 0,
  add column guest_manual_fires int not null default 0;

-- 3) Manual effect rows (payload carries `uses` = per-battle cap).
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (249, 0, 'manual', 'opponent', 'stat_stage', '{"stat":"speed","delta":-2,"uses":2}'::jsonb),
  (380, 0, 'manual', 'opponent', 'stat_stage', '{"stat":"attack","delta":-2,"uses":1}'::jsonb),
  (381, 0, 'manual', 'opponent', 'stat_stage', '{"stat":"defense","delta":-2,"uses":1}'::jsonb),
  (483, 0, 'manual', 'self', 'stat_stage', '{"stat":"speed","delta":2,"uses":2}'::jsonb),
  (484, 0, 'manual', 'self', 'stat_stage', '{"stat":"speed","delta":1,"uses":2}'::jsonb),
  (491, 0, 'manual', 'opponent', 'status', '{"status":"sleep","questions":2,"uses":1}'::jsonb),
  (492, 0, 'manual', 'opponent', 'stat_stage', '{"stat":"defense","delta":-2,"uses":1}'::jsonb),
  (648, 0, 'manual', 'self', 'stat_stage', '{"stat":"attack","delta":1,"uses":2}'::jsonb),
  (648, 1, 'manual', 'opponent', 'status', '{"status":"sleep","questions":1,"uses":2}'::jsonb),
  (1002, 0, 'manual', 'opponent', 'stat_stage', '{"stat":"defense","delta":-2,"uses":1}'::jsonb),
  (1003, 0, 'manual', 'self', 'stat_stage', '{"stat":"defense","delta":2,"uses":1}'::jsonb),
  (1003, 1, 'manual', 'opponent', 'stat_stage', '{"stat":"crit","delta":-1,"uses":1}'::jsonb),
  (1024, 0, 'manual', 'self', 'stat_stage', '{"stat":"attack","delta":2,"uses":1}'::jsonb),
  (1024, 1, 'manual', 'self', 'stat_stage', '{"stat":"defense","delta":1,"uses":1}'::jsonb),
  (1024, 2, 'manual', 'self', 'stat_stage', '{"stat":"speed","delta":2,"uses":1}'::jsonb)
on conflict (pokemon_id, effect_index) do update
  set phase = excluded.phase, target = excluded.target,
      kind = excluded.kind, payload = excluded.payload;

-- 4) RPC: add manual-phase handling (use-cap check + fire-counter increment) on
--    top of the existing battle_start / post_answer logic.
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
  v_applied int := 0;
  v_touched_opponent boolean := false;
  v_stat text;
  v_delta int;
  v_amount int;
  v_cap int;
  v_my_fires int;
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

  -- battle_start effects apply exactly once per side.
  if _phase = 'battle_start' then
    if v_i_am_host and v_match.host_ability_started then
      return jsonb_build_object('ok', true, 'noop', true);
    elsif (not v_i_am_host) and v_match.guest_ability_started then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  end if;

  -- manual effects are gated by a per-battle use cap (from the catalog `uses`).
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
      host_ability_started = host_ability_started or (_phase = 'battle_start'),
      host_manual_fires = host_manual_fires + (case when _phase = 'manual' then 1 else 0 end)
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp, host_hp = v_opp_hp,
      guest_stages = v_self_stages, guest_statuses = v_self_statuses,
      host_stages = v_opp_stages, host_statuses = v_opp_statuses,
      guest_ability_started = guest_ability_started or (_phase = 'battle_start'),
      guest_manual_fires = guest_manual_fires + (case when _phase = 'manual' then 1 else 0 end)
    where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (
    _match_id, greatest(0, _question_index), v_uid,
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
$$;

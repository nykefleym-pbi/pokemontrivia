-- A `cure` of Confusion must also clear the ENGINE's confusion, not just the
-- status jsonb.
--
-- Nearby/Training confusion has two independent representations:
--
--   * `host_confused_ticks_live` / `guest_confused_ticks_live` — set by the
--     consecutive-wrong chain in engine/pvp-live-answer.ts. This is what drives
--     the 25% miss roll, and it is how a player becomes confused in the
--     overwhelming majority of battles.
--   * a `confused` entry in `host_statuses` / `guest_statuses` — written only by
--     a signature ability or an item.
--
-- Every `cure` row in `pvp_type_ability_effects` reached only the second one.
-- So Hydration ("cures Confusion") and Toxic ("cleanses Poison/Confusion") both
-- announced themselves and did nothing against the common case — the same blind
-- spot that made Shield Dust inert before it was changed to prevention.
--
-- Shield Dust is fixed upstream (it now prevents the chain from arming, so this
-- path is a fallback for it). Hydration and Toxic are genuinely cures, not
-- immunities, so they are fixed here instead: curing `confused` zeroes the
-- caller's engine ticks in the same statement that rewrites the statuses.
--
-- The returned `confusionCured` flag lets the client drop its local confusion
-- badge in the same round trip, so the UI can't disagree with the row.

create or replace function public.apply_pvp_type_ability_effect(
  _match_id uuid,
  _question_index int,
  _ability_id text,
  _phase text
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
  v_my_ability text;
  v_row public.pvp_type_ability_effects;
  v_self_stages jsonb;
  v_self_statuses jsonb;
  v_self_hp int;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
  v_opp_hp int;
  v_applied int := 0;
  v_stat text;
  v_delta int;
  v_amount int;
  v_cured_confusion boolean := false;
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
  v_my_ability := case when v_i_am_host then v_match.host_ability_id else v_match.guest_ability_id end;
  if v_my_ability is not null and v_my_ability != _ability_id then
    return jsonb_build_object('ok', false, 'error', 'ability_mismatch');
  end if;

  if _phase = 'battle_start' then
    if v_i_am_host and v_match.host_type_ability_started then
      return jsonb_build_object('ok', true, 'noop', true);
    elsif (not v_i_am_host) and v_match.guest_type_ability_started then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  end if;

  v_self_stages := case when v_i_am_host then v_match.host_stages else v_match.guest_stages end;
  v_self_statuses := case when v_i_am_host then v_match.host_statuses else v_match.guest_statuses end;
  v_self_hp := case when v_i_am_host then v_match.host_hp else v_match.guest_hp end;
  v_opp_stages := case when v_i_am_host then v_match.guest_stages else v_match.host_stages end;
  v_opp_statuses := case when v_i_am_host then v_match.guest_statuses else v_match.host_statuses end;
  v_opp_hp := case when v_i_am_host then v_match.guest_hp else v_match.host_hp end;

  for v_row in
    select * from public.pvp_type_ability_effects
    where ability_id = _ability_id and phase = _phase
    order by effect_index
  loop
    if v_row.kind = 'stat_stage' then
      v_stat := v_row.payload->>'stat';
      v_delta := (v_row.payload->>'delta')::int;
      if v_row.target = 'self' then
        v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat, v_delta);
      else
        v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat, v_delta);
      end if;
    elsif v_row.kind = 'status' then
      if v_row.target = 'self' then
        v_self_statuses := public._pvp_apply_status(v_self_statuses, v_row.payload->>'status', coalesce((v_row.payload->>'questions')::int, 3));
      else
        v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_row.payload->>'status', coalesce((v_row.payload->>'questions')::int, 3));
      end if;
    elsif v_row.kind = 'cure' then
      v_self_statuses := public._pvp_cure_status(v_self_statuses, v_row.payload->>'status');
      -- The addition: confusion also lives in the engine's tick counter.
      if v_row.payload->>'status' = 'confused' then
        v_cured_confusion := true;
      end if;
    elsif v_row.kind = 'heal' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_self_hp := least(120, v_self_hp + v_amount);
    elsif v_row.kind = 'drain' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_opp_hp := greatest(0, v_opp_hp - v_amount);
      v_self_hp := least(120, v_self_hp + v_amount);
    elsif v_row.kind = 'damage' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_opp_hp := greatest(0, v_opp_hp - v_amount);
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
      host_ability_id = coalesce(host_ability_id, _ability_id),
      host_type_ability_started = host_type_ability_started or (_phase = 'battle_start'),
      host_confused_ticks_live =
        case when v_cured_confusion then 0 else host_confused_ticks_live end
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp, host_hp = v_opp_hp,
      guest_stages = v_self_stages, guest_statuses = v_self_statuses,
      host_stages = v_opp_stages, host_statuses = v_opp_statuses,
      guest_ability_id = coalesce(guest_ability_id, _ability_id),
      guest_type_ability_started = guest_type_ability_started or (_phase = 'battle_start'),
      guest_confused_ticks_live =
        case when v_cured_confusion then 0 else guest_confused_ticks_live end
    where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (_match_id, greatest(0, _question_index), v_uid, 'opponent', null, 'ability', null, 'stat_stage',
          jsonb_build_object('phase', _phase, 'abilityId', _ability_id));

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages, 'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses, 'guestStatuses', v_match.guest_statuses,
    'confusionCured', v_cured_confusion
  );
end;
$$;

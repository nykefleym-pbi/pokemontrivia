-- Legendary/Mythical PARTNER signature abilities for Nearby Battle (live PvP).
-- Mirrors the pvp_item_effects trust model: the client names WHICH ability to
-- apply (by partner dex id) and the server looks up the fixed magnitude from
-- this catalog — the client can never supply a raw magnitude. Applied to the
-- authoritative pvp_live_matches row and logged to pvp_live_effects (with
-- source='ability') for the opponent's attribution toast.
--
-- Only battle_start (standing buffs) and post_answer (triggered stat/status/
-- heal/drain) effects reach the server; damage-calc / one-hit modifiers stay
-- client-side (the per-answer damage number is already client-computed and
-- server-clamped in submit_pvp_live_answer), and manual/bespoke abilities are
-- catalog-only for now (see the implementation report).

-- Attribution discriminator + partner-id for ability rows. item_id becomes
-- nullable so ability rows (which have no item) can log for the toast; the
-- client resolves the display name from its own signature-ability catalog by
-- pokemon_id, so no move name is trusted from the wire.
alter table public.pvp_live_effects
  add column source text not null default 'item' check (source in ('item', 'ability')),
  add column pokemon_id int,
  alter column item_id drop not null;

-- One-shot guard so battle_start standing buffs apply exactly once per side.
alter table public.pvp_live_matches
  add column host_ability_started boolean not null default false,
  add column guest_ability_started boolean not null default false;

create table public.pvp_signature_effects (
  pokemon_id int not null,
  effect_index int not null,
  phase text not null check (phase in ('battle_start', 'post_answer')),
  target text not null check (target in ('self', 'opponent')),
  kind text not null check (kind in ('stat_stage', 'status', 'cure', 'heal', 'drain', 'stat_scale')),
  payload jsonb not null,
  primary key (pokemon_id, effect_index)
);

grant select on public.pvp_signature_effects to authenticated;
grant all on public.pvp_signature_effects to service_role;

insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (145, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"defense","delta":-1}'::jsonb),
  (244, 0, 'post_answer', 'opponent', 'status', '{"status":"burn","questions":3}'::jsonb),
  (245, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  (245, 1, 'post_answer', 'self', 'cure', '{"status":"any"}'::jsonb),
  (379, 0, 'battle_start', 'self', 'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  (382, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (382, 1, 'post_answer', 'self', 'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  (383, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (383, 1, 'post_answer', 'opponent', 'stat_stage', '{"stat":"speed","delta":-1}'::jsonb),
  (489, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"speed","delta":-1}'::jsonb),
  (641, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"speed","delta":-2}'::jsonb),
  (642, 0, 'post_answer', 'opponent', 'status', '{"status":"paralysis","questions":3}'::jsonb),
  (644, 0, 'post_answer', 'opponent', 'status', '{"status":"paralysis","questions":3}'::jsonb),
  (644, 1, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (645, 0, 'post_answer', 'opponent', 'status', '{"status":"burn","questions":3}'::jsonb),
  (645, 1, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (646, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"speed","delta":-1}'::jsonb),
  (717, 0, 'post_answer', 'opponent', 'drain', '{"amount":2}'::jsonb),
  (719, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  (721, 0, 'post_answer', 'opponent', 'status', '{"status":"burn","questions":3}'::jsonb),
  (786, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"crit","delta":-1}'::jsonb),
  (787, 0, 'post_answer', 'self', 'heal', '{"amount":4}'::jsonb),
  (787, 1, 'post_answer', 'self', 'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  (788, 0, 'post_answer', 'self', 'cure', '{"status":"any"}'::jsonb),
  (790, 0, 'battle_start', 'self', 'stat_stage', '{"stat":"defense","delta":2}'::jsonb),
  (790, 1, 'battle_start', 'self', 'stat_stage', '{"stat":"attack","delta":-1}'::jsonb),
  (803, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (804, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  (805, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  (806, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"crit","delta":1}'::jsonb),
  (807, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  (807, 1, 'post_answer', 'self', 'stat_stage', '{"stat":"crit","delta":1}'::jsonb),
  (808, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (888, 0, 'battle_start', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (889, 0, 'battle_start', 'self', 'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  (891, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"crit","delta":1}'::jsonb),
  (893, 0, 'post_answer', 'self', 'heal', '{"amount":8}'::jsonb),
  (893, 1, 'post_answer', 'self', 'cure', '{"status":"any"}'::jsonb),
  (896, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"speed","delta":-1}'::jsonb),
  (897, 0, 'post_answer', 'opponent', 'drain', '{"amount":2}'::jsonb),
  (898, 0, 'post_answer', 'opponent', 'stat_stage', '{"stat":"speed","delta":-2}'::jsonb),
  (898, 1, 'post_answer', 'self', 'heal', '{"amount":3}'::jsonb),
  (1001, 0, 'battle_start', 'opponent', 'stat_stage', '{"stat":"attack","delta":-1}'::jsonb),
  (1008, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  (1015, 0, 'post_answer', 'opponent', 'status', '{"status":"poisoned","questions":3}'::jsonb),
  (1016, 0, 'battle_start', 'self', 'stat_scale', '{"stat":"attack","per":25,"max":3}'::jsonb);

-- Apply a partner's signature ability effects for the given phase. Looks up the
-- fixed magnitudes from the catalog by dex id; reuses the shared status/stage
-- helpers from the pvp_live_hp_battle migration so the "one major at a time /
-- confusion stacks / hard-lockout exclusivity" and stage clamp rules are
-- honored automatically. Returns the resulting authoritative state.
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
  v_stat text;
  v_delta int;
  v_amount int;
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
      host_ability_started = host_ability_started or (_phase = 'battle_start')
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp, host_hp = v_opp_hp,
      guest_stages = v_self_stages, guest_statuses = v_self_statuses,
      host_stages = v_opp_stages, host_statuses = v_opp_statuses,
      guest_ability_started = guest_ability_started or (_phase = 'battle_start')
    where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (_match_id, greatest(0, _question_index), v_uid, 'opponent', null, 'ability', _pokemon_id, 'stat_stage', jsonb_build_object('phase', _phase));

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages, 'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses, 'guestStatuses', v_match.guest_statuses
  );
end;
$$;

grant execute on function public.apply_pvp_signature_effect(uuid, int, int, text, int) to authenticated;

-- Non-legendary TYPE abilities (abilities.ts) for Nearby Battle (live PvP).
-- Legendary/Mythical partners run their Signature ability instead — the two are
-- mutually exclusive per partner — so this catalog is only ever invoked for a
-- non-legendary partner. Same trust model as pvp_signature_effects: the client
-- names WHICH ability (by its text id) and phase, and the server looks up the
-- fixed magnitude here; the client can never supply a raw magnitude. Pure
-- damage / self-damage number tweaks stay client-side (already clamped to
-- [0,60] in submit_pvp_live_answer); only HP heals, stat stages, statuses and
-- cures — the authoritative-row mutations — reach this catalog.

-- Each side's resolved type-ability id (null for a legendary partner or a legacy
-- row). Lets the opponent name the ability for attribution/"in play" toasts.
alter table public.pvp_live_matches
  add column if not exists host_ability_id text,
  add column if not exists guest_ability_id text,
  add column if not exists host_type_ability_started boolean not null default false,
  add column if not exists guest_type_ability_started boolean not null default false;

create table if not exists public.pvp_type_ability_effects (
  ability_id text not null,
  effect_index int not null,
  phase text not null check (phase in ('battle_start', 'post_answer')),
  target text not null check (target in ('self', 'opponent')),
  kind text not null check (kind in ('stat_stage', 'status', 'cure', 'heal', 'drain', 'damage')),
  payload jsonb not null,
  primary key (ability_id, effect_index)
);

grant select on public.pvp_type_ability_effects to authenticated;
grant all on public.pvp_type_ability_effects to service_role;

insert into public.pvp_type_ability_effects (ability_id, effect_index, phase, target, kind, payload) values
  -- battle_start standing buffs
  ('adaptable',   0, 'battle_start', 'self',     'stat_stage', '{"stat":"defense","delta":1}'::jsonb),
  ('swift-swim',  0, 'battle_start', 'self',     'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  ('sand-veil',   0, 'battle_start', 'self',     'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  ('aerilate',    0, 'battle_start', 'self',     'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  ('intimidate',  0, 'battle_start', 'opponent', 'stat_stage', '{"stat":"attack","delta":-1}'::jsonb),
  -- post_answer triggered effects (client decides the timing; magnitude here)
  ('leech-seed',  0, 'post_answer',  'self',     'heal',   '{"amount":2}'::jsonb),
  ('ice-body',    0, 'post_answer',  'self',     'heal',   '{"amount":6}'::jsonb),
  ('torrent',     0, 'post_answer',  'self',     'heal',   '{"amount":10}'::jsonb),
  ('pixie-dust',  0, 'post_answer',  'self',     'heal',   '{"amount":5}'::jsonb),
  ('cursed-body', 0, 'post_answer',  'self',     'heal',   '{"amount":8}'::jsonb),
  ('hydration',   0, 'post_answer',  'self',     'cure',   '{"status":"confused"}'::jsonb),
  ('shield-dust', 0, 'post_answer',  'self',     'cure',   '{"status":"confused"}'::jsonb),
  ('toxic',       0, 'post_answer',  'self',     'cure',   '{"status":"poisoned"}'::jsonb),
  ('toxic',       1, 'post_answer',  'self',     'cure',   '{"status":"confused"}'::jsonb),
  ('poison-touch',0, 'post_answer',  'opponent', 'status', '{"status":"poisoned","questions":2}'::jsonb),
  ('corrosion',   0, 'post_answer',  'opponent', 'damage', '{"amount":2}'::jsonb),
  ('shadow-tag',  0, 'post_answer',  'opponent', 'damage', '{"amount":2}'::jsonb),
  ('stealth-rock',0, 'post_answer',  'opponent', 'damage', '{"amount":3}'::jsonb)
on conflict (ability_id, effect_index) do nothing;

-- Apply a non-legendary partner's type-ability effects for the given phase.
-- Mirrors apply_pvp_signature_effect: validates ownership + active match, looks
-- up the fixed magnitudes by ability id, and reuses the shared stage/status
-- helpers so clamps and status-exclusivity rules are honored. Adds the 'damage'
-- kind (opponent HP down with NO self-heal, unlike 'drain'). If the caller's
-- ability id is already registered on the row it must match (anti-cheat: a
-- client can't invoke a different ability's effect); an unregistered side is
-- trusted on first use, mirroring the signature system.
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

  -- battle_start effects apply exactly once per side.
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
      host_type_ability_started = host_type_ability_started or (_phase = 'battle_start')
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp, host_hp = v_opp_hp,
      guest_stages = v_self_stages, guest_statuses = v_self_statuses,
      host_stages = v_opp_stages, host_statuses = v_opp_statuses,
      guest_ability_id = coalesce(guest_ability_id, _ability_id),
      guest_type_ability_started = guest_type_ability_started or (_phase = 'battle_start')
    where id = _match_id;
  end if;

  -- Log for the opponent's attribution toast (source='ability', no dex id;
  -- the ability id rides in the payload so the opponent resolves the name).
  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (_match_id, greatest(0, _question_index), v_uid, 'opponent', null, 'ability', null, 'stat_stage',
          jsonb_build_object('phase', _phase, 'abilityId', _ability_id));

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages, 'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses, 'guestStatuses', v_match.guest_statuses
  );
end;
$$;

grant execute on function public.apply_pvp_type_ability_effect(uuid, int, text, text) to authenticated;

-- Extend set_live_pvp_partner to also register the caller's resolved type-ability
-- id (write-once, side-aware) so the opponent can name it. Drop the 2-arg form
-- so PostgREST sees a single unambiguous signature; the new arg defaults to null
-- for a legendary partner (which registers a signature via its dex id instead).
drop function if exists public.set_live_pvp_partner(uuid, int);

create or replace function public.set_live_pvp_partner(
  _match_id uuid,
  _partner_id int,
  _ability_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
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

  if v_uid = v_match.host_id then
    update public.pvp_live_matches
      set host_partner_id = coalesce(host_partner_id, _partner_id),
          host_ability_id = coalesce(host_ability_id, _ability_id)
      where id = _match_id
      returning * into v_match;
  else
    update public.pvp_live_matches
      set guest_partner_id = coalesce(guest_partner_id, _partner_id),
          guest_ability_id = coalesce(guest_ability_id, _ability_id)
      where id = _match_id
      returning * into v_match;
  end if;

  return jsonb_build_object(
    'ok', true,
    'hostPartnerId', v_match.host_partner_id,
    'guestPartnerId', v_match.guest_partner_id,
    'bothKnown', v_match.host_partner_id is not null and v_match.guest_partner_id is not null
  );
end;
$$;

grant execute on function public.set_live_pvp_partner(uuid, int, text) to authenticated;

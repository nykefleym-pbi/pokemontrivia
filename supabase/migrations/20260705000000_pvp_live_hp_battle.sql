-- Nearby Battle rework: turn `pvp_live_matches` into a real-time HP-endurance
-- battle. Both trainers get a live HP pool, Attack/Defense/Speed/Crit stat
-- stages, and shared status conditions; items/berries can mutate the LIVE
-- opponent's stats via a server-validated effects channel instead of the
-- old completion-only realtime signal.
--
-- Server-authoritative model / trust boundary (documented, not full combat
-- re-simulation): per-question damage is computed CLIENT-SIDE (using the same
-- pvp-combat.ts formula both trainers run) and submitted via
-- `submit_pvp_live_answer`, which clamps it to a sane ceiling so a malicious
-- client can't one-shot the opponent. Item/berry EFFECTS (stat stages,
-- statuses, heals) are looked up from the server-side `pvp_item_effects`
-- catalog by item id — the client cannot supply an arbitrary magnitude for a
-- named item, only pick which known item to use — and the resulting mutation
-- is written straight to the authoritative match row, never trusted from a
-- raw peer-to-peer payload. Full inventory-ownership verification (i.e.
-- confirming server-side that the caller's persisted inventory actually holds
-- the berry) is out of scope for this pass because the item inventory itself
-- is local/client-persisted (zustand + localStorage), not synced to Supabase;
-- this is called out as a follow-up in the implementation report.

alter table public.pvp_live_matches
  add column host_hp int not null default 120,
  add column guest_hp int not null default 120,
  add column host_stages jsonb not null default '{"attack":0,"defense":0,"speed":0,"crit":0}'::jsonb,
  add column guest_stages jsonb not null default '{"attack":0,"defense":0,"speed":0,"crit":0}'::jsonb,
  add column host_statuses jsonb not null default '[]'::jsonb,
  add column guest_statuses jsonb not null default '[]'::jsonb,
  add column host_correct_live int not null default 0,
  add column guest_correct_live int not null default 0,
  add column host_answered_live int not null default 0,
  add column guest_answered_live int not null default 0,
  add column host_time_ms_live bigint not null default 0,
  add column guest_time_ms_live bigint not null default 0,
  add column host_items_used int not null default 0,
  add column guest_items_used int not null default 0,
  add column host_last_submitted_idx int not null default -1,
  add column guest_last_submitted_idx int not null default -1,
  add column live_resolved_at timestamptz;

-- Server-side catalog of the item effects usable in the live HP battle. The
-- client names an item id; the server looks up what it actually does. Mirrors
-- (a strict subset of) src/lib/game-data.ts ITEMS — kept intentionally small
-- in this pass to the items with authoritative server-side reach: the three
-- healing potions (self-heal touches server HP) and all 14 PvP berries.
-- Everything else usable in Nearby Battle (X Attack, Scope Lens, X Accuracy)
-- stays a client-local flag/UI-aid exactly like Solo and never needs to
-- mutate this table.
create table public.pvp_item_effects (
  item_id text primary key,
  target text not null check (target in ('self', 'opponent')),
  kind text not null check (kind in ('stat_stage', 'status', 'cure', 'immunity', 'heal')),
  payload jsonb not null
);

grant select on public.pvp_item_effects to authenticated;
grant all on public.pvp_item_effects to service_role;

insert into public.pvp_item_effects (item_id, target, kind, payload) values
  ('potion', 'self', 'heal', '{"amount": 30}'),
  ('superpotion', 'self', 'heal', '{"amount": 60}'),
  ('maxpotion', 'self', 'heal', '{"full": true}'),
  ('cheriberry', 'self', 'cure', '{"status": "paralysis"}'),
  ('chestoberry', 'self', 'cure', '{"status": "sleep"}'),
  ('pechaberry', 'self', 'cure', '{"status": "poisoned"}'),
  ('rawstberry', 'self', 'cure', '{"status": "burn"}'),
  ('persimberry', 'self', 'cure', '{"status": "confused"}'),
  ('lumberry', 'self', 'cure', '{"status": "any", "immunityQuestions": 1}'),
  ('liechiberry', 'self', 'stat_stage', '{"stat": "attack", "delta": 1, "questions": 3}'),
  ('ganlonberry', 'self', 'stat_stage', '{"stat": "defense", "delta": 1, "questions": 3}'),
  ('salacberry', 'opponent', 'stat_stage', '{"stat": "speed", "delta": -1, "questions": 3}'),
  ('starfberry', 'self', 'stat_stage', '{"stat": "random", "delta": 2, "questions": 3}'),
  ('tangaberry', 'opponent', 'stat_stage', '{"stat": "attack", "delta": -1, "questions": 3}'),
  ('kasibberry', 'opponent', 'stat_stage', '{"stat": "defense", "delta": -1, "questions": 3}'),
  ('chopleberry', 'opponent', 'status', '{"status": "confused", "questions": 2}'),
  ('colburberry', 'opponent', 'stat_stage', '{"stat": "speed", "delta": -2, "questions": 3}');

-- Append-only effect log both clients subscribe to (via postgres_changes
-- INSERT) purely for toast/animation attribution ("Opponent used Tanga Berry
-- — your Attack ▼"); the authoritative state change itself lands in the
-- pvp_live_matches row columns above in the same transaction.
create table public.pvp_live_effects (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.pvp_live_matches(id) on delete cascade,
  question_index int not null,
  source_id uuid not null references public.profiles(id),
  target text not null check (target in ('self', 'opponent')),
  item_id text not null,
  kind text not null check (kind in ('stat_stage', 'status', 'cure', 'immunity', 'heal')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pvp_live_effects enable row level security;
grant select on public.pvp_live_effects to authenticated;
grant all on public.pvp_live_effects to service_role;

create policy "pvp_live_effects_select_participant" on public.pvp_live_effects
  for select to authenticated
  using (
    exists (
      select 1 from public.pvp_live_matches m
      where m.id = match_id and (m.host_id = auth.uid() or m.guest_id = auth.uid())
    )
  );

alter publication supabase_realtime add table public.pvp_live_effects;
alter table public.pvp_live_effects replica identity full;

-- Statuses considered "major" (mutually exclusive with each other; a new
-- major replaces an old one). Confusion is the sole volatile and always
-- coexists. Mirrors STATUS_META in src/lib/game-data.ts.
create or replace function public._pvp_is_major_status(_kind text)
returns boolean
language sql
immutable
as $$
  select _kind in ('poisoned', 'badly-poisoned', 'burn', 'paralysis', 'sleep', 'freeze');
$$;

-- Apply a status object to a jsonb array of ActiveStatus per the shared
-- stacking rule (one major at a time; confusion stacks freely).
create or replace function public._pvp_apply_status(_statuses jsonb, _kind text, _cures int)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_filtered jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(_statuses, '[]'::jsonb))
  loop
    if v_item->>'kind' = _kind then
      continue;
    end if;
    if public._pvp_is_major_status(_kind) and public._pvp_is_major_status(v_item->>'kind') then
      continue;
    end if;
    v_filtered := v_filtered || jsonb_build_array(v_item);
  end loop;
  return v_filtered || jsonb_build_array(jsonb_build_object(
    'kind', _kind,
    'curesRemaining', _cures,
    'appliedAt', (extract(epoch from now()) * 1000)::bigint
  ));
end;
$$;

create or replace function public._pvp_cure_status(_statuses jsonb, _kind text)
returns jsonb
language sql
immutable
as $$
  select case
    when _kind = 'any' then '[]'::jsonb
    else coalesce(
      (select jsonb_agg(s) from jsonb_array_elements(coalesce(_statuses, '[]'::jsonb)) s
       where s->>'kind' != _kind),
      '[]'::jsonb
    )
  end;
$$;

create or replace function public._pvp_bump_stage(_stages jsonb, _stat text, _delta int)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_stat text := _stat;
  v_current int;
  v_next int;
begin
  if v_stat = 'random' then
    v_stat := (array['attack', 'defense', 'speed', 'crit'])[1 + floor(random() * 4)::int];
  end if;
  v_current := coalesce((_stages->>v_stat)::int, 0);
  v_next := greatest(-3, least(3, v_current + _delta));
  return coalesce(_stages, '{}'::jsonb) || jsonb_build_object(v_stat, v_next);
end;
$$;

-- Use an item/berry in a live match. Looks up the effect from the
-- server-side catalog (the client cannot supply its own magnitude for a named
-- item), applies it to the authoritative row, enforces the same
-- MAX_ITEMS_PER_BATTLE=3 cap as Solo (counted server-side per match/player),
-- and logs an entry to pvp_live_effects for the other client's toast.
create or replace function public.use_pvp_live_item(
  _match_id uuid,
  _question_index int,
  _item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_effect public.pvp_item_effects;
  v_i_am_host boolean;
  v_used_count int;
  v_target text;
  v_self_stages jsonb;
  v_self_statuses jsonb;
  v_self_hp int;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
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

  select * into v_effect from public.pvp_item_effects where item_id = _item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_item');
  end if;

  v_i_am_host := v_uid = v_match.host_id;
  v_used_count := case when v_i_am_host then v_match.host_items_used else v_match.guest_items_used end;
  if v_used_count >= 3 then
    return jsonb_build_object('ok', false, 'error', 'item_cap');
  end if;

  -- "target" in the effect catalog is relative to the USER of the item;
  -- resolve to host/guest columns based on who's calling and which side the
  -- effect targets.
  v_target := v_effect.target;
  v_self_stages := case when v_i_am_host then v_match.host_stages else v_match.guest_stages end;
  v_self_statuses := case when v_i_am_host then v_match.host_statuses else v_match.guest_statuses end;
  v_self_hp := case when v_i_am_host then v_match.host_hp else v_match.guest_hp end;
  v_opp_stages := case when v_i_am_host then v_match.guest_stages else v_match.host_stages end;
  v_opp_statuses := case when v_i_am_host then v_match.guest_statuses else v_match.host_statuses end;

  if v_effect.kind = 'heal' then
    if (v_effect.payload->>'full')::boolean is true then
      v_self_hp := 120;
    else
      v_self_hp := least(120, v_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
    end if;
  elsif v_effect.kind = 'stat_stage' then
    if v_target = 'self' then
      v_self_stages := public._pvp_bump_stage(v_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    else
      v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    end if;
  elsif v_effect.kind = 'status' then
    if v_target = 'self' then
      v_self_statuses := public._pvp_apply_status(v_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    else
      v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    end if;
  elsif v_effect.kind = 'cure' then
    v_self_statuses := public._pvp_cure_status(v_self_statuses, v_effect.payload->>'status');
  end if;

  if v_i_am_host then
    update public.pvp_live_matches set
      host_hp = v_self_hp,
      host_stages = v_self_stages,
      host_statuses = v_self_statuses,
      guest_stages = v_opp_stages,
      guest_statuses = v_opp_statuses,
      host_items_used = host_items_used + 1
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_hp = v_self_hp,
      guest_stages = v_self_stages,
      guest_statuses = v_self_statuses,
      host_stages = v_opp_stages,
      host_statuses = v_opp_statuses,
      guest_items_used = guest_items_used + 1
    where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
  values (_match_id, _question_index, v_uid, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostHp', v_match.host_hp,
    'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages,
    'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses,
    'guestStatuses', v_match.guest_statuses
  );
end;
$$;

grant execute on function public.use_pvp_live_item(uuid, int, text) to authenticated;

-- Submit the caller's outcome for one question: whether they answered
-- correctly, how much damage they dealt to the opponent, how much
-- self-damage they took (wrong answers / poison-style DoT / burn-adjacent
-- chip), and how long they took. Damage values are computed client-side
-- (see pvp-combat.ts, run identically by both trainers) and clamped here to
-- a sane ceiling so a malicious client can't one-shot the opponent.
-- Resolves the match (status/winner) on sudden-KO or after PVP_QUESTIONS(20).
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
  v_resolved boolean := false;
  v_winner uuid;
  v_h_acc numeric;
  v_g_acc numeric;
  v_h_avg numeric;
  v_g_avg numeric;
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
    v_my_hp := greatest(0, v_match.host_hp - v_self_dmg);
    v_opp_hp := greatest(0, v_match.guest_hp - v_dmg);
    update public.pvp_live_matches set
      host_hp = v_my_hp,
      guest_hp = v_opp_hp,
      host_correct_live = host_correct_live + (case when _correct then 1 else 0 end),
      host_answered_live = host_answered_live + 1,
      host_time_ms_live = host_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      host_last_submitted_idx = _question_index
    where id = _match_id;
  else
    v_my_hp := greatest(0, v_match.guest_hp - v_self_dmg);
    v_opp_hp := greatest(0, v_match.host_hp - v_dmg);
    update public.pvp_live_matches set
      guest_hp = v_my_hp,
      host_hp = v_opp_hp,
      guest_correct_live = guest_correct_live + (case when _correct then 1 else 0 end),
      guest_answered_live = guest_answered_live + 1,
      guest_time_ms_live = guest_time_ms_live + greatest(0, coalesce(_time_ms, 0)),
      guest_last_submitted_idx = _question_index
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;

  -- Sudden KO, or both sides have answered all 20 questions.
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

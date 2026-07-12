-- signature-rework M4 — the engine becomes the SOLE driver of all 104 rows.
--
-- Two things land here:
--
-- A. The 33 Gen VIII/IX rows from the owner's second spreadsheet (Zeraora #807 →
--    Pecharunt #1025). With these, every Legendary/Mythical on the roster is
--    engine-driven; the "non-rework tail" no longer exists.
--
-- B. `engine_status` — the channel that actually DELIVERS an engine row's status.
--    This closes a real bug: 34 rows carry `engine.status` in the TS catalog and
--    NOTHING ever applied it. Statuses were still being delivered by the LEGACY
--    trigger/effect path. Owner ruling 2026-07-12 ("remove the legacy") makes the
--    engine authoritative, so those 34 statuses need a server home — this one.
--    Generated straight from the catalog by scripts/gen-engine-status-sql.ts, so
--    the client and the DB cannot drift.
--
-- Six mechanics here never existed in the game before, and every one is
-- server-owned because a client must never be trusted with it:
--
--   instant_ko      — Urshifu #892 (30%), Fezandipiti #1016 (10%), Terapagos
--                     #1024 (50%). The SERVER rolls it. A client claiming "I KO'd
--                     them" would be an instant-win cheat.
--   shield          — Zamazenta #889 / Iron Boulder #1022 take 0 damage for 3
--                     questions. Enforced in submit_pvp_live_answer off the
--                     DEFENDER's runtime: the ATTACKER computes the damage, so
--                     only the server can throw it away.
--   selfDmgZero     — Eternatus #890's wrong answers cost it no HP (the `_self_dmg`
--                     channel ONLY — it still takes the opponent's hits in full).
--   oppTimer        — the Loyal Three (#1014/#1015/#1016) crush the opponent's
--                     answer clock from 20s to 5s for 5 questions.
--   frac_hp_current — the Ruination quartet (#1001-#1004) halve the opponent's
--                     CURRENT HP, once per battle.
--   2 new disables  — Eternatus is inert vs Zacian/Zamazenta; Terapagos is inert
--                     once its owner has drunk any healing item.
--
-- Trust model unchanged: the client names WHICH partner and WHICH phase fired; the
-- server reads every magnitude from pvp_signature_effects. A tampered client can
-- change WHEN something fires, never HOW MUCH.
--
-- ROLLBACK:
--   delete from public.pvp_signature_effects where phase in ('engine_status','m4_fx');
--   delete from public.pvp_signature_effects where effect_index in (90, 91)
--     and pokemon_id in (893, 894);
--   drop trigger if exists pvp_live_effects_mark_healing on public.pvp_live_effects;
--   alter table public.pvp_live_matches
--     drop column if exists host_used_healing, drop column if exists guest_used_healing;
--   (then re-run 20260711133000 to restore submit_pvp_live_answer.)

-- ── 0. Track healing-item use (Terapagos #1024's disable) ────────────────────
-- host/guest_items_used already exists but counts EVERY item; Terapagos is gated
-- specifically on HEALING.
alter table public.pvp_live_matches
  add column if not exists host_used_healing boolean not null default false,
  add column if not exists guest_used_healing boolean not null default false;

-- Item uses log to pvp_live_effects with a NON-NULL item_id (ability rows carry
-- item_id = null). A trigger keeps the flag correct for the human RPC, the bot RPC
-- and the Marshadow mirror at once, without rewriting any of them.
create or replace function public._pvp_mark_used_healing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.item_id is null or new.kind <> 'heal' then
    return new;
  end if;
  update public.pvp_live_matches m set
    host_used_healing  = m.host_used_healing  or (m.host_id  = new.source_id),
    guest_used_healing = m.guest_used_healing or (m.guest_id = new.source_id)
  where m.id = new.match_id;
  return new;
end;
$$;

drop trigger if exists pvp_live_effects_mark_healing on public.pvp_live_effects;
create trigger pvp_live_effects_mark_healing
  after insert on public.pvp_live_effects
  for each row execute function public._pvp_mark_used_healing();

-- ── 1. Widen the effect catalog ─────────────────────────────────────────────
-- `engine_status` and `m4_fx` are DEDICATED phases, not reuses of post_answer /
-- bespoke: several of these dex ids (e.g. Munkidori #1015, Zekrom #643) ALREADY
-- carry a legacy post_answer status row, and firing both would double-inflict.
alter table public.pvp_signature_effects
  drop constraint if exists pvp_signature_effects_phase_check,
  add constraint pvp_signature_effects_phase_check
    check (phase in ('battle_start', 'post_answer', 'manual', 'bespoke',
                     'engine_status', 'm4_fx'));

alter table public.pvp_signature_effects
  drop constraint if exists pvp_signature_effects_kind_check,
  add constraint pvp_signature_effects_kind_check
    check (kind in ('stat_stage', 'status', 'cure', 'heal', 'drain', 'stat_scale',
                    'swap_stages', 'cleanse', 'suppress_ability',
                    'dot_frac_hp', 'frac_hp_random', 'flat_next_question_damage',
                    'reflect_opponent_stat', 'predicted_status_apply',
                    'instant_ko', 'frac_hp_current'));

-- ── 2. engine_status rows — ALL 34 engine rows that inflict a status ─────────
-- Generated by scripts/gen-engine-status-sql.ts from src/lib/signature-abilities.ts.
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (144, 80, 'engine_status', 'opponent', 'status', '{"status":"freeze","chance":0.1,"questions":2}'::jsonb),
  (146, 80, 'engine_status', 'opponent', 'status', '{"status":"sleep","chance":0.2,"questions":2}'::jsonb),
  (243, 80, 'engine_status', 'opponent', 'status', '{"status":"paralysis","chance":0.3,"questions":3}'::jsonb),
  (244, 80, 'engine_status', 'opponent', 'status', '{"status":"burn","chance":0.5,"questions":3}'::jsonb),
  (378, 80, 'engine_status', 'opponent', 'status', '{"status":"freeze","chance":0.1,"questions":2}'::jsonb),
  (491, 80, 'engine_status', 'opponent', 'status', '{"status":"sleep","chance":1,"questions":2}'::jsonb),
  (641, 80, 'engine_status', 'opponent', 'status', '{"status":"confused","chance":0.2,"questions":2}'::jsonb),
  (642, 80, 'engine_status', 'opponent', 'status', '{"status":"paralysis","chance":0.2,"questions":3}'::jsonb),
  (643, 80, 'engine_status', 'opponent', 'status', '{"status":"burn","chance":0.2,"questions":3}'::jsonb),
  (644, 80, 'engine_status', 'opponent', 'status', '{"status":"paralysis","chance":0.2,"questions":3}'::jsonb),
  (645, 80, 'engine_status', 'opponent', 'status', '{"status":"burn","chance":0.2,"questions":3}'::jsonb),
  (646, 80, 'engine_status', 'opponent', 'status', '{"status":"freeze","chance":0.2,"questions":2}'::jsonb),
  (648, 80, 'engine_status', 'opponent', 'status', '{"status":"sleep","chance":0.2,"questions":2}'::jsonb),
  -- Genesect #649: the status itself is rolled at random (see _pvp_apply_engine_status).
  (649, 80, 'engine_status', 'opponent', 'status', '{"status":"random","chance":1,"questions":3}'::jsonb),
  (721, 80, 'engine_status', 'opponent', 'status', '{"status":"burn","chance":0.3,"questions":3}'::jsonb),
  (800, 80, 'engine_status', 'opponent', 'status', '{"status":"confused","chance":0.5,"questions":2}'::jsonb),
  (809, 80, 'engine_status', 'opponent', 'status', '{"status":"sleep","chance":0.3,"questions":3}'::jsonb),
  (890, 80, 'engine_status', 'opponent', 'status', '{"status":"badly-poisoned","chance":0.05,"questions":3}'::jsonb),
  (896, 80, 'engine_status', 'opponent', 'status', '{"status":"freeze","chance":1,"questions":3}'::jsonb),
  (897, 80, 'engine_status', 'opponent', 'status', '{"status":"badly-poisoned","chance":1,"questions":3}'::jsonb),
  (898, 80, 'engine_status', 'opponent', 'status', '{"status":"freeze","chance":1,"questions":3}'::jsonb),
  (1001, 80, 'engine_status', 'opponent', 'status', '{"status":"poisoned","chance":0.1,"questions":3}'::jsonb),
  (1002, 80, 'engine_status', 'opponent', 'status', '{"status":"freeze","chance":0.1,"questions":3}'::jsonb),
  (1003, 80, 'engine_status', 'opponent', 'status', '{"status":"confused","chance":0.1,"questions":3}'::jsonb),
  (1004, 80, 'engine_status', 'opponent', 'status', '{"status":"burn","chance":0.1,"questions":3}'::jsonb),
  (1014, 80, 'engine_status', 'opponent', 'status', '{"status":"confused","chance":0.1,"questions":3}'::jsonb),
  (1015, 80, 'engine_status', 'opponent', 'status', '{"status":"poisoned","chance":0.1,"questions":3}'::jsonb),
  -- Ogerpon #1017 only badly-poisons the Loyal Three — the grudge is a payload gate.
  (1017, 80, 'engine_status', 'opponent', 'status', '{"status":"badly-poisoned","chance":1,"questions":3,"ifOpponentSpeciesAny":[1014,1015,1016]}'::jsonb),
  (1020, 80, 'engine_status', 'opponent', 'status', '{"status":"burn","chance":1,"questions":3}'::jsonb),
  (1021, 80, 'engine_status', 'opponent', 'status', '{"status":"paralysis","chance":1,"questions":3}'::jsonb),
  (1022, 80, 'engine_status', 'opponent', 'status', '{"status":"confused","chance":1,"questions":3}'::jsonb),
  (1023, 80, 'engine_status', 'opponent', 'status', '{"status":"confused","chance":1,"questions":3}'::jsonb),
  (1025, 80, 'engine_status', 'opponent', 'status', '{"status":"badly-poisoned","chance":0.75,"questions":3}'::jsonb),
  (10194, 80, 'engine_status', 'opponent', 'status', '{"status":"badly-poisoned","chance":1,"questions":3}'::jsonb)
on conflict (pokemon_id, effect_index) do nothing;

-- ── 3. m4_fx rows — the new HP-touching effects ─────────────────────────────
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (892,  90, 'm4_fx', 'opponent', 'instant_ko',      '{"chance":0.3}'::jsonb),  -- Urshifu (behind a 5-streak)
  (1016, 90, 'm4_fx', 'opponent', 'instant_ko',      '{"chance":0.1}'::jsonb),  -- Fezandipiti
  (1024, 90, 'm4_fx', 'opponent', 'instant_ko',      '{"chance":0.5}'::jsonb),  -- Terapagos (only while doubled on HP)
  (1001, 90, 'm4_fx', 'opponent', 'frac_hp_current', '{"pct":0.5}'::jsonb),     -- Wo-Chien  \
  (1002, 90, 'm4_fx', 'opponent', 'frac_hp_current', '{"pct":0.5}'::jsonb),     -- Chien-Pao  | Ruination:
  (1003, 90, 'm4_fx', 'opponent', 'frac_hp_current', '{"pct":0.5}'::jsonb),     -- Ting-Lu    | halve current HP
  (1004, 90, 'm4_fx', 'opponent', 'frac_hp_current', '{"pct":0.5}'::jsonb)      -- Chi-Yu    /
on conflict (pokemon_id, effect_index) do nothing;

-- Regieleki #894 rides the EXISTING `bespoke`/frac_hp_random handler (1-15% of the
-- opponent's MAX HP per question — owner ruling). Zarude #893 heals to full and
-- clears its statuses; `heal` clamps at 120 = PVP_MAX_HP, so amount 120 is a full
-- heal with no new kind needed.
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (894, 90, 'bespoke', 'opponent', 'frac_hp_random', '{"minPct":0.01,"maxPct":0.15}'::jsonb),
  (893, 90, 'bespoke', 'self',     'heal',           '{"amount":120}'::jsonb),
  (893, 91, 'bespoke', 'self',     'cure',           '{"status":"any"}'::jsonb)
on conflict (pokemon_id, effect_index) do nothing;

-- ── 4. Helpers ──────────────────────────────────────────────────────────────
-- Is a runtime window (shieldThroughQ / oppTimerThroughQ) still open on question
-- `_q_no` (1-indexed)? A disabled row's windows are dead, so a Zamazenta that has
-- since eaten a wrong answer loses its shield immediately.
create or replace function public._pvp_m4_window_active(
  _runtime jsonb, _dex int, _key text, _q_no int
) returns boolean
language plpgsql
immutable
as $$
declare
  v_e jsonb;
begin
  if _dex is null then return false; end if;
  v_e := coalesce(_runtime, '{}'::jsonb) -> _dex::text;
  if v_e is null then return false; end if;
  if coalesce((v_e->>'disabled')::boolean, false) then return false; end if;
  return coalesce((v_e->>_key)::int, -1) >= _q_no;
end;
$$;

-- Eternatus #890 and Terapagos #1024 are the only rows whose disable depends on
-- MATCH STATE rather than on answering wrong. Checked server-side so a client
-- cannot simply decline to disable itself.
create or replace function public._pvp_m4_row_disabled(
  _match public.pvp_live_matches, _i_am_host boolean, _pokemon_id int
) returns boolean
language plpgsql
immutable
as $$
declare
  v_opp_partner int;
  v_used_healing boolean;
begin
  v_opp_partner  := case when _i_am_host then _match.guest_partner_id else _match.host_partner_id end;
  v_used_healing := case when _i_am_host then _match.host_used_healing else _match.guest_used_healing end;
  -- Eternatus is hard-countered by the two wolves.
  if _pokemon_id = 890 and coalesce(v_opp_partner, -1) in (888, 889) then
    return true;
  end if;
  -- Terapagos's comeback KO switches off for good once its owner has healed: you
  -- cannot drink your way back into range and still hold the trigger.
  if _pokemon_id = 1024 and coalesce(v_used_healing, false) then
    return true;
  end if;
  return false;
end;
$$;

-- ── 5. engine_status — deliver an engine row's status ───────────────────────
create or replace function public._pvp_apply_engine_status(
  _match_id uuid, _i_am_host boolean, _question_index int, _pokemon_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.pvp_live_matches;
  v_row public.pvp_signature_effects;
  v_opp_statuses jsonb;
  v_self_statuses jsonb;
  v_opp_partner int;
  v_status text;
  v_did_apply boolean := false;
  v_qidx int := greatest(0, _question_index);
begin
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'not_active');
  end if;
  if public._pvp_m4_row_disabled(v_match, _i_am_host, _pokemon_id) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'row_disabled');
  end if;

  v_self_statuses := case when _i_am_host then v_match.host_statuses else v_match.guest_statuses end;
  v_opp_statuses  := case when _i_am_host then v_match.guest_statuses else v_match.host_statuses end;
  v_opp_partner   := case when _i_am_host then v_match.guest_partner_id else v_match.host_partner_id end;

  for v_row in
    select * from public.pvp_signature_effects
    where pokemon_id = _pokemon_id and phase = 'engine_status' and kind = 'status'
    order by effect_index
  loop
    -- Ogerpon #1017: only fires into the species named in the payload.
    if v_row.payload ? 'ifOpponentSpeciesAny'
       and not exists (
         select 1 from jsonb_array_elements_text(v_row.payload->'ifOpponentSpeciesAny') s
         where s::int = coalesce(v_opp_partner, -1)
       ) then
      continue;
    end if;

    if random() >= coalesce((v_row.payload->>'chance')::numeric, 1) then
      continue;
    end if;

    v_status := v_row.payload->>'status';
    -- Genesect #649 rolls WHICH status it inflicts.
    if v_status = 'random' then
      v_status := (array['poisoned','burn','paralysis','sleep','freeze','confused'])[1 + floor(random() * 6)::int];
    end if;

    if v_row.target = 'self' then
      v_self_statuses := public._pvp_apply_status(v_self_statuses, v_status, coalesce((v_row.payload->>'questions')::int, 3));
    else
      v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_status, coalesce((v_row.payload->>'questions')::int, 3));
    end if;
    v_did_apply := true;
  end loop;

  if not v_did_apply then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'no_roll');
  end if;

  if _i_am_host then
    update public.pvp_live_matches set
      host_statuses = v_self_statuses, guest_statuses = v_opp_statuses
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_statuses = v_self_statuses, host_statuses = v_opp_statuses
    where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (
    _match_id, v_qidx,
    case when _i_am_host then v_match.host_id else v_match.guest_id end,
    'opponent', null, 'ability', _pokemon_id, 'status', jsonb_build_object('phase', 'engine_status')
  );

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostStatuses', v_match.host_statuses,
    'guestStatuses', v_match.guest_statuses
  );
end;
$$;

revoke all on function public._pvp_apply_engine_status(uuid, boolean, int, int) from public;

-- ── 6. m4_fx — instant KO / halve-current-HP ────────────────────────────────
create or replace function public._pvp_apply_m4_fx(
  _match_id uuid, _i_am_host boolean, _question_index int, _pokemon_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.pvp_live_matches;
  v_row public.pvp_signature_effects;
  v_opp_hp int;
  v_did_apply boolean := false;
  v_ko boolean := false;
  v_qidx int := greatest(0, _question_index);
  v_winner uuid;
begin
  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'not_active');
  end if;
  if public._pvp_m4_row_disabled(v_match, _i_am_host, _pokemon_id) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'row_disabled');
  end if;

  v_opp_hp := case when _i_am_host then v_match.guest_hp else v_match.host_hp end;

  for v_row in
    select * from public.pvp_signature_effects
    where pokemon_id = _pokemon_id and phase = 'm4_fx'
    order by effect_index
  loop
    if v_row.kind = 'instant_ko' then
      -- SERVER-rolled. The client never gets to say "I won".
      if random() < coalesce((v_row.payload->>'chance')::numeric, 0) then
        v_opp_hp := 0;
        v_ko := true;
        v_did_apply := true;
      end if;
    elsif v_row.kind = 'frac_hp_current' then
      -- Ruination: take a fraction of what they have LEFT. Floor of 1 so it is
      -- never a whiff, and it can never finish them off by itself.
      v_opp_hp := greatest(
        0,
        v_opp_hp - greatest(1, floor(v_opp_hp * coalesce((v_row.payload->>'pct')::numeric, 0.5))::int)
      );
      v_did_apply := true;
    end if;
  end loop;

  if not v_did_apply then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'no_roll');
  end if;

  if _i_am_host then
    update public.pvp_live_matches set guest_hp = v_opp_hp where id = _match_id;
  else
    update public.pvp_live_matches set host_hp = v_opp_hp where id = _match_id;
  end if;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (
    _match_id, v_qidx,
    case when _i_am_host then v_match.host_id else v_match.guest_id end,
    'opponent', null, 'ability', _pokemon_id, 'heal',
    jsonb_build_object('phase', 'm4_fx', 'instantKo', v_ko)
  );

  -- An instant KO resolves the match immediately — the loser is at 0.
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if (v_match.host_hp <= 0 or v_match.guest_hp <= 0) and v_match.status = 'active' then
    if v_match.host_hp > v_match.guest_hp then
      v_winner := v_match.host_id;
    elsif v_match.guest_hp > v_match.host_hp then
      v_winner := v_match.guest_id;
    else
      v_winner := null;
    end if;
    update public.pvp_live_matches set
      status = 'completed', winner_id = v_winner, live_resolved_at = now()
    where id = _match_id;
    select * into v_match from public.pvp_live_matches where id = _match_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'instantKo', v_ko,
    'hostHp', v_match.host_hp,
    'guestHp', v_match.guest_hp,
    'resolved', v_match.status = 'completed',
    'winnerId', v_match.winner_id
  );
end;
$$;

revoke all on function public._pvp_apply_m4_fx(uuid, boolean, int, int) from public;

-- ── 7. Runtime windows: shield / selfDmgZero / opponent-timer ───────────────
-- Called on the question the trigger fires. The client names the row; the SERVER
-- clamps every magnitude (a timer can never be squeezed below 3s, no matter what
-- a tampered client asks for).
create or replace function public._pvp_m4_window_apply(
  _match_id uuid,
  _i_am_host boolean,
  _question_index int,
  _pokemon_id int,
  _shield_questions int,
  _self_dmg_zero boolean,
  _opp_timer_ms int,
  _opp_timer_questions int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.pvp_live_matches;
  v_runtime jsonb;
  v_dex text := _pokemon_id::text;
  v_entry jsonb;
  v_q_no int := greatest(0, _question_index) + 1;
  v_shield_q int;
  v_timer_ms int;
  v_timer_q int;
begin
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if public._pvp_m4_row_disabled(v_match, _i_am_host, _pokemon_id) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'row_disabled');
  end if;

  v_runtime := case when _i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
  v_entry := coalesce(coalesce(v_runtime, '{}'::jsonb) -> v_dex, '{}'::jsonb);

  -- A row already on cooldown gets no new windows.
  if coalesce((v_entry->>'disabled')::boolean, false) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'disabled');
  end if;

  if coalesce(_shield_questions, 0) > 0 then
    v_shield_q := least(greatest(_shield_questions, 1), 5);
    v_entry := v_entry || jsonb_build_object('shieldThroughQ', v_q_no + v_shield_q - 1);
  end if;

  if coalesce(_self_dmg_zero, false) then
    v_entry := v_entry || jsonb_build_object('selfDmgZero', true);
  end if;

  if coalesce(_opp_timer_ms, 0) > 0 and coalesce(_opp_timer_questions, 0) > 0 then
    v_timer_ms := greatest(least(_opp_timer_ms, 20000), 3000); -- never below 3s
    v_timer_q  := least(greatest(_opp_timer_questions, 1), 5);
    v_entry := v_entry || jsonb_build_object(
      'oppTimerMs', v_timer_ms,
      'oppTimerThroughQ', v_q_no + v_timer_q - 1
    );
  end if;

  v_runtime := coalesce(v_runtime, '{}'::jsonb) || jsonb_build_object(v_dex, v_entry);
  if _i_am_host then
    update public.pvp_live_matches set host_sig_runtime = v_runtime where id = _match_id;
  else
    update public.pvp_live_matches set guest_sig_runtime = v_runtime where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostSigRuntime', v_match.host_sig_runtime,
    'guestSigRuntime', v_match.guest_sig_runtime
  );
end;
$$;

revoke all on function public._pvp_m4_window_apply(uuid, boolean, int, int, int, boolean, int, int) from public;

-- ── 8. Public wrappers (human = own side; bot = always the guest) ───────────
create or replace function public.pvp_sig_engine_status(
  _match_id uuid, _question_index int, _pokemon_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._pvp_apply_engine_status(_match_id, v_uid = v_match.host_id, _question_index, _pokemon_id);
end;
$$;

create or replace function public.pvp_bot_sig_engine_status(
  _match_id uuid, _question_index int, _pokemon_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid <> v_match.host_id or not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._pvp_apply_engine_status(_match_id, false, _question_index, _pokemon_id);
end;
$$;

create or replace function public.pvp_sig_m4_fx(
  _match_id uuid, _question_index int, _pokemon_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._pvp_apply_m4_fx(_match_id, v_uid = v_match.host_id, _question_index, _pokemon_id);
end;
$$;

create or replace function public.pvp_bot_sig_m4_fx(
  _match_id uuid, _question_index int, _pokemon_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid <> v_match.host_id or not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._pvp_apply_m4_fx(_match_id, false, _question_index, _pokemon_id);
end;
$$;

create or replace function public.pvp_sig_m4_window(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _shield_questions int default 0,
  _self_dmg_zero boolean default false,
  _opp_timer_ms int default 0,
  _opp_timer_questions int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._pvp_m4_window_apply(
    _match_id, v_uid = v_match.host_id, _question_index, _pokemon_id,
    _shield_questions, _self_dmg_zero, _opp_timer_ms, _opp_timer_questions
  );
end;
$$;

create or replace function public.pvp_bot_sig_m4_window(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _shield_questions int default 0,
  _self_dmg_zero boolean default false,
  _opp_timer_ms int default 0,
  _opp_timer_questions int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid <> v_match.host_id or not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._pvp_m4_window_apply(
    _match_id, false, _question_index, _pokemon_id,
    _shield_questions, _self_dmg_zero, _opp_timer_ms, _opp_timer_questions
  );
end;
$$;

grant execute on function public.pvp_sig_engine_status(uuid, int, int) to authenticated;
grant execute on function public.pvp_bot_sig_engine_status(uuid, int, int) to authenticated;
grant execute on function public.pvp_sig_m4_fx(uuid, int, int) to authenticated;
grant execute on function public.pvp_bot_sig_m4_fx(uuid, int, int) to authenticated;
grant execute on function public.pvp_sig_m4_window(uuid, int, int, int, boolean, int, int) to authenticated;
grant execute on function public.pvp_bot_sig_m4_window(uuid, int, int, int, boolean, int, int) to authenticated;

-- ── 9. submit_pvp_live_answer — enforce shield + selfDmgZero ────────────────
-- Identical to 20260706120000 (Ho-Oh Rainbow Rebirth, both KO paths) except for
-- the M4 clamp block, which runs BEFORE any HP math:
--   * the DEFENDER's shield zeroes the damage the ATTACKER just computed;
--   * the CALLER's selfDmgZero (Eternatus) zeroes their wrong-answer self-damage.
-- Both are read from sig_runtime, which only the server writes.
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
  v_my_revived boolean;
  v_my_stages jsonb;
  v_my_statuses jsonb;
  v_my_bonus_until int;
  v_my_bonus_prev int;
  v_pre_opp_hp int;
  v_opp_revived boolean;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
  v_opp_bonus_until int;
  -- M4 locals
  v_q_no int := greatest(0, _question_index) + 1;
  v_my_dex int;
  v_opp_dex int;
  v_my_runtime jsonb;
  v_opp_runtime jsonb;
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
    return jsonb_build_object(
      'ok', true,
      'hostHp', v_match.host_hp, 'guestHp', v_match.guest_hp,
      'resolved', v_match.status = 'completed'
    );
  end if;
  if _question_index >= 20 then
    return jsonb_build_object('ok', false, 'error', 'out_of_range');
  end if;

  -- ── M4 clamp ──────────────────────────────────────────────────────────────
  -- Resolve both partners through Mew's Transform, exactly as use_pvp_live_item does.
  v_my_dex := case
    when v_i_am_host then (case when v_match.host_partner_id = 151 then v_match.host_transform_id else v_match.host_partner_id end)
    else (case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end)
  end;
  v_opp_dex := case
    when v_i_am_host then (case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end)
    else (case when v_match.host_partner_id = 151 then v_match.host_transform_id else v_match.host_partner_id end)
  end;
  v_my_runtime  := case when v_i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
  v_opp_runtime := case when v_i_am_host then v_match.guest_sig_runtime else v_match.host_sig_runtime end;

  -- Zamazenta #889 / Iron Boulder #1022: the DEFENDER is shielded, so the damage
  -- this attacker just computed is thrown away. The attacker's client cannot know
  -- (or be trusted to honour) the defender's window — only we can.
  if public._pvp_m4_window_active(v_opp_runtime, v_opp_dex, 'shieldThroughQ', v_q_no) then
    v_dmg := 0;
  end if;

  -- Eternatus #890: wrong answers cost it nothing. Its own runtime flag, its own
  -- self-damage channel — the opponent's hits are untouched.
  if v_my_dex is not null and v_my_runtime is not null
     and coalesce(((v_my_runtime -> v_my_dex::text) ->> 'selfDmgZero')::boolean, false)
     and not coalesce(((v_my_runtime -> v_my_dex::text) ->> 'disabled')::boolean, false) then
    v_self_dmg := 0;
  end if;
  -- ──────────────────────────────────────────────────────────────────────────

  if v_i_am_host then
    v_pre_hp := v_match.host_hp - v_self_dmg;
    v_my_bonus_prev := v_match.host_revive_bonus_until;
    if v_pre_hp <= 0 and v_match.host_partner_id = 250 and not coalesce(v_match.host_revived, false) then
      v_my_hp := round(120 * 0.25)::int;
      v_my_revived := true;
      v_my_stages := public._pvp_bump_stage(v_match.host_stages, 'attack', 1);
      v_my_statuses := public._pvp_cure_status(v_match.host_statuses, 'any');
      v_my_bonus_until := _question_index + 1 + 2;
    else
      v_my_hp := greatest(0, v_pre_hp);
      v_my_revived := v_match.host_revived;
      v_my_stages := v_match.host_stages;
      v_my_statuses := v_match.host_statuses;
      v_my_bonus_until := v_match.host_revive_bonus_until;
    end if;
    v_pre_opp_hp := v_match.guest_hp - v_dmg;
    if v_pre_opp_hp <= 0 and v_match.guest_partner_id = 250 and not coalesce(v_match.guest_revived, false) then
      v_opp_hp := round(120 * 0.25)::int;
      v_opp_revived := true;
      v_opp_stages := public._pvp_bump_stage(v_match.guest_stages, 'attack', 1);
      v_opp_statuses := public._pvp_cure_status(v_match.guest_statuses, 'any');
      v_opp_bonus_until := _question_index + 1 + 2;
    else
      v_opp_hp := greatest(0, v_pre_opp_hp);
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
      guest_last_submitted_idx = _question_index
    where id = _match_id;

    if _correct and _question_index < v_my_bonus_prev and random() < 0.5 then
      update public.pvp_live_matches set
        host_statuses = public._pvp_apply_status(host_statuses, 'burn', 3)
      where id = _match_id;
    end if;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;

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

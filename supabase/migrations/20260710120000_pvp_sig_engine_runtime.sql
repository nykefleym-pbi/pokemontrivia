-- Signature-ability rework, M1+M2 engine core (docs/handoffs/signature-rework/02-architecture.md).
--
-- Adds the server-authoritative per-ability, per-side lifecycle runtime
-- (stacks / netByStat / consecutiveWrong / disabled / decay / re-arm — owner
-- rulings 1-3, 01b-owner-decisions.md) that today's `*_sig_state` (a single
-- 0..3 int, Moltres Wrath precedent) and `apply_pvp_signature_effect`'s
-- fire-and-forget `stat_stage`/`stat_scale` application cannot express: no
-- duration, no per-ability attribution, so a wrong answer can never "give
-- back" the stacks one ability alone contributed to a shared stage (F2).
--
-- Design choice ("(a)" per the Database Engineer brief): the per-ability
-- CATALOG spec (which stats, ramp/decay/one_shot, cap, disable condition)
-- stays CLIENT-SIDE in signature-abilities.ts (stub `SignatureEngineSpec`,
-- `src/lib/signature-rework-types.ts` §2/§3/§8) — the server does not store
-- or duplicate the 71-row catalog. Each call to the tick RPCs passes the
-- RESOLVED spec for the firing ability as arguments; the server owns only the
-- STATE MACHINE (counters, netByStat bookkeeping, ±3/±cap clamps, revert,
-- decay, re-arm, replay). See docs/handoffs/signature-rework/03-db.md for the
-- exact argument mapping Backend/Frontend must serialize.
--
-- PER-STAT tracking (revision R1): `netByStat` is a jsonb object keyed by
-- "<target>:<stat>" (e.g. "self:attack", "opponent:speed") -> the signed
-- stage delta THIS ability contributed to that (side, stat) cell of the
-- shared stage map. EVERY stat in a row's `_stat_specs` is tracked, so a
-- multi-stat ability (Kyogre +Atk/+Crit/+Speed; Rayquaza +Crit/-Def; Zygarde
-- fallback +Atk/+Def; Registeel/Phione ramp pairs; Xerneas +2/+2/+2) reverts
-- ALL of its stats together on the disable/incorrect condition (owner ruling
-- 1). `stacks` stays a single shared ramp counter — all ramp stats in a row
-- advance in lockstep per correct answer; the per-ability magnitude cap
-- (SIG_STACK_CAP, +3) is enforced per stat inside _pvp_bump_stage_tracked and
-- again by the global ±3 stage clamp inside _pvp_bump_stage.
--
-- Two entry points (revision R3): pvp_sig_engine_tick (a live participant
-- ticks THEIR OWN side via auth.uid) and pvp_bot_sig_engine_tick (the HOST's
-- session drives the bot/guest side in a bot match — the guest has no
-- auth.uid, mirroring apply_bot_pvp_signature_effect). Both resolve auth +
-- ownership then delegate the identical lifecycle to the internal
-- _pvp_sig_engine_apply so there is ONE lifecycle body, no drift.

-- ── 1. Runtime columns (additive, idempotent) ───────────────────────────────
-- Keyed by dex-id string -> SigRuntimeEntry (stub §7). Parallel to (does NOT
-- overload) the existing host/guest_sig_state single-int columns (F4).
alter table public.pvp_live_matches
  add column if not exists host_sig_runtime jsonb not null default '{}'::jsonb,
  add column if not exists guest_sig_runtime jsonb not null default '{}'::jsonb;

-- Dedicated per-side replay cursor for the sig-engine tick. Deliberately NOT
-- shared with host/guest_post_answer_last_idx (apply_pvp_signature_effect's
-- cursor) or the type-ability cursor (host/guest_type_ability_started,
-- 20260709120000): two RPCs advancing the same cursor in the same question
-- would false-positive each other's replay guard. Mirrors the *_last_idx
-- STYLE (F3), not the literal column, and keeps the dual-fire systems fully
-- independent per F6/R1.
alter table public.pvp_live_matches
  add column if not exists host_sig_engine_last_idx int not null default -1,
  add column if not exists guest_sig_engine_last_idx int not null default -1;

-- ── 2. Helper: tracked ramp/stack apply, per-stat (owner rulings 1 & 3) ──────
-- Applies a single stat's ramp increment. Increments the "<_target>:<_stat>"
-- slot of this dex's `netByStat` toward `_cap` (SIG_STACK_CAP, per-stat, per
-- ability); applies min(|_per_fire|, cap - |current slot|), signed to match
-- _per_fire's direction, via the existing _pvp_bump_stage clamp primitive
-- (kept unchanged — still the single ±3 stage clamp authority). The slot
-- accumulates the ACTUALLY-applied stage delta (post ±3 clamp diff), not the
-- intended one, so a later revert-to-0 is exact even if the shared stage was
-- already near its ±3 ceiling from another source. Does NOT touch `stacks`
-- (the caller owns the shared lockstep counter across all ramp stats in a row).
create or replace function public._pvp_bump_stage_tracked(
  _stages jsonb,
  _runtime jsonb,
  _dex text,
  _target text,
  _stat text,
  _per_fire int,
  _cap int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_entry jsonb := coalesce(_runtime->_dex, '{}'::jsonb);
  v_net jsonb := coalesce(v_entry->'netByStat', '{}'::jsonb);
  v_key text := coalesce(_target, 'self') || ':' || _stat;
  v_cur int := coalesce((v_net->>v_key)::int, 0);
  v_cap_abs int := abs(coalesce(_cap, 3));
  v_remaining int := greatest(0, v_cap_abs - abs(v_cur));
  v_sign int := case when coalesce(_per_fire, 0) < 0 then -1 else 1 end;
  v_intended int;
  v_before int;
  v_after int;
  v_actual int;
  v_new_stages jsonb := coalesce(_stages, '{}'::jsonb);
  v_new_runtime jsonb := coalesce(_runtime, '{}'::jsonb);
begin
  if _stat is null or coalesce(_per_fire, 0) = 0 or v_remaining <= 0 then
    return jsonb_build_object('stages', v_new_stages, 'runtime', v_new_runtime);
  end if;

  v_intended := v_sign * least(abs(_per_fire), v_remaining);
  v_before := coalesce((v_new_stages->>_stat)::int, 0);
  v_new_stages := public._pvp_bump_stage(v_new_stages, _stat, v_intended);
  v_after := coalesce((v_new_stages->>_stat)::int, 0);
  v_actual := v_after - v_before;

  v_net := v_net || jsonb_build_object(v_key, v_cur + v_actual);
  v_entry := v_entry || jsonb_build_object('netByStat', v_net);
  v_new_runtime := v_new_runtime || jsonb_build_object(_dex, v_entry);

  return jsonb_build_object('stages', v_new_stages, 'runtime', v_new_runtime);
end;
$$;

-- ── 3. Helper: revert-to-0, ALL stats (owner ruling 1) ──────────────────────
-- Loops EVERY key in this dex's `netByStat`, parses "<target>:<stat>", and
-- subtracts the tracked contribution from the correct stat on the correct
-- side's stage map (self or opponent) — so a multi-stat ability reverts all
-- of its buffs/debuffs at once (single writer of each contribution — R2).
-- Then clears the whole netByStat map and zeroes `stacks`. Returns
-- {selfStages, oppStages, runtime}. No-op stage touch when a slot is 0, but
-- still clears bookkeeping.
create or replace function public._pvp_revert_ability_stat(
  _self_stages jsonb,
  _opp_stages jsonb,
  _runtime jsonb,
  _dex text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_entry jsonb := coalesce(_runtime->_dex, '{}'::jsonb);
  v_net jsonb := coalesce(v_entry->'netByStat', '{}'::jsonb);
  v_self jsonb := coalesce(_self_stages, '{}'::jsonb);
  v_opp jsonb := coalesce(_opp_stages, '{}'::jsonb);
  v_new_runtime jsonb := coalesce(_runtime, '{}'::jsonb);
  v_key text;
  v_val int;
  v_sep int;
  v_target text;
  v_stat text;
begin
  for v_key, v_val in select key, value::int from jsonb_each_text(v_net)
  loop
    v_sep := position(':' in v_key);
    if v_sep > 0 and v_val <> 0 then
      v_target := left(v_key, v_sep - 1);
      v_stat := substr(v_key, v_sep + 1);
      if v_target = 'opponent' then
        v_opp := public._pvp_bump_stage(v_opp, v_stat, -v_val);
      else
        v_self := public._pvp_bump_stage(v_self, v_stat, -v_val);
      end if;
    end if;
  end loop;

  v_entry := v_entry || jsonb_build_object('netByStat', '{}'::jsonb, 'stacks', 0);
  v_new_runtime := v_new_runtime || jsonb_build_object(_dex, v_entry);

  return jsonb_build_object('selfStages', v_self, 'oppStages', v_opp, 'runtime', v_new_runtime);
end;
$$;

-- ── 4. Internal lifecycle body (shared by both tick RPCs — R3) ──────────────
-- Runs the deterministic per-answer lifecycle (§3 steps 2-8) for the side
-- selected by `_i_am_host`, then persists it. Assumes the CALLER has already
-- validated session / match-active / ownership and holds the row's FOR UPDATE
-- lock (both public tick RPCs do). Contains NO auth of its own, so it is
-- SECURITY DEFINER and REVOKED from PUBLIC (below) — only the definer-context
-- tick RPCs (running as this function's owner) may invoke it; a direct call by
-- `authenticated` is refused. Factored out so the ~200-line lifecycle exists
-- ONCE (no human/bot drift).
--
-- `_stat_specs` mirrors stub §2 `StatChangeSpec[]` verbatim:
--   ramp:     {"mode":"ramp","stat","target","perCorrect"}
--   decay:    {"mode":"decay","stat","target","initial","perQuestion","floor"}
--   one_shot: {"mode":"one_shot","stat","target","delta"}  (stat may be "random")
-- EVERY element is tracked into its own "<target>:<stat>" netByStat slot and
-- reverts on the disable/incorrect condition (R1 — no untracked path).
-- `_question_index` is 0-indexed (client loop); mapped to 1-indexed qNo (F1).
create or replace function public._pvp_sig_engine_apply(
  _match_id uuid,
  _i_am_host boolean,
  _question_index int,
  _pokemon_id int,
  _correct boolean,
  _trigger_fired boolean,
  _stat_specs jsonb,
  _disable_kind text,
  _disable_n int,
  _disable_next_question boolean,
  _stack_cap int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.pvp_live_matches;
  v_qidx int := greatest(0, _question_index);
  v_q_no int := greatest(0, _question_index) + 1;
  v_last_idx int;
  v_dex text := _pokemon_id::text;

  v_self_runtime jsonb;
  v_self_stages jsonb;
  v_opp_stages jsonb;

  v_entry jsonb;
  v_net jsonb;
  v_stacks int;
  v_consecutive_wrong int;
  v_disabled boolean;
  v_increase_disabled boolean;
  v_fired_this_battle boolean;
  v_phase_idx int;
  v_disabled_until_q int;
  v_already_fired boolean;
  v_skip_this_q boolean;
  v_did_apply boolean := false;
  v_ramp_arm boolean;
  v_did_ramp boolean;

  v_spec jsonb;
  v_mode_i text;
  v_stat_i text;
  v_target_i text;
  v_per_fire int;
  v_delta int;
  v_initial int;
  v_per_q int;
  v_floor int;

  v_key text;
  v_cur int;
  v_before int;
  v_after int;
  v_target_total int;
  v_incr int;

  v_tracked jsonb;
  v_reverted jsonb;
begin
  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Replay guard (dedicated cursor for the acting side).
  v_last_idx := case when _i_am_host then v_match.host_sig_engine_last_idx else v_match.guest_sig_engine_last_idx end;
  if v_qidx <= v_last_idx then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'stale');
  end if;

  v_self_runtime := case when _i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
  v_self_stages := case when _i_am_host then v_match.host_stages else v_match.guest_stages end;
  v_opp_stages := case when _i_am_host then v_match.guest_stages else v_match.host_stages end;

  v_entry := coalesce(v_self_runtime->v_dex, '{}'::jsonb);
  v_net := coalesce(v_entry->'netByStat', '{}'::jsonb);
  v_stacks := coalesce((v_entry->>'stacks')::int, 0);
  v_consecutive_wrong := coalesce((v_entry->>'consecutiveWrong')::int, 0);
  v_disabled := coalesce((v_entry->>'disabled')::boolean, false);
  v_increase_disabled := coalesce((v_entry->>'increaseDisabled')::boolean, false);
  v_fired_this_battle := coalesce((v_entry->>'firedThisBattle')::boolean, false);
  v_phase_idx := coalesce((v_entry->>'phaseIdx')::int, 0);
  v_disabled_until_q := coalesce((v_entry->>'disabledUntilQ')::int, -1);
  v_already_fired := v_fired_this_battle;

  -- Step 2/3 (§3): consecutive-wrong counter — a correct answer resets it.
  if _correct then
    v_consecutive_wrong := 0;
  else
    v_consecutive_wrong := v_consecutive_wrong + 1;
  end if;

  -- Step 4 (§3, owner rulings 1-2): revert/disable checks, on the incorrect
  -- answer, using the counter just updated. `revert_stat_after_incorrect` ALSO
  -- disables (not just reverts) — ruling 2's "re-meeting the trigger re-arms
  -- it" only makes sense if the effect actually stopped applying meanwhile.
  -- Revert loops ALL of this ability's stats (R1).
  if not _correct then
    if _disable_kind = 'revert_stat_after_incorrect'
       and v_consecutive_wrong >= greatest(_disable_n, 1) then
      v_reverted := public._pvp_revert_ability_stat(
        v_self_stages, v_opp_stages,
        jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net, 'stacks', v_stacks)),
        v_dex
      );
      v_self_stages := v_reverted->'selfStages';
      v_opp_stages := v_reverted->'oppStages';
      v_net := coalesce(((v_reverted->'runtime')->v_dex)->'netByStat', '{}'::jsonb);
      v_stacks := 0;
      v_disabled := true;
    elsif _disable_kind = 'disable_increase_after_incorrect'
          and v_consecutive_wrong >= greatest(_disable_n, 1) then
      v_increase_disabled := true;
    elsif _disable_kind = 'disable_effect_after_incorrect'
          and v_consecutive_wrong >= greatest(_disable_n, 1) then
      v_disabled := true;
      v_reverted := public._pvp_revert_ability_stat(
        v_self_stages, v_opp_stages,
        jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net, 'stacks', v_stacks)),
        v_dex
      );
      v_self_stages := v_reverted->'selfStages';
      v_opp_stages := v_reverted->'oppStages';
      v_net := coalesce(((v_reverted->'runtime')->v_dex)->'netByStat', '{}'::jsonb);
      v_stacks := 0;
    end if;
  end if;
  if _disable_kind = 'once_per_battle' and v_fired_this_battle then
    v_disabled := true;
  end if;

  -- Step 5 (ruling 2): re-arm on trigger fire. once_per_battle never re-arms.
  if _trigger_fired and _disable_kind <> 'once_per_battle' then
    v_disabled := false;
    v_increase_disabled := false;
  end if;
  if _trigger_fired then
    v_phase_idx := v_q_no;
    v_fired_this_battle := true;
  end if;

  -- Step 8 pre-check: "disabled for exactly the next question" one-shot skip
  -- (Mewtwo/Entei/Jirachi). Consumed below once matched, so it only skips one
  -- question then resumes.
  v_skip_this_q := _disable_next_question and (v_q_no = v_disabled_until_q);

  if not v_skip_this_q and not v_disabled then
    -- Shared ramp arming, evaluated once for all ramp stats in the row so they
    -- advance in lockstep (single `stacks` counter). `stacks < cap` caps the
    -- number of increments at SIG_STACK_CAP (ruling 3: trigger fire = stack #1).
    v_ramp_arm := (_trigger_fired or (_correct and v_already_fired and v_q_no > v_phase_idx))
                  and not v_increase_disabled and v_stacks < greatest(_stack_cap, 1);
    v_did_ramp := false;

    for v_spec in select value from jsonb_array_elements(coalesce(_stat_specs, '[]'::jsonb))
    loop
      v_mode_i := v_spec->>'mode';
      v_stat_i := v_spec->>'stat';
      v_target_i := coalesce(v_spec->>'target', 'self');
      if v_stat_i is null then
        continue;
      end if;

      -- Step 7: ramp stack apply (tracked per stat).
      if v_mode_i = 'ramp' then
        if v_ramp_arm then
          v_per_fire := coalesce((v_spec->>'perCorrect')::int, 0);
          v_tracked := public._pvp_bump_stage_tracked(
            case when v_target_i = 'opponent' then v_opp_stages else v_self_stages end,
            jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net)),
            v_dex, v_target_i, v_stat_i, v_per_fire, _stack_cap
          );
          if v_target_i = 'opponent' then v_opp_stages := v_tracked->'stages'; else v_self_stages := v_tracked->'stages'; end if;
          v_net := coalesce(((v_tracked->'runtime')->v_dex)->'netByStat', v_net);
          v_did_ramp := true;
          v_did_apply := true;
        end if;

      -- Step 6: decay tick (tracked per stat). On trigger re-fire, reset this
      -- stat's contribution then apply `initial`; otherwise step toward `floor`
      -- by `perQuestion` once per question. increaseDisabled does NOT gate
      -- decay (R4: "disable increase only... decay continues").
      elsif v_mode_i = 'decay' then
        v_initial := coalesce((v_spec->>'initial')::int, 0);
        v_per_q := coalesce((v_spec->>'perQuestion')::int, 0);
        v_floor := coalesce((v_spec->>'floor')::int, 0);
        v_key := v_target_i || ':' || v_stat_i;
        v_cur := coalesce((v_net->>v_key)::int, 0);
        if _trigger_fired then
          if v_cur <> 0 then
            if v_target_i = 'opponent' then
              v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, -v_cur);
            else
              v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, -v_cur);
            end if;
          end if;
          if v_target_i = 'opponent' then
            v_before := coalesce((v_opp_stages->>v_stat_i)::int, 0);
            v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, v_initial);
            v_after := coalesce((v_opp_stages->>v_stat_i)::int, 0);
          else
            v_before := coalesce((v_self_stages->>v_stat_i)::int, 0);
            v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, v_initial);
            v_after := coalesce((v_self_stages->>v_stat_i)::int, 0);
          end if;
          v_net := v_net || jsonb_build_object(v_key, v_after - v_before);
          v_did_apply := true;
        elsif v_q_no > v_phase_idx then
          if v_per_q < 0 then
            v_target_total := greatest(v_floor, v_cur + v_per_q);
          else
            v_target_total := least(v_floor, v_cur + v_per_q);
          end if;
          v_incr := v_target_total - v_cur;
          if v_incr <> 0 then
            if v_target_i = 'opponent' then
              v_before := coalesce((v_opp_stages->>v_stat_i)::int, 0);
              v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, v_incr);
              v_after := coalesce((v_opp_stages->>v_stat_i)::int, 0);
            else
              v_before := coalesce((v_self_stages->>v_stat_i)::int, 0);
              v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, v_incr);
              v_after := coalesce((v_self_stages->>v_stat_i)::int, 0);
            end if;
            v_net := v_net || jsonb_build_object(v_key, v_cur + (v_after - v_before));
            v_did_apply := true;
          end if;
        end if;

      -- one_shot: applied once ever (re-fires add nothing), tracked so it
      -- reverts with the rest of the ability. `stat = "random"` resolves inside
      -- _pvp_bump_stage; the changed cell is detected and tracked.
      elsif v_mode_i = 'one_shot' then
        if _trigger_fired and not v_already_fired then
          v_delta := coalesce((v_spec->>'delta')::int, 0);
          if v_stat_i = 'random' then
            declare
              v_snap jsonb;
              v_k text;
              v_b int;
              v_a int;
            begin
              if v_target_i = 'opponent' then
                v_snap := v_opp_stages;
                v_opp_stages := public._pvp_bump_stage(v_opp_stages, 'random', v_delta);
              else
                v_snap := v_self_stages;
                v_self_stages := public._pvp_bump_stage(v_self_stages, 'random', v_delta);
              end if;
              foreach v_k in array array['attack','defense','speed','crit'] loop
                v_b := coalesce((v_snap->>v_k)::int, 0);
                if v_target_i = 'opponent' then
                  v_a := coalesce((v_opp_stages->>v_k)::int, 0);
                else
                  v_a := coalesce((v_self_stages->>v_k)::int, 0);
                end if;
                if v_a <> v_b then
                  v_key := v_target_i || ':' || v_k;
                  v_net := v_net || jsonb_build_object(v_key, coalesce((v_net->>v_key)::int, 0) + (v_a - v_b));
                end if;
              end loop;
            end;
          else
            v_key := v_target_i || ':' || v_stat_i;
            if v_target_i = 'opponent' then
              v_before := coalesce((v_opp_stages->>v_stat_i)::int, 0);
              v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_stat_i, v_delta);
              v_after := coalesce((v_opp_stages->>v_stat_i)::int, 0);
            else
              v_before := coalesce((v_self_stages->>v_stat_i)::int, 0);
              v_self_stages := public._pvp_bump_stage(v_self_stages, v_stat_i, v_delta);
              v_after := coalesce((v_self_stages->>v_stat_i)::int, 0);
            end if;
            v_net := v_net || jsonb_build_object(v_key, coalesce((v_net->>v_key)::int, 0) + (v_after - v_before));
          end if;
          v_did_apply := true;
        end if;
      end if;
    end loop;

    -- One shared ramp increment per armed question (all ramp stats advanced in
    -- lockstep above), capped at SIG_STACK_CAP.
    if v_did_ramp then
      v_stacks := least(greatest(_stack_cap, 1), v_stacks + 1);
    end if;
    -- Mark progression so the next question's decay-step / subsequent-correct
    -- ramp arming compares against this question.
    if v_did_apply then
      v_phase_idx := v_q_no;
    end if;
  end if;

  -- Step 8: consume/arm the next-question skip.
  if _disable_next_question then
    if v_skip_this_q then
      v_disabled_until_q := -1;
    elsif v_did_apply then
      v_disabled_until_q := v_q_no + 1;
    end if;
  end if;

  v_entry := jsonb_build_object(
    'stacks', v_stacks,
    'netByStat', coalesce(v_net, '{}'::jsonb),
    'consecutiveWrong', v_consecutive_wrong,
    'disabled', v_disabled,
    'increaseDisabled', v_increase_disabled,
    'firedThisBattle', v_fired_this_battle,
    'phaseIdx', v_phase_idx,
    'disabledUntilQ', v_disabled_until_q
  );
  v_self_runtime := coalesce(v_self_runtime, '{}'::jsonb) || jsonb_build_object(v_dex, v_entry);

  if _i_am_host then
    update public.pvp_live_matches set
      host_stages = v_self_stages,
      guest_stages = v_opp_stages,
      host_sig_runtime = v_self_runtime,
      host_sig_engine_last_idx = v_qidx
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_stages = v_self_stages,
      host_stages = v_opp_stages,
      guest_sig_runtime = v_self_runtime,
      guest_sig_engine_last_idx = v_qidx
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  return jsonb_build_object(
    'ok', true,
    'hostStages', v_match.host_stages,
    'guestStages', v_match.guest_stages,
    'hostSigRuntime', v_match.host_sig_runtime,
    'guestSigRuntime', v_match.guest_sig_runtime
  );
end;
$$;

-- Least-privilege: the internal body has no auth of its own, so lock it to the
-- definer-context tick RPCs only (they run as this function's owner, which
-- retains EXECUTE as owner). Refuses a direct `authenticated` call.
revoke all on function public._pvp_sig_engine_apply(uuid, boolean, int, int, boolean, boolean, jsonb, text, int, boolean, int) from public;

-- ── 5. pvp_sig_engine_tick — live participant ticks THEIR OWN side (§3) ─────
-- Ownership-authenticated exactly like apply_pvp_signature_effect (self-heal a
-- not-yet-registered partner write-once; Mew pinned to its resolved Transform
-- target). Acting side derived from auth.uid; delegates the lifecycle to
-- _pvp_sig_engine_apply. Invoked once per side per answer (ruling 5).
create or replace function public.pvp_sig_engine_tick(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _correct boolean,
  _trigger_fired boolean,
  _stat_specs jsonb default '[]'::jsonb,
  _disable_kind text default 'none',
  _disable_n int default 0,
  _disable_next_question boolean default false,
  _stack_cap int default 3
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
  v_my_partner int;
  v_my_transform int;
  v_authorized_id int;
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

  -- ── Ownership authorization (mirrors apply_pvp_signature_effect, 20260706090116) ──
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

  return public._pvp_sig_engine_apply(
    _match_id, v_i_am_host, _question_index, _pokemon_id, _correct, _trigger_fired,
    _stat_specs, _disable_kind, _disable_n, _disable_next_question, _stack_cap
  );
end;
$$;

grant execute on function public.pvp_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int) to authenticated;

-- ── 6. pvp_bot_sig_engine_tick — HOST drives the bot/guest side (R3) ────────
-- In a bot match the guest is a bot with no auth.uid; the HOST's session drives
-- its moves. Auth mirrors apply_bot_pvp_signature_effect (20260706202620:254-269):
-- require caller = host_id AND is_bot_match; acting side is FIXED to the guest.
-- Ownership: _pokemon_id must equal the bot's authorized ability id
-- (guest_partner_id, or guest_transform_id when the bot is Mew(151) — the guest
-- analogue of the human tick's transform resolution). No partner self-heal
-- (apply_bot_pvp_signature_effect doesn't do one either). Same lifecycle body.
create or replace function public.pvp_bot_sig_engine_tick(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _correct boolean,
  _trigger_fired boolean,
  _stat_specs jsonb default '[]'::jsonb,
  _disable_kind text default 'none',
  _disable_n int default 0,
  _disable_next_question boolean default false,
  _stack_cap int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_authorized_id int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid <> v_match.host_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'not_bot_match');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  -- Ownership: the bot may only run its own registered (guest) partner's ability.
  v_authorized_id := case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end;
  if v_authorized_id is null or _pokemon_id is distinct from v_authorized_id then
    return jsonb_build_object('ok', false, 'error', 'unauthorized_ability');
  end if;

  -- Acting side is fixed to the guest (the bot): _i_am_host = false.
  return public._pvp_sig_engine_apply(
    _match_id, false, _question_index, _pokemon_id, _correct, _trigger_fired,
    _stat_specs, _disable_kind, _disable_n, _disable_next_question, _stack_cap
  );
end;
$$;

grant execute on function public.pvp_bot_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int) to authenticated;

-- ── 7. apply_pvp_signature_effect — remove the ramp/decay stat path (R2) ────
-- Single-writer fix: the ONLY incremental/scaling stat-application branch in
-- the shipped function is `stat_scale` (floor(_scale_count/per), capped at
-- max, re-applied via _pvp_bump_stage every call — the closest thing to a
-- ramp today, and the exact double-write risk R2 warns about now that the
-- sig-engine tick owns ramp/decay netByStat bookkeeping for the same stats).
-- Removed below. `stat_stage` (fixed one-shot delta — battle_start / manual /
-- bespoke post_answer rows) is UNCHANGED: it is not a ramp, carries no
-- revert/decay semantics, and rows using it (Zekrom, Regice, Raikou, Deoxys,
-- Magearna, etc.) keep firing through this function exactly as before. All
-- other kinds (status incl. `chance` gating, cure, heal, drain,
-- suppress_ability, swap_stages, cleanse), the sig_state phase, ownership
-- auth, post_answer replay cursor, and weather owner/negation checks are
-- copied forward unchanged from 20260706130000 (the current shipped body).
--
-- Body is otherwise byte-for-byte identical to 20260706130000's
-- apply_pvp_signature_effect — diff is exactly the deleted `stat_scale`
-- elsif branch (folded into a final `else` no-op).
--
-- KNOWN GAP left for Frontend (documented in 03-db.md): pokemon_id 1016 is
-- the only catalog row using `stat_scale` today (battle_start, attack,
-- per=25/max=3). After this migration that row silently no-ops until it is
-- re-authored onto the new ramp/decay lifecycle.
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

  -- Weather non-owner enforcement: "latest weather wins".
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
    elsif v_row.kind = 'status' then
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
    else
      -- `stat_scale` removed here (R2): ramp/decay stat application now owned
      -- exclusively by the sig-engine tick. Any other unrecognized kind is a
      -- deliberate no-op, same as before.
      v_did_apply := false;
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

-- ── 8. apply_bot_pvp_signature_effect — remove its stat_scale path (R2) ─────
-- The bot/guest RPC (20260706202620_pvp_bot_match_rpcs.sql:230) carries its OWN
-- copy of the `stat_scale` branch — the same R2 double-writer risk on the bot
-- side now that the sig-engine tick owns ramp/decay for the guest too (ruling 5
-- symmetry). Surgically remove ONLY that branch; the function already has a
-- trailing `else` that no-ops exotic kinds, so a `stat_scale` row now falls
-- through to it. Everything else (auth, phase gate, stat_stage/status/cure/
-- heal/drain, replay cursor, effect log) is byte-for-byte identical to the
-- shipped body. CREATE OR REPLACE preserves the existing EXECUTE grant.
create or replace function public.apply_bot_pvp_signature_effect(_match_id uuid, _question_index integer, _pokemon_id integer, _phase text, _scale_count integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_row public.pvp_signature_effects;
  v_self_stages jsonb; v_self_statuses jsonb; v_self_hp int;
  v_opp_stages jsonb; v_opp_statuses jsonb; v_opp_hp int;
  v_applied int := 0; v_did_apply boolean; v_touched_opponent boolean := false;
  v_stat text; v_delta int; v_amount int; v_status_chance numeric;
  v_qidx int := greatest(0, _question_index);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid <> v_match.host_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'not_bot_match');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  -- Ownership: the bot may only invoke its own registered (guest) partner's ability.
  if v_match.guest_partner_id is null or _pokemon_id is distinct from v_match.guest_partner_id then
    return jsonb_build_object('ok', false, 'error', 'unauthorized_ability');
  end if;
  if _phase not in ('battle_start', 'post_answer') then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'unsupported_phase');
  end if;

  if _phase = 'battle_start' and v_match.guest_ability_started then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if _phase = 'post_answer' and v_qidx <= v_match.guest_post_answer_last_idx then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'post_answer_replay');
  end if;

  v_self_stages := v_match.guest_stages;
  v_self_statuses := v_match.guest_statuses;
  v_self_hp := v_match.guest_hp;
  v_opp_stages := v_match.host_stages;
  v_opp_statuses := v_match.host_statuses;
  v_opp_hp := v_match.host_hp;

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
    elsif v_row.kind = 'status' then
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
    else
      -- Exotic kinds (weather/suppress/swap/cleanse/sig_state) AND `stat_scale`
      -- (removed for R2 — ramp/decay now owned by the sig-engine tick, incl. the
      -- guest side) are deliberately unsupported for the bot; skip them so the
      -- function stays small/auditable.
      v_did_apply := false;
    end if;
    if v_did_apply then
      v_applied := v_applied + 1;
    end if;
  end loop;

  if v_applied = 0 then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.pvp_live_matches set
    guest_hp = v_self_hp, host_hp = v_opp_hp,
    guest_stages = v_self_stages, guest_statuses = v_self_statuses,
    host_stages = v_opp_stages, host_statuses = v_opp_statuses,
    guest_ability_started = guest_ability_started or (_phase = 'battle_start'),
    guest_post_answer_last_idx = case when _phase = 'post_answer' then greatest(guest_post_answer_last_idx, v_qidx) else guest_post_answer_last_idx end
  where id = _match_id;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, source, pokemon_id, kind, payload)
  values (
    _match_id, v_qidx, v_match.guest_id,
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
$function$;

-- ── down (commented; forward-only in prod, kept for local rollback) ─────────
-- drop function if exists public.pvp_bot_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int);
-- drop function if exists public.pvp_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int);
-- drop function if exists public._pvp_sig_engine_apply(uuid, boolean, int, int, boolean, boolean, jsonb, text, int, boolean, int);
-- drop function if exists public._pvp_revert_ability_stat(jsonb, jsonb, jsonb, text);
-- drop function if exists public._pvp_bump_stage_tracked(jsonb, jsonb, text, text, text, int, int);
-- alter table public.pvp_live_matches
--   drop column if exists host_sig_runtime,
--   drop column if exists guest_sig_runtime,
--   drop column if exists host_sig_engine_last_idx,
--   drop column if exists guest_sig_engine_last_idx;
-- -- Restore the stat_scale branch of BOTH apply_pvp_signature_effect and
-- -- apply_bot_pvp_signature_effect by re-running their CREATE OR REPLACE bodies
-- -- from 20260706130000_pvp_signature_fixes_wave2.sql and
-- -- 20260706202620_pvp_bot_match_rpcs.sql respectively (never edit those shipped
-- -- files directly).

-- Signature-ability rework, M2/M3 — advanced rows, fidelity restorations,
-- legacy de-duplication (docs/handoffs/signature-rework/02-architecture-m2m3.md).
--
-- Layers additively on M1 (20260710120000_pvp_sig_engine_runtime.sql, treated as
-- shipped — never edited). Per COMMON_RULES §4 this is a SECOND migration; DB
-- applies M1 then this file in order on the preview branch.
--
-- Scope (owner rulings 1-5 of the M2/M3 brief, §2/§2b/§2c/§2d/§1 of the addendum):
--   1. Widen the tick trio (pvp_sig_engine_tick / pvp_bot_sig_engine_tick /
--      _pvp_sig_engine_apply) with FOUR new trailing defaulted args via
--      DROP FUNCTION + recreate (appending args to CREATE OR REPLACE would make
--      an overload, not a replace).
--   2. Lifecycle arms in _pvp_sig_engine_apply: Moltres q-expiry (F-a),
--      Hoopa incorrect-answer stat specs (F-d), Uxie predicted-status roll+echo.
--   3. New HP-mutating bespoke effect kinds in apply_pvp_signature_effect and
--      apply_bot_pvp_signature_effect (server-clamped [0,120], G5): dot_frac_hp,
--      frac_hp_random, flat_next_question_damage, reflect_opponent_stat.
--   4. Opponent-item hooks in use_pvp_live_item / use_bot_pvp_live_item:
--      Mesprit #481 lockout, Marshadow #802 mirror (ruling 2).
--   5. L1 legacy de-dup DELETE of pvp_signature_effects stat_stage rows for the
--      71 reworked dex ids (ships WITH Frontend-B's L2 !ability.engine gate).
--
-- No new columns: all new runtime state (predictedStatus, pendingStrikeAtQ) lives
-- inside the existing host/guest_sig_runtime jsonb (SigRuntimeEntry, addendum §T2).
-- disable_opponent_ability reuses the existing suppress_ability effect kind with a
-- rest-of-battle window (ruling 1) — no new kind; see §note at the end of this file.
--
-- NOTE / deviation (flagged in the handoff): the four bespoke HP kinds are
-- data-driven through the existing `for v_row … loop` over public.pvp_signature_effects
-- (addendum §2c "called via a bespoke phase"), so this migration also (a) widens the
-- pvp_signature_effects phase/kind CHECK constraints and (b) inserts four `bespoke`
-- catalog rows. Those are DATA + constraint changes (not new columns); the addendum's
-- "no new columns" note is preserved.

-- ── 0. Widen pvp_signature_effects for the bespoke phase + HP kinds ──────────
alter table public.pvp_signature_effects
  drop constraint if exists pvp_signature_effects_phase_check,
  add constraint pvp_signature_effects_phase_check
    check (phase in ('battle_start', 'post_answer', 'manual', 'bespoke'));

alter table public.pvp_signature_effects
  drop constraint if exists pvp_signature_effects_kind_check,
  add constraint pvp_signature_effects_kind_check
    check (kind in ('stat_stage', 'status', 'cure', 'heal', 'drain', 'stat_scale',
                    'swap_stages', 'cleanse', 'suppress_ability',
                    'dot_frac_hp', 'frac_hp_random', 'flat_next_question_damage',
                    'reflect_opponent_stat', 'predicted_status_apply'));

-- Bespoke catalog rows (effect_index 90 avoids collision with existing index-0/1
-- rows on these ids). Server-side magnitudes only — the client names the phase,
-- the server owns the payload (same trust model as every other effect row).
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (385, 90, 'bespoke', 'opponent', 'flat_next_question_damage', '{"amount":20}'::jsonb),          -- Jirachi #20
  (485, 90, 'bespoke', 'opponent', 'dot_frac_hp',              '{"pct":0.125,"questions":5}'::jsonb), -- Heatran #28
  (493, 90, 'bespoke', 'opponent', 'frac_hp_random',           '{"minPct":0.01,"maxPct":0.10}'::jsonb), -- Arceus #36
  (490, 90, 'bespoke', 'self',     'reflect_opponent_stat',    '{}'::jsonb),                         -- Manaphy #33 (ruling 3)
  (480, 90, 'bespoke', 'opponent', 'predicted_status_apply',   '{"questions":3}'::jsonb)             -- Uxie #23 (ruling 4)
on conflict (pokemon_id, effect_index) do nothing;

-- ── 1. Drop the M1 tick trio (10/11-arg) so we can re-create widened ────────
-- Appending trailing args to CREATE OR REPLACE would create a distinct OVERLOAD;
-- DROP first guarantees a single widened definition. plpgsql bodies carry no hard
-- call dependency, so drop order among the three is irrelevant.
drop function if exists public.pvp_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int);
drop function if exists public.pvp_bot_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int);
drop function if exists public._pvp_sig_engine_apply(uuid, boolean, int, int, boolean, boolean, jsonb, text, int, boolean, int);

-- ── 2. Internal lifecycle body (widened: +4 trailing args) ──────────────────
-- Identical to M1 §4 plus three arms (addendum §2b):
--   * Moltres q-expiry (F-a): _expire_after_questions > 0 → disable+revert at
--     phaseIdx + n (composes with revert_stat_after_incorrect via _disable_kind).
--   * Hoopa incorrect-stat (F-d): apply _incorrect_stat_specs on a WRONG answer,
--     tracked into netByStat (±3), accumulating; reverts only if the row disables.
--   * Uxie predicted-status: if a _stat_specs element carries mode='predicted_status',
--     roll+store predictedStatus in runtime on first fire; it echoes back inside
--     host/guestSigRuntime (server infliction is bespoke — see handoff note U).
-- _self_hp/_opp_hp are ACCEPTED (ruling 5) for forward use; the Regigigas payoff
-- gate stays client-side with server clamp on the effect RPC, so they are unused here.
create function public._pvp_sig_engine_apply(
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
  _stack_cap int,
  _incorrect_stat_specs jsonb default '[]'::jsonb,
  _expire_after_questions int default 0,
  _self_hp int default null,
  _opp_hp int default null
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

  -- M2/M3 additions
  v_predicted_status text;
  v_pending_strike int;
  v_wants_predicted boolean;
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
  -- Carry M2/M3 optional runtime scalars through (SigRuntimeEntry §T2).
  v_predicted_status := v_entry->>'predictedStatus';
  v_pending_strike := case when v_entry ? 'pendingStrikeAtQ' then (v_entry->>'pendingStrikeAtQ')::int else null end;
  v_wants_predicted := exists (
    select 1 from jsonb_array_elements(coalesce(_stat_specs, '[]'::jsonb)) e
    where e->>'mode' = 'predicted_status'
  );

  -- Step 2/3 (§3): consecutive-wrong counter — a correct answer resets it.
  if _correct then
    v_consecutive_wrong := 0;
  else
    v_consecutive_wrong := v_consecutive_wrong + 1;
  end if;

  -- Step 4 (§3, owner rulings 1-2): revert/disable checks on the incorrect answer.
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

  -- Step 3 arm (addendum §2b, F-a Moltres): auto-expire n questions after the
  -- trigger last fired → disable+revert. Guarded by `not _trigger_fired` so a
  -- fresh fire this tick is never expired in the same call; composes with the
  -- revert_stat_after_incorrect(1) passed via _disable_kind.
  if _expire_after_questions > 0 and v_already_fired and not v_disabled
     and not _trigger_fired and v_q_no >= v_phase_idx + _expire_after_questions then
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

  -- Step 4b (addendum §2b, Uxie): on FIRST fire roll+store the predicted status.
  -- Echoed back inside the runtime blob for the client to reveal.
  if v_wants_predicted and _trigger_fired and not v_already_fired and v_predicted_status is null then
    v_predicted_status := (array['poisoned','burn','paralysis','sleep','freeze','confused'])[1 + floor(random() * 6)::int];
  end if;

  -- Step 8 pre-check: "disabled for exactly the next question" one-shot skip.
  v_skip_this_q := _disable_next_question and (v_q_no = v_disabled_until_q);

  if not v_skip_this_q and not v_disabled then
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

      -- Step 6: decay tick (tracked per stat).
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

      -- one_shot: applied once ever, tracked so it reverts with the rest.
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

    -- Step 6b (addendum §2b, F-d Hoopa): on a WRONG answer apply incorrect-stat
    -- specs, tracked into netByStat (±3 magnitude cap). With no disable they
    -- accumulate and never revert; with a disable they revert with the rest.
    if not _correct and jsonb_array_length(coalesce(_incorrect_stat_specs, '[]'::jsonb)) > 0 then
      for v_spec in select value from jsonb_array_elements(coalesce(_incorrect_stat_specs, '[]'::jsonb))
      loop
        v_stat_i := v_spec->>'stat';
        v_target_i := coalesce(v_spec->>'target', 'self');
        if v_stat_i is null then
          continue;
        end if;
        v_per_fire := coalesce((v_spec->>'delta')::int, (v_spec->>'perCorrect')::int, 0);
        if v_per_fire = 0 then
          continue;
        end if;
        v_tracked := public._pvp_bump_stage_tracked(
          case when v_target_i = 'opponent' then v_opp_stages else v_self_stages end,
          jsonb_build_object(v_dex, jsonb_build_object('netByStat', v_net)),
          v_dex, v_target_i, v_stat_i, v_per_fire, 3
        );
        if v_target_i = 'opponent' then v_opp_stages := v_tracked->'stages'; else v_self_stages := v_tracked->'stages'; end if;
        v_net := coalesce(((v_tracked->'runtime')->v_dex)->'netByStat', v_net);
        v_did_apply := true;
      end loop;
    end if;

    if v_did_ramp then
      v_stacks := least(greatest(_stack_cap, 1), v_stacks + 1);
    end if;
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
  -- Preserve/echo the optional M2/M3 runtime scalars (§T2) when present.
  if v_predicted_status is not null then
    v_entry := v_entry || jsonb_build_object('predictedStatus', v_predicted_status);
  end if;
  if v_pending_strike is not null then
    v_entry := v_entry || jsonb_build_object('pendingStrikeAtQ', v_pending_strike);
  end if;
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

revoke all on function public._pvp_sig_engine_apply(uuid, boolean, int, int, boolean, boolean, jsonb, text, int, boolean, int, jsonb, int, int, int) from public;

-- ── 3. pvp_sig_engine_tick — human self-tick (widened +4 args) ──────────────
create function public.pvp_sig_engine_tick(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _correct boolean,
  _trigger_fired boolean,
  _stat_specs jsonb default '[]'::jsonb,
  _disable_kind text default 'none',
  _disable_n int default 0,
  _disable_next_question boolean default false,
  _stack_cap int default 3,
  _incorrect_stat_specs jsonb default '[]'::jsonb,
  _expire_after_questions int default 0,
  _self_hp int default null,
  _opp_hp int default null
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
    _stat_specs, _disable_kind, _disable_n, _disable_next_question, _stack_cap,
    _incorrect_stat_specs, _expire_after_questions, _self_hp, _opp_hp
  );
end;
$$;

grant execute on function public.pvp_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int, jsonb, int, int, int) to authenticated;

-- ── 4. pvp_bot_sig_engine_tick — HOST drives the bot/guest side (widened) ───
create function public.pvp_bot_sig_engine_tick(
  _match_id uuid,
  _question_index int,
  _pokemon_id int,
  _correct boolean,
  _trigger_fired boolean,
  _stat_specs jsonb default '[]'::jsonb,
  _disable_kind text default 'none',
  _disable_n int default 0,
  _disable_next_question boolean default false,
  _stack_cap int default 3,
  _incorrect_stat_specs jsonb default '[]'::jsonb,
  _expire_after_questions int default 0,
  _self_hp int default null,
  _opp_hp int default null
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

  v_authorized_id := case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end;
  if v_authorized_id is null or _pokemon_id is distinct from v_authorized_id then
    return jsonb_build_object('ok', false, 'error', 'unauthorized_ability');
  end if;

  return public._pvp_sig_engine_apply(
    _match_id, false, _question_index, _pokemon_id, _correct, _trigger_fired,
    _stat_specs, _disable_kind, _disable_n, _disable_next_question, _stack_cap,
    _incorrect_stat_specs, _expire_after_questions, _self_hp, _opp_hp
  );
end;
$$;

grant execute on function public.pvp_bot_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int, jsonb, int, int, int) to authenticated;

-- ── 5. apply_pvp_signature_effect — add HP-mutating bespoke kinds (§2c) ─────
-- Body is M1's apply_pvp_signature_effect (20260710120000 §7) plus four new
-- `kind` branches in the loop; all HP subtractions clamp to [0,120] like heal/drain.
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

  if v_is_weather and (v_match.host_partner_id = 384 or v_match.guest_partner_id = 384) then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'weather_negated');
  end if;

  if v_is_weather and v_match.weather_owner is not null then
    if (v_match.weather_owner = 'host' and v_match.host_partner_id in (382, 383) and v_match.host_partner_id <> _pokemon_id)
       or (v_match.weather_owner = 'guest' and v_match.guest_partner_id in (382, 383) and v_match.guest_partner_id <> _pokemon_id) then
      return jsonb_build_object('ok', true, 'noop', true, 'reason', 'weather_non_owner');
    end if;
  end if;

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
    elsif v_row.kind = 'dot_frac_hp' then
      -- Heatran DoT: opp HP -= round(oppMaxHp × pct). oppMaxHp is the 120 ceiling.
      v_amount := round(120 * coalesce((v_row.payload->>'pct')::numeric, 0))::int;
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'frac_hp_random' then
      -- Arceus: server rolls pct in [minPct, maxPct] (trust — R6), then damages.
      declare
        v_min numeric := coalesce((v_row.payload->>'minPct')::numeric, 0);
        v_max numeric := coalesce((v_row.payload->>'maxPct')::numeric, 0);
      begin
        v_amount := round(120 * (v_min + random() * greatest(0, v_max - v_min)))::int;
      end;
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'flat_next_question_damage' then
      -- Jirachi: flat opp HP hit on the scheduled question (client schedules).
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'reflect_opponent_stat' then
      -- Manaphy Heart Swap ×(−1), ruling 3: flip Manaphy's OWN negative stat
      -- stages into positive (a debuff-on-self becomes a buff-on-self). Stages only.
      declare
        v_k text; v_v int; v_did_reflect boolean := false;
      begin
        foreach v_k in array array['attack','defense','speed','crit'] loop
          v_v := coalesce((v_self_stages->>v_k)::int, 0);
          if v_v < 0 then
            v_self_stages := public._pvp_bump_stage(v_self_stages, v_k, -2 * v_v);
            v_did_reflect := true;
          end if;
        end loop;
        v_did_apply := v_did_reflect;
      end;
    elsif v_row.kind = 'predicted_status_apply' then
      -- Uxie #23 (ruling 4): inflict EXACTLY the status the engine tick already
      -- rolled and revealed at battle start. The prediction is read back out of
      -- MY OWN sig_runtime entry (the tick stored it there); we never re-roll, so
      -- the status the player was shown is provably the status they land. A null
      -- prediction (tick never fired) is a clean no-op, not a random substitute.
      declare
        v_runtime jsonb;
        v_pred text;
      begin
        v_runtime := case when v_i_am_host then v_match.host_sig_runtime else v_match.guest_sig_runtime end;
        v_pred := coalesce(v_runtime, '{}'::jsonb) #>> array[_pokemon_id::text, 'predictedStatus'];
        if v_pred is null then
          v_did_apply := false;
        else
          v_opp_statuses := public._pvp_apply_status(
            v_opp_statuses, v_pred, coalesce((v_row.payload->>'questions')::int, 3));
          v_touched_opponent := true;
        end if;
      end;
    else
      -- `stat_scale` removed (R2) + any unrecognized kind: deliberate no-op.
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

-- ── 6. apply_bot_pvp_signature_effect — same bespoke HP kinds for the bot ────
-- M1's bot body (20260710120000 §8) plus: allow the `bespoke` phase and the four
-- new HP kinds so a bot partner (Heatran/Arceus/Jirachi/Manaphy) resolves the
-- same way the human tick does. Bot self = guest; opponent = host.
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

  if v_match.guest_partner_id is null or _pokemon_id is distinct from v_match.guest_partner_id then
    return jsonb_build_object('ok', false, 'error', 'unauthorized_ability');
  end if;
  if _phase not in ('battle_start', 'post_answer', 'bespoke') then
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
    elsif v_row.kind = 'dot_frac_hp' then
      v_amount := round(120 * coalesce((v_row.payload->>'pct')::numeric, 0))::int;
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'frac_hp_random' then
      declare
        v_min numeric := coalesce((v_row.payload->>'minPct')::numeric, 0);
        v_max numeric := coalesce((v_row.payload->>'maxPct')::numeric, 0);
      begin
        v_amount := round(120 * (v_min + random() * greatest(0, v_max - v_min)))::int;
      end;
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'flat_next_question_damage' then
      v_amount := coalesce((v_row.payload->>'amount')::int, 0);
      v_opp_hp := greatest(0, least(120, v_opp_hp - v_amount));
      v_touched_opponent := true;
    elsif v_row.kind = 'reflect_opponent_stat' then
      declare
        v_k text; v_v int; v_did_reflect boolean := false;
      begin
        foreach v_k in array array['attack','defense','speed','crit'] loop
          v_v := coalesce((v_self_stages->>v_k)::int, 0);
          if v_v < 0 then
            v_self_stages := public._pvp_bump_stage(v_self_stages, v_k, -2 * v_v);
            v_did_reflect := true;
          end if;
        end loop;
        v_did_apply := v_did_reflect;
      end;
    elsif v_row.kind = 'predicted_status_apply' then
      -- Uxie #23 (ruling 4), bot side: the bot IS the guest, so its own prediction
      -- lives in guest_sig_runtime. Same contract as the human path — inflict the
      -- already-rolled status, never a fresh roll.
      declare
        v_pred text;
      begin
        v_pred := coalesce(v_match.guest_sig_runtime, '{}'::jsonb)
                    #>> array[_pokemon_id::text, 'predictedStatus'];
        if v_pred is null then
          v_did_apply := false;
        else
          v_opp_statuses := public._pvp_apply_status(
            v_opp_statuses, v_pred, coalesce((v_row.payload->>'questions')::int, 3));
          v_touched_opponent := true;
        end if;
      end;
    else
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

-- ── 7. use_pvp_live_item — Mesprit lockout + Marshadow mirror (§2d) ─────────
-- M1-era body (20260705000000) plus two opponent-aware hooks. "Opponent" = the
-- side that is NOT the caller; its partner dex resolves through Mew's transform.
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
  -- Opponent (Mesprit/Marshadow) resolution.
  v_opp_partner int;
  v_opp_transform int;
  v_opp_dex int;
  v_opp_runtime jsonb;
  v_opp_entry jsonb;
  -- Marshadow mirror scratch (Marshadow's own side = the caller's opponent side).
  v_marsh_used int;
  v_m_self_stages jsonb;
  v_m_self_statuses jsonb;
  v_m_self_hp int;
  v_m_opp_stages jsonb;
  v_m_opp_statuses jsonb;
  v_marsh_owner uuid;
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

  -- Resolve the opponent's live partner dex (through Mew Transform).
  v_opp_partner := case when v_i_am_host then v_match.guest_partner_id else v_match.host_partner_id end;
  v_opp_transform := case when v_i_am_host then v_match.guest_transform_id else v_match.host_transform_id end;
  v_opp_dex := case when v_opp_partner = 151 then v_opp_transform else v_opp_partner end;
  v_opp_runtime := case when v_i_am_host then v_match.guest_sig_runtime else v_match.host_sig_runtime end;

  -- Mesprit #481 lockout (§2d): if the opponent is Mesprit and its runtime has
  -- fired-this-battle and is not disabled, the caller cannot use items.
  if v_opp_dex = 481 then
    v_opp_entry := coalesce(v_opp_runtime->'481', '{}'::jsonb);
    if coalesce((v_opp_entry->>'firedThisBattle')::boolean, false)
       and not coalesce((v_opp_entry->>'disabled')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'item_locked');
    end if;
  end if;

  v_used_count := case when v_i_am_host then v_match.host_items_used else v_match.guest_items_used end;
  if v_used_count >= 3 then
    return jsonb_build_object('ok', false, 'error', 'item_cap');
  end if;

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

  -- Marshadow #802 mirror (§2d, ruling 2): if the opponent is Marshadow and not
  -- disabled, replay the SAME effect on Marshadow's side (all item kinds), charge
  -- it against Marshadow's own 3-item cap, and log a second attribution row.
  if v_opp_dex = 802 then
    v_opp_entry := coalesce((case when v_i_am_host then v_match.guest_sig_runtime else v_match.host_sig_runtime end)->'802', '{}'::jsonb);
    v_marsh_used := case when v_i_am_host then v_match.guest_items_used else v_match.host_items_used end;
    if not coalesce((v_opp_entry->>'disabled')::boolean, false) and v_marsh_used < 3 then
      -- Marshadow's "self" is the caller's opponent side; its "opponent" is the caller.
      v_m_self_stages := case when v_i_am_host then v_match.guest_stages else v_match.host_stages end;
      v_m_self_statuses := case when v_i_am_host then v_match.guest_statuses else v_match.host_statuses end;
      v_m_self_hp := case when v_i_am_host then v_match.guest_hp else v_match.host_hp end;
      v_m_opp_stages := case when v_i_am_host then v_match.host_stages else v_match.guest_stages end;
      v_m_opp_statuses := case when v_i_am_host then v_match.host_statuses else v_match.guest_statuses end;

      if v_effect.kind = 'heal' then
        if (v_effect.payload->>'full')::boolean is true then
          v_m_self_hp := 120;
        else
          v_m_self_hp := least(120, v_m_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
        end if;
      elsif v_effect.kind = 'stat_stage' then
        if v_effect.target = 'self' then
          v_m_self_stages := public._pvp_bump_stage(v_m_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
        else
          v_m_opp_stages := public._pvp_bump_stage(v_m_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
        end if;
      elsif v_effect.kind = 'status' then
        if v_effect.target = 'self' then
          v_m_self_statuses := public._pvp_apply_status(v_m_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
        else
          v_m_opp_statuses := public._pvp_apply_status(v_m_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
        end if;
      elsif v_effect.kind = 'cure' then
        v_m_self_statuses := public._pvp_cure_status(v_m_self_statuses, v_effect.payload->>'status');
      end if;

      if v_i_am_host then
        -- Marshadow is the guest.
        update public.pvp_live_matches set
          guest_hp = v_m_self_hp,
          guest_stages = v_m_self_stages,
          guest_statuses = v_m_self_statuses,
          host_stages = v_m_opp_stages,
          host_statuses = v_m_opp_statuses,
          guest_items_used = guest_items_used + 1
        where id = _match_id;
        v_marsh_owner := v_match.guest_id;
      else
        update public.pvp_live_matches set
          host_hp = v_m_self_hp,
          host_stages = v_m_self_stages,
          host_statuses = v_m_self_statuses,
          guest_stages = v_m_opp_stages,
          guest_statuses = v_m_opp_statuses,
          host_items_used = host_items_used + 1
        where id = _match_id;
        v_marsh_owner := v_match.host_id;
      end if;

      insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
      values (_match_id, _question_index, v_marsh_owner, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

      select * into v_match from public.pvp_live_matches where id = _match_id;
    end if;
  end if;

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

-- ── 8. use_bot_pvp_live_item — same hooks, bot is always the guest opponent ──
create or replace function public.use_bot_pvp_live_item(_match_id uuid, _question_index integer, _item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_effect public.pvp_item_effects;
  v_self_stages jsonb; v_self_statuses jsonb; v_self_hp int;
  v_opp_stages jsonb; v_opp_statuses jsonb;
  -- Opponent is always the bot (guest).
  v_opp_dex int;
  v_opp_entry jsonb;
  -- Marshadow mirror scratch (bot/guest side).
  v_marsh_used int;
  v_m_self_stages jsonb; v_m_self_statuses jsonb; v_m_self_hp int;
  v_m_opp_stages jsonb; v_m_opp_statuses jsonb;
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

  select * into v_effect from public.pvp_item_effects where item_id = _item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_item');
  end if;

  v_opp_dex := case when v_match.guest_partner_id = 151 then v_match.guest_transform_id else v_match.guest_partner_id end;

  -- Mesprit #481 lockout: the bot opponent locks the host's items.
  if v_opp_dex = 481 then
    v_opp_entry := coalesce(v_match.guest_sig_runtime->'481', '{}'::jsonb);
    if coalesce((v_opp_entry->>'firedThisBattle')::boolean, false)
       and not coalesce((v_opp_entry->>'disabled')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'item_locked');
    end if;
  end if;

  if v_match.host_items_used >= 3 then
    return jsonb_build_object('ok', false, 'error', 'item_cap');
  end if;

  v_self_stages := v_match.host_stages;
  v_self_statuses := v_match.host_statuses;
  v_self_hp := v_match.host_hp;
  v_opp_stages := v_match.guest_stages;
  v_opp_statuses := v_match.guest_statuses;

  if v_effect.kind = 'heal' then
    if (v_effect.payload->>'full')::boolean is true then
      v_self_hp := 120;
    else
      v_self_hp := least(120, v_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
    end if;
  elsif v_effect.kind = 'stat_stage' then
    if v_effect.target = 'self' then
      v_self_stages := public._pvp_bump_stage(v_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    else
      v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    end if;
  elsif v_effect.kind = 'status' then
    if v_effect.target = 'self' then
      v_self_statuses := public._pvp_apply_status(v_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    else
      v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    end if;
  elsif v_effect.kind = 'cure' then
    v_self_statuses := public._pvp_cure_status(v_self_statuses, v_effect.payload->>'status');
  end if;

  -- Host applies its own item (host = self, guest/bot = opponent).
  update public.pvp_live_matches set
    host_hp = v_self_hp,
    host_stages = v_self_stages,
    host_statuses = v_self_statuses,
    guest_stages = v_opp_stages,
    guest_statuses = v_opp_statuses,
    host_items_used = host_items_used + 1
  where id = _match_id;

  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
  values (_match_id, _question_index, v_uid, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

  select * into v_match from public.pvp_live_matches where id = _match_id;

  -- Marshadow #802 mirror onto the bot (guest) side.
  if v_opp_dex = 802 then
    v_opp_entry := coalesce(v_match.guest_sig_runtime->'802', '{}'::jsonb);
    v_marsh_used := v_match.guest_items_used;
    if not coalesce((v_opp_entry->>'disabled')::boolean, false) and v_marsh_used < 3 then
      -- Marshadow's self = guest (bot); its opponent = host (caller).
      v_m_self_stages := v_match.guest_stages;
      v_m_self_statuses := v_match.guest_statuses;
      v_m_self_hp := v_match.guest_hp;
      v_m_opp_stages := v_match.host_stages;
      v_m_opp_statuses := v_match.host_statuses;

      if v_effect.kind = 'heal' then
        if (v_effect.payload->>'full')::boolean is true then
          v_m_self_hp := 120;
        else
          v_m_self_hp := least(120, v_m_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
        end if;
      elsif v_effect.kind = 'stat_stage' then
        if v_effect.target = 'self' then
          v_m_self_stages := public._pvp_bump_stage(v_m_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
        else
          v_m_opp_stages := public._pvp_bump_stage(v_m_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
        end if;
      elsif v_effect.kind = 'status' then
        if v_effect.target = 'self' then
          v_m_self_statuses := public._pvp_apply_status(v_m_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
        else
          v_m_opp_statuses := public._pvp_apply_status(v_m_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
        end if;
      elsif v_effect.kind = 'cure' then
        v_m_self_statuses := public._pvp_cure_status(v_m_self_statuses, v_effect.payload->>'status');
      end if;

      update public.pvp_live_matches set
        guest_hp = v_m_self_hp,
        guest_stages = v_m_self_stages,
        guest_statuses = v_m_self_statuses,
        host_stages = v_m_opp_stages,
        host_statuses = v_m_opp_statuses,
        guest_items_used = guest_items_used + 1
      where id = _match_id;

      insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
      values (_match_id, _question_index, v_match.guest_id, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

      select * into v_match from public.pvp_live_matches where id = _match_id;
    end if;
  end if;

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
$function$;

-- ── 9. L1 legacy de-duplication DELETE (addendum §1) ────────────────────────
-- Retire the server-side stat_stage rows for the 71 reworked ids; the sig-engine
-- tick now owns their stat lifecycle. KEEP status/heal/drain/cure/suppress_ability/
-- swap_stages/cleanse rows and every row for non-reworked ids. MUST ship together
-- with Frontend-B's L2 `!ability.engine` client gate (else reworked buffs go 0× or 2×).
delete from public.pvp_signature_effects
where kind = 'stat_stage'
  and pokemon_id = any(array[
    144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,
    480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,
    638,639,640,641,642,643,644,645,646,647,648,649,
    716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,
    800,801,802,803,804,805,806
  ]);

-- ── suppress_ability window note (ruling 1 / disable_opponent_ability) ──────
-- disable_opponent_ability is delivered by CALLING the existing `suppress_ability`
-- effect kind (see §5 of the human RPC above): it reads payload->>'questions' and
-- sets *_suppressed_until = greatest(_, v_qidx + 1 + questions). Passing
-- questions = SIG_BATTLE_QUESTIONS (20) yields a rest-of-battle window. No new
-- kind and no new column were required — confirmed.

-- ── down (commented; forward-only in prod, kept for local rollback) ─────────
-- delete from public.pvp_signature_effects where phase = 'bespoke' and effect_index = 90
--   and pokemon_id in (385, 485, 493, 490, 480);
-- drop function if exists public.use_bot_pvp_live_item(uuid, integer, text);
-- drop function if exists public.use_pvp_live_item(uuid, int, text);
-- drop function if exists public.pvp_bot_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int, jsonb, int, int, int);
-- drop function if exists public.pvp_sig_engine_tick(uuid, int, int, boolean, boolean, jsonb, text, int, boolean, int, jsonb, int, int, int);
-- drop function if exists public._pvp_sig_engine_apply(uuid, boolean, int, int, boolean, boolean, jsonb, text, int, boolean, int, jsonb, int, int, int);
-- -- Re-create the M1 10/11-arg tick trio and the pre-M2/M3 apply_* / use_*_item
-- -- bodies by re-running their CREATE OR REPLACE / CREATE from 20260710120000,
-- -- 20260705000000, 20260706202620 (never edit those shipped files directly).
-- -- Restore the narrower phase/kind CHECK constraints and re-insert the deleted
-- -- stat_stage rows from their original wave migrations if a full rollback is needed.

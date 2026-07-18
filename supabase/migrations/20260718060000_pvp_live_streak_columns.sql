-- Live-PvP server-authoritative answer verification, Phase 3 (schema-only —
-- see the plan at /root/.claude/plans/prancy-spinning-sedgewick.md).
--
-- `resolvePvpAnswer` (engine/pvp-live-answer.ts, Phase 2c) needs two pieces of
-- per-side battle state the server does not persist today, because the
-- client has always kept them as local `useState`/`useRef`:
--
--  - The CORRECT-answer streak (`streak` in the client, `PvpEngineState.
--    streak`) — feeds the streak curve AND every signature engine trigger
--    keyed on `streak_in_a_row`/`streak_at_least` (Koraidon, Darkrai, Chien-
--    Pao, ...). Without a server column, the Edge Function that will replace
--    `submit_pvp_live_answer` has no authoritative streak to recompute
--    against.
--  - The WRONG-answer streak (`selfWrongStreak` in the client) — the trigger
--    for confusion arming at 2 consecutive wrong answers. The 'confused'
--    STATUS itself already has full server support (`_pvp_apply_status`/
--    `_pvp_cure_status`, already used by Chople Berry/Hydration/Shield
--    Dust/M4 rows) — the only missing piece is the counter that decides WHEN
--    to apply it.
--
-- Sword of Ruin's 2-charge ignore-Defense window needs NO new column: the
-- existing `host_sig_state`/`guest_sig_state` jsonb (added for Moltres'
-- Wrath stacks, `20260706031922_apply_pvp_signature_effect_add_sig_state_phase.sql`)
-- already stores an arbitrary 0..3 int keyed by ANY partner dex id via
-- `apply_pvp_signature_effect(..., 'sig_state', n)` — 2 charges fits that
-- clamp exactly, so Chien-Pao (1002) can reuse the same mechanism Moltres
-- (146) already exercises in production.
--
-- Purely additive: new columns default to 0 and nothing writes to them yet.
-- `submit_pvp_live_answer` keeps computing HP off the client-reported
-- `_dmg`/`_self_dmg` exactly as it does today — wiring these columns into the
-- RPC (and confusion's status application) is Phase 4's job, alongside the
-- Edge Function cutover, so this migration alone changes no runtime
-- behavior.
alter table public.pvp_live_matches
  add column if not exists host_streak_live integer not null default 0,
  add column if not exists guest_streak_live integer not null default 0,
  add column if not exists host_wrong_streak_live integer not null default 0,
  add column if not exists guest_wrong_streak_live integer not null default 0;

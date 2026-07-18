-- Live-PvP server-authoritative answer verification, Phase 4 (schema addendum).
--
-- Phase 3 (20260718060000) added the streak/wrong-streak columns but missed
-- confusion's OWN duration counter — `resolvePvpAnswer`'s `PvpEngineState.
-- confusedTicks` (engine/pvp-live-answer.ts) has no server column to read
-- from/write to yet. Rather than route confusion through the generic
-- `host_statuses`/`guest_statuses` jsonb (`_pvp_apply_status`/
-- `_pvp_cure_status`) — which has no per-answer decrement pass today for any
-- non-poison status, so a status written there would never tick down
-- server-side — this mirrors the engine's own counter directly: a plain int
-- that arms to 2 at a 2-wrong-streak and decrements by 1 each confusion-eaten
-- hit, exactly like the client's local `confusedTicksRef`. This keeps the
-- server's ground truth a 1:1 match with the engine module already verified
-- against the real component (Phase 2c).
--
-- Purely additive: defaults to 0, nothing writes to it until the same
-- migration's sibling (submit_pvp_live_answer's correctness-verification
-- extension) starts populating it.
alter table public.pvp_live_matches
  add column if not exists host_confused_ticks_live integer not null default 0,
  add column if not exists guest_confused_ticks_live integer not null default 0;

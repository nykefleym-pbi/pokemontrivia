-- server-first-refactor Phase 2 — extend `grants` for Mega Raid rewards.
--
-- Reuses the existing (user_id, kind, ref_id) idempotency ledger (see
-- p2_saves_and_grants.sql) rather than a new table: a Mega Raid reward claim
-- is exactly the same shape (one grant per user per event, ever) as an
-- achievement/badge/level grant already is. Only the CHECK constraint needs
-- extending — the mega-reward-claim Edge Function is the only writer (via
-- the service-role key, same as rewards-grant), so no RLS/grant changes are
-- needed here.
alter table public.grants drop constraint grants_kind_check;
alter table public.grants add constraint grants_kind_check
  check (kind = any (array['achievement', 'badge', 'level', 'mega_reward']));

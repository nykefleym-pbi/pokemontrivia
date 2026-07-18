-- Live PvP Phase 6 cleanup: drop the OLD submit_pvp_live_answer/
-- submit_bot_pvp_move RPC bodies.
--
-- Their `authenticated`/`anon` execute grant was already revoked
-- (20260718180000_pvp_live_answer_revoke_old_rpcs.sql) once the client fully
-- cut over to pvp-live-resolve-turn. Nothing calls them anymore -- not the
-- client, not another RPC, not the shadow-log/offline-verifier tooling (those
-- read the shadow-log table directly, not these functions). Dropping the
-- bodies rather than leaving them around unreachable, per that migration's
-- own note that deleting them was deferred to this separate cleanup task.
drop function if exists public.submit_pvp_live_answer(uuid, int, boolean, int, int, int, int);
drop function if exists public.submit_bot_pvp_move(uuid, integer, boolean, integer, integer);

-- saves_set_updated_at is an internal trigger helper, never an RPC endpoint —
-- unlike the app's real RPCs (submit_pvp_result, use_pvp_live_item, etc.),
-- nothing should call it directly via /rest/v1/rpc/saves_set_updated_at.
-- Postgres grants EXECUTE to PUBLIC by default, so the advisor correctly
-- flagged it as callable by anon/authenticated. Revoking direct EXECUTE does
-- not break the trigger: a BEFORE UPDATE trigger invocation runs regardless
-- of the triggering role's EXECUTE privilege on the function.
revoke execute on function public.saves_set_updated_at() from public, anon, authenticated;

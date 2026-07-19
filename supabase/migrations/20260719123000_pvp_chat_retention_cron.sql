-- Nightly retention sweep for pvp chat: deletes messages whose parent match
-- is older than the 24h chat window (send/read are both bounded to
-- created_at + interval '24 hours' of the parent pvp_live_matches row, per
-- 02-architecture.md "Retention / pruning"). This is independent of the
-- on delete cascade from pvp_live_matches -> pvp_chat_messages, which already
-- reclaims chat immediately when a match row itself is deleted; this cron
-- only covers matches that are never deleted but have aged out of the
-- window. pvp_chat_reports rows cascade-delete automatically via their
-- on delete cascade foreign key to pvp_chat_messages (PR-1 schema
-- migration), so this job does not need to separately clean up reports.
create extension if not exists pg_cron;

select cron.schedule(
  'pvp-chat-prune',
  '30 3 * * *', -- 03:30 UTC every day
  $$
  delete from public.pvp_chat_messages m
  using public.pvp_live_matches pm
  where pm.id = m.match_id and pm.created_at < now() - interval '24 hours';
  $$
);

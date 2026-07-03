-- Schedules the two push-notification cron jobs via pg_net HTTP calls to the
-- send-push / daily-reminders Edge Functions. The X-Cron-Secret value here
-- must match the PUSH_CRON_SECRET Edge Function secret (set separately via
-- `supabase secrets set` — not something a migration can provision).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-promo-push',
  '0 8 * * *', -- 08:00 UTC every day
  $$
  select net.http_post(
    url := 'https://dvdorceiasaipdvyfhil.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', '__PUSH_CRON_SECRET__'
    ),
    body := jsonb_build_object(
      'kind', 'broadcast',
      'title', 'Pokémon Trivia Battle',
      'body', 'Play Pokémon Trivia Battle! New questions and battles are waiting.'
    )
  );
  $$
);

select cron.schedule(
  'mode-availability-reminders',
  '0 */4 * * *', -- every 4 hours
  $$
  select net.http_post(
    url := 'https://dvdorceiasaipdvyfhil.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', '__PUSH_CRON_SECRET__'
    ),
    body := '{}'::jsonb
  );
  $$
);

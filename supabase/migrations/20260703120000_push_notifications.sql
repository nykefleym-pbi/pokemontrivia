-- Web Push subscriptions, one row per device/browser subscribed to push.
-- Only the owning user can manage their own rows; the service role (used by
-- Edge Functions) bypasses RLS to read across all users for broadcast sends.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- Last-played timestamps per mode, synced from the client, so a scheduled
-- Edge Function can decide who's overdue for a "mode is ready" reminder push
-- without needing to know each user's local device state.
alter table public.profiles
  add column last_daily_claim timestamptz,
  add column last_weekly_attempt timestamptz,
  add column last_whos_that_played timestamptz,
  add column last_mega_played timestamptz,
  add column last_gift_claim timestamptz,
  add column last_reminder_sent timestamptz;

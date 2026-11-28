-- Product funnel events (src/lib/analytics.ts).
--
-- Vercel Web Analytics records page views on the Hobby plan but drops custom
-- events (they need Pro), so onboarding, first battle, Daily and return-visit
-- events were never stored. Paul chose (2026-11-28) to keep them here instead.
--
-- Players can only INSERT their own rows; nobody but the service role (SQL
-- editor, MCP) reads them. Rows follow the account: deleting the auth user
-- (Reset progress) deletes its events.
create table public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event text not null check (event ~ '^[a-z_]{3,40}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2048)
);

alter table public.analytics_events enable row level security;

grant insert on public.analytics_events to authenticated;
grant all on public.analytics_events to service_role;

create policy "analytics_events_insert_own" on public.analytics_events
  for insert to authenticated
  with check (user_id = auth.uid());

create index analytics_events_event_created_idx on public.analytics_events (event, created_at);

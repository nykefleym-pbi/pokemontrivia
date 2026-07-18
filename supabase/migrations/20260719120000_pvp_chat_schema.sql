-- Match-scoped chat schema (PR-1 of docs/handoffs/global-chat/02-architecture.md).
-- Four new tables + one config table, RPC-only writes on every one (no client
-- INSERT policy) so profanity/rate-limit/ban/kill checks stay authoritative.
-- RPCs (send/report/get-state) land in a later migration (PR-2); this file is
-- schema + RLS + realtime + grants only.

-- Chat messages for a pvp_live_matches row. trainer_name/trainer_sprite are
-- snapshotted at send time (denormalized, same pattern as pvp_live_effects).
create table public.pvp_chat_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.pvp_live_matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  trainer_name text not null,
  trainer_sprite text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index pvp_chat_messages_match_id_created_at_idx
  on public.pvp_chat_messages (match_id, created_at);
create index pvp_chat_messages_match_id_user_id_created_at_idx
  on public.pvp_chat_messages (match_id, user_id, created_at desc);

alter table public.pvp_chat_messages enable row level security;
grant select on public.pvp_chat_messages to authenticated;
grant all on public.pvp_chat_messages to service_role;

-- No INSERT/UPDATE/DELETE policy → all writes go through the security-definer
-- send RPC (PR-2). Select-only, gated the same way as the parent match row.
create policy "pvp_chat_messages_select_participant" on public.pvp_chat_messages
  for select to authenticated
  using (exists (
    select 1 from public.pvp_live_matches m
    where m.id = match_id and (m.host_id = auth.uid() or m.guest_id = auth.uid())
  ));

alter publication supabase_realtime add table public.pvp_chat_messages;
alter table public.pvp_chat_messages replica identity full;

-- Message reports. RPC-only insert (report RPC lands in PR-2); no select
-- grant needed client-side (fire-and-forget) and no client insert policy —
-- the report RPC uses its own security-definer privileges to write.
create table public.pvp_chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.pvp_chat_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

alter table public.pvp_chat_reports enable row level security;
grant all on public.pvp_chat_reports to service_role;

-- Manual/service-role bans (dashboard-populated for v1, no auto-ban trigger —
-- one bad actor's blast radius is a single opponent, per spec decision 4).
create table public.pvp_chat_bans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text,
  banned_by uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pvp_chat_bans enable row level security;
grant select on public.pvp_chat_bans to authenticated;
grant all on public.pvp_chat_bans to service_role;

-- A user may read only their own ban row (lets the client gray out the
-- composer); the authoritative check is in the send RPC regardless.
create policy "pvp_chat_bans_select_own" on public.pvp_chat_bans
  for select to authenticated
  using (user_id = auth.uid());

-- Server-side wordlist for the send RPC's profanity filter. Stored lowercase.
-- No grant to authenticated — enforcement is server-side only inside the
-- send RPC.
create table public.chat_banned_words (
  word text primary key,
  created_at timestamptz not null default now()
);

alter table public.chat_banned_words enable row level security;
grant all on public.chat_banned_words to service_role;

-- Generic key/value config surface. First use is the chat_enabled kill
-- switch (flip via dashboard, no deploy). No grant to authenticated — read
-- only through the security-definer RPCs, so the flag can't be probed or
-- spoofed.
create table public.app_config (
  key text primary key,
  value jsonb not null default 'null',
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
grant all on public.app_config to service_role;

insert into public.app_config (key, value) values ('chat_enabled', 'true'::jsonb);

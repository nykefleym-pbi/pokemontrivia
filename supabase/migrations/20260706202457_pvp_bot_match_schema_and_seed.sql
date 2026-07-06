-- Training vs Bot: mark server-backed bot matches, and seed ONE shared
-- "Training Bot" identity reused as guest_id for every bot match. guest_id
-- stays NOT NULL + FK intact (the bot is a real, if synthetic, profile row).

alter table public.pvp_live_matches
  add column if not exists is_bot_match boolean not null default false;

-- Shared Training Bot identity (fixed singleton id, referenced by
-- start_bot_pvp_match). It is a real auth.users + profiles row that never
-- logs in; it exists only to satisfy guest_id's NOT NULL + FK.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
)
values (
  '00000000-0000-0000-0000-000000000000',
  'b07b07b0-7b07-4b07-8b07-b07b07b07b07',
  'authenticated', 'authenticated', 'training-bot@internal.invalid',
  '', now(), now(), now(),
  '{"provider":"training-bot","providers":["training-bot"]}'::jsonb, '{}'::jsonb, false
)
on conflict (id) do nothing;

insert into public.profiles (id, friend_code, trainer_name, trainer_sprite, level)
values (
  'b07b07b0-7b07-4b07-8b07-b07b07b07b07',
  'TRNBOT', 'Training Bot', 'red', 5
)
on conflict (id) do nothing;

-- Online matchmaking: a way to reach a human who is not standing next to you.
--
-- Until now the only route to a human opponent was scanning their Battle Code
-- in the same room. Production bears that out: 52 live matches, 52 against the
-- bot, zero human-vs-human, ever. Everything needed for a real match already
-- exists and is server-authoritative — pvp_live_matches, the resolve-turn Edge
-- Function, and LivePvpWatcher, which pulls a player straight into any match
-- row inserted with their guest_id. The only missing piece was pairing.
--
-- Shape: whoever arrives second becomes the HOST and supplies the questions,
-- exactly as the scanner does today; the waiting player becomes the guest and
-- is pulled in by the watcher with no accept step. That keeps one match-start
-- path instead of two.

-- ── Where a match came from ─────────────────────────────────────────────────
-- Nullable on purpose: existing rows predate the concept and must not be
-- relabelled. Only 'queue' carries a behaviour change (chat, below).
alter table public.pvp_live_matches
  add column if not exists match_source text
  check (match_source in ('qr', 'queue', 'bot'));

comment on column public.pvp_live_matches.match_source is
  'How the pairing happened. Null on rows created before matchmaking existed.';

-- ── The queue ───────────────────────────────────────────────────────────────
create table if not exists public.pvp_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Read from profiles server-side, never taken from the client: it decides
  -- who you are matched against.
  level integer not null,
  partner_id integer,
  -- Fairness and band widening are measured from here...
  enqueued_at timestamptz not null default now(),
  -- ...liveness from here, so a client keeping itself alive does not keep
  -- resetting its own place in the line.
  heartbeat_at timestamptz not null default now()
);

create index if not exists pvp_queue_enqueued_at_idx on public.pvp_queue (enqueued_at);

alter table public.pvp_queue enable row level security;

-- Writes go exclusively through the SECURITY DEFINER RPCs below. These two
-- policies exist so a player can see and abandon their own row, nothing else:
-- the queue must not be a directory of who is online.
drop policy if exists "pvp_queue_select_own" on public.pvp_queue;
create policy "pvp_queue_select_own" on public.pvp_queue
  for select using (auth.uid() = user_id);

drop policy if exists "pvp_queue_delete_own" on public.pvp_queue;
create policy "pvp_queue_delete_own" on public.pvp_queue
  for delete using (auth.uid() = user_id);

-- ── Pair, or wait ───────────────────────────────────────────────────────────
create or replace function public.enqueue_pvp(
  _questions jsonb,
  _partner_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer;
  v_opponent public.pvp_queue;
  v_profile public.profiles;
  v_id uuid;
  v_started_at timestamptz := now() + interval '3 seconds';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select level into v_level from public.profiles where id = v_uid;
  if v_level is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  -- Housekeeping: a client that was closed mid-wait leaves a row behind, and a
  -- dead row must never be matched into a battle nobody is watching.
  delete from public.pvp_queue where heartbeat_at < now() - interval '90 seconds';

  -- Pick the longest waiter whose level gap is acceptable *for how long they
  -- have waited*. A fixed band on a small player base means never matching at
  -- all; a band that opens up over time keeps early matches fair without
  -- leaving anyone stranded.
  select * into v_opponent
  from public.pvp_queue q
  where q.user_id <> v_uid
    and abs(q.level - v_level) <= case
      when now() - q.enqueued_at < interval '20 seconds' then 5
      when now() - q.enqueued_at < interval '60 seconds' then 15
      else 1000000
    end
  order by q.enqueued_at asc
  limit 1
  for update skip locked;

  if not found then
    -- Nobody to play yet. Join the line (or refresh liveness without losing
    -- the place already earned).
    insert into public.pvp_queue (user_id, level, partner_id)
    values (v_uid, v_level, _partner_id)
    on conflict (user_id) do update
      set heartbeat_at = now(),
          partner_id = coalesce(excluded.partner_id, public.pvp_queue.partner_id);
    return jsonb_build_object(
      'ok', true,
      'matched', false,
      'waitingSince', (select enqueued_at from public.pvp_queue where user_id = v_uid)
    );
  end if;

  -- Matched. Both sides leave the queue before the match exists, so a third
  -- caller racing us cannot pair with either of them.
  delete from public.pvp_queue where user_id in (v_uid, v_opponent.user_id);

  select * into v_profile from public.profiles where id = v_opponent.user_id;

  insert into public.pvp_live_matches
    (host_id, guest_id, questions, started_at, host_partner_id, guest_partner_id, match_source)
  values
    (v_uid, v_opponent.user_id, _questions, v_started_at, _partner_id, v_opponent.partner_id, 'queue')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'matched', true,
    'matchId', v_id,
    'startedAt', v_started_at,
    'opponent', jsonb_build_object(
      'id', v_profile.id,
      'trainer_name', v_profile.trainer_name,
      'trainer_sprite', v_profile.trainer_sprite,
      'level', v_profile.level
    )
  );
end;
$function$;

create or replace function public.leave_pvp_queue()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;
  delete from public.pvp_queue where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.enqueue_pvp(jsonb, integer) from public;
revoke all on function public.leave_pvp_queue() from public;
grant execute on function public.enqueue_pvp(jsonb, integer) to authenticated;
grant execute on function public.leave_pvp_queue() to authenticated;

-- ── Chat stays shut for strangers ───────────────────────────────────────────
-- Matchmaking is the first thing in this app that puts two people who have
-- never met into contact. Moderation exists (banned words, reports, bans, a
-- 24h retention cron), but it was built for people who are face to face and
-- accountable. Queue matches open with chat off; turning it on should be a
-- deliberate, separate decision. Enforced here rather than only in the client,
-- because a hidden button is not a control.
create or replace function public.send_pvp_chat_message(_match_id uuid, _body text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_chat_enabled boolean;
  v_match public.pvp_live_matches;
  v_trainer_name text;
  v_trainer_sprite text;
  v_trimmed text;
  v_len int;
  v_last_msg public.pvp_chat_messages;
  v_norm text;
  v_words text[];
  v_blocked boolean;
  v_new_id uuid;
begin
  -- 1. session required
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  -- 2. kill switch (checked early/cheaply, before any row locks)
  select (value = 'true'::jsonb) into v_chat_enabled
    from public.app_config where key = 'chat_enabled';
  if v_chat_enabled is not true then
    return jsonb_build_object('ok', false, 'error', 'chat_disabled');
  end if;

  -- 3. match must exist (row-locked, mirrors apply_pvp_signature_effect)
  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- 4. caller must be a participant (RLS-equivalent, re-checked here)
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- 5. 24h post-match grace window
  if now() >= v_match.created_at + interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'chat_closed');
  end if;

  -- 5b. strangers paired by matchmaking do not get a chat channel
  if v_match.match_source = 'queue' then
    return jsonb_build_object('ok', false, 'error', 'chat_strangers_disabled');
  end if;

  -- 6. no active ban
  if exists (
    select 1 from public.pvp_chat_bans
    where user_id = v_uid and (expires_at is null or expires_at > now())
  ) then
    return jsonb_build_object('ok', false, 'error', 'banned');
  end if;

  -- 7. name claim gate (re-checked server-side, not just client-gated)
  select trainer_name, trainer_sprite into v_trainer_name, v_trainer_sprite
    from public.profiles where id = v_uid;
  if v_trainer_name is null or length(trim(v_trainer_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  -- 8. body length, using the trimmed original (not normalized) body
  v_trimmed := trim(coalesce(_body, ''));
  v_len := char_length(v_trimmed);
  if v_len = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty');
  elsif v_len > 300 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;

  -- 9. rate limit + duplicate, based on the caller's most recent message in
  -- this match (pvp_chat_messages_match_id_user_id_created_at_idx serves this)
  select * into v_last_msg from public.pvp_chat_messages
    where match_id = _match_id and user_id = v_uid
    order by created_at desc
    limit 1;
  if found then
    if now() < v_last_msg.created_at + interval '2 seconds' then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    if trim(v_last_msg.body) = v_trimmed then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    end if;
  end if;

  -- 10. profanity filter: lowercase, strip everything that isn't a letter,
  -- digit or whitespace (collapses leetspeak-style separators like "f.u.c.k"
  -- into "fuck"), tokenize on whitespace, reject if any token is banned.
  -- Deterministic, in-DB, no external call.
  v_norm := regexp_replace(lower(v_trimmed), '[^a-z0-9\s]', '', 'g');
  v_words := regexp_split_to_array(btrim(v_norm), '\s+');
  select exists (
    select 1 from public.chat_banned_words w where w.word = any(v_words)
  ) into v_blocked;
  if v_blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  -- All guards passed: insert, snapshotting trainer identity at send time.
  insert into public.pvp_chat_messages (match_id, user_id, trainer_name, trainer_sprite, body)
  values (_match_id, v_uid, v_trainer_name, v_trainer_sprite, v_trimmed)
  returning id into v_new_id;

  return jsonb_build_object('ok', true, 'id', v_new_id);
end;
$function$;

-- Match-scoped chat RPCs (PR-2 of docs/handoffs/global-chat/02-architecture.md).
-- Implements the three frozen RPC signatures from architecture §2 exactly:
--   send_pvp_chat_message, report_pvp_chat_message, get_pvp_chat_state.
-- All security definer / search_path-pinned / jsonb {ok,error}-shaped, in the
-- same style as apply_pvp_signature_effect (20260706090116…): row-lock the
-- parent match with `for update`, re-check everything server-side (no trust
-- placed in RLS or client state), defense-in-depth throughout.
--
-- Depends on 20260719120000_pvp_chat_schema.sql (pvp_chat_messages,
-- pvp_chat_reports, pvp_chat_bans, chat_banned_words, app_config seeded with
-- chat_enabled=true).

-- ─────────────────────────────────────────────────────────────────────────
-- send_pvp_chat_message: the only write path onto pvp_chat_messages. Ordered
-- guards exactly per architecture §2 (kill switch → match found → membership
-- → 24h window → ban → name claim → length → rate-limit/dup → profanity).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.send_pvp_chat_message(
  _match_id uuid,
  _body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.send_pvp_chat_message(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- report_pvp_chat_message: fire-and-forget report, idempotent per
-- (message, reporter) via the unique constraint from PR-1. Its INSERT is
-- what the PR-3 escalation trigger will fire on.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.report_pvp_chat_message(
  _message_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_participant boolean;
  v_inserted_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  -- Message must exist AND caller must be a participant of its match; both
  -- failure modes collapse to 'forbidden' per the frozen spec.
  select exists (
    select 1
    from public.pvp_chat_messages m
    join public.pvp_live_matches lm on lm.id = m.match_id
    where m.id = _message_id
      and v_uid in (lm.host_id, lm.guest_id)
  ) into v_is_participant;

  if not v_is_participant then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.pvp_chat_reports (message_id, reporter_id, reason)
  values (_message_id, v_uid, _reason)
  on conflict (message_id, reporter_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

grant execute on function public.report_pvp_chat_message(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- get_pvp_chat_state: read-only, UX-only mirror of the send RPC's gates.
-- NOT a security boundary — send_pvp_chat_message re-checks everything
-- itself regardless of what this returns. Never raises for a non-
-- participant/missing match; just reports sane (closed) defaults.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_pvp_chat_state(
  _match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_enabled boolean;
  v_banned boolean;
  v_name_claimed boolean;
  v_match public.pvp_live_matches;
  v_window_open boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select (value = 'true'::jsonb) into v_enabled
    from public.app_config where key = 'chat_enabled';
  v_enabled := coalesce(v_enabled, false);

  select exists (
    select 1 from public.pvp_chat_bans
    where user_id = v_uid and (expires_at is null or expires_at > now())
  ) into v_banned;

  select (trainer_name is not null and length(trim(trainer_name)) > 0)
    into v_name_claimed
    from public.profiles where id = v_uid;
  v_name_claimed := coalesce(v_name_claimed, false);

  select * into v_match from public.pvp_live_matches where id = _match_id;
  if found and v_uid in (v_match.host_id, v_match.guest_id) then
    v_window_open := now() < v_match.created_at + interval '24 hours';
  end if;

  return jsonb_build_object(
    'enabled', v_enabled,
    'banned', v_banned,
    'nameClaimed', v_name_claimed,
    'windowOpen', v_window_open
  );
end;
$$;

grant execute on function public.get_pvp_chat_state(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- chat_banned_words seed. PLACEHOLDER ONLY — no product-approved wordlist
-- exists yet (architecture §2 / risk #2: "PO owns the seed list"). This is a
-- minimal, conservative starter set of unambiguous common English swear
-- words so the filter isn't a no-op at launch; it deliberately excludes
-- slurs/edge cases per spec, which are deferred product work, NOT decided
-- here. Must be reviewed/replaced by product before this feature ships.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.chat_banned_words (word) values
  ('fuck'),
  ('shit'),
  ('bitch'),
  ('asshole'),
  ('bastard'),
  ('dick')
on conflict (word) do nothing;

-- Being scanned into a Nearby Battle only ever reached the guest as a single
-- realtime postgres_changes INSERT (LivePvpWatcher). postgres_changes has no
-- replay: a socket asleep behind a backgrounded tab, a reconnect, or a client
-- still mid-subscribe when the row lands misses that event permanently, and
-- nothing in the app ever asked the server afterwards. The host then battled
-- alone. The client now also POLLS for a match it has been pulled into, which
-- needs an index — pvp_live_matches had only its primary key, so every poll
-- would have been a sequential scan.
--
-- Partial on status='active' because that is the only state worth joining, and
-- it keeps the index to the handful of matches actually in flight.
create index if not exists pvp_live_matches_guest_active_idx
  on public.pvp_live_matches (guest_id, created_at desc)
  where status = 'active';

-- The host side navigates itself, but the same poll covers a host whose tab
-- was reloaded mid-match, and the queue path pairs a WAITING player in as the
-- guest of a match someone else's enqueue_pvp created — same blind spot.
create index if not exists pvp_live_matches_host_active_idx
  on public.pvp_live_matches (host_id, created_at desc)
  where status = 'active';

-- The queue side of the same hole, fixed at the source rather than papered
-- over by the client. A waiting player is paired IN by somebody else's call:
-- their own row is deleted and a match is created with them as guest. Their
-- client, which polls this function every 5s both to pair and to hold its
-- place, then found no queue row and cheerfully re-enqueued — so a player
-- already booked into one battle could be paired into a SECOND one, and their
-- own 30s Training fallback could fire and abandon the human waiting for them.
--
-- Now the pairing check comes first: if a live match is already waiting with
-- me as its guest, hand back that match instead of queueing again. `pulledIn`
-- tells the client this is somebody else's match, so it does not spend its own
-- unused question ticket or double-count the match-started event.
create or replace function public.enqueue_pvp(_questions jsonb, _partner_id integer default null)
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
  v_pending public.pvp_live_matches;
  v_id uuid;
  v_started_at timestamptz := now() + interval '3 seconds';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  -- Already paired in by someone else while we were between polls?
  select * into v_pending
  from public.pvp_live_matches m
  where m.guest_id = v_uid
    and m.status = 'active'
    and m.is_bot_match is not true
    and m.guest_completed_at is null
    and m.created_at > now() - interval '90 seconds'
  order by m.created_at desc
  limit 1;

  if found then
    delete from public.pvp_queue where user_id = v_uid;
    select * into v_profile from public.profiles where id = v_pending.host_id;
    return jsonb_build_object(
      'ok', true,
      'matched', true,
      'pulledIn', true,
      'matchId', v_pending.id,
      'startedAt', v_pending.started_at,
      'opponent', jsonb_build_object(
        'id', v_profile.id,
        'trainer_name', v_profile.trainer_name,
        'trainer_sprite', v_profile.trainer_sprite,
        'level', v_profile.level
      )
    );
  end if;

  select level into v_level from public.profiles where id = v_uid;
  if v_level is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  delete from public.pvp_queue where heartbeat_at < now() - interval '90 seconds';

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
    'pulledIn', false,
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

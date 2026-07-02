-- Friend request keyed by target user id (for the Mega Raid leaderboard,
-- where rows carry user_id but not friend_code). Mirrors send_friend_request.
create or replace function public.send_friend_request_by_id(_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reverse public.friend_requests;
  v_existing public.friend_requests;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  if _target is null or not exists (select 1 from public.profiles where id = _target) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if _target = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  if exists (
    select 1 from public.friends
    where owner_id = v_uid and friend_id = _target
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_friends');
  end if;

  -- Auto-accept a pending reverse request.
  select * into v_reverse from public.friend_requests
    where from_id = _target and to_id = v_uid and status = 'pending'
    limit 1;
  if found then
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = v_reverse.id;
    insert into public.friends (owner_id, friend_id) values (v_uid, _target)
      on conflict do nothing;
    insert into public.friends (owner_id, friend_id) values (_target, v_uid)
      on conflict do nothing;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;

  select * into v_existing from public.friend_requests
    where from_id = v_uid and to_id = _target
    limit 1;
  if found and v_existing.status = 'pending' then
    return jsonb_build_object('ok', true, 'status', 'already_pending');
  end if;

  insert into public.friend_requests (from_id, to_id, status, created_at)
  values (v_uid, _target, 'pending', now())
  on conflict (from_id, to_id) do update
    set status = 'pending', created_at = now(), responded_at = null;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

grant execute on function public.send_friend_request_by_id(uuid) to authenticated;

-- Outgoing pending target ids for the caller (to render "Pending" states).
create or replace function public.my_pending_request_targets()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select to_id from public.friend_requests
  where from_id = auth.uid() and status = 'pending';
$$;

grant execute on function public.my_pending_request_targets() to authenticated;

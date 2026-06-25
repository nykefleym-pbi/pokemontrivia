
-- friend_requests table
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_id, to_id)
);

grant select on public.friend_requests to authenticated;
grant all on public.friend_requests to service_role;

alter table public.friend_requests enable row level security;

drop policy if exists friend_requests_read_involved on public.friend_requests;
create policy friend_requests_read_involved
  on public.friend_requests for select
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- send_friend_request
create or replace function public.send_friend_request(_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_code text := upper(btrim(coalesce(_code, '')));
  v_reverse public.friend_requests;
  v_existing public.friend_requests;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select id into v_target from public.profiles where friend_code = v_code limit 1;
  if v_target is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_target = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  if exists (
    select 1 from public.friends
    where owner_id = v_uid and friend_id = v_target
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_friends');
  end if;

  -- Auto-accept a pending reverse request.
  select * into v_reverse from public.friend_requests
    where from_id = v_target and to_id = v_uid and status = 'pending'
    limit 1;
  if found then
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = v_reverse.id;
    insert into public.friends (owner_id, friend_id) values (v_uid, v_target)
      on conflict do nothing;
    insert into public.friends (owner_id, friend_id) values (v_target, v_uid)
      on conflict do nothing;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;

  -- Existing outgoing request?
  select * into v_existing from public.friend_requests
    where from_id = v_uid and to_id = v_target
    limit 1;
  if found and v_existing.status = 'pending' then
    return jsonb_build_object('ok', true, 'status', 'already_pending');
  end if;

  insert into public.friend_requests (from_id, to_id, status, created_at, responded_at)
    values (v_uid, v_target, 'pending', now(), null)
    on conflict (from_id, to_id) do update
      set status = 'pending', created_at = now(), responded_at = null;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

grant execute on function public.send_friend_request(text) to anon, authenticated;

-- respond_friend_request
create or replace function public.respond_friend_request(_request_id uuid, _accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.friend_requests;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_req from public.friend_requests where id = _request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.to_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', true, 'status', v_req.status);
  end if;

  if _accept then
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = v_req.id;
    insert into public.friends (owner_id, friend_id) values (v_req.from_id, v_req.to_id)
      on conflict do nothing;
    insert into public.friends (owner_id, friend_id) values (v_req.to_id, v_req.from_id)
      on conflict do nothing;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    update public.friend_requests
       set status = 'declined', responded_at = now()
     where id = v_req.id;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to anon, authenticated;

-- list_incoming_friend_requests
create or replace function public.list_incoming_friend_requests()
returns table (
  request_id uuid,
  from_id uuid,
  trainer_name text,
  trainer_sprite text,
  level int,
  friend_code text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select fr.id as request_id,
         fr.from_id,
         p.trainer_name,
         p.trainer_sprite,
         p.level,
         p.friend_code,
         fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_id
  where fr.to_id = auth.uid() and fr.status = 'pending'
  order by fr.created_at desc;
$$;

grant execute on function public.list_incoming_friend_requests() to anon, authenticated;

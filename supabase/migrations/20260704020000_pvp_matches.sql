-- Async friend-vs-friend PvP: challenger sends a frozen 20-question set to a
-- friend, both sides play it independently and whenever they get to it, the
-- higher composite score wins. Frozen questions (not re-fetched per side)
-- keep the comparison fair — both players face the exact same set.
create table public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  questions jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'declined', 'expired')),

  challenger_correct int,
  challenger_total int,
  challenger_time_ms int,
  challenger_streak int,
  challenger_score int,
  challenger_completed_at timestamptz,

  opponent_correct int,
  opponent_total int,
  opponent_time_ms int,
  opponent_streak int,
  opponent_score int,
  opponent_completed_at timestamptz,

  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.pvp_matches enable row level security;
grant select on public.pvp_matches to authenticated;
grant all on public.pvp_matches to service_role;

create policy "pvp_matches_select_own" on public.pvp_matches
  for select to authenticated
  using (challenger_id = auth.uid() or opponent_id = auth.uid());

-- Challenge a friend to a match. The question set is generated client-side
-- (same curated-question fetcher as regular battles) and frozen here.
create or replace function public.create_pvp_challenge(_opponent_id uuid, _questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;
  if _opponent_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if not exists (
    select 1 from public.friends where owner_id = v_uid and friend_id = _opponent_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_friends');
  end if;

  insert into public.pvp_matches (challenger_id, opponent_id, questions)
  values (v_uid, _opponent_id, _questions)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'matchId', v_id);
end;
$$;

grant execute on function public.create_pvp_challenge(uuid, jsonb) to authenticated;

-- Record the caller's side of a match. Score = correct*100 (points) +
-- accuracy%*200 + maxStreak*20 (streak) + a per-correct-answer speed bonus
-- based on average pace (10s baseline, 3pts/second faster). When both sides
-- have submitted, the match is marked completed and the winner decided.
create or replace function public.submit_pvp_result(
  _match_id uuid,
  _correct int,
  _total int,
  _time_ms int,
  _max_streak int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_matches;
  v_score int;
  v_avg_sec numeric;
  v_speed_bonus int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.challenger_id, v_match.opponent_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_match.status = 'declined' or v_match.status = 'expired' or now() > v_match.expires_at then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if (v_uid = v_match.challenger_id and v_match.challenger_completed_at is not null)
    or (v_uid = v_match.opponent_id and v_match.opponent_completed_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  v_avg_sec := (_time_ms::numeric / 1000) / greatest(_total, 1);
  v_speed_bonus := _correct * greatest(0, round((10 - v_avg_sec) * 3))::int;
  v_score := (_correct * 100)
    + round((_correct::numeric / greatest(_total, 1)) * 200)
    + (_max_streak * 20)
    + v_speed_bonus;

  if v_uid = v_match.challenger_id then
    update public.pvp_matches set
      challenger_correct = _correct,
      challenger_total = _total,
      challenger_time_ms = _time_ms,
      challenger_streak = _max_streak,
      challenger_score = v_score,
      challenger_completed_at = now()
    where id = _match_id;
  else
    update public.pvp_matches set
      opponent_correct = _correct,
      opponent_total = _total,
      opponent_time_ms = _time_ms,
      opponent_streak = _max_streak,
      opponent_score = v_score,
      opponent_completed_at = now()
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_matches where id = _match_id;
  if v_match.challenger_completed_at is not null and v_match.opponent_completed_at is not null then
    update public.pvp_matches set
      status = 'completed',
      winner_id = case
        when v_match.challenger_score > v_match.opponent_score then v_match.challenger_id
        when v_match.opponent_score > v_match.challenger_score then v_match.opponent_id
        else null
      end
    where id = _match_id;
  end if;

  return jsonb_build_object('ok', true, 'score', v_score);
end;
$$;

grant execute on function public.submit_pvp_result(uuid, int, int, int, int) to authenticated;

-- Pending challenges where the caller is the invited opponent and hasn't
-- played yet.
create or replace function public.list_pvp_invites()
returns setof public.pvp_matches
language sql
security definer
set search_path = public
as $$
  select * from public.pvp_matches
  where opponent_id = auth.uid()
    and opponent_completed_at is null
    and status = 'pending'
    and expires_at > now()
  order by created_at desc;
$$;

grant execute on function public.list_pvp_invites() to authenticated;

-- All of the caller's matches (either role), most recent first.
create or replace function public.list_pvp_matches()
returns setof public.pvp_matches
language sql
security definer
set search_path = public
as $$
  select * from public.pvp_matches
  where challenger_id = auth.uid() or opponent_id = auth.uid()
  order by created_at desc
  limit 50;
$$;

grant execute on function public.list_pvp_matches() to authenticated;

-- Decline a challenge without playing it.
create or replace function public.decline_pvp_challenge(_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;
  update public.pvp_matches
     set status = 'declined'
   where id = _match_id and opponent_id = v_uid and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.decline_pvp_challenge(uuid) to authenticated;

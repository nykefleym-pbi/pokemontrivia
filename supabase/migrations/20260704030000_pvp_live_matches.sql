-- Nearby (in-person) PvP: mirrors Pokémon GO's Trainer Battle QR flow. Each
-- trainer's existing friend code doubles as their scannable Battle Code;
-- scanning someone's code atomically creates an ALREADY-ACTIVE match (no
-- separate host-waits-for-guest handshake, since both trainers are already
-- face to face) with a shared `started_at` wall-clock anchor both clients
-- use to advance through the frozen question set in lockstep.
create table public.pvp_live_matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  questions jsonb not null,
  status text not null default 'active' check (status in ('active', 'completed', 'forfeited')),
  started_at timestamptz not null,

  host_correct int,
  host_total int,
  host_time_ms int,
  host_streak int,
  host_score int,
  host_completed_at timestamptz,

  guest_correct int,
  guest_total int,
  guest_time_ms int,
  guest_streak int,
  guest_score int,
  guest_completed_at timestamptz,

  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

alter table public.pvp_live_matches enable row level security;
grant select on public.pvp_live_matches to authenticated;
grant all on public.pvp_live_matches to service_role;

create policy "pvp_live_matches_select_own" on public.pvp_live_matches
  for select to authenticated
  using (host_id = auth.uid() or guest_id = auth.uid());

alter publication supabase_realtime add table public.pvp_live_matches;
alter table public.pvp_live_matches replica identity full;

-- Fix: PvpInviteInbox subscribes to postgres_changes on pvp_matches, but the
-- table was never added to the realtime publication, so that push silently
-- never fired (the poll-on-focus fallback masked it). Fold the fix in here.
alter publication supabase_realtime add table public.pvp_matches;
alter table public.pvp_matches replica identity full;

-- Scan a trainer's Battle Code (their friend code) to instantly start a
-- match. The scanner supplies the frozen question set; both host_id and
-- guest_id are known immediately so there's no waiting/lobby state.
create or replace function public.start_live_pvp_match(_opponent_code text, _questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_opponent public.profiles;
  v_id uuid;
  v_started_at timestamptz := now() + interval '3 seconds';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_opponent from public.profiles where friend_code = upper(trim(_opponent_code));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_opponent.id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  insert into public.pvp_live_matches (host_id, guest_id, questions, started_at)
  values (v_uid, v_opponent.id, _questions, v_started_at)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_id,
    'startedAt', v_started_at,
    'opponent', jsonb_build_object(
      'id', v_opponent.id,
      'trainer_name', v_opponent.trainer_name,
      'trainer_sprite', v_opponent.trainer_sprite,
      'level', v_opponent.level
    )
  );
end;
$$;

grant execute on function public.start_live_pvp_match(text, jsonb) to authenticated;

-- Record the caller's side. Same weighted-sum scoring as async PvP (correct
-- count + accuracy + streak + speed bonus off the average pace).
create or replace function public.submit_live_pvp_result(
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
  v_match public.pvp_live_matches;
  v_score int;
  v_avg_sec numeric;
  v_speed_bonus int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_match.status = 'forfeited' or now() > v_match.expires_at then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if (v_uid = v_match.host_id and v_match.host_completed_at is not null)
    or (v_uid = v_match.guest_id and v_match.guest_completed_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  v_avg_sec := (_time_ms::numeric / 1000) / greatest(_total, 1);
  v_speed_bonus := _correct * greatest(0, round((10 - v_avg_sec) * 3))::int;
  v_score := (_correct * 100)
    + round((_correct::numeric / greatest(_total, 1)) * 200)
    + (_max_streak * 20)
    + v_speed_bonus;

  if v_uid = v_match.host_id then
    update public.pvp_live_matches set
      host_correct = _correct,
      host_total = _total,
      host_time_ms = _time_ms,
      host_streak = _max_streak,
      host_score = v_score,
      host_completed_at = now()
    where id = _match_id;
  else
    update public.pvp_live_matches set
      guest_correct = _correct,
      guest_total = _total,
      guest_time_ms = _time_ms,
      guest_streak = _max_streak,
      guest_score = v_score,
      guest_completed_at = now()
    where id = _match_id;
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  if v_match.host_completed_at is not null and v_match.guest_completed_at is not null then
    update public.pvp_live_matches set
      status = 'completed',
      winner_id = case
        when v_match.host_score > v_match.guest_score then v_match.host_id
        when v_match.guest_score > v_match.host_score then v_match.guest_id
        else null
      end
    where id = _match_id;
  end if;

  return jsonb_build_object('ok', true, 'score', v_score);
end;
$$;

grant execute on function public.submit_live_pvp_result(uuid, int, int, int, int) to authenticated;

-- Claimed by whichever side is still present when the other's Realtime
-- Presence drops for 30s mid-match. Trust-based (no server-side presence
-- check) — acceptable for a casual, already-face-to-face v1 feature.
create or replace function public.forfeit_live_pvp_match(_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_match.status != 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  update public.pvp_live_matches
     set status = 'forfeited', winner_id = v_uid
   where id = _match_id and status = 'active';

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.forfeit_live_pvp_match(uuid) to authenticated;
